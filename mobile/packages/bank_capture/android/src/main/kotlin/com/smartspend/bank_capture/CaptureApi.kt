package com.smartspend.bank_capture

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/** An answer from `/api/capture/v1`: the status code and the JSON body, when there is one. */
internal class CaptureReply(val code: Int, val body: JSONObject?) {
    val error: String? get() = body?.optString("error")?.takeIf { it.isNotEmpty() }
}

/**
 * Calls the capture routes with the device token (`contracts/capture-intake.ts`). Always JSON, because the server's
 * CSRF check refuses a POST without it, and with this build's version, so the server can refuse a build too old (426).
 * A network failure throws [IOException] and the caller retries later.
 */
internal class CaptureApi(private val baseUrl: String, private val token: String, private val clientVersion: String? = null) {
    fun config(): CaptureReply = call("GET", "/api/capture/v1/config", null)

    fun signals(body: JSONObject): CaptureReply = call("POST", "/api/capture/v1/signals", body)

    fun action(body: JSONObject): CaptureReply = call("POST", "/api/capture/v1/actions", body)

    fun notices(): CaptureReply = call("GET", "/api/capture/v1/notices", null)

    private fun call(method: String, path: String, body: JSONObject?): CaptureReply {
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-Capture-Device", token)
            if (clientVersion != null) connection.setRequestProperty("X-Client-Version", clientVersion)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { it.readBytes().toString(Charsets.UTF_8) }
            val json = text?.takeIf { it.isNotBlank() }?.let { runCatching { JSONObject(it) }.getOrNull() }
            return CaptureReply(code, json)
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TIMEOUT_MS = 15_000
    }
}
