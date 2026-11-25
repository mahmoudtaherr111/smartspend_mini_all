import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'core/preferences.dart';
import 'features/auth/session_controller.dart';
import 'features/commitments/logo_cache.dart';
import 'features/infrastructure/app_update_screen.dart';
import 'features/infrastructure/remote_config.dart';
import 'features/limits/limits_api.dart';
import 'features/lock/lock_screen.dart';
import 'features/notifications/push_notification_service.dart';
import 'features/plans/plan_providers.dart';
import 'features/plans/store_purchases.dart';
import 'l10n/app_localizations.dart';
import 'routing/app_router.dart';

/// The root widget: theme, language, routes, and the app lock over them.
class SmartSpendApp extends ConsumerStatefulWidget {
  const SmartSpendApp({super.key});

  @override
  ConsumerState<SmartSpendApp> createState() => _SmartSpendAppState();
}

class _SmartSpendAppState extends ConsumerState<SmartSpendApp> {
  bool _pushInitScheduled = false;
  StreamSubscription<void>? _storeSub;

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider);
    _schedulePushInitIfSignedIn(session);
    _syncStoreListener(session);
  }

  @override
  void dispose() {
    unawaited(_storeSub?.cancel());
    super.dispose();
  }

  void _syncStoreListener(SessionState session) {
    if (session is SignedIn) {
      _storeSub ??= ref.read(storePurchasesProvider).observeBackgroundUpdates(
        () {
          if (!mounted) return;
          ref.invalidate(userPlanProvider);
          ref.invalidate(userLimitsProvider);
        },
      );
    } else {
      unawaited(_storeSub?.cancel());
      _storeSub = null;
    }
  }

  void _schedulePushInitIfSignedIn(SessionState session) {
    if (_pushInitScheduled || session is! SignedIn) return;
    _pushInitScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(pushNotificationServiceProvider).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (previous, next) {
      _syncStoreListener(next);
      if (next is SignedIn) {
        _schedulePushInitIfSignedIn(next);
      } else if (next is SignedOut) {
        _pushInitScheduled = false;
      }
    });

    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      // Light or dark follows the phone, as the web app does by default.
      theme: SmartSpendTheme.light(),
      darkTheme: SmartSpendTheme.dark(),
      themeMode: switch (ref.watch(themeModeProvider)) {
        ThemeChoice.light => ThemeMode.light,
        ThemeChoice.dark => ThemeMode.dark,
        ThemeChoice.system => ThemeMode.system,
      },
      // Arabic first, right to left; English, left to right, when the person chooses it (decision 0020). The
      // direction follows the language through Flutter's localizations.
      locale: ref.watch(languageProvider).locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: ref.watch(routerProvider),
      // The app lock covers every route and sheet; it also hides amounts everywhere when asked.
      // A build the server no longer works with shows only the way to update.
      builder: (context, child) => Consumer(
        builder: (context, ref, _) {
          final config = ref.watch(updateRequiredProvider);
          return config == null
              ? RemoteConfigRefresher(
                  child: LogoCacheScope(child: LockGate(child: child!)),
                )
              : AppUpdateScreen(
                  minimumVersion: config.minVersion,
                  storeUrl: config.storeUrl,
                );
        },
      ),
    );
  }
}
