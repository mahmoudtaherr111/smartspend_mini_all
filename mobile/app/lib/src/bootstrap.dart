import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'core/preferences.dart';
import 'core/providers.dart';

/// Starts the app: reads this build's configuration and the phone's preferences (the interface language must be
/// known before the first frame), then runs [SmartSpendApp] inside Riverpod.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();
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
