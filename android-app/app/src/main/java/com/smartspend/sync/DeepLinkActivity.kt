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
import androidx.appcompat.app.AlertDialog
import androidx.core.text.HtmlCompat

/**
 * DeepLinkActivity — Entry point & Setup screen.
 *
 * Handles two scenarios:
 *   1. Opened via deep link: smartspend://connect?token=TOKEN&url=INGEST_URL
 *      → validates the HTTPS endpoint and asks the device owner to approve pairing.
 *   2. Opened normally (launcher):
 *      → shows current connection status.
 *
 * In both cases, guides user to grant Notification Access if not yet granted.
 */
class DeepLinkActivity : AppCompatActivity() {

    private lateinit var statusIcon: ImageView
    private lateinit var statusTitle: TextView
    private lateinit var statusBody: TextView
    private lateinit var btnAction: Button
    private lateinit var stepIndicator: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusIcon  = findViewById(R.id.statusIcon)
        statusTitle = findViewById(R.id.statusTitle)
        statusBody  = findViewById(R.id.statusBody)
        btnAction   = findViewById(R.id.btnAction)
        stepIndicator = findViewById(R.id.stepIndicator)

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        // Refresh UI state when resuming without recreations
        refreshUI()
    }

    private fun handleIntent(intent: Intent?) {
        val uri: Uri? = intent?.data
        if (uri != null && uri.scheme == "smartspend" && uri.host == "connect") {
            val token = uri.getQueryParameter("token")
            val url   = uri.getQueryParameter("url")

            if (!token.isNullOrBlank() && !url.isNullOrBlank()) {
                val endpoint = Uri.parse(url)
                if (endpoint.scheme != "https" || endpoint.host.isNullOrBlank() || endpoint.userInfo != null ||
                    endpoint.path != "/api/sms/ingest" || endpoint.query != null || endpoint.fragment != null || token.length > 512) return
                // A web link cannot silently replace the destination of financial notifications.
                AlertDialog.Builder(this)
                    .setTitle("تأكيد ربط الإشعارات")
                    .setMessage("سيُرسل نص إشعارات الدفع إلى:\n${endpoint.host}\n\nتأكد أن هذا هو الموقع الذي بدأت منه ربط حسابك. عند تغيير الحساب تبقى الرسائل القديمة في نطاق الربط السابق.")
                    .setNegativeButton("إلغاء", null)
                    .setPositiveButton("ربط هذا الحساب") { _, _ ->
                        getSharedPreferences("smartspend", MODE_PRIVATE).edit()
                            .putString("webhook_token", token)
                            .putString("ingest_url", url)
                            .putLong("connected_at", System.currentTimeMillis())
                            .commit()
                        refreshUI()
                    }.show()
            }
        }
    }

    private fun refreshUI() {
        val prefs = getSharedPreferences("smartspend", MODE_PRIVATE)
        val token    = prefs.getString("webhook_token", null)
        val ingestUrl= prefs.getString("ingest_url", null)
        val isLinked = !token.isNullOrBlank() && !ingestUrl.isNullOrBlank()
        val hasNotifPerm = isNotificationListenerEnabled()

        when {
            // Fully connected ✅
            isLinked && hasNotifPerm -> {
                statusIcon.setImageResource(R.drawable.ic_check_circle)
                statusTitle.text = "متصل بـ SmartSpend ✅"
                statusBody.text  = if (prefs.getString("capture_sync_error",null) != null)
                    "توجد إشعارات تنتظر المزامنة. افتح SmartSpend وراجع الاتصال وحدود الحساب."
                    else "الإشعارات المتاحة تُرسل للمراجعة في SmartSpend.\nقد لا يعرض الهاتف كل تفاصيل الرسالة."
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
