import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'add_commitment_screen.dart';
import 'commitment_api.dart';
import 'commitment_detail_screen.dart';
import 'commitment_models.dart';
import 'commitment_ui.dart';

/// «التزاماتي» (docs/decisions/0051-commitments-ecosystem.md): what is left to pay this month, the dates that need
/// the person now, and every installment, bill, school fee, debt and gam3eya with where it stands.
class CommitmentsScreen extends ConsumerStatefulWidget {
  const CommitmentsScreen({super.key});

  static const path = '/commitments';

  @override
  ConsumerState<CommitmentsScreen> createState() => _CommitmentsScreenState();
}

class _CommitmentsScreenState extends ConsumerState<CommitmentsScreen> {
  CommitmentGroup? _group;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final overview = ref.watch(commitmentsOverviewProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.cmTitle),
        actions: [
          IconButton(
            tooltip: l10n.cmAdd,
            icon: const Icon(Icons.add_rounded),
            onPressed: () => context.push(AddCommitmentScreen.path),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(commitmentsOverviewProvider);
          await ref.read(commitmentsOverviewProvider.future);
        },
        child: overview.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ListView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            children: [
              ErrorState(
                message: l10n.cmLoadFailed,
                retryLabel: l10n.retry,
                onRetry: () => ref.invalidate(commitmentsOverviewProvider),
              ),
            ],
          ),
          data: (data) => _Hub(
            overview: data,
            group: _group,
            onGroup: (group) => setState(() => _group = group),
          ),
        ),
      ),
    );
  }
}

class _Hub extends StatelessWidget {
  const _Hub({
    required this.overview,
    required this.group,
    required this.onGroup,
  });

