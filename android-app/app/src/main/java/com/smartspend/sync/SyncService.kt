package com.smartspend.sync

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * SyncService — NotificationListenerService
 *
 * Listens to ALL system notifications.
 * Filters for Egyptian bank / wallet senders.
 * POSTs matching notifications to SmartSpend /api/sms/ingest.
 *
 * This approach is:
 *  ✅ Allowed by Google Play policies (NotificationListenerService is a standard API)
 *  ✅ Used by millions of legitimate apps (Wear OS, Mi Band, notification managers)
 *  ✅ Does NOT read SMS inbox (only on-screen notification text)
 *  ✅ Works for InstaPay, Vodafone Cash, Bank SMS, and all wallet apps
 */
class SyncService : NotificationListenerService() {

    companion object {
        private const val TAG = "SmartSpendSync"

        /** Whitelisted SMS applications */
        val SMS_PACKAGES = listOf(
            "com.android.mms",
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.huawei.android.mms",
            "com.miui.sms",
            "com.oppo.sms",
            "com.vivo.message",
            "com.android.messaging"
        )

        /** Whitelisted financial applications in Egypt */
        val FINANCIAL_PACKAGES = listOf(
            "com.egyptianbanks.instapay",        // InstaPay Egypt
            "com.vodafone.vodafone",             // Ana Vodafone (Vodafone Cash)
            "eg.etisalat.sports",                // My e& (Etisalat Cash)
            "com.orange.egyphone",               // My Orange Egypt (Orange Cash)
            "com.te.wepay",                      // WE Pay
            "com.cib.digital.mb",                // CIB Egypt Mobile Banking
            "com.cib.cibwallet",                 // CIB Smart Wallet
            "com.banquemisr.bmobile",            // BM Mobile Banking
            "eg.com.bm.wallet",                  // BM Wallet
            "com.qnb.mobilebanking",             // QNB Mobile
            "com.qnb.qnbwallet",                 // QNB Wallet
            "com.fawry.fawrypay",                // FawryPay
        )

        /** Known social and chat applications to strictly exclude from notification listening */
        val SOCIAL_CHAT_PACKAGES = listOf(
            "com.whatsapp",
            "org.telegram.messenger",
            "com.facebook.orca",
            "com.instagram.android",
            "com.discord",
            "com.twitter.android",
            "com.snapchat.android",
            "com.skype.raider",
            "com.google.android.apps.dynamite", // Google Chat
            "com.microsoft.teams",
            "com.viber.voip",
            "com.tencent.mm",
            "jp.naver.line.android"
        )

        /** Keywords to match bank/wallet names in SMS senders (notification title) */
        val BANK_SENDER_KEYWORDS = listOf(
            "cib", "nbe", "banque", "misr", "qnb", "alex", "faisal", "hsbc", "aaib",
            "instapay", "vodafone", "vf", "orange", "etisalat", "ahly", "wepay", "we", "fawry", "meeza"
        )

        /** Keywords to ensure the notification is transactional (for both SMS and financial apps) */
        val TRANSACTION_KEYWORDS = listOf(
            // Arabic transaction keywords
            "تحويل", "استقبال", "خصم", "سحب", "إيداع", "ايداع", "إضافة", "اضافة", "قيد",
            "رصيد", "مشتريات", "شراء", "عملية", "عمليه", "سداد", "فاتورة", "فاتوره", "فواتير", "شحن", "صرف",
            
            // English transaction keywords
            "credited", "debited", "transferred", "received", "withdrawn", "withdrew", "paid",
            "payment", "purchase", "sent", "salary", "payroll", "deposited", "deposit", "fee",
            "balance", "spent", "amount", "charge"
        )

        /** Keywords for sensitive OTP, verification, or promotional codes to be ignored */
        val SENSITIVE_IGNORED_KEYWORDS = listOf(
            "otp", "verification", "password", "كود التحقق", "رمز التحقق", "رمز تفعيل", 
            "كلمة مرور مؤقتة", "كلمة المرور", "كلمة سر مؤقتة", "verification code", "activation code"
        )

        /** Precise OTP and verification code patterns to prevent blocking valid transaction references */
        val OTP_PATTERNS = listOf(
            "(?:رمز|كود|رقم|كلمه)\\s+(?:التحقق|التفعيل|الامان|المرور|السر)\\s*(?:الخاص\\s*بك\\s*)?(?:هو|:|is)?\\s*\\b\\d{4,6}\\b".toRegex(RegexOption.IGNORE_CASE),
            "\\b(?:otp|verification|activation|passcode|one-time|auth)\\b.*\\b\\d{4,6}\\b".toRegex(RegexOption.IGNORE_CASE)
        )

        /** Keywords that represent banking / wallet indicators, currency, or transactions to match robustly */
        val FINANCIAL_MARKERS = listOf(
            "egp", "le", "جنيه", "ج.م", "usd",
            "vodafone cash", "فودافون كاش", "اتصالات كاش", "etisalat cash", 
            "أورنج كاش", "orange cash", "إنستاباي", "instapay", "fawry", "فوري", "meeza", "ميزة",
            "cib", "nbe", "qnb", "misr", "ahly", "alex", "faisal", "hsbc", "aaib", "wepay",
            "بطاقة", "حساب رقم", "رقم العملية", "ref", "txn", "card ending", "account no", "wallet", "محفظة",
            "سحب نقدي", "شراء من تاجر", "تحويل من", "تحويل إلى", "تحويل الى"
        )

        /** Helper to identify personal phone numbers and avoid importing private chats */
        fun isPersonalPhoneNumber(title: String): Boolean {
            val clean = title.replace("\\s".toRegex(), "")
            return clean.matches("^(\\+?20)?0?1[0125]\\d{8}$".toRegex()) || 
                   clean.matches("^\\+?\\d{9,15}$".toRegex())
        }
    }

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val pkg = sbn.packageName ?: return

