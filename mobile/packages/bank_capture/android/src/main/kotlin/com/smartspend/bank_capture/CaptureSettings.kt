package com.smartspend.bank_capture

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import org.json.JSONObject

/**
 * What capture keeps outside the queue: the device token (encrypted), the API's origin, whose token it is, the
 * interface language, the server's `/config`, and the moments and error the app's status shows. Never the text of a
 * message.
 */
internal class CaptureSettings(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)?.let { CaptureCipher.decrypt(Base64.decode(it, Base64.NO_WRAP)) }
        set(value) = prefs.edit().apply {
            if (value == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, Base64.encodeToString(CaptureCipher.encrypt(value), Base64.NO_WRAP))
        }.apply()

    var baseUrl: String?
        get() = prefs.getString(KEY_BASE_URL, null)
        set(value) = prefs.edit().putString(KEY_BASE_URL, value).apply()

    var ownerKey: String?
        get() = prefs.getString(KEY_OWNER, null)
        set(value) = prefs.edit().putString(KEY_OWNER, value).apply()

    var language: String
        get() = prefs.getString(KEY_LANGUAGE, "ar") ?: "ar"
        set(value) = prefs.edit().putString(KEY_LANGUAGE, value).apply()

    /** The server's `/config` as it came, and when. */
    var config: CaptureConfig?
        get() = prefs.getString(KEY_CONFIG, null)?.let { runCatching { CaptureConfig.parse(JSONObject(it)) }.getOrNull() }
        set(value) = prefs.edit().putString(KEY_CONFIG, value?.raw).putLong(KEY_CONFIG_AT, System.currentTimeMillis()).apply()

    val configAt: Long get() = prefs.getLong(KEY_CONFIG_AT, 0)

    var lastCaptureAt: Long?
        get() = prefs.getLong(KEY_LAST_CAPTURE, 0).takeIf { it > 0 }
        set(value) = prefs.edit().putLong(KEY_LAST_CAPTURE, value ?: 0).apply()

    var lastUploadAt: Long?
        get() = prefs.getLong(KEY_LAST_UPLOAD, 0).takeIf { it > 0 }
        set(value) = prefs.edit().putLong(KEY_LAST_UPLOAD, value ?: 0).apply()

    var lastError: String?
        get() = prefs.getString(KEY_LAST_ERROR, null)
        set(value) = prefs.edit().putString(KEY_LAST_ERROR, value).apply()

    /** When the phone last reported its health, and last said capture stopped. */
    var heartbeatAt: Long
        get() = prefs.getLong(KEY_HEARTBEAT_AT, 0)
        set(value) = prefs.edit().putLong(KEY_HEARTBEAT_AT, value).apply()

    var stoppedNoticeAt: Long
        get() = prefs.getLong(KEY_STOPPED_NOTICE_AT, 0)
        set(value) = prefs.edit().putLong(KEY_STOPPED_NOTICE_AT, value).apply()

    val connected: Boolean get() = token != null && baseUrl != null && ownerKey != null

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val FILE = "smartspend_capture"
        const val KEY_TOKEN = "token"
        const val KEY_BASE_URL = "base_url"
        const val KEY_OWNER = "owner"
        const val KEY_LANGUAGE = "language"
        const val KEY_CONFIG = "config"
        const val KEY_CONFIG_AT = "config_at"
        const val KEY_LAST_CAPTURE = "last_capture_at"
        const val KEY_LAST_UPLOAD = "last_upload_at"
        const val KEY_LAST_ERROR = "last_error"
        const val KEY_HEARTBEAT_AT = "heartbeat_at"
        const val KEY_STOPPED_NOTICE_AT = "stopped_notice_at"
    }
}

/** The parts of the server's `/config` (`contracts/capture-intake.ts#CaptureConfig`) the phone uses. */
internal class CaptureConfig(
    val raw: String,
    val enabled: Boolean,
    val consented: Boolean,
    /** Bank, wallet and fintech apps whose notifications are read as they are. */
    val appPackages: Set<String>,
    /** Messaging apps: their notifications are SMS, judged by the sender. */
    val messagingPackages: Set<String>,
    val otpWords: List<String>,
    val currencyWords: List<String>,
    val batchMax: Int,
) {
    val gate: CaptureGate by lazy { CaptureGate(otpWords, currencyWords) }

    companion object {
        fun parse(json: JSONObject): CaptureConfig {
            val apps = mutableSetOf<String>()
            val messaging = mutableSetOf<String>()
            val sources = json.optJSONArray("sources")
            for (i in 0 until (sources?.length() ?: 0)) {
                val source = sources!!.getJSONObject(i)
                val packages = source.optJSONArray("androidPackages")
                val target = if (source.optString("kind") == "sms_app") messaging else apps
                for (j in 0 until (packages?.length() ?: 0)) target.add(packages!!.getString(j))
            }
            val gate = json.optJSONObject("gate")
            fun words(name: String): List<String> {
                val list = gate?.optJSONArray(name) ?: return emptyList()
                return (0 until list.length()).map { list.getString(it) }
            }
            return CaptureConfig(
                raw = json.toString(),
                enabled = json.optBoolean("enabled", false),
                consented = json.optJSONObject("consent")?.optBoolean("capture", false) ?: false,
                appPackages = apps,
                messagingPackages = messaging,
                otpWords = words("otpWords"),
                currencyWords = words("currencyWords"),
                batchMax = json.optInt("batchMax", 20).coerceIn(1, 20),
            )
        }
    }
}
