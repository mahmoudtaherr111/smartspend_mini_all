package com.smartspend.bank_capture

import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.PluginRegistry
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Answers the Dart side of bank_capture (pigeons/bank_capture_api.dart) on Android: whether the listener may read
 * notifications, connecting it to the signed-in account with a device token, and disconnecting it when the user signs
 * out. The capture itself runs without Flutter (BankNotificationListener, CaptureWork.kt).
 */
class BankCapturePlugin : FlutterPlugin, ActivityAware, BankCaptureHostApi, PluginRegistry.RequestPermissionsResultListener {
    private var context: Context? = null
    private var activity: ActivityPluginBinding? = null
    private var permissionWaiter: CancellableContinuation<Boolean>? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        BankCaptureHostApi.setUp(binding.binaryMessenger, this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        BankCaptureHostApi.setUp(binding.binaryMessenger, null)
        context = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding
        binding.addRequestPermissionsResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() = onDetachedFromActivity()

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = onAttachedToActivity(binding)

    override fun onDetachedFromActivity() {
        activity?.removeRequestPermissionsResultListener(this)
        activity = null
    }

    override fun getStatus(): CaptureStatus {
        val context = requireContext()
        val settings = CaptureSettings(context)
        val queue = CaptureQueue(context)
        val waiting = try {
            queue.count()
        } finally {
            queue.close()
        }
        return CaptureStatus(
            method = CaptureMethod.NOTIFICATION_LISTENER,
            access = if (isListenerGranted(context)) CaptureAccess.GRANTED else CaptureAccess.NOT_GRANTED,
            connected = settings.connected,
            notificationsAllowed = CaptureNotifier.canNotify(context),
            waiting = waiting,
            lastCaptureAt = settings.lastCaptureAt,
            lastUploadAt = settings.lastUploadAt,
            lastError = settings.lastError,
        )
    }

    override fun openAccessSettings() {
        val context = requireContext()
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11 and newer open this app's own switch instead of the list of every listener.
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                listenerComponent(context).flattenToString(),
            )
        } else {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    override fun connect(setup: CaptureSetup) {
        val context = requireContext()
        val settings = CaptureSettings(context)
        if (settings.ownerKey != null && settings.ownerKey != setup.ownerKey) {
            // Another account signed in on this phone: nothing of the previous one is sent with the new token.
            val queue = CaptureQueue(context)
            try {
                queue.clear()
            } finally {
                queue.close()
            }
            settings.clear()
        }
        settings.baseUrl = setup.baseUrl
        settings.ownerKey = setup.ownerKey
        settings.language = setup.language
        settings.token = setup.deviceToken
        settings.lastError = null
        // Read the server's config at the next send, then keep sending every six hours as a safety net.
        settings.config = null
        CaptureScheduler.sendSoon(context)
        CaptureScheduler.keepAlive(context)
    }

    override fun disconnect() {
        val context = requireContext()
        CaptureScheduler.stop(context)
        val queue = CaptureQueue(context)
        try {
            queue.clear()
        } finally {
            queue.close()
        }
        CaptureSettings(context).clear()
    }

    override fun setLanguage(language: String) {
        CaptureSettings(requireContext()).language = language
    }

    override fun sendNow() {
        CaptureScheduler.sendSoon(requireContext())
    }

    override suspend fun requestNotificationPermission(): Boolean {
        val context = requireContext()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return CaptureNotifier.canNotify(context)
        if (context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return CaptureNotifier.canNotify(context)
        }
        val current: Activity = activity?.activity ?: return false
        return suspendCancellableCoroutine { waiter ->
            permissionWaiter?.resume(false)
            permissionWaiter = waiter
            current.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), PERMISSION_REQUEST)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean {
        if (requestCode != PERMISSION_REQUEST) return false
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        permissionWaiter?.resume(granted)
        permissionWaiter = null
        return true
    }

    private fun requireContext(): Context =
        context ?: throw FlutterError("detached", "bank_capture is not attached to an engine", null)

    private fun listenerComponent(context: Context) =
        ComponentName(context, BankNotificationListener::class.java)

    private fun isListenerGranted(context: Context): Boolean {
        val component = listenerComponent(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            val manager = context.getSystemService(NotificationManager::class.java)
            return manager.isNotificationListenerAccessGranted(component)
        }
        val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            ?: return false
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == component }
    }

    private companion object {
        const val PERMISSION_REQUEST = 7_401
    }
}
