import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

/// Which server the app talks to and how it names itself, fixed at build time:
///
///     flutter run --dart-define-from-file=config/development.json
///     flutter build appbundle --dart-define=SMARTSPEND_ENV=production --dart-define=SMARTSPEND_API_URL=https://…
///
/// Nothing secret belongs here: everything in a dart-define ships inside the app. OAuth client ids and the Turnstile
/// site key are public identifiers, which every copy of the app and the website carry anyway.
final class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUri,
    required this.userAgent,
    this.googleServerClientId = '',
    this.googleIosClientId = '',
    this.turnstileSiteKey = '',
  });

  /// Reads the dart-defines of this build.
  ///
  /// Without `SMARTSPEND_API_URL`, a debug build calls the development server (`npm run dev`, port 3000) on the
  /// computer it runs from: 10.0.2.2 from the Android emulator, localhost from the iOS simulator. A release build
  /// without it refuses to start, so a store build can never point at a development machine.
  factory AppConfig.fromEnvironment() {
    const environment = String.fromEnvironment(
      'SMARTSPEND_ENV',
      defaultValue: 'development',
    );
    const apiUrl = String.fromEnvironment('SMARTSPEND_API_URL');
    return AppConfig.resolve(
      environment: environment,
      apiUrl: apiUrl,
      isReleaseBuild: kReleaseMode,
      platform: Platform.operatingSystem,
      googleServerClientId: const String.fromEnvironment(
        'GOOGLE_SERVER_CLIENT_ID',
      ),
      googleIosClientId: const String.fromEnvironment('GOOGLE_IOS_CLIENT_ID'),
      turnstileSiteKey: const String.fromEnvironment('TURNSTILE_SITE_KEY'),
    );
  }

  @visibleForTesting
  factory AppConfig.resolve({
    required String environment,
    required String apiUrl,
    required bool isReleaseBuild,
    required String platform,
    String googleServerClientId = '',
    String googleIosClientId = '',
    String turnstileSiteKey = '',
  }) {
    if (apiUrl.isEmpty && isReleaseBuild) {
      throw StateError(
        'A release build needs --dart-define=SMARTSPEND_API_URL=https://…',
      );
    }
    final developmentHost = platform == 'android' ? '10.0.2.2' : 'localhost';
    final uri = Uri.parse(
      apiUrl.isEmpty ? 'http://$developmentHost:3000' : apiUrl,
    );
    if (isReleaseBuild && uri.scheme != 'https') {
      throw StateError('A release build talks to the API over HTTPS only.');
    }
    return AppConfig(
      environment: environment,
      apiBaseUri: uri,
      userAgent: 'SmartSpend-Mobile ($platform; $environment)',
      googleServerClientId: googleServerClientId.trim(),
      googleIosClientId: googleIosClientId.trim(),
      turnstileSiteKey: turnstileSiteKey.trim(),
    );
  }

  /// `development` or `production`.
  final String environment;

  /// The origin the API is served from; the tRPC client adds `/api/trpc/…`.
  final Uri apiBaseUri;

  /// Sent with every request; the server keeps it with each session, so the user can tell this phone apart in
  /// their list of sessions.
  final String userAgent;

  /// The server's web OAuth client id (`GOOGLE_CLIENT_ID` on the server). Android's Google SDK issues the ID token
  /// for it, and `auth.signInWithGoogle` checks that the Android app asked for it.
  final String googleServerClientId;

  /// This build's iOS OAuth client id. iOS also needs its reversed form as a URL scheme, `GOOGLE_REVERSED_CLIENT_ID`
  /// in `ios/Flutter/GoogleSignIn.xcconfig`.
  final String googleIosClientId;

  /// The Cloudflare Turnstile site key, the same public key as the web build's `VITE_TURNSTILE_SITE_KEY`. Without
  /// it no check is shown and none is sent, which a development server accepts.
  final String turnstileSiteKey;

  bool get isProduction => environment == 'production';
}
