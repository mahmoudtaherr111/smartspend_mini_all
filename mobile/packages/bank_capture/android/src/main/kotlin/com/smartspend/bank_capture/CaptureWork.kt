package com.smartspend.bank_capture

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Schedules the sends. One unique chain, so a burst of notifications never starts parallel sends. */
internal object CaptureScheduler {
    private const val UPLOAD = "smartspend.capture.upload"
    private const val PERIODIC = "smartspend.capture.periodic"
    private const val NOTICES = "smartspend.capture.notices"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Sends soon: expedited when the system allows it, as ordinary work when the quota is used up. */
    fun sendSoon(context: Context) {
        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(online)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UPLOAD, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /** A send every six hours, in case a notification's own send was lost. */
    fun keepAlive(context: Context) {
        val request = PeriodicWorkRequestBuilder<UploadWorker>(6, TimeUnit.HOURS).setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Asks for the questions the server's model leaves for queued signals, a few seconds from now (decision 0031). */
    fun fetchNotices(context: Context) {
        val request = OneTimeWorkRequestBuilder<NoticeWorker>()
            .setConstraints(online)
            .setInitialDelay(NOTICE_DELAY_S, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.LINEAR, NOTICE_DELAY_S, TimeUnit.SECONDS)
            .build()
        // One fetch takes every waiting notice: a fetch already planned is enough.
        WorkManager.getInstance(context).enqueueUniqueWork(NOTICES, ExistingWorkPolicy.KEEP, request)
    }

    fun answer(context: Context, eventId: Long, action: String) {
        val request = OneTimeWorkRequestBuilder<ActionWorker>()
            .setConstraints(online)
            .setInputData(workDataOf("eventId" to eventId, "action" to action, "actionId" to UUID.randomUUID().toString().replace("-", "")))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueue(request)
    }

    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(UPLOAD)
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(NOTICES)
    }

    private const val NOTICE_DELAY_S = 10L
}

/** Shared by the two workers: the foreground notice expedited work needs on Android 11 and older. */
private fun foregroundInfo(context: Context): ForegroundInfo {
    // Only Android 11 and older run expedited work as a foreground service, and they need no service type.
    val notification = CaptureNotifier.syncNotification(context, CaptureSettings(context).language)
    return ForegroundInfo(CaptureNotifier.SYNC_NOTIFICATION_ID, notification)
}

/**
 * Sends the waiting signals, oldest first, in batches, and shows the server's notice for each one kept for review.
 * A signal with a result leaves the queue, whatever the result; one the server never answered stays for the next try.
 */
internal class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(applicationContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val context = applicationContext
        val settings = CaptureSettings(context)
        val token = settings.token
        val baseUrl = settings.baseUrl
        val owner = settings.ownerKey
        if (token == null || baseUrl == null || owner == null) return@withContext Result.success()
        val api = CaptureApi(baseUrl, token, appVersion(context))
        val queue = CaptureQueue(context)
        try {
            if (System.currentTimeMillis() - settings.configAt > CONFIG_MAX_AGE_MS || settings.config == null) {
                val reply = api.config()
                when {
                    reply.code == 200 && reply.body != null -> settings.config = CaptureConfig.parse(reply.body)
                    reply.code == 401 -> return@withContext stopForDevice(settings, queue)
                    reply.code >= 500 -> return@withContext Result.retry()
                }
            }
            queue.prune(owner)
            val batchMax = settings.config?.batchMax ?: 20
            repeat(MAX_BATCHES) {
                val batch = queue.oldest(owner, batchMax)
                if (batch.isEmpty()) {
                    settings.lastError = null
                    return@withContext Result.success()
                }
                val reply = api.signals(request(batch, settings.language))
                when (reply.code) {
                    200 -> handle(reply.body, batch, queue, settings)
                    401 -> return@withContext stopForDevice(settings, queue)
                    426 -> {
                        // This build is too old: keep the queue for the updated app, and say so on the card.
                        settings.lastError = "update_required"
                        return@withContext Result.success()
                    }
                    403, 503 -> {
                        // Consent taken back or capture switched off: keep the queue, and read the config again.
                        settings.lastError = reply.error ?: "capture_disabled"
                        settings.config = null
                        return@withContext Result.success()
                    }
                    400, 413 -> {
                        // The batch as a whole is not acceptable: drop it rather than send it forever.
                        queue.remove(batch.map { it.id })
                        settings.lastError = "invalid_request"
                    }
                    429 -> return@withContext Result.retry()
                    else -> return@withContext if (reply.code >= 500) Result.retry() else Result.success()
                }
            }
            Result.success()
        } catch (_: IOException) {
            settings.lastError = "offline"
            Result.retry()
        } finally {
            queue.close()
        }
    }

