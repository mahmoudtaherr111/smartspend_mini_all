package com.smartspend.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "com.smartspend.app/share"
    private var sharedText: String? = null
    private var pendingRoute: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()
        handleIntent(intent)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val budgetChannel = NotificationChannel(
                "channel_budget_spending",
                "Budgets & Spending Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts when approaching or exceeding budgets"
                enableVibration(true)
                enableLights(true)
            }

            val securityChannel = NotificationChannel(
                "channel_security_auth",
                "Security & Authentication",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Security, login alerts, and biometric updates"
                enableVibration(true)
            }

            val reminderChannel = NotificationChannel(
                "channel_reminders_marketing",
                "Reminders & Updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Periodic financial summaries and updates"
            }

            notificationManager.createNotificationChannels(listOf(budgetChannel, securityChannel, reminderChannel))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
        }
        // Fallback for callers that pass a route extra without an ACTION_VIEW URI (which FlutterActivity handles natively).
        if (intent?.data == null) {
            val route = intent?.getStringExtra("route")?.takeIf { it.startsWith("/") }
            if (route != null) {
                val engine = flutterEngine
                if (engine != null) {
                    engine.navigationChannel.pushRouteInformation(route)
                } else {
                    pendingRoute = route
                }
            }
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        pendingRoute?.let { route ->
            pendingRoute = null
            flutterEngine.navigationChannel.pushRouteInformation(route)
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            if (call.method == "getSharedText") {
                result.success(sharedText)
                sharedText = null
            } else {
                result.notImplemented()
            }
        }
    }
}
