package com.smartspend.bank_capture

/** No network while held. Serializes local queue/notification effects with account changes in this app process. */
internal object CaptureOwnerGuard {
    val lock = Any()
    fun matches(settings: CaptureSettings, owner: String, token: String): Boolean =
        settings.ownerKey == owner && settings.token == token
}
