import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// One tab of [SmartSpendNavigationBar].
final class SmartSpendDestination {
  const SmartSpendDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The bottom tab bar. Moving to another tab gives the selection tick the platform's own tab bars give;
/// tapping the current tab calls [onSelected] with the same index, so the screen can return to its top.
class SmartSpendNavigationBar extends StatelessWidget {
  const SmartSpendNavigationBar({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<SmartSpendDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index != selectedIndex) HapticFeedback.selectionClick();
        onSelected(index);
      },
      destinations: [
        for (final destination in destinations)
          NavigationDestination(
            icon: Icon(destination.icon),
            selectedIcon: Icon(destination.selectedIcon),
            label: destination.label,
          ),
      ],
    );
  }
}
