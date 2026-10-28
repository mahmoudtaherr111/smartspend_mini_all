package com.smartspend.bank_capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/**
 * The notifications capture shows: one per captured transaction, asking whether to record it (the text comes from the
 * server, in the phone's language), and the quiet one Android needs while a send runs in the foreground on older
 * phones. A transaction's notification is private: the lock screen shows only that a bank transaction arrived, never
 * its amount or merchant.
 */
internal object CaptureNotifier {
    private const val REVIEW_CHANNEL = "smartspend_capture_review"
    private const val SYNC_CHANNEL = "smartspend_capture_sync"
    const val SYNC_NOTIFICATION_ID = 7_400_001

    private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return manager(context).areNotificationsEnabled()
    }

    private fun ensureChannels(context: Context, arabic: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val review = NotificationChannel(
            REVIEW_CHANNEL,
            if (arabic) "عمليات البنك" else "Bank transactions",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE }
        val sync = NotificationChannel(
            SYNC_CHANNEL,
            if (arabic) "إرسال رسايل البنك" else "Sending bank messages",
            NotificationManager.IMPORTANCE_MIN,
        )
        manager(context).createNotificationChannels(listOf(review, sync))
    }

    @Suppress("DEPRECATION")
    private fun builder(context: Context, channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel) else Notification.Builder(context)

    private fun openApp(context: Context): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun smallIcon(context: Context): Int = context.applicationInfo.icon

    /** Asks about one captured transaction. [actions] are the buttons the server allowed ("record", "dismiss"). */
    fun showReview(context: Context, eventId: Long, title: String, body: String, actions: List<String>, language: String) {
        if (!canNotify(context)) return
        val arabic = language != "en"
        ensureChannels(context, arabic)
        val publicVersion = builder(context, REVIEW_CHANNEL)
            .setSmallIcon(smallIcon(context))
            .setContentTitle(if (arabic) "عملية جديدة من البنك" else "New bank transaction")
            .build()
        val notification = builder(context, REVIEW_CHANNEL)
            .setSmallIcon(smallIcon(context))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
        for (action in actions) {
            val label = when (action) {
                "record" -> if (arabic) "سجّل" else "Record"
                "dismiss" -> if (arabic) "مش مصروف" else "Not mine"
                "undo" -> if (arabic) "تراجع" else "Undo"
                else -> continue
            }
            notification.addAction(Notification.Action.Builder(null, label, CaptureActionReceiver.intent(context, eventId, action)).build())
        }
        manager(context).notify(notificationId(eventId), notification.build())
    }

    fun cancelReview(context: Context, eventId: Long) = manager(context).cancel(notificationId(eventId))

    /** The quiet notification of a send running in the foreground (expedited work on Android 11 and older). */
    fun syncNotification(context: Context, language: String): Notification {
        val arabic = language != "en"
        ensureChannels(context, arabic)
        return builder(context, SYNC_CHANNEL)
            .setSmallIcon(smallIcon(context))
            .setContentTitle(if (arabic) "بنبعت رسايل البنك" else "Sending bank messages")
            .setOngoing(true)
            .build()
    }

    /** A payment's id keeps its notification one, so a repeated answer replaces it instead of adding one. */
    private fun notificationId(eventId: Long): Int = (eventId % Int.MAX_VALUE).toInt()
}
