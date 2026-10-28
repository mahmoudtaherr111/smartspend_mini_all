package com.smartspend.bank_capture

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings
import org.json.JSONObject

/** Whether the person still lets this app read notifications (the system's notification access screen). */
internal fun listenerGranted(context: Context): Boolean {
    val component = ComponentName(context, BankNotificationListener::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        val manager = context.getSystemService(NotificationManager::class.java)
        return manager.isNotificationListenerAccessGranted(component)
    }
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == component }
}

/**
 * The phone's health (decision 0034): every twelve hours the sending work reports to the server whether access is
 * still granted, whether notifications may be shown and what waits to be sent; and once a day, while access is gone,
 * the phone itself says capture stopped, because the server cannot reach it.
 */
internal object CaptureHealth {
    private const val REPORT_EVERY_MS = 12L * 3600 * 1000
    private const val TELL_EVERY_MS = 24L * 3600 * 1000

    fun reportIfDue(context: Context, api: CaptureApi, settings: CaptureSettings, waiting: Long) {
        val now = System.currentTimeMillis()
        val access = listenerGranted(context)
        if (!access && now - settings.stoppedNoticeAt > TELL_EVERY_MS) {
            CaptureNotifier.showStopped(context, settings.language)
            settings.stoppedNoticeAt = now
        }
        if (now - settings.heartbeatAt < REPORT_EVERY_MS) return
        val report = JSONObject()
            .put("access", access)
            .put("notifications", CaptureNotifier.canNotify(context))
            .put("waiting", waiting)
            .put("lastCaptureAt", settings.lastCaptureAt?.let { isoInstant(it) } ?: JSONObject.NULL)
        appVersion(context)?.let { report.put("appVersion", it.take(32)) }
        // A report that does not arrive is sent again on the next run.
        if (api.heartbeat(report).code in 200..299) settings.heartbeatAt = now
    }
}
