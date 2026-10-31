import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';

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

    Color flameColor;
    Color bgColor;
    Color borderColor;
    Color textColor;
    String labelSuffix = 'يوم متواصل';

    if (streak >= 30) {
      flameColor = const Color(0xFFA855F7); // Purple
      bgColor = const Color(0xFFA855F7).withValues(alpha: 0.12);
      borderColor = const Color(0xFFA855F7).withValues(alpha: 0.3);
      textColor = const Color(0xFFA855F7);
      labelSuffix = 'يوم متواصل 👑';
    } else if (streak >= 10) {
      flameColor = const Color(0xFF3B82F6); // Blue
      bgColor = const Color(0xFF3B82F6).withValues(alpha: 0.12);
      borderColor = const Color(0xFF3B82F6).withValues(alpha: 0.3);
      textColor = const Color(0xFF3B82F6);
      labelSuffix = 'يوم متواصل 🔥';
    } else if (streak >= 1) {
      flameColor = const Color(0xFFF97316); // Orange
      bgColor = const Color(0xFFF97316).withValues(alpha: 0.12);
      borderColor = const Color(0xFFF97316).withValues(alpha: 0.3);
      textColor = const Color(0xFFEA580C);
    } else {
      flameColor = const Color(0xFF94A3B8); // Slate
      bgColor = const Color(0xFF94A3B8).withValues(alpha: 0.1);
      borderColor = const Color(0xFF94A3B8).withValues(alpha: 0.2);
      textColor = const Color(0xFF64748B);
      labelSuffix = 'يوم';
    }

    return Semantics(
      label: 'سجلت $streak $labelSuffix',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: borderColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.local_fire_department_rounded,
              size: 16,
              color: flameColor,
            ),
            const SizedBox(width: 4),
            Text(
              '$streak $labelSuffix',
              style: SmartSpendTypography.style(
                12,
                streak > 0 ? FontWeight.w700 : FontWeight.w500,
              ).copyWith(color: textColor),
            ),
          ],
        ),
      ),
    );
  }
}
