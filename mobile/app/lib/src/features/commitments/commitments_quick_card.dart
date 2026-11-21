import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'commitment_api.dart';
import 'commitment_ui.dart';
import 'commitments_screen.dart';

/// On the Record tab: the next date that needs paying (or the one that passed), and the way into «التزاماتي».
class CommitmentsQuickCard extends ConsumerWidget {
  const CommitmentsQuickCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final overview = ref.watch(commitmentsOverviewProvider).value;
    if (overview == null || overview.today.isEmpty) {
      return const SizedBox.shrink();
    }
    final open = overview.due
        .where(
          (due) => due.isOpen && !due.undated && due.status != 'unconfirmed',
        )
        .toList();
    final next = open.firstOrNull;
    final overdue = overview.summary.overdue;
    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const ValueKey('commitments-quick-card'),
          onTap: () => context.push(CommitmentsScreen.path),
          child: Padding(
            padding: const EdgeInsets.all(SmartSpendSpacing.md),
            child: Row(
              children: [
                if (next == null)
                  Icon(Icons.event_repeat_rounded, color: colors.accent)
                else
                  CommitmentAvatar(
                    kind: next.kind,
                    title: next.title,
                    slug: next.catalogSlug,
                    brandColor: next.brandColor,
                    logoUrl: next.logoUrl,
                    size: 36,
                  ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        next == null
                            ? (overview.items.isEmpty
                                  ? l10n.cmQuickEmpty
                                  : l10n.cmQuickNothingDue)
                            : l10n.cmQuickNext(
                                next.title,
                                commitmentDayLabel(context, next.day),
                              ),
                        style: textTheme.titleSmall,
                      ),
                      if (overdue > 0)
                        Text(
                          l10n.cmOverdueCount(overdue),
                          style: textTheme.labelSmall?.copyWith(
                            color: colors.danger,
                          ),
                        )
                      else if (overview.summary.leftThisMonth > 0)
                        Text(
                          l10n.cmLeftThisMonthLine(
                            moneyText(context, overview.summary.leftThisMonth),
                          ),
                          style: textTheme.labelSmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (next != null && (next.remaining ?? next.amount) != null)
                  AmountText(
                    next.remaining ?? next.amount!,
                    style: textTheme.titleSmall,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
