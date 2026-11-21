import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../infrastructure/remote_config.dart';
import 'ai_providers.dart';

/// Yearly insights view analyzing the user's entire year of finances (AI-11).
class AiYearlyInsightsView extends ConsumerStatefulWidget {
  const AiYearlyInsightsView({super.key});

  @override
  ConsumerState<AiYearlyInsightsView> createState() =>
      _AiYearlyInsightsViewState();
}

class _AiYearlyInsightsViewState extends ConsumerState<AiYearlyInsightsView> {
  String? _selectedYear;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ref
        .watch(serverMonthProvider)
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.all(SmartSpendSpacing.screen),
            child: Skeleton(height: 180),
          ),
          error: (_, _) => Center(
            child: ErrorState(
              message: l10n.aiWeCanTRunThe,
              retryLabel: l10n.retry,
              onRetry: () => ref.invalidate(serverMonthProvider),
            ),
          ),
          data: (month) {
            final thisYear = int.parse(month.substring(0, 4));
            final years = ['$thisYear', '${thisYear - 1}'];
            final year = _selectedYear ?? years.first;
            return ListView(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.screen,
                vertical: SmartSpendSpacing.lg,
              ),
              children: [
                Text(
                  l10n.aiYearlyReport2,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                Wrap(
                  spacing: SmartSpendSpacing.sm,
                  children: [
                    for (final option in years)
                      ChoiceChip(
                        label: Text(option),
                        selected: option == year,
                        onSelected: (_) =>
                            setState(() => _selectedYear = option),
                      ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                ref
                    .watch(yearlyInsightsFamily(year))
                    .when(
                      loading: () => const Skeleton(height: 180),
                      // A failed analysis says so: a person never reads a made-up verdict on their money.
                      error: (_, _) => ErrorState(
                        message: l10n.aiWeCanTRunThe,
                        retryLabel: l10n.retry,
                        onRetry: () =>
                            ref.invalidate(yearlyInsightsFamily(year)),
                      ),
                      data: (insights) => GroupedCard(
                        title: l10n.aiP0Summary(year),
                        child: Text(
                          insights ?? l10n.aiNotEnoughDataForThis,
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      ),
                    ),
              ],
            );
          },
        );
  }
}