            // 0. Exclude social and chat packages immediately to protect private communications
            if (SOCIAL_CHAT_PACKAGES.contains(pkg) || pkg.contains("messenger") || pkg.contains("chat") || pkg.contains("telegram")) {
                Log.d(TAG, "Ignoring chat/social notification from package: $pkg")
                return
            }

            val extras   = sbn.notification?.extras ?: return
            val title    = extras.getString(Notification.EXTRA_TITLE)?.trim() ?: ""
            val text     = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
            val bigText  = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: text

            if (title.isBlank() && text.isBlank()) return

            val fullContent = "$title $text $bigText"
            val contentLower = fullContent.lowercase()

            // 1. Filter out OTP / sensitive non-financial messages using regex to avoid false positives on reference/transaction numbers
            val isOtp = OTP_PATTERNS.any { it.containsMatchIn(contentLower) } || 
                        (SENSITIVE_IGNORED_KEYWORDS.any { contentLower.contains(it) } && 
                         !contentLower.contains("ref") && 
                         !contentLower.contains("txn") && 
                         !contentLower.contains("رقم العمليه") && 
                         !contentLower.contains("المرجع"))
            if (isOtp) {
                Log.d(TAG, "Ignoring sensitive OTP or verification notification")
                return
            }

            // 2. Extract transaction & financial marker presence
            val hasTxKeyword = TRANSACTION_KEYWORDS.any { contentLower.contains(it) }
            val hasFinancialMarker = FINANCIAL_MARKERS.any { contentLower.contains(it) }

            // 3. Package categorization
            val isSmsApp = SMS_PACKAGES.any { pkg == it }
            val isFinancialApp = FINANCIAL_PACKAGES.any { pkg == it } ||
                                 pkg.startsWith("com.cib.") ||
                                 pkg.startsWith("com.nbe.") ||
                                 pkg.startsWith("com.qnb.") ||
                                 pkg.startsWith("com.banquemisr.") ||
                                 pkg.startsWith("com.ofss.fcdb.") ||
                                 pkg.contains("wallet", ignoreCase = true) ||
                                 pkg.contains("pay", ignoreCase = true) ||
                                 pkg.contains("bank", ignoreCase = true) ||
                                 pkg.contains("cash", ignoreCase = true)

            // 4. Greedy-but-Smart transaction detection heuristic
            var isTransactional = false

            if (isFinancialApp) {
                // If it is a known/suspected financial application, any transaction keyword is sufficient
                if (hasTxKeyword) {
                    isTransactional = true
                }
            } else if (isSmsApp) {
                val sender = title.lowercase()
                val hasBankKeyword = BANK_SENDER_KEYWORDS.any { sender.contains(it) }

                if (hasBankKeyword && hasTxKeyword) {
                    isTransactional = true
                } else if (hasTxKeyword && hasFinancialMarker) {
                    // Extremely important: If the SMS is from an unexpected number format (like a normal mobile phone number
                    // for P2P local wallet transfers), we let it pass ONLY if it has both a transaction keyword AND a financial marker.
                    isTransactional = true
                }
            } else {
                // Greedy fallback: If the notification is from an unexpected package (e.g. customized browser, instant messaging app,
                // or unlisted service), but contains a strong transactional signature, pass it to the backend parser.
                if (hasTxKeyword && hasFinancialMarker) {
                    isTransactional = true
                }
            }

            if (!isTransactional) {
                Log.d(TAG, "Ignoring non-transactional notification | title=$title | pkg=$pkg")
                return
            }

            Log.d(TAG, "🏦 Bank/Wallet notification detected | title=$title | pkg=$pkg")

            // ── Send to SmartSpend ────────────────────────────────────────────
            sendToSmartSpend(
                sender  = title.ifBlank { pkg },
                message = bigText.ifBlank { text },
            )

        } catch (e: Exception) {
            Log.e(TAG, "Error processing notification", e)
        }
    }

    private fun sendToSmartSpend(sender: String, message: String) {
        val prefs     = getSharedPreferences("smartspend", MODE_PRIVATE)
        val token     = prefs.getString("webhook_token", null) ?: run {
            Log.w(TAG, "No token configured — skipping")
            return
        }
        val ingestUrl = prefs.getString("ingest_url", null) ?: run {
            Log.w(TAG, "No ingest URL configured — skipping")
            return
        }

        // Backward-compatible ISO-8601 formatting that works on ALL Android versions
        val timestamp = try {
            val df = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            df.timeZone = java.util.TimeZone.getTimeZone("UTC")
            df.format(java.util.Date())
        } catch (e: Exception) {
            java.time.Instant.now().toString() // Fallback
        }

        val body = JSONObject().apply {
            put("message",   message)
            put("sender",    sender)
            put("timestamp", timestamp)
            put("source",    "android_notification")
        }.toString()

        val request = Request.Builder()
            .url(ingestUrl)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type",  "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "Failed to send notification to SmartSpend: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                val code = response.code
                val respBody = response.body?.string()
                Log.d(TAG, "✅ Sent to SmartSpend | HTTP $code | $respBody")
                response.close()
            }
        })
    }
}
