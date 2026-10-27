package com.smartspend.bank_capture

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives the phone's notifications once the user grants this app notification access.
 *
 * It keeps nothing yet. Milestone 4 of docs/decisions/0022-flutter-mobile-app.md puts here the filters that keep
 * bank and wallet messages, a queue that survives restarts, and the upload to the rebuilt capture intake (the old
 * companion app and its ingest route were removed). Never log a
 * notification's text (golden rule 10 in the root AGENTS.md).
 */
class BankNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) = Unit
}
