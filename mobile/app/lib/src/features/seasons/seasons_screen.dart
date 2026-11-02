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
                          SmartSpendTypography.style(
                            13,
                            isSelected ? FontWeight.w700 : FontWeight.w500,
                          ).copyWith(
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
                        borderRadius: BorderRadius.circular(999),
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
                            formatMoney(prev.total),
                          );
                    } else if (change < 0) {
                      comparisonStory = AppLocalizations.of(context)
                          .appP0ToP1P2Less(
                            data.startDay,
                            data.endDay,
                            '${change.abs()}',
                            formatMoney(prev.total),
                          );
                    } else {
                      comparisonStory = AppLocalizations.of(context)
                          .appP0ToP1SameAs(
                            data.startDay,
                            data.endDay,
                            formatMoney(prev.total),
                          );
                    }
                  } else {
                    comparisonStory = AppLocalizations.of(context)
                        .appP0ToP1(data.startDay, data.endDay);
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
                        style: SmartSpendTypography.style(
                          16,
                          FontWeight.w700,
                        ).copyWith(color: colors.foreground),
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      ...data.byCategory.map((cat) {
                        return Container(
                          margin: const EdgeInsets.only(
                            bottom: SmartSpendSpacing.sm,
                          ),
                          padding: const EdgeInsets.all(SmartSpendSpacing.md),
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(
                              SmartSpendRadii.md,
                            ),
                            border: Border.all(color: colors.border),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: categoryColor(
                                    context,
                                    cat.category,
                                  ).withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(
                                    SmartSpendRadii.sm,
                                  ),
                                ),
                                child: Icon(
                                  categoryIcon(cat.category),
                                  color: categoryColor(context, cat.category),
                                  size: 20,
                                ),
                              ),
                              const SizedBox(width: SmartSpendSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      cat.category,
                                      style: SmartSpendTypography.style(
                                        15,
                                        FontWeight.w600,
                                      ).copyWith(color: colors.foreground),
                                    ),
                                    Text(
                                      AppLocalizations.of(context)
                                          .appP0Transactions('${cat.count}'),
                                      style: SmartSpendTypography.style(
                                        12,
                                        FontWeight.w400,
                                      ).copyWith(color: colors.mutedForeground),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatMoney(cat.amount),
                                style: SmartSpendTypography.style(
                                  15,
                                  FontWeight.w700,
                                ).copyWith(color: colors.foreground),
                              ),
                            ],
                          ),
                        );
                      }),
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
