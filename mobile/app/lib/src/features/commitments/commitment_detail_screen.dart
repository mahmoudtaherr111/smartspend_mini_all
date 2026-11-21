import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'commitment_api.dart';
import 'commitment_models.dart';
import 'commitment_ui.dart';

/// One commitment: where it stands, what to say when paying it, its reminder, where its payments are filed, and
/// every date with what paid it. Each date can be paid, moved, given another amount or skipped this time.
class CommitmentDetailScreen extends ConsumerWidget {
  const CommitmentDetailScreen({super.key, required this.id});

  static const path = '/commitments/:commitmentId';

  static String pathOf(int id) => '/commitments/$id';

  final int id;

  Future<void> _setStatus(
    BuildContext context,
    WidgetRef ref,
    Commitment item,
    String status,
  ) async {
    final l10n = AppLocalizations.of(context);
    if (status == 'ended') {
      final sure = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text(l10n.cmEndTitle),
          content: Text(l10n.cmEndBody(item.title)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: Text(l10n.cmCancel),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: Text(l10n.cmEnd),
            ),
          ],
        ),
      );
      if (sure != true) return;
    }
    try {
      await ref.read(commitmentApiProvider).setStatus(item.id, status);
      refreshCommitments(ref);
      if (status == 'ended' && context.mounted) {
        unawaited(Navigator.of(context).maybePop());
      }
    } on Object {
      if (context.mounted) showSmartSpendNotice(context, l10n.cmChangeFailed);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final detail = ref.watch(commitmentDetailProvider(id));
    final item = detail.value?.commitment;
    return Scaffold(
      appBar: AppBar(
        title: Text(item?.title ?? l10n.cmTitle),
        actions: [
          if (item != null)
            PopupMenuButton<String>(
              tooltip: l10n.cmMore,
              onSelected: (status) => _setStatus(context, ref, item, status),
              itemBuilder: (_) => [
                if (item.status == 'active')
                  PopupMenuItem(value: 'paused', child: Text(l10n.cmPause)),
                if (item.status == 'paused')
                  PopupMenuItem(value: 'active', child: Text(l10n.cmResume)),
                PopupMenuItem(value: 'ended', child: Text(l10n.cmEnd)),
              ],
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(commitmentDetailProvider(id));
          await ref.read(commitmentDetailProvider(id).future);
        },
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ListView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            children: [
              ErrorState(
                message: l10n.cmLoadFailed,
                retryLabel: l10n.retry,
                onRetry: () => ref.invalidate(commitmentDetailProvider(id)),
              ),
            ],
          ),
          data: (data) => _DetailBody(detail: data),
        ),
      ),
    );
  }
}

class _DetailBody extends ConsumerWidget {
  const _DetailBody({required this.detail});

