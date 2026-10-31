import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/register_screen.dart';
import '../features/auth/session_controller.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/auth/starting_screen.dart';
import '../features/capture/capture_review_screen.dart';
import '../features/capture/capture_settings_screen.dart';
import '../features/in_progress_screen.dart';
import '../features/ledger/record_screen.dart';
import '../features/ledger/transactions_screen.dart';
import '../features/lock/security_screen.dart';
import '../features/more/more_screen.dart';
import '../features/stats/category_transactions_screen.dart';
import '../features/stats/stats_screen.dart';
import '../features/wallets/wallet_detail_screen.dart';
import '../features/wallets/wallets_screen.dart';
import '../l10n/app_localizations.dart';
import 'app_shell.dart';

/// A tab of the bottom bar: the same five, in the same order, as the web app's `MobileBottomNav`.
final class AppTab {
  const AppTab({
    required this.path,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.screen,
    this.routes = const [],
  });

  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String Function(AppLocalizations l10n) label;
  final WidgetBuilder screen;

  /// Screens reached from the tab, which keep the tab selected and return to it on back.
  final List<RouteBase> routes;
}

final appTabs = <AppTab>[
  AppTab(
    path: '/record',
    icon: Icons.add_circle_outline,
    selectedIcon: Icons.add_circle,
    label: (l10n) => l10n.navRecord,
    screen: (context) => const RecordScreen(),
    routes: [
      GoRoute(
        path: TransactionsScreen.path.substring(RecordScreen.path.length + 1),
        builder: (context, state) => const TransactionsScreen(),
      ),
    ],
  ),
  AppTab(
    path: '/stats',
    icon: Icons.bar_chart_outlined,
    selectedIcon: Icons.bar_chart,
    label: (l10n) => l10n.navStats,
    screen: (context) => const StatsScreen(),
    routes: [
      GoRoute(
        path: CategoryTransactionsScreen.subPath,
        builder: (context, state) => CategoryTransactionsScreen(
          category: state.uri.queryParameters['name'] ?? '',
          month: state.uri.queryParameters['month'],
        ),
      ),
    ],
  ),
  AppTab(
    path: '/ai',
    icon: Icons.auto_awesome_outlined,
    selectedIcon: Icons.auto_awesome,
    label: (l10n) => l10n.navAi,
    screen: (context) =>
        InProgressScreen(title: AppLocalizations.of(context).navAi),
  ),
  AppTab(
    path: '/calendar',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month,
    label: (l10n) => l10n.navCalendar,
    screen: (context) =>
        InProgressScreen(title: AppLocalizations.of(context).navCalendar),
  ),
  AppTab(
    path: '/more',
    icon: Icons.menu,
    selectedIcon: Icons.menu_open,
    label: (l10n) => l10n.navMore,
    screen: (context) => const MoreScreen(),
    routes: [
      GoRoute(
        path: CaptureReviewScreen.path.substring('/more/'.length),
        builder: (context, state) => const CaptureReviewScreen(),
      ),
      GoRoute(
        path: CaptureSettingsScreen.path.substring('/more/'.length),
        builder: (context, state) => const CaptureSettingsScreen(),
      ),
      GoRoute(
        path: WalletsScreen.path.substring('/more/'.length),
        builder: (context, state) => const WalletsScreen(),
        routes: [
          GoRoute(
            path: WalletDetailScreen.path,
            builder: (context, state) => WalletDetailScreen(
              walletId: int.tryParse(state.pathParameters['walletId']!) ?? 0,
            ),
          ),
        ],
      ),
      GoRoute(
        path: SecurityScreen.path.substring('/more/'.length),
        builder: (context, state) => const SecurityScreen(),
        routes: [
          GoRoute(
            path: PinSetupScreen.path.substring(SecurityScreen.path.length + 1),
            builder: (context, state) => const PinSetupScreen(),
          ),
        ],
      ),
    ],
  ),
];

/// Where the session sends a [location], or null to let it open.
///
/// Signed out, only the sign-in screens open; signed in, they lead to the first tab; while the stored token is
/// being read, the starting screen shows. Every tab sits behind this guard.
String? sessionRedirect(SessionState session, String location) {
  final onSignIn =
      location == SignInScreen.path ||
      location.startsWith('${SignInScreen.path}/');
  return switch (session) {
    SessionRestoring() =>
      location == StartingScreen.path ? null : StartingScreen.path,
    SignedOut() => onSignIn ? null : SignInScreen.path,
    SignedIn() =>
      onSignIn || location == StartingScreen.path ? appTabs.first.path : null,
  };
}

/// The app's routes: the sign-in screens, and one branch per tab, each keeping its own back stack while the user
/// moves between tabs. The router follows the session: signing in, out, or a session the server ended moves the
/// user at once.
final routerProvider = Provider<GoRouter>((ref) {
  final session = ValueNotifier<SessionState>(ref.read(sessionProvider));
  ref.listen(sessionProvider, (_, next) => session.value = next);
  final router = GoRouter(
    initialLocation: appTabs.first.path,
    refreshListenable: session,
    redirect: (context, state) =>
        sessionRedirect(session.value, state.uri.path),
    routes: [
      GoRoute(
        path: StartingScreen.path,
        builder: (context, state) => const StartingScreen(),
      ),
      GoRoute(
        path: SignInScreen.path,
        builder: (context, state) => const SignInScreen(),
        routes: [
          GoRoute(
            path: RegisterScreen.path.substring(SignInScreen.path.length + 1),
            builder: (context, state) => const RegisterScreen(),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          for (final tab in appTabs)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: tab.path,
                  builder: (context, state) => tab.screen(context),
                  routes: tab.routes,
                ),
              ],
            ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    session.dispose();
  });
  return router;
});
