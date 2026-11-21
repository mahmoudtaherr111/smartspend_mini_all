import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../ledger/category_style.dart';
import 'season_models.dart';
import 'seasons_api.dart';

/// Screen displaying seasonal spending comparisons («مواسم المصاريف»).
class SeasonsScreen extends ConsumerStatefulWidget {
  const SeasonsScreen({super.key});

  static const path = '/more/seasons';

  @override
  ConsumerState<SeasonsScreen> createState() => _SeasonsScreenState();
}

class _SeasonsScreenState extends ConsumerState<SeasonsScreen> {
  String _selectedSeason = 'ramadan';

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final seasonAsync = ref.watch(seasonSpendingFamily(_selectedSeason));

    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).appSeasons)),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Horizontal Season Selector Pills
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.screen,
              vertical: SmartSpendSpacing.sm,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: kAvailableSeasons.map((season) {
                  final isSelected = _selectedSeason == season['id'];
                  return Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: SmartSpendSpacing.sm,
                    ),
                    child: ChoiceChip(
                      label: Text(season['label']!),
                      selected: isSelected,
                      onSelected: (selected) {
                        if (selected) {
                          setState(() => _selectedSeason = season['id']!);
                        }
                      },
                      labelStyle:
                          (isSelected
                                  ? Theme.of(context).textTheme.titleSmall
                                  : Theme.of(context).textTheme.bodyMedium)!
                              .copyWith(
                                color: isSelected
                                    ? colors.onAccent
                                    : colors.foreground,
                              ),
                      selectedColor: colors.accent,
                      backgroundColor: colors.surface,
                      side: BorderSide(
                        color: isSelected ? colors.accent : colors.border,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(
                          SmartSpendRadii.pill,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(seasonSpendingFamily(_selectedSeason));
                await ref.read(seasonSpendingFamily(_selectedSeason).future);
              },
              child: seasonAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                    child: ErrorState(
                      message: AppLocalizations.of(context).appWeCanTLoadThis,
                      retryLabel: AppLocalizations.of(context).appTryAgain,
                      onRetry: () =>
                          ref.invalidate(seasonSpendingFamily(_selectedSeason)),
                    ),
                  ),
                ),
                data: (data) {
                  final change = data.percentageChange;
                  final prev = data.previous;
                  String comparisonStory;
                  if (prev != null && prev.total > 0 && change != null) {
                    if (change > 0) {
                      comparisonStory = AppLocalizations.of(context)
                          .appP0ToP1P2More(
                            data.startDay,
                            data.endDay,
                            '$change',
                            moneyText(context, prev.total),
                          );
                    } else if (change < 0) {
                      comparisonStory = AppLocalizations.of(context)
                          .appP0ToP1P2Less(
                            data.startDay,
                            data.endDay,
                            '${change.abs()}',
                            moneyText(context, prev.total),
                          );
                    } else {
                      comparisonStory = AppLocalizations.of(context)
                          .appP0ToP1SameAs(
                            data.startDay,
                            data.endDay,
                            moneyText(context, prev.total),
                          );
                    }
                  } else {
                    comparisonStory = AppLocalizations.of(context).appP0ToP1(
                      _dayLabel(context, data.startDay),
                      _dayLabel(context, data.endDay),
                    );
                  }

                  if (data.byCategory.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                      children: [
                        HeroFigure(
                          label: AppLocalizations.of(context)
                              .appWhatP0CostYou(data.label),
                          amount: data.total,
                          kind: AmountKind.expense,
                          story: comparisonStory,
                          wash: true,
                        ),
                        const SizedBox(height: SmartSpendSpacing.xxl),
                        EmptyState(
                          icon: Icons.calendar_today_outlined,
                          title: AppLocalizations.of(context)
                              .appNoSpendingInP0(data.label),
                          message: AppLocalizations.of(context)
                              .appNothingRecordedFromP0To(
                                data.startDay,
                                data.endDay,
                              ),
                        ),
                      ],
                    );
                  }

                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                    children: [
                      HeroFigure(
                        label: AppLocalizations.of(context)
                            .appWhatP0CostYou(data.label),
                        amount: data.total,
                        kind: AmountKind.expense,
                        story: comparisonStory,
                        wash: true,
                      ),
                      const SizedBox(height: SmartSpendSpacing.lg),
                      Text(
                        AppLocalizations.of(context).appByCategory,
                        style: Theme.of(context).textTheme.titleMedium!
                            .copyWith(color: colors.foreground),
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      GroupedSection(
                        children: [
                          for (final cat in data.byCategory)
                            GroupedRow(
                              icon: categoryIcon(cat.category),
                              tint: categoryColor(context, cat.category),
                              title: cat.category,
                              subtitle: AppLocalizations.of(context)
                                  .appP0Transactions('${cat.count}'),
                              value: AmountText(cat.amount),
                            ),
                        ],
                      ),
                      const SizedBox(height: SmartSpendSpacing.xxl),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A server day such as "2026-02-18" in words; the key itself when it is not one.
String _dayLabel(BuildContext context, String day) {
  final date = DateTime.tryParse(day);
  return date == null ? day : DateWords.of(context).date(date);
}
