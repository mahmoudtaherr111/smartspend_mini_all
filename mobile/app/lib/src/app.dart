import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'features/lock/lock_screen.dart';
import 'l10n/app_localizations.dart';
import 'routing/app_router.dart';

/// The root widget: theme, language, routes, and the app lock over them.
class SmartSpendApp extends ConsumerWidget {
  const SmartSpendApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      // Light or dark follows the phone, as the web app does by default.
      theme: SmartSpendTheme.light(),
      darkTheme: SmartSpendTheme.dark(),
      themeMode: ThemeMode.system,
      // Arabic first, right to left. English becomes a setting later (decision 0020).
      locale: const Locale('ar'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: ref.watch(routerProvider),
      // The app lock covers every route and sheet; it also hides amounts everywhere when asked.
      builder: (context, child) => LockGate(child: child!),
    );
  }
}
