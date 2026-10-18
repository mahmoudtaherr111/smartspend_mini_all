import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

/// Which server the app talks to and how it names itself, fixed at build time:
///
///     flutter run --dart-define-from-file=config/development.json
///     flutter build appbundle --dart-define=SMARTSPEND_ENV=production --dart-define=SMARTSPEND_API_URL=https://…
///
/// Nothing secret belongs here: everything in a dart-define ships inside the app.
final class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUri,
    required this.userAgent,
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
    );
  }

  @visibleForTesting
  factory AppConfig.resolve({
    required String environment,
    required String apiUrl,
    required bool isReleaseBuild,
    required String platform,
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
    );
  }

  /// `development` or `production`.
  final String environment;

  /// The origin the API is served from; the tRPC client adds `/api/trpc/…`.
  final Uri apiBaseUri;

  /// Sent with every request; the server keeps it with each session, so the user can tell this phone apart in
  /// their list of sessions.
  final String userAgent;

  bool get isProduction => environment == 'production';
}
