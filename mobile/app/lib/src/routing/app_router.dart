import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/in_progress_screen.dart';
import '../features/more/more_screen.dart';
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
  });

  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String Function(AppLocalizations l10n) label;
  final WidgetBuilder screen;
}

final appTabs = <AppTab>[
  AppTab(
    path: '/record',
    icon: Icons.add_circle_outline,
    selectedIcon: Icons.add_circle,
    label: (l10n) => l10n.navRecord,
    screen: (context) =>
        InProgressScreen(title: AppLocalizations.of(context).navRecord),
  ),
  AppTab(
    path: '/stats',
    icon: Icons.bar_chart_outlined,
    selectedIcon: Icons.bar_chart,
    label: (l10n) => l10n.navStats,
    screen: (context) =>
        InProgressScreen(title: AppLocalizations.of(context).navStats),
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
  ),
];

/// The app's routes: one branch per tab, each keeping its own back stack while the user moves between tabs.
final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: appTabs.first.path,
    routes: [
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
                ),
              ],
            ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
