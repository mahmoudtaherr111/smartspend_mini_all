package com.smartspend.bank_capture

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony

/**
 * Bank and wallet SMS read directly, in the build that declares the SMS permissions (plan v6 §6.1). The default
 * build declares neither the permissions nor this receiver (`mobile/packages/bank_capture/android-sms`), so it never
 * runs there. A long SMS arrives in parts: the parts of one sender are joined into one message before the phone's
 * filter ([CaptureGate]). The sender is the network's originating address, so a bank saved as a contact is still
 * the bank. Never log a message's text or sender (golden rule 10 in the root AGENTS.md).
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        try {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
            val joined = LinkedHashMap<String, StringBuilder>()
            val times = HashMap<String, Long>()
            for (part in messages) {
                val sender = part?.originatingAddress ?: continue
                joined.getOrPut(sender) { StringBuilder() }.append(part.messageBody.orEmpty())
                times.putIfAbsent(sender, part.timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis())
            }
            for ((sender, body) in joined) {
                SmsCapture.keep(context.applicationContext, sender, body.toString(), times[sender] ?: System.currentTimeMillis())
            }
        } catch (_: Exception) {
            // A message that cannot be read is skipped; the receiver must never crash the app.
        }
    }
}

internal object SmsCapture {
    /** Whether this build declares SMS reading at all (the SMS build only). */
    fun supported(context: Context): Boolean = try {
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        }
        info.requestedPermissions?.contains(Manifest.permission.RECEIVE_SMS) == true
    } catch (_: Exception) {
        false
    }

    /** SMS arrive here: the build declares them and the person allowed it. */
    fun active(context: Context): Boolean =
        supported(context) && context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    /** One whole SMS through the same checks as a notification, into the encrypted queue. */
    fun keep(context: Context, sender: String, text: String, at: Long, imported: Boolean = false): Boolean {
        if (text.isBlank()) return false
        val settings = CaptureSettings(context)
        val owner = settings.ownerKey ?: return false
        val token = settings.token ?: return false
        if (!settings.connected) return false
        val config = settings.config ?: return false
        if (!config.enabled || !config.consented) return false
        if (config.gate.dropReason(sender, sender, text, true) != null) return false
        synchronized(CaptureOwnerGuard.lock) {
            if (!CaptureOwnerGuard.matches(settings, owner, token)) return false
            val queue = CaptureQueue(context)
            try {
                // A message seen once (live, or again by an inbox import) is one message.
                if (!queue.firstSight("sms|$sender|$at|${text.hashCode()}")) return false
                queue.add(owner, "sms", null, sender, sender, text, at, imported)
            } finally {
                queue.close()
            }
            settings.lastCaptureAt = System.currentTimeMillis()
        }
        if (!imported) CaptureScheduler.sendSoon(context)
        return true
    }
}

/**
 * A one-time import of the inbox's past bank SMS (plan v6 §6.3), newest first, through the same filter and queue as a
 * live SMS. The server keeps signals 30 days, so older messages are not read. Never log a message or its sender.
 */
internal object SmsInbox {
    private const val MAX_DAYS = 30

    fun import(context: Context, days: Int, max: Int): Int {
        if (!SmsCapture.supported(context)) return 0
        if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) return 0
        val since = System.currentTimeMillis() - days.coerceIn(1, MAX_DAYS) * 24L * 3600 * 1000
        var queued = 0
        context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
            "${Telephony.Sms.DATE} >= ?",
            arrayOf(since.toString()),
            "${Telephony.Sms.DATE} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext() && queued < max) {
                val sender = cursor.getString(0) ?: continue
                val body = cursor.getString(1) ?: continue
                if (SmsCapture.keep(context, sender, body, cursor.getLong(2), imported = true)) queued++
            }
        }
        if (queued > 0) CaptureScheduler.sendSoon(context)
        return queued
    }
}
