package com.smartspend.bank_capture

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A tap on a transaction's "record" or "not mine" button. The notification goes at once; the answer is sent by
 * [ActionWorker], which retries until the server has it, so the app never has to open.
 */
class CaptureActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val eventId = intent.getLongExtra(EXTRA_EVENT, 0)
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        if (eventId <= 0 || action !in setOf("record", "dismiss", "undo")) return
        CaptureNotifier.cancelReview(context, eventId)
        CaptureScheduler.answer(context, eventId, action)
    }

    companion object {
        private const val EXTRA_EVENT = "eventId"
        private const val EXTRA_ACTION = "action"

        internal fun intent(context: Context, eventId: Long, action: String): PendingIntent {
            val intent = Intent(context, CaptureActionReceiver::class.java)
                .setAction("com.smartspend.bank_capture.ANSWER.$action")
                .putExtra(EXTRA_EVENT, eventId)
                .putExtra(EXTRA_ACTION, action)
            // One request code per signal and button, so each button keeps its own extras.
            val requestCode = (eventId * 3 + when (action) { "record" -> 0; "dismiss" -> 1; else -> 2 }).toInt()
            return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
    }
}
