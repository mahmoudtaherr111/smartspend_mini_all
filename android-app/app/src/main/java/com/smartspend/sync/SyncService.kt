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

        /**
         * Known Egyptian bank & wallet notification senders.
         * Matches against notification TITLE, TEXT, and package name.
         */
        val BANK_KEYWORDS = listOf(
            // Banks
            "cib", "commercial international", "nbe", "national bank",
            "banque misr", "bm", "قومي", "مصر",
            "qnb", "hsbc", "alex bank", "بنك الإسكندرية",
            "faisal", "arab bank", "arab african", "aaib",
            "ahli bank", "الأهلي", "blom", "credit agricole",
            "suez canal", "export development", "edb",
            "housing development", "hdb", "union national",
            // Wallets & Payments
            "instapay", "إنستا باي", "انستا",
            "vodafone cash", "فودافون كاش", "vf cash",
            "orange money", "أورنج موني",
            "etisalat cash", "we pay",
            "fawry", "فوري",
            "aman", "أمان",
            "meeza", "ميزة",
            "mastercard", "visa",
            // Common SMS short codes / patterns (Egyptian banks use these)
            "egp", "جنيه", "محفظة", "رصيد", "تحويل", "خصم", "إيداع",
            "transaction", "debit", "credit", "balance",
        )

        /** Packages that definitely send bank/wallet notifications */
        val BANK_PACKAGES = listOf(
            "com.cib.mobilebank",
            "com.nbe.ahly",
            "com.banquemisr.bmobile",
            "com.vodafone.egypt.myvoda",
            "com.orange.egyphone",
            "com.fawry.fawrypay",
            // SMS apps — any bank SMS arrives here
            "com.android.mms",
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.huawei.android.mms",
            "com.miui.sms",
            "com.oppo.sms",
            "com.vivo.message",
        )
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
            val pkg      = sbn.packageName ?: return
            val extras   = sbn.notification?.extras ?: return
            val title    = extras.getString(Notification.EXTRA_TITLE)?.trim() ?: ""
            val text     = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
            val bigText  = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: text

            if (title.isBlank() && text.isBlank()) return

            // ── Filter: Is this from a bank? ──────────────────────────────────
            val fullText = "$title $text $bigText $pkg".lowercase()
            val isBank   = BANK_PACKAGES.any { pkg.startsWith(it) } ||
                           BANK_KEYWORDS.any { fullText.contains(it.lowercase()) }

            if (!isBank) return

            Log.d(TAG, "🏦 Bank notification detected | title=$title | pkg=$pkg")

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

        val body = JSONObject().apply {
            put("message",   message)
            put("sender",    sender)
            put("timestamp", java.time.Instant.now().toString())
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
