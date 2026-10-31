import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

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
      appBar: AppBar(title: const Text('مواسم المصاريف')),
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
                      message: 'مش قادرين نحمّل بيانات الموسم دلوقتي: $err',
                      retryLabel: 'إعادة المحاولة',
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
                      comparisonStory =
                          'الفترة (${data.startDay} إلى ${data.endDay}) · أكتر من السنة اللي فاتت بـ $change% (كان ${formatMoney(prev.total)})';
                    } else if (change < 0) {
                      comparisonStory =
                          'الفترة (${data.startDay} إلى ${data.endDay}) · أقل من السنة اللي فاتت بـ ${change.abs()}% (كان ${formatMoney(prev.total)})';
                    } else {
                      comparisonStory =
                          'الفترة (${data.startDay} إلى ${data.endDay}) · نفس مصاريف السنة اللي فاتت بالضبط (${formatMoney(prev.total)})';
                    }
                  } else {
                    comparisonStory =
                        'الفترة (${data.startDay} إلى ${data.endDay})';
                  }

                  if (data.byCategory.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                      children: [
                        HeroFigure(
                          label: '${data.label} كلفك كام',
                          amount: data.total,
                          kind: AmountKind.expense,
                          story: comparisonStory,
                          wash: true,
                        ),
                        const SizedBox(height: SmartSpendSpacing.xxl),
                        EmptyState(
                          icon: Icons.calendar_today_outlined,
                          title: 'مافيش مصاريف في ${data.label}',
                          message:
                              'ماسجلتش مصاريف في الفترة دي (${data.startDay} إلى ${data.endDay}). مصاريف المواسم بتتحسب تلقائياً من تواريخ مصاريفك (زي ياميش رمضان في أكل وشرب أو لبس العيد).',
                        ),
                      ],
                    );
                  }

                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                    children: [
                      HeroFigure(
                        label: '${data.label} كلفك كام',
                        amount: data.total,
                        kind: AmountKind.expense,
                        story: comparisonStory,
                        wash: true,
                      ),
                      const SizedBox(height: SmartSpendSpacing.lg),
                      Text(
                        'تفاصيل المصاريف حسب الفئة',
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
                                      '${cat.count} معاملة',
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
