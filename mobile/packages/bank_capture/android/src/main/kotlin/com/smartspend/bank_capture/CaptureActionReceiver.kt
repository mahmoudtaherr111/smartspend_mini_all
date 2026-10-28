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
        val signalId = intent.getLongExtra(EXTRA_SIGNAL, 0)
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        if (signalId <= 0 || (action != "record" && action != "dismiss")) return
        CaptureNotifier.cancelReview(context, signalId)
        CaptureScheduler.answer(context, signalId, action)
    }

    companion object {
        private const val EXTRA_SIGNAL = "signalId"
        private const val EXTRA_ACTION = "action"

        internal fun intent(context: Context, signalId: Long, action: String): PendingIntent {
            val intent = Intent(context, CaptureActionReceiver::class.java)
                .setAction("com.smartspend.bank_capture.ANSWER.$action")
                .putExtra(EXTRA_SIGNAL, signalId)
                .putExtra(EXTRA_ACTION, action)
            // One request code per signal and button, so each button keeps its own extras.
            val requestCode = (signalId * 2 + if (action == "record") 0 else 1).toInt()
            return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
    }
}
