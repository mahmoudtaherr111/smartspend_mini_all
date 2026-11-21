import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

final streakProvider = FutureProvider<int>((ref) async {
  final client = ref.watch(trpcClientProvider);
  try {
    final response = _object(
      await client.query(Procedures.profile.getSmartProfile),
    );
    // Profile structure: identity.currentStreak or currentStreak
    final identity = response['identity'] as Map<String, Object?>?;
    final streak = identity?['currentStreak'] ?? response['currentStreak'];
    return (streak as num?)?.toInt() ?? 0;
  } catch (_) {
    return 0;
  }
});

/// Subtle encouragement badge showing consecutive recording streak (REC-17).
class StreakBadge extends ConsumerWidget {
  const StreakBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final streakAsync = ref.watch(streakProvider);
    final streak = streakAsync.value ?? 0;
    if (streak == 0) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final l10n = AppLocalizations.of(context);
    final (flameColor, labelSuffix) = streak >= 30
        ? (colors.ai, l10n.appDaysInARow2)
        : streak >= 10
        ? (colors.info, l10n.appDaysInARow3)
        : (colors.warning, l10n.appDaysInARow);

    return Semantics(
      label: AppLocalizations.of(context)
          .appYouRecordedP0P1('$streak', labelSuffix),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: SmartSpendSpacing.md,
          vertical: SmartSpendSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: flameColor.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.local_fire_department_rounded,
              size: 16,
              color: flameColor,
            ),
            const SizedBox(width: SmartSpendSpacing.xs),
            Text(
              '$streak $labelSuffix',
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: colors.foreground),
            ),
          ],
        ),
      ),
    );
  }
}
