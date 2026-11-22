import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/deep_links.dart';
import '../../core/providers.dart';
import '../../routing/app_router.dart';

export '../../core/deep_links.dart' show resolveAppRoute;

/// Top-level background message handler required by FirebaseMessaging.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (kDebugMode) {
    print('Handling background notification: ${message.messageId}');
  }
}

final class PushNotificationService {
  PushNotificationService(this._ref);

  final Ref _ref;
  bool _initialized = false;
  String? _fcmToken;
  final _foregroundMessageController =
      StreamController<RemoteMessage>.broadcast();

  String? get fcmToken => _fcmToken;
  Stream<RemoteMessage> get onForegroundMessage =>
      _foregroundMessageController.stream;

  /// Requests OS push notification permission and initializes FCM if granted.
  Future<bool> requestPermission() async {
    try {
      await Firebase.initializeApp();
      final settings = await FirebaseMessaging.instance.requestPermission();
      final granted =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (granted) {
        await initialize(askPermission: false);
      }
      return granted;
    } catch (e) {
      if (kDebugMode) {
        print('PushNotificationService requestPermission note: $e');
      }
      return false;
    }
  }

  /// Initializes Firebase and Push Notification handlers safely.
  Future<void> initialize({bool askPermission = false}) async {
    if (_initialized) return;

    try {
      // 1. Initialize Firebase Core safely
      await Firebase.initializeApp();

      // Set background handler
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      // 2. Request Notification Permissions (critical for iOS and Android 13+)
      // Asked when the person turns notifications on, never on launch (design rule: ask after explaining).
      final settings = askPermission
          ? await FirebaseMessaging.instance.requestPermission()
          : await FirebaseMessaging.instance.getNotificationSettings();
      if (settings.authorizationStatus != AuthorizationStatus.authorized &&
          settings.authorizationStatus != AuthorizationStatus.provisional) {
        return;
      }

      if (kDebugMode) {
        print(
          'User notification permission status: ${settings.authorizationStatus}',
        );
      }

      // 3. Configure iOS foreground presentation options
      if (!kIsWeb && Platform.isIOS) {
        await FirebaseMessaging.instance
            .setForegroundNotificationPresentationOptions(
              alert: true,
              badge: true,
              sound: true,
            );
      }

      // 4. Retrieve FCM Token and register with backend
      // ignore: deprecated_member_use
      _fcmToken = await FirebaseMessaging.instance.getToken();
      if (_fcmToken != null && _fcmToken!.isNotEmpty) {
        await _registerTokenWithBackend(_fcmToken!);
      }

      // 5. Listen for Token refreshes
      // ignore: deprecated_member_use
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
        _fcmToken = newToken;
        await _registerTokenWithBackend(newToken);
      });

      // 6. Listen for incoming foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        if (kDebugMode) {
          print('Foreground push received: ${message.notification?.title}');
        }
        _foregroundMessageController.add(message);
      });

      // 7. Handle notification tap when app opened from background
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        if (kDebugMode) {
          print('App opened from notification: ${message.data}');
        }
        _handleNotificationNavigation(message.data);
      });

      // 8. Handle cold start when app was launched from terminated state by tapping notification
      final initialMessage = await FirebaseMessaging.instance
          .getInitialMessage();
      if (initialMessage != null) {
        if (kDebugMode) {
          print(
            'App launched from terminated state via notification: ${initialMessage.data}',
          );
        }
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _handleNotificationNavigation(initialMessage.data);
        });
      }

      _initialized = true;
    } catch (e) {
      if (kDebugMode) {
        print('PushNotificationService initialization note: $e');
      }
    }
  }

  void _handleNotificationNavigation(Map<String, dynamic> data) {
    final route = resolveTargetRoute(data);
    if (route != null && route.isNotEmpty) {
      try {
        _ref.read(routerProvider).push(route);
      } catch (e) {
        if (kDebugMode) {
          print('Navigation error from notification payload: $e');
        }
      }
    }
  }

  /// Maps backend URLs and event types to native Flutter routes cleanly.
  static String? resolveTargetRoute(Map<String, dynamic> data) {
    final rawUrl = data['url'] as String? ?? data['route'] as String?;
    if (rawUrl != null && rawUrl.trim().isNotEmpty) {
      return resolveAppRoute(rawUrl);
    }

    final type = data['type'] as String?;
    if (type != null && type.isNotEmpty) {
      if (type.contains('budget')) return resolveAppRoute('/budgets');
      if (type.contains('subscription') || type.contains('pro')) {
        return resolveAppRoute('/pro');
      }
      if (type.contains('security') ||
          type.contains('biometric') ||
          type.contains('passkey')) {
        return resolveAppRoute('/settings/security');
      }
      if (type.contains('commitment')) return resolveAppRoute('/commitments');
      if (type.contains('reminder')) return resolveAppRoute('/record');
      return '/notifications';
    }

    return null;
  }

  Future<void> _registerTokenWithBackend(String token) async {
    try {
      final deviceType = !kIsWeb && Platform.isIOS ? 'ios' : 'android';
      final client = _ref.read(trpcClientProvider);
      await client.mutate(
        Procedures.profile.savePushSubscription,
        input: {'fcmToken': token, 'deviceType': deviceType},
      );
      if (kDebugMode) {
        print('FCM Token successfully registered with backend ($deviceType).');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Failed to register FCM token with backend: $e');
      }
    }
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>((
  ref,
) {
  return PushNotificationService(ref);
});