  final CommitmentDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final defaults = ref.watch(commitmentDefaultsProvider).value;
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final item = detail.commitment;
    final progress = item.progress;
    final fraction = progress.fraction;
    final mine = detail.dates
        .where((due) => due.cashflowId == item.id)
        .toList();
    // A gam3eya's payouts: one per share, each on its own turn.
    final payouts = detail.dates
        .where((due) => due.cashflowId != item.id)
        .toList();
    final open = mine.where((due) => due.isOpen).toList();
    final done = mine.where((due) => !due.isOpen).toList().reversed.toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        SmartSpendSpacing.sm,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xxl,
      ),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(SmartSpendSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    CommitmentAvatar.of(item, size: 52),
                    const SizedBox(width: SmartSpendSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title, style: textTheme.titleLarge),
                          Text(
                            commitmentPlanLine(context, item),
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (fraction != null ||
                    (progress.remainingAmount ?? 0) > 0) ...[
                  const SizedBox(height: SmartSpendSpacing.lg),
                  if (fraction != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.pill),
                      child: LinearProgressIndicator(
                        value: fraction,
                        minHeight: 8,
                        backgroundColor: colors.surfaceRaised,
                        valueColor: AlwaysStoppedAnimation(colors.accent),
                      ),
                    ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    spacing: SmartSpendSpacing.sm,
                    children: [
                      if (progress.paidCount != null &&
                          progress.totalCount != null)
                        Text(
                          l10n.cmPaidCount(
                            '${progress.paidCount}',
                            '${progress.totalCount}',
                          ),
                          style: textTheme.bodyMedium,
                        ),
                      if ((progress.remainingAmount ?? 0) > 0)
                        Text(
                          l10n.cmLeftAmount(
                            moneyText(context, progress.remainingAmount!),
                          ),
                          style: textTheme.titleSmall?.copyWith(
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
        if (item.sayHint != null) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          InlineMessage(l10n.cmSayToPay(item.sayHint!), tone: MessageTone.info),
        ],
        GroupedSection(
          children: [
            GroupedRow(
              icon: Icons.notifications_active_outlined,
              title: l10n.cmReminder,
              subtitle: reminderLine(
                context,
                item,
                defaultDays: defaults?.days ?? 3,
              ),
              onTap: () => ReminderSheet.show(context, item),
            ),
            if (detail.filingCategory != null)
              GroupedRow(
                icon: Icons.folder_open_outlined,
                title: l10n.cmFiledUnder,
                subtitle: detail.filingSubCategory == null
                    ? detail.filingCategory!
                    : '${detail.filingCategory} › ${detail.filingSubCategory}',
              ),
            for (final payout in payouts)
              GroupedRow(
                icon: Icons.savings_outlined,
                title: l10n.cmYourPayout,
                subtitle: l10n.cmPayoutLine(
                  commitmentDayLabel(context, payout.day),
                  payout.amount == null
                      ? l10n.cmAmountUnknown
                      : moneyText(context, payout.amount!),
                ),
                value: StatusTag(
                  dueStatusLook(context, payout).$1,
                  color: dueStatusLook(context, payout).$2,
                ),
                onTap: () =>
                    DateActionsSheet.show(context, item, payout, detail.today),
              ),
          ],
        ),
        if (open.isNotEmpty) ...[
          SectionHeader(l10n.cmOpenDates),
          GroupedCard(
            child: Column(
              children: [
                for (final due in open)
                  DueRow(
                    key: ValueKey('date-${due.dueDay}'),
                    due: due,
                    onTap: () =>
                        DateActionsSheet.show(context, item, due, detail.today),
                  ),
              ],
            ),
          ),
        ],
        if (done.isNotEmpty) ...[
          SectionHeader(l10n.cmDoneDates),
          GroupedCard(
            child: Column(
              children: [
                for (final due in done) ...[
                  DueRow(
                    key: ValueKey('date-${due.dueDay}'),
                    due: due,
                    showPay: false,
                    onTap: () =>
                        DateActionsSheet.show(context, item, due, detail.today),
                  ),
                  for (final payment in due.settlements)
                    _PaymentLine(payment: payment),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// «2,000 ج.م كل شهر · 12 قسط» — the plan of a commitment in one line.
String commitmentPlanLine(BuildContext context, Commitment item) {
  final l10n = AppLocalizations.of(context);
  final amount = item.amount == null
      ? (item.amountVaries ? l10n.cmAmountVaries : null)
      : moneyText(context, item.amount!);
  final every = switch (item.shape) {
    CommitmentShape.schedule => l10n.cmOnItsDates,
    CommitmentShape.balance =>
      item.totalAmount == null
          ? null
          : l10n.cmOwedTotal(moneyText(context, item.totalAmount!)),
    _ => switch (item.recurrence) {
      'once' => l10n.cmOnce,
      'weekly' => l10n.cmWeekly,
      'yearly' => l10n.cmYearly,
      _ =>
        item.intervalCount > 1
            ? l10n.cmEveryMonths(item.intervalCount)
            : l10n.cmMonthly,
    },
  };
  final parts = [
    commitmentKindLabel(l10n, item.kind),
    ?amount,
    ?every,
    if (item.occurrenceCount != null && item.shape != CommitmentShape.balance)
      l10n.cmTimesCount(item.occurrenceCount!),
    if (item.beneficiaryName != null) l10n.cmFor(item.beneficiaryName!),
    if (item.contactName != null) item.contactName!,
  ];
  return parts.join(' · ');
}

/// The name of a commitment's kind.
String commitmentKindLabel(AppLocalizations l10n, String kind) =>
    switch (kind) {
      'installment' => l10n.cmKindInstallment,
      'loan' => l10n.cmKindLoan,
      'property' => l10n.cmKindProperty,
      'card' => l10n.cmKindCard,
      'school' => l10n.cmKindSchool,
      'university' => l10n.cmKindUniversity,
      'lessons' => l10n.cmKindLessons,
      'rent' => l10n.cmKindRent,
      'bill' => l10n.cmKindBill,
      'subscription' => l10n.cmKindSubscription,
      'debt' => l10n.cmKindDebt,
      'gam3eya' => l10n.cmKindGam3eya,
      'salary' => l10n.cmKindSalary,
      'freelance' => l10n.cmKindFreelance,
      _ => l10n.cmKindOther,
    };

/// «قبلها بـ 3 أيام، الساعة 10:00 ص» or «مفيش تذكير».
String reminderLine(
  BuildContext context,
  Commitment item, {
  int defaultDays = 3,
}) {
  final l10n = AppLocalizations.of(context);
  if (!item.remindersEnabled) return l10n.cmNoReminder;
  final days = item.remindDaysBefore;
  final hour = item.remindHour;
  final when = (days ?? defaultDays) == 0
      ? l10n.cmOnTheDay
      : l10n.cmDaysBefore(days ?? defaultDays);
  if (hour == null) return when;
  final time = MaterialLocalizations.of(context)
      .formatTimeOfDay(TimeOfDay(hour: hour, minute: 0));
  return l10n.cmReminderAt(when, time);
}

class _PaymentLine extends ConsumerWidget {
  const _PaymentLine({required this.payment});

  final LinkedPayment payment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final how = switch (payment.matchedBy) {
      'auto' => l10n.cmLinkedAuto,
      'question' => l10n.cmLinkedByAnswer,
      'voice' || 'chat' => l10n.cmLinkedBySentence,
      _ => payment.source == 'declared' ? l10n.cmDeclared : l10n.cmLinkedByYou,
    };
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: 48,
        bottom: SmartSpendSpacing.sm,
      ),
      child: Row(
        children: [
          Icon(Icons.link_rounded, size: 16, color: colors.mutedForeground),
          const SizedBox(width: SmartSpendSpacing.xs),
          Expanded(
            child: Text(
              '${moneyText(context, payment.amount)} · $how${payment.description == null ? '' : ' · ${payment.description}'}',
              style: textTheme.labelSmall?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// What can be done with one date: pay it, move it, another amount this time, skip it, or undo a change; and the
/// payments linked to it, each of which can be unlinked (the payment stays in the ledger).
class DateActionsSheet extends ConsumerStatefulWidget {
  const DateActionsSheet({
    super.key,
    required this.item,
    required this.due,
    required this.today,
  });

  final Commitment item;
  final DueDate due;
  final String today;

  static Future<void> show(
    BuildContext context,
    Commitment item,
    DueDate due,
    String today,
  ) => showSmartSpendSheet<void>(
    context: context,
    builder: (_) => DateActionsSheet(item: item, due: due, today: today),
  );

  @override
  ConsumerState<DateActionsSheet> createState() => _DateActionsSheetState();
}

class _DateActionsSheetState extends ConsumerState<DateActionsSheet> {
  bool _busy = false;

  Future<void> _run(Future<void> Function(CommitmentApi api) action) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      await action(ref.read(commitmentApiProvider));
      refreshCommitments(ref);
      refreshLedger(ref);
      if (mounted) Navigator.of(context).pop();
    } on Object {
      if (mounted) {
        setState(() => _busy = false);
        showSmartSpendNotice(context, l10n.cmChangeFailed);
      }
    }
  }

  Future<void> _move() async {
    final day = await pickCommitmentDay(
      context,
      initial: widget.due.day,
      today: widget.today,
    );
    if (day == null || !mounted) return;
    await _run(
      (api) => api.setOverride(
        widget.due.cashflowId,
        widget.due.dueDay,
        'move',
        newDay: day,
      ),
    );
  }

  Future<void> _otherAmount() async {
    final l10n = AppLocalizations.of(context);
    final controller = TextEditingController();
    final amount = await showDialog<num>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.cmOtherAmountTitle),
        content: TextField(
          key: const ValueKey('other-amount'),
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            suffixText: MoneyLocale.of(context).symbol,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: Text(l10n.cmCancel),
          ),
          TextButton(
            onPressed: () =>
                Navigator.pop(dialog, parseAmount(controller.text)),
            child: Text(l10n.cmSave),
          ),
        ],
      ),
    );
    controller.dispose();
    if (amount == null || amount <= 0 || !mounted) return;
    await _run(
      (api) => api.setOverride(
        widget.due.cashflowId,
        widget.due.dueDay,
        'amount',
        amount: amount,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final due = widget.due;
    final changed = due.status == 'skipped' || due.day != due.dueDay;
    final canChange = !due.undated && due.settlements.isEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            due.label == null ? due.title : '${due.title} · ${due.label}',
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            due.undated
                ? l10n.cmNoDate
                : l10n.cmDueOn(commitmentDayLabel(context, due.day)),
            style: textTheme.bodySmall,
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          if (due.isOpen) ...[
            SmartSpendButton(
              label: due.isIncome ? l10n.cmGotIt : l10n.cmPaidIt,
              icon: Icons.check_rounded,
              onPressed: _busy
                  ? null
                  : () async {
                      final navigator = Navigator.of(context);
                      final paid = await PaySheet.show(context, due);
                      if (paid == true) navigator.pop();
                    },
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          if (canChange && due.isOpen) ...[
            _Action(
              icon: Icons.event_outlined,
              label: l10n.cmMoveDate,
              onTap: _busy ? null : _move,
            ),
            _Action(
              icon: Icons.edit_outlined,
              label: l10n.cmOtherAmount,
              onTap: _busy ? null : _otherAmount,
            ),
            _Action(
              icon: Icons.redo_rounded,
              label: l10n.cmSkipThisTime,
              onTap: _busy
                  ? null
                  : () => _run(
                      (api) =>
                          api.setOverride(due.cashflowId, due.dueDay, 'skip'),
                    ),
            ),
          ],
          if (changed)
            _Action(
              icon: Icons.undo_rounded,
              label: l10n.cmUndoChange,
              onTap: _busy
                  ? null
                  : () => _run(
                      (api) =>
                          api.setOverride(due.cashflowId, due.dueDay, null),
                    ),
            ),
          for (final payment in due.settlements)
            _Action(
              icon: Icons.link_off_rounded,
              label: l10n.cmUnlinkPayment(moneyText(context, payment.amount)),
              onTap: _busy ? null : () => _run((api) => api.unlink(payment.id)),
            ),
          if (due.settlements.isNotEmpty) ...[
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(l10n.cmUnlinkKeeps, style: textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon),
    title: Text(label),
    onTap: onTap,
  );
}

/// The reminder of one commitment: on or off, how many days before, and at what hour.
class ReminderSheet extends ConsumerStatefulWidget {
  const ReminderSheet({super.key, required this.item});

  final Commitment item;

  static Future<void> show(BuildContext context, Commitment item) =>
      showSmartSpendSheet<void>(
        context: context,
        builder: (_) => ReminderSheet(item: item),
      );

  @override
  ConsumerState<ReminderSheet> createState() => _ReminderSheetState();
}

/// The days a reminder can come before its date.
const reminderDayChoices = [0, 1, 2, 3, 5, 7, 10, 14];

class _ReminderSheetState extends ConsumerState<ReminderSheet> {
  late bool _enabled = widget.item.remindersEnabled;
  late int? _days = widget.item.remindDaysBefore;
  late int? _hour = widget.item.remindHour;
  bool _busy = false;

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(commitmentApiProvider).update(widget.item.id, {
        'remindersEnabled': _enabled,
        'remindDaysBefore': _days,
        'remindHour': _hour,
      });
      refreshCommitments(ref);
      if (mounted) Navigator.of(context).pop();
    } on Object {
      if (mounted) {
        setState(() => _busy = false);
        showSmartSpendNotice(context, l10n.cmChangeFailed);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final defaults = ref.watch(commitmentDefaultsProvider).value;
    final days = _days ?? defaults?.days ?? 3;
    final hour = _hour ?? defaults?.hour ?? 10;
    final time = MaterialLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.cmReminderTitle(widget.item.title),
            style: textTheme.titleLarge,
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _enabled,
            onChanged: (value) => setState(() => _enabled = value),
            title: Text(l10n.cmRemindMe),
          ),
          if (_enabled) ...[
            Text(l10n.cmHowEarly, style: textTheme.titleSmall),
            const SizedBox(height: SmartSpendSpacing.sm),
            Wrap(
              spacing: SmartSpendSpacing.sm,
              runSpacing: SmartSpendSpacing.sm,
              children: [
                for (final choice in reminderDayChoices)
                  ChoiceChip(
                    label: Text(
                      choice == 0 ? l10n.cmOnTheDay : l10n.cmDaysBefore(choice),
                    ),
                    selected: days == choice,
                    onSelected: (_) => setState(() => _days = choice),
                  ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            DropdownButtonFormField<int>(
              initialValue: hour,
              decoration: InputDecoration(labelText: l10n.cmAtHour),
              items: [
                for (var value = 7; value <= 22; value++)
                  DropdownMenuItem(
                    value: value,
                    child: Text(
                      time.formatTimeOfDay(TimeOfDay(hour: value, minute: 0)),
                    ),
                  ),
              ],
              onChanged: (value) => setState(() => _hour = value),
            ),
          ],
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.cmSave,
            busy: _busy,
            onPressed: _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}

/// The admin's default reminder, shown where a commitment has none of its own.
final commitmentDefaultsProvider = FutureProvider<({int days, int hour})>((
  ref,
) async {
  try {
    return await ref.watch(commitmentApiProvider).defaults();
  } on Object {
    return (days: 3, hour: 10);
  }
});