    private fun request(batch: List<QueuedSignal>, language: String): JSONObject {
        val signals = JSONArray()
        for (signal in batch) {
            signals.put(
                JSONObject()
                    .put("id", signal.id)
                    .put("channel", signal.channel)
                    .put("app", signal.app ?: JSONObject.NULL)
                    .put("sender", signal.sender ?: JSONObject.NULL)
                    .put("title", signal.title ?: JSONObject.NULL)
                    .put("text", signal.text.take(TEXT_MAX))
                    .put("postedAt", isoInstant(signal.postedAt)),
            )
        }
        return JSONObject().put("signals", signals).put("lang", if (language == "en") "en" else "ar")
    }

    private fun handle(body: JSONObject?, batch: List<QueuedSignal>, queue: CaptureQueue, settings: CaptureSettings) {
        val results = body?.optJSONArray("results") ?: return
        val answered = mutableListOf<String>()
        var queued = false
        for (i in 0 until results.length()) {
            val result = results.getJSONObject(i)
            val id = result.optString("id")
            if (batch.none { it.id == id }) continue
            answered.add(id)
            // Every result is final, including one this build does not know.
            if (result.optString("result") == "queued") queued = true
            // A notice comes with a payment to answer, or once a month with the first one held over the limit.
            showNotice(applicationContext, result.optJSONObject("notice"), result.optLong("eventId", 0), settings.language)
        }
        // The server's model reads these next; their questions come from the notices route.
        if (queued) CaptureScheduler.fetchNotices(applicationContext)
        queue.remove(answered)
        settings.lastUploadAt = System.currentTimeMillis()
        settings.lastError = null
    }

    private fun stopForDevice(settings: CaptureSettings, queue: CaptureQueue): Result {
        // The token was revoked: nothing more can be sent for this account until the app registers again.
        queue.clear()
        settings.token = null
        settings.lastError = "device_revoked"
        return Result.success()
    }

    private companion object {
        const val MAX_BATCHES = 5
        const val TEXT_MAX = 2_000
        const val CONFIG_MAX_AGE_MS = 6L * 3600 * 1000
    }
}

/** Sends a notification button's answer. Repeating it is harmless: the server keeps the first answer. */
internal class ActionWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(applicationContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val settings = CaptureSettings(applicationContext)
        val token = settings.token ?: return@withContext Result.success()
        val baseUrl = settings.baseUrl ?: return@withContext Result.success()
        val eventId = inputData.getLong("eventId", 0)
        val action = inputData.getString("action") ?: return@withContext Result.success()
        val actionId = inputData.getString("actionId") ?: return@withContext Result.success()
        if (eventId <= 0) return@withContext Result.success()
        try {
            val reply = CaptureApi(baseUrl, token, appVersion(applicationContext)).action(
                JSONObject().put("actionId", actionId).put("eventId", eventId).put("action", action),
            )
            when {
                reply.code == 429 || reply.code >= 500 -> Result.retry()
                else -> Result.success()
            }
        } catch (_: IOException) {
            Result.retry()
        }
    }
}

/** Shows the server's notice for a payment, when there is one. */
private fun showNotice(context: Context, notice: JSONObject?, eventId: Long, language: String) {
    if (notice == null || eventId <= 0) return
    val actions = notice.optJSONArray("actions")
    CaptureNotifier.showReview(
        context,
        eventId,
        notice.optString("title"),
        notice.optString("body"),
        (0 until (actions?.length() ?: 0)).map { actions!!.getString(it) },
        language,
    )
}

/**
 * Fetches the notices the server's model left for this phone's queued signals and shows them. While some are still
 * being read it asks again, a few times, then leaves the rest to the app's review list.
 */
internal class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val settings = CaptureSettings(applicationContext)
        val token = settings.token ?: return@withContext Result.success()
        val baseUrl = settings.baseUrl ?: return@withContext Result.success()
        try {
            val reply = CaptureApi(baseUrl, token, appVersion(applicationContext)).notices()
            if (reply.code == 429 || reply.code >= 500) return@withContext retryOrStop()
            if (reply.code != 200) return@withContext Result.success()
            val notices = reply.body?.optJSONArray("notices")
            for (i in 0 until (notices?.length() ?: 0)) {
                val item = notices!!.getJSONObject(i)
                showNotice(applicationContext, item.optJSONObject("notice"), item.optLong("eventId", 0), settings.language)
            }
            if ((reply.body?.optInt("pending", 0) ?: 0) > 0) retryOrStop() else Result.success()
        } catch (_: IOException) {
            retryOrStop()
        }
    }

    private fun retryOrStop(): Result = if (runAttemptCount < MAX_TRIES) Result.retry() else Result.success()

    private companion object {
        const val MAX_TRIES = 5
    }
}

/** This app's version name ("1.4.0"), sent so the server can refuse a build too old to talk to it. */
internal fun appVersion(context: Context): String? =
    runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()

/** An instant as the server reads it: ISO 8601 in UTC. */
internal fun isoInstant(millis: Long): String {
    val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    format.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return format.format(java.util.Date(millis))
}
