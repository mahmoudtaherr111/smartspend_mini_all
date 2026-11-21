import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../infrastructure/remote_config.dart';
import '../stats/stats_providers.dart';
import 'ai_models.dart';
import 'ai_providers.dart';

/// Month-over-month comparison view with validation preventing identical months (AI-07).
class AiCompareView extends ConsumerStatefulWidget {
  const AiCompareView({super.key});

  @override
  ConsumerState<AiCompareView> createState() => _AiCompareViewState();
}

class _AiCompareViewState extends ConsumerState<AiCompareView> {
  String? _firstMonth;
  String? _secondMonth;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    return ref
        .watch(serverMonthProvider)
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.all(SmartSpendSpacing.screen),
            child: Skeleton(height: 180),
          ),
          error: (_, _) => Center(
            child: ErrorState(
              message: l10n.aiWeCouldnTCompareThem,
              retryLabel: l10n.retry,
              onRetry: () => ref.invalidate(serverMonthProvider),
            ),
          ),
          data: (current) {
            // The server says which month it is (mobile rule 8); the list is the twelve before it.
            final months = [
              for (var back = 0; back < 12; back++) monthBefore(current, back),
            ];
            final first = _firstMonth ?? months[0];
            final second = _secondMonth ?? months[1];
            return ListView(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.screen,
                vertical: SmartSpendSpacing.lg,
              ),
              children: [
                Text(l10n.aiCompareTwoMonths, style: textTheme.titleLarge),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  l10n.aiPickTwoDifferentMonthsTo,
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                _monthField(
                  label: l10n.aiFirstMonth,
                  value: first,
                  months: months,
                  onChanged: (month) => setState(() => _firstMonth = month),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                _monthField(
                  label: l10n.aiSecondMonth,
                  value: second,
                  months: months,
                  onChanged: (month) => setState(() => _secondMonth = month),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                if (first == second)
                  InlineMessage(l10n.aiPickTwoDifferentMonths)
                else
                  ...ref
                      .watch(monthComparisonFamily((first, second)))
                      .when(
                        loading: () => [const Skeleton(height: 180)],
                        error: (_, _) => [
                          ErrorState(
                            message: l10n.aiWeCouldnTCompareThem,
                            retryLabel: l10n.retry,
                            onRetry: () => ref.invalidate(
                              monthComparisonFamily((first, second)),
                            ),
                          ),
                        ],
                        data: _comparisonResults,
                      ),
              ],
            );
          },
        );
  }

  Widget _monthField({
    required String label,
    required String value,
    required List<String> months,
    required ValueChanged<String> onChanged,
  }) {
    final words = DateWords.of(context);
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        for (final month in months)
          DropdownMenuItem(value: month, child: Text(words.month(month))),
      ],
      onChanged: (month) {
        if (month != null) onChanged(month);
      },
    );
  }

  List<Widget> _comparisonResults(MonthComparison comparison) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final words = DateWords.of(context);
    return [
      GroupedCard(
        title: l10n.aiComparisonP0AndP1(
          words.month(comparison.secondMonth),
          words.month(comparison.firstMonth),
        ),
        child: Text(
          comparison.responseText,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ),
      if (comparison.changes.isNotEmpty) ...[
        const SizedBox(height: SmartSpendSpacing.md),
        GroupedSection(
          title: l10n.aiBiggestChangesByCategory,
          children: [
            for (final change in comparison.changes)
              Builder(
                builder: (context) {
                  final diff = (change['diff'] as num?)?.toDouble() ?? 0;
                  return GroupedRow(
                    icon: diff > 0
                        ? Icons.arrow_upward_rounded
                        : Icons.arrow_downward_rounded,
                    tint: diff > 0 ? colors.danger : colors.accent,
                    title: (change['category'] as String?) ?? l10n.aiCategory,
                    value: AmountText(diff.abs()),
                  );
                },
              ),
          ],
        ),
      ],
      const SizedBox(height: SmartSpendSpacing.lg),
    ];
  }
}