  final CommitmentsOverview overview;
  final CommitmentGroup? group;
  final ValueChanged<CommitmentGroup?> onGroup;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final items = overview.items
        .where((item) => item.status != 'ended')
        .toList();
    if (items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          const SizedBox(height: SmartSpendSpacing.xl),
          EmptyState(
            icon: Icons.event_repeat_rounded,
            title: l10n.cmEmptyTitle,
            message: l10n.cmEmptyBody,
            actionLabel: l10n.cmAddFirst,
            onAction: () => context.push(AddCommitmentScreen.path),
          ),
        ],
      );
    }
    final summary = overview.summary;
    final attention = overview.due
        .where((due) => due.status == 'overdue' || due.status == 'unconfirmed')
        .toList();
    final upcoming = overview.due
        .where(
          (due) =>
              (due.status == 'due' || due.status == 'partial') && !due.undated,
        )
        .take(5)
        .toList();
    final groups = {for (final item in items) item.group}.toList()
      ..sort((a, b) => a.index.compareTo(b.index));
    final shown = group == null
        ? items
        : items.where((item) => item.group == group).toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        SmartSpendSpacing.sm,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xxl,
      ),
      children: [
        HeroFigure(
          label: l10n.cmLeftThisMonth,
          amount: summary.leftThisMonth,
          story: summary.dueThisMonth > 0
              ? l10n.cmPaidOfMonth(
                  moneyText(context, summary.paidThisMonth),
                  moneyText(context, summary.dueThisMonth),
                )
              : l10n.cmNothingThisMonth,
          wash: true,
        ),
        if (summary.installmentsLeft > 0) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          StatTileRow(
            children: [
              StatTile(
                label: l10n.cmInstallmentsLeft,
                amount: summary.installmentsLeft,
              ),
              StatTile(
                label: l10n.cmPaidThisMonth,
                amount: summary.paidThisMonth,
              ),
            ],
          ),
        ],
        if (attention.isNotEmpty) ...[
          SectionHeader(l10n.cmNeedsYou),
          GroupedCard(
            child: Column(
              children: [
                for (final due in attention)
                  DueRow(
                    key: ValueKey('attention-${due.cashflowId}-${due.dueDay}'),
                    due: due,
                    onTap: () => context.push(
                      CommitmentDetailScreen.pathOf(due.cashflowId),
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (upcoming.isNotEmpty) ...[
          SectionHeader(l10n.cmComingUp),
          GroupedCard(
            child: Column(
              children: [
                for (final due in upcoming)
                  DueRow(
                    key: ValueKey('upcoming-${due.cashflowId}-${due.dueDay}'),
                    due: due,
                    onTap: () => context.push(
                      CommitmentDetailScreen.pathOf(due.cashflowId),
                    ),
                  ),
              ],
            ),
          ),
        ],
        SectionHeader(l10n.cmAll),
        if (groups.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _GroupChip(
                  label: l10n.cmAllGroups,
                  selected: group == null,
                  onTap: () => onGroup(null),
                ),
                for (final value in groups)
                  _GroupChip(
                    label: commitmentGroupLabel(l10n, value),
                    selected: group == value,
                    onTap: () => onGroup(value),
                  ),
              ],
            ),
          ),
        const SizedBox(height: SmartSpendSpacing.sm),
        for (final item in shown)
          CommitmentCard(
            key: ValueKey('commitment-${item.id}'),
            item: item,
            onTap: () => context.push(CommitmentDetailScreen.pathOf(item.id)),
          ),
        const SizedBox(height: SmartSpendSpacing.md),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.mic_none_rounded,
              size: 18,
              color: colors.mutedForeground,
            ),
            const SizedBox(width: SmartSpendSpacing.sm),
            Expanded(
              child: Text(
                l10n.cmSayItHint,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _GroupChip extends StatelessWidget {
  const _GroupChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(end: SmartSpendSpacing.sm),
    child: ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    ),
  );
}

/// The name of a hub filter.
String commitmentGroupLabel(AppLocalizations l10n, CommitmentGroup group) =>
    switch (group) {
      CommitmentGroup.installments => l10n.cmGroupInstallments,
      CommitmentGroup.bills => l10n.cmGroupBills,
      CommitmentGroup.education => l10n.cmGroupEducation,
      CommitmentGroup.debts => l10n.cmGroupDebts,
      CommitmentGroup.gam3eya => l10n.cmGroupGam3eya,
      CommitmentGroup.income => l10n.cmGroupIncome,
    };

/// One commitment in the hub: its mark, what is next, and how far along it is.
class CommitmentCard extends StatelessWidget {
  const CommitmentCard({super.key, required this.item, this.onTap});

  final Commitment item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final progress = item.progress;
    final next = progress.next;
    final fraction = progress.fraction;
    final nextLine = next == null
        ? (item.status == 'paused' ? l10n.cmPaused : l10n.cmNothingOpen)
        : next.undated
        ? l10n.cmNoDate
        : l10n.cmNextOn(commitmentDayLabel(context, next.day));
    final amount = next?.remaining ?? next?.amount ?? item.amount;
    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(SmartSpendSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    CommitmentAvatar.of(item),
                    const SizedBox(width: SmartSpendSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title, style: textTheme.titleMedium),
                          const SizedBox(height: SmartSpendSpacing.xs / 2),
                          Wrap(
                            spacing: SmartSpendSpacing.sm,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                nextLine,
                                style: textTheme.bodySmall?.copyWith(
                                  color: colors.mutedForeground,
                                ),
                              ),
                              if (progress.overdue > 0)
                                StatusTag(
                                  l10n.cmOverdueCount(progress.overdue),
                                  color: colors.danger,
                                ),
                              if (item.status == 'paused')
                                StatusTag(l10n.cmPaused, color: colors.warning),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (amount != null)
                      AmountText(
                        amount,
                        kind: item.isIncome
                            ? AmountKind.income
                            : AmountKind.neutral,
                        style: textTheme.titleSmall,
                      ),
                  ],
                ),
                if (fraction != null) ...[
                  const SizedBox(height: SmartSpendSpacing.md),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
                    child: LinearProgressIndicator(
                      value: fraction,
                      minHeight: 6,
                      backgroundColor: colors.surfaceRaised,
                      valueColor: AlwaysStoppedAnimation(colors.accent),
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    spacing: SmartSpendSpacing.sm,
                    children: [
                      Text(
                        l10n.cmPaidCount(
                          '${progress.paidCount}',
                          '${progress.totalCount}',
                        ),
                        style: textTheme.labelSmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      if ((progress.remainingAmount ?? 0) > 0)
                        Text(
                          l10n.cmLeftAmount(
                            moneyText(context, progress.remainingAmount!),
                          ),
                          style: textTheme.labelSmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
