package com.smartspend.sync

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.text.HtmlCompat

/**
 * DeepLinkActivity — Entry point & Setup screen.
 *
 * Handles two scenarios:
 *   1. Opened via deep link: smartspend://connect?token=TOKEN&url=INGEST_URL
 *      → saves token + url to SharedPreferences, shows "connected" state.
 *   2. Opened normally (launcher):
 *      → shows current connection status.
 *
 * In both cases, guides user to grant Notification Access if not yet granted.
 */
class DeepLinkActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences("smartspend", MODE_PRIVATE)

        // ── Handle deep link ──────────────────────────────────────────────────
        val uri: Uri? = intent?.data
        if (uri != null && uri.scheme == "smartspend" && uri.host == "connect") {
            val token = uri.getQueryParameter("token")
            val url   = uri.getQueryParameter("url")

            if (!token.isNullOrBlank() && !url.isNullOrBlank()) {
                prefs.edit()
                    .putString("webhook_token", token)
                    .putString("ingest_url", url)
                    .putLong("connected_at", System.currentTimeMillis())
                    .apply()
            }
        }

        // ── Render UI state ───────────────────────────────────────────────────
        val token    = prefs.getString("webhook_token", null)
        val ingestUrl= prefs.getString("ingest_url", null)
        val isLinked = !token.isNullOrBlank() && !ingestUrl.isNullOrBlank()
        val hasNotifPerm = isNotificationListenerEnabled()

        val statusIcon  = findViewById<ImageView>(R.id.statusIcon)
        val statusTitle = findViewById<TextView>(R.id.statusTitle)
        val statusBody  = findViewById<TextView>(R.id.statusBody)
        val btnAction   = findViewById<Button>(R.id.btnAction)
        val stepIndicator = findViewById<TextView>(R.id.stepIndicator)

        when {
            // Fully connected ✅
            isLinked && hasNotifPerm -> {
                statusIcon.setImageResource(R.drawable.ic_check_circle)
                statusTitle.text = "متصل بـ SmartSpend ✅"
                statusBody.text  = "التطبيق يعمل في الخلفية.\nكل رسائل البنك ستُسجَّل تلقائياً."
                stepIndicator.text = "الحالة: نشط"
                btnAction.text   = "إغلاق"
                btnAction.setOnClickListener { finish() }
            }

            // Linked but no notification permission yet
            isLinked && !hasNotifPerm -> {
                statusIcon.setImageResource(R.drawable.ic_bell_off)
                statusTitle.text = "خطوة أخيرة! 🔔"
                statusBody.text  = HtmlCompat.fromHtml(
                    "اضغط الزر لفتح إعدادات الإشعارات.<br>" +
                    "ابحث عن <b>SmartSpend Sync</b> وفعّل المفتاح.<br>" +
                    "ارجع هنا وسيتحوّل المؤشر للأخضر.",
                    HtmlCompat.FROM_HTML_MODE_LEGACY
                )
                stepIndicator.text = "الخطوة 3 من 3"
                btnAction.text   = "فتح إعدادات الإشعارات"
                btnAction.setOnClickListener { openNotificationSettings() }
            }

            // Not linked yet (app opened without deep link)
            else -> {
                statusIcon.setImageResource(R.drawable.ic_link_off)
                statusTitle.text = "غير مرتبط بعد"
                statusBody.text  = "افتح موقع SmartSpend من هاتفك\nواضغط 'ربط التطبيق بحسابي'."
                stepIndicator.text = "الخطوة 2 من 3"
                btnAction.text   = "فتح SmartSpend"
                btnAction.setOnClickListener {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://smartspend.app/bank-sync")))
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresh UI in case user just granted notification permission
        recreate()
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val cn   = ComponentName(this, SyncService::class.java)
        return flat.contains(cn.flattenToString())
    }

    private fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        startActivity(intent)
    }
}
