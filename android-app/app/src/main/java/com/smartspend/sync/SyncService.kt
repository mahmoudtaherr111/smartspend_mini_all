package com.smartspend.sync

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Receives notification text from explicitly allowed packages, not the SMS inbox.
 * Availability depends on device settings, app notification contents, OS restrictions and permissions.
 * Package IDs and sender coverage require device verification; this is not a claim of all-bank coverage.
 * Persists a bounded owner/endpoint-scoped outbox before delivery and removes only acknowledged items.
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

        fun isPersonalPhoneNumber(title: String): Boolean = title.replace(" ", "").matches("^(\\+?20)?0?1[0125]\\d{8}$".toRegex())
        private val queueLock = Any()
    }

    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(10, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).callTimeout(40, TimeUnit.SECONDS).build()
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var flushing = false
    @Volatile private var destroyed = false
    private val prefs get() = getSharedPreferences("smartspend", MODE_PRIVATE)
    private fun hash(value: String) = java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    private fun scope(token: String, url: String) = "capture_queue_" + hash(token + "|" + url)
    private val networkCallback = object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: android.net.Network) { flushQueue() }
    }

    override fun onCreate() {
        super.onCreate()
        try { (getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).registerDefaultNetworkCallback(networkCallback) } catch (_: Exception) { }
    }
    override fun onListenerConnected() { super.onListenerConnected(); flushQueue() }
    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        try { (getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).unregisterNetworkCallback(networkCallback) } catch (_: Exception) { }
        super.onDestroy()
    }
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val pkg = sbn.packageName.lowercase()
            if (pkg !in SMS_PACKAGES && pkg !in FINANCIAL_PACKAGES) return
            if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
            val extras = sbn.notification.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
            if (pkg in SMS_PACKAGES && (isPersonalPhoneNumber(title) || BANK_SENDER_KEYWORDS.none { word ->
                Regex("(?:^|[^a-z])" + Regex.escape(word) + "(?:$|[^a-z])",RegexOption.IGNORE_CASE).containsMatchIn(title)
            })) return
            val message = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim() ?: return
            if (message.length < 5 || message.length > 12000) return
            val content = message.lowercase()
            // Never exempt OTP because it also has a transaction reference.
            if (SENSITIVE_IGNORED_KEYWORDS.any { content.contains(it) } || OTP_PATTERNS.any { it.containsMatchIn(content) }) return
            if (TRANSACTION_KEYWORDS.none { content.contains(it) } || message.none { it.isDigit() }) return
            val token = prefs.getString("webhook_token",null) ?: return
            val url = prefs.getString("ingest_url",null) ?: return
            if (!url.startsWith("https://")) return
            val time = if (sbn.notification.`when` > 0) sbn.notification.`when` else sbn.postTime
            val item = JSONObject().apply {
                put("eventId",hash(pkg + "|" + sbn.key + "|" + time + "|" + message))
                put("message",message);put("sender",title.take(100));put("packageName",pkg)
                put("timestamp",java.time.Instant.ofEpochMilli(time).toString());put("source","android_notification")
            }
            synchronized(queueLock) {
                val key = scope(token,url)
                val queue = JSONArray(prefs.getString(key,"[]") ?: "[]")
                if ((0 until queue.length()).none { queue.getJSONObject(it).optString("eventId") == item.getString("eventId") }) {
                    if (queue.length() >= 500) {
                        prefs.edit().putString("capture_sync_error","queue_full").apply()
                        return
                    }
                    queue.put(item)
                    // Commit before networking; an OS kill after receipt cannot erase an unacknowledged event.
                    if (!prefs.edit().putString(key,queue.toString()).commit()) return
                }
            }
            flushQueue()
        } catch (_: Exception) { Log.w(TAG,"Notification could not be retained") }
    }

    private fun flushQueue() {
        synchronized(queueLock) { if (flushing || destroyed) return; flushing = true }
        val token = prefs.getString("webhook_token",null)
        val url = prefs.getString("ingest_url",null)
        if (token == null || url == null || !url.startsWith("https://")) { synchronized(queueLock) {flushing = false};return }
        sendHead(token,url,scope(token,url))
    }
    private fun sendHead(token: String,url: String,key: String) {
        if (destroyed || token != prefs.getString("webhook_token",null) || url != prefs.getString("ingest_url",null)) {synchronized(queueLock){flushing=false};return}
        val item = synchronized(queueLock) {
            val queue = JSONArray(prefs.getString(key,"[]") ?: "[]")
            if (queue.length() == 0) {flushing=false;return}
            queue.getJSONObject(0)
        }
        val request = Request.Builder().url(url).header("Authorization","Bearer $token")
            .post(item.toString().toRequestBody("application/json".toMediaType())).build()
        client.newCall(request).enqueue(object: Callback {
            override fun onFailure(call: Call,e: IOException) { retryLater("network") }
            override fun onResponse(call: Call,response: Response) {
                val code = response.code
                val body = try { response.use { it.body?.string() } } catch (_: IOException) { retryLater("response_body"); return }
                val acknowledgement = try {JSONObject(body ?: "{}")} catch (_: Exception) {JSONObject()}
                if (code in 200..299 && acknowledgement.optBoolean("received",false)) {
                    synchronized(queueLock) {
                        val queue=JSONArray(prefs.getString(key,"[]") ?: "[]")
                        val remaining=JSONArray()
                        for (i in 0 until queue.length()) if (queue.getJSONObject(i).optString("eventId") != item.optString("eventId")) remaining.put(queue.getJSONObject(i))
                        prefs.edit().putString(key,remaining.toString()).remove("capture_sync_error").commit()
                    }
                    sendHead(token,url,key)
                } else {
                    // 401/403/409 need attention; 429/5xx retry later. None is silently discarded.
                    prefs.edit().putString("capture_sync_error","http_$code").apply()
                    if (code == 429 || code >= 500) retryLater("http_$code") else synchronized(queueLock){flushing=false}
                }
            }
        })
    }
    private fun retryLater(reason: String) {
        synchronized(queueLock){flushing=false}
        prefs.edit().putString("capture_sync_error",reason).apply()
        if (!destroyed) handler.postDelayed({flushQueue()},60_000)
    }
}
