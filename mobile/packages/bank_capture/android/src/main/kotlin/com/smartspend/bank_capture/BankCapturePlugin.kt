package com.smartspend.bank_capture

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.engine.plugins.FlutterPlugin

/** Answers the Dart side of bank_capture (pigeons/bank_capture_api.dart) on Android. */
class BankCapturePlugin : FlutterPlugin, BankCaptureHostApi {
    private var context: Context? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        BankCaptureHostApi.setUp(binding.binaryMessenger, this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        BankCaptureHostApi.setUp(binding.binaryMessenger, null)
        context = null
    }

    override fun getStatus(): CaptureStatus {
        val granted = isListenerGranted(requireContext())
        return CaptureStatus(
            method = CaptureMethod.NOTIFICATION_LISTENER,
            access = if (granted) CaptureAccess.GRANTED else CaptureAccess.NOT_GRANTED,
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
}
