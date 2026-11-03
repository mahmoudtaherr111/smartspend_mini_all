import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'core/preferences.dart';
import 'core/providers.dart';

/// Starts the app: reads this build's configuration and the phone's preferences (the interface language must be
/// known before the first frame), then runs [SmartSpendApp] inside Riverpod.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final version = await PackageInfo.fromPlatform()
      .then((info) => info.version)
      .catchError((Object _) => '');
  final config = AppConfig.fromEnvironment(appVersion: version);
  final preferences = await FilePreferencesStore().read();
  runApp(
    ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(config),
        initialPreferencesProvider.overrideWithValue(preferences),
      ],
      child: const SmartSpendApp(),
    ),
  );
}
