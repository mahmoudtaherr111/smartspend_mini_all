package com.smartspend.bank_capture

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives the phone's notifications once the user grants this app notification access.
 *
 * It keeps nothing yet. Milestone 4 of docs/decisions/0022-flutter-mobile-app.md moves here what the companion
 * app does in android-app/app/src/main/java/com/smartspend/sync/SyncService.kt: the filters that keep bank and
 * wallet messages, a queue that survives restarts, and the upload to POST /api/sms/ingest. Never log a
 * notification's text (golden rule 10 in the root AGENTS.md).
 */
class BankNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) = Unit
}
