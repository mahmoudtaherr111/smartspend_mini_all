import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:ios_liquid_glass/ios_liquid_glass.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../features/commitments/due_prompt.dart';
import '../l10n/app_localizations.dart';
import 'app_router.dart';

/// SF Symbols of the five tabs on iOS, in the order of [appTabs].
const _tabSfSymbols = <String>[
  'plus.circle.fill',
  'chart.pie.fill',
  'sparkles',
  'calendar',
  'ellipsis.circle.fill',
];

/// The frame around every tab: the screen, and the bottom bar under it; it also asks about commitment dates that
/// passed (CommitmentPromptHost).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    // A limit prompt without its own action sends the person to the plan screen.
    SmartSpendUpgradePrompt.defaultOnUpgrade = (ctx) => ctx.push('/more/plan');
    void onSelected(int index) => navigationShell.goBranch(
      index,
      // Tapping the open tab again takes it back to its first screen.
      initialLocation: index == navigationShell.currentIndex,
    );
    return Scaffold(
      body: CommitmentPromptHost(child: navigationShell),
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
        onSelected: onSelected,
        // On iOS the bar is the native Liquid Glass one; everywhere else it falls back to the Flutter bar.
        iosNativeBarBuilder:
            (context, destinations, selectedIndex, onSelected, fallback) =>
                IosLiquidGlassTabBar(
                  items: [
                    for (var i = 0; i < destinations.length; i++)
                      IosLiquidGlassTabItem(
                        id: appTabs[i].path,
                        label: destinations[i].label,
                        sfSymbol: _tabSfSymbols[i],
                      ),
                  ],
                  selectedIndex: selectedIndex,
                  onSelected: onSelected,
                  fallback: (_) => fallback,
                ),
      ),
    );
  }
}
