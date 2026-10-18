import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../l10n/app_localizations.dart';
import 'app_router.dart';

/// The frame around every tab: the screen, and the bottom bar under it.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: SmartSpendNavigationBar(
        selectedIndex: navigationShell.currentIndex,
        destinations: [
          for (final tab in appTabs)
            SmartSpendDestination(
              icon: tab.icon,
              selectedIcon: tab.selectedIcon,
              label: tab.label(l10n),
            ),
        ],
        // Tapping the open tab again takes it back to its first screen.
        onSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
      ),
    );
  }
}
