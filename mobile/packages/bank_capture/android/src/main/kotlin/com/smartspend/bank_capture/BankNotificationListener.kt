package com.smartspend.bank_capture

import android.app.Notification
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives the phone's notifications once the user grants this app notification access, and keeps those of bank,
 * wallet and messaging apps (decision 0028). The component name stays `.BankNotificationListener`: renaming it would
 * take the access away from everyone who granted it.
 *
 * An app the server's catalog does not list is refused before its notification is read. A kept message goes through
 * the phone's filter ([CaptureGate]), then into the encrypted queue, and a send is scheduled. Never log a
 * notification's text (golden rule 10 in the root AGENTS.md).
 */
class BankNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        try {
            capture(sbn)
        } catch (_: Exception) {
            // A notification that cannot be read is skipped; the listener must never crash.
        }
    }

    override fun onListenerDisconnected() {
        // Some phones unbind the listener after an update or to save power; ask to be bound again.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            NotificationListenerService.requestRebind(ComponentName(this, BankNotificationListener::class.java))
        }
    }

    private fun capture(sbn: StatusBarNotification) {
        val settings = CaptureSettings(this)
        val owner = settings.ownerKey ?: return
        if (!settings.connected) return
        val config = settings.config ?: return
        if (!config.enabled || !config.consented) return

        val app = sbn.packageName ?: return
        if (app == packageName) return
        val defaultSms = Telephony.Sms.getDefaultSmsPackage(this)
        val messaging = app in config.messagingPackages || app == defaultSms
        if (!messaging && app !in config.appPackages) return

        val notification = sbn.notification ?: return
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (sbn.isOngoing) return

        val read = NotificationText.read(notification.extras ?: return, messaging) ?: return
        val gate = config.gate.dropReason(read.sender, read.title, read.text, messaging)
        if (gate != null) return

        val queue = CaptureQueue(this)
        try {
            // The system posts a notification again when it is updated: one identity is one message.
            val identity = "${sbn.key}|${read.postedAt}|${read.text.hashCode()}"
            if (!queue.firstSight(identity)) return
            queue.add(owner, if (messaging) "sms" else "notification", app, read.sender, read.title, read.text, read.postedAt)
        } finally {
            queue.close()
        }
        settings.lastCaptureAt = System.currentTimeMillis()
        CaptureScheduler.sendSoon(this)
    }
}

/** What a notification says: its title, its full text, and for a messaging app the sender of its newest message. */
internal data class NotificationText(val title: String?, val text: String, val sender: String?, val postedAt: Long) {
    companion object {
        fun read(extras: Bundle, messaging: Boolean): NotificationText? {
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            val conversation = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()

            // A messaging app's newest message, with its own time, when the notification carries a conversation.
            if (messaging) {
                @Suppress("DEPRECATION")
                val messages: Array<Parcelable>? = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
                val newest = messages?.lastOrNull() as? Bundle
                val text = newest?.getCharSequence("text")?.toString()
                if (!text.isNullOrBlank()) {
                    val sender = newest?.getCharSequence("sender")?.toString() ?: conversation ?: title
                    val time = newest?.getLong("time", 0L)?.takeIf { it > 0 } ?: System.currentTimeMillis()
                    return NotificationText(title = conversation ?: title, text = text, sender = sender, postedAt = time)
                }
            }

            // Otherwise the long text, then the lines of an inbox-style notification, then the short text.
            val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.lastOrNull()?.toString()
            val short = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            val text = listOf(big, lines, short).firstOrNull { !it.isNullOrBlank() } ?: return null
            return NotificationText(
                title = title,
                text = text,
                sender = if (messaging) conversation ?: title else null,
                postedAt = System.currentTimeMillis(),
            )
        }
    }
}
