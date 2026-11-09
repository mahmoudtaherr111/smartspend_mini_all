import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'commitment_api.dart';
import 'commitment_models.dart';
import 'subscription_brands.dart';

/// The icon of a commitment's kind.
IconData commitmentKindIcon(String kind) => switch (kind) {
  'installment' => Icons.shopping_bag_outlined,
  'loan' => Icons.account_balance_outlined,
  'property' => Icons.apartment_outlined,
  'card' => Icons.credit_card_outlined,
  'school' => Icons.school_outlined,
  'university' => Icons.history_edu_outlined,
  'lessons' => Icons.menu_book_outlined,
  'rent' => Icons.home_outlined,
  'bill' => Icons.receipt_long_outlined,
  'subscription' => Icons.subscriptions_outlined,
  'debt' => Icons.handshake_outlined,
  'gam3eya' => Icons.groups_2_outlined,
  'salary' => Icons.payments_outlined,
  'freelance' => Icons.work_outline,
  _ => Icons.event_note_outlined,
};

/// «12 نوفمبر» for a Cairo day key; the key itself when it is not one.
String commitmentDayLabel(BuildContext context, String dayKey) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(dayKey);
  if (match == null) return dayKey;
  final month = int.parse(match.group(2)!);
  return '${int.parse(match.group(3)!)} ${DateWords.of(context).months[month - 1]}';
}

/// The day key ("2026-11-05") of a date the person picked.
String dayKeyOf(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

/// The date of a day key, for a date picker; null when it is not one.
DateTime? dateOfKey(String? key) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(key ?? '');
  if (match == null) return null;
  return DateTime(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
}

/// Asks for a day, starting at [initial] (a day key from the server); returns its key, or null when closed.
Future<String?> pickCommitmentDay(
  BuildContext context, {
  String? initial,
  String? today,
}) async {
  final base = dateOfKey(initial) ?? dateOfKey(today) ?? DateTime.now();
  final picked = await showDatePicker(
    context: context,
    initialDate: base,
    firstDate: DateTime(base.year - 5),
    lastDate: DateTime(base.year + 30),
  );
  return picked == null ? null : dayKeyOf(picked);
}

/// «نوفمبر 2027» for a day key.
String commitmentMonthLabel(BuildContext context, String dayKey) =>
    dayKey.length >= 7
    ? DateWords.of(context).month(dayKey.substring(0, 7))
    : dayKey;

/// The words and colour of a due date's status.
(String, Color) dueStatusLook(BuildContext context, DueDate due) {
  final l10n = AppLocalizations.of(context);
  final colors = context.smartSpendColors;
  return switch (due.status) {
    'paid' => (due.isIncome ? l10n.cmReceived : l10n.cmPaid, colors.accent),
    'partial' => (l10n.cmPartlyPaid, colors.warning),
    'overdue' => (l10n.cmOverdue, colors.danger),
    'skipped' => (l10n.cmSkipped, colors.mutedForeground),
    'unconfirmed' => (l10n.cmPaidOrNot, colors.info),
    _ => (due.undated ? l10n.cmOpen : l10n.cmDue, colors.mutedForeground),
  };
}

/// A commitment's mark: a known service's logo or brand colour, else its kind's icon.
class CommitmentAvatar extends StatelessWidget {
  const CommitmentAvatar({
    super.key,
    required this.kind,
    required this.title,
    this.slug,
    this.brandColor,
    this.logoUrl,
    this.size = 40,
  });

  CommitmentAvatar.of(Commitment item, {super.key, this.size = 40})
    : kind = item.kind,
      title = item.catalog?.name ?? item.title,
      slug = item.catalog?.slug,
      brandColor = item.catalog?.brandColor,
      logoUrl = item.catalog?.logoUrl;

  final String kind;
  final String title;
  final String? slug;
  final String? brandColor;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    if (slug != null) {
      return LogoBadge(
        label: title,
        color: brandColorOf(slug, brandColor, colors.accent),
        imageUrl: logoUrl,
        size: size,
      );
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: colors.accent.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Icon(
        commitmentKindIcon(kind),
        color: colors.accent,
        size: size * 0.5,
      ),
    );
  }
}

/// One due date in a list: what, when, how much, its status, and «دفعته» while it is open.
class DueRow extends ConsumerWidget {
  const DueRow({super.key, required this.due, this.onTap, this.showPay = true});

  final DueDate due;
  final VoidCallback? onTap;
  final bool showPay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final (status, tint) = dueStatusLook(context, due);
    // An open date shows what is still owed; a paid one what was paid.
    final amount = due.isOpen
        ? (due.remaining ?? due.amount)
        : (due.paid > 0 ? due.paid : due.amount);
    final when = due.undated
        ? l10n.cmNoDate
        : commitmentDayLabel(context, due.day);
    final count = due.number != null && due.total != null
        ? ' · ${l10n.cmInstallmentOf('${due.number}', '${due.total}')}'
        : '';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
        child: Row(
          children: [
            CommitmentAvatar(
              kind: due.kind,
              title: due.title,
              slug: due.catalogSlug,
              brandColor: due.brandColor,
              logoUrl: due.logoUrl,
              size: 36,
            ),
            const SizedBox(width: SmartSpendSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    due.label == null
                        ? due.title
                        : '${due.title} · ${due.label}',
                    style: textTheme.titleSmall?.copyWith(
                      color: colors.foreground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xs / 2),
                  Wrap(
                    spacing: SmartSpendSpacing.sm,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '$when$count',
                        style: textTheme.labelSmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      StatusTag(status, color: tint),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: SmartSpendSpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  amount == null
                      ? l10n.cmAmountUnknown
                      : '${due.estimated ? '${l10n.cmAbout} ' : ''}${moneyText(context, amount)}',
                  style: textTheme.titleSmall?.copyWith(
                    color: colors.foreground,
                  ),
                ),
                if (showPay && due.isOpen && due.status != 'unconfirmed')
                  TextButton(
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(
                        horizontal: SmartSpendSpacing.sm,
                      ),
                    ),
                    onPressed: () => PaySheet.show(context, due),
                    child: Text(due.isIncome ? l10n.cmGotIt : l10n.cmPaidIt),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// «دفعته»: the amount still owed on the date, recorded in the ledger where the commitment files it, or said to be
/// paid off the records (someone else paid it).
class PaySheet extends ConsumerStatefulWidget {
  const PaySheet({super.key, required this.due});

  final DueDate due;

  static Future<bool?> show(BuildContext context, DueDate due) =>
      showSmartSpendSheet<bool>(
        context: context,
        builder: (_) => PaySheet(due: due),
      );

  @override
  ConsumerState<PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends ConsumerState<PaySheet> {
  late final _amount = TextEditingController(
    text: _plain(widget.due.remaining ?? widget.due.amount),
  );
  bool _record = true;
  bool _busy = false;
  String? _error;

  static String _plain(num? value) {
    if (value == null) return '';
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final amount = parseAmount(_amount.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = l10n.cmEnterAmount);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(commitmentApiProvider)
          .pay(
            widget.due.cashflowId,
            widget.due.dueDay,
            amount: amount,
            record: _record,
          );
      refreshCommitments(ref);
      refreshLedger(ref);
      if (mounted) Navigator.of(context).pop(true);
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = l10n.cmPayFailed;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final colors = context.smartSpendColors;
    final due = widget.due;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            due.isIncome
                ? l10n.cmReceivedTitle(due.title)
                : l10n.cmPaidTitle(due.title),
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            due.undated
                ? l10n.cmNoDate
                : l10n.cmDueOn(commitmentDayLabel(context, due.day)),
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            key: const ValueKey('pay-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: l10n.cmAmountPaid,
              suffixText: MoneyLocale.of(context).symbol,
            ),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _record,
            onChanged: (value) => setState(() => _record = value),
            title: Text(l10n.cmRecordInSpending),
            subtitle: Text(
              _record ? l10n.cmRecordInSpendingHint : l10n.cmOffRecordsHint,
            ),
          ),
          if (_error != null) ...[
            InlineMessage(_error!, tone: MessageTone.warning),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          SmartSpendButton(
            label: due.isIncome ? l10n.cmGotIt : l10n.cmPaidIt,
            busy: _busy,
            onPressed: _busy ? null : _save,
          ),
        ],
      ),
    );
  }
}

/// After a save: says which commitment the payment paid (with undo), or asks which one it is.
Future<void> announceCommitmentLinks(
  BuildContext context,
  WidgetRef ref,
  List<int> ids,
) async {
  if (ids.isEmpty) return;
  List<CommitmentLink> links;
  try {
    links = await ref.read(commitmentApiProvider).linksFor(ids);
  } on Object {
    return;
  }
  if (!context.mounted) return;
  final l10n = AppLocalizations.of(context);
  final linked = links.where((link) => link.status == 'linked').toList();
  final ask = links
      .where((link) => link.status == 'ask' && link.candidates.isNotEmpty)
      .toList();
  if (linked.isNotEmpty) {
    final link = linked.first;
    final count = link.number != null && link.total != null
        ? ' · ${l10n.cmInstallmentOf('${link.number}', '${link.total}')}'
        : '';
    final left = link.remainingAmount != null && link.remainingAmount! > 0
        ? ' · ${l10n.cmLeftAmount(moneyText(context, link.remainingAmount!))}'
        : '';
    refreshCommitments(ref);
    showSmartSpendNotice(
      context,
      l10n.cmCountedAs('${link.title}$count$left'),
      undoLabel: l10n.undo,
      onUndo: () => unawaited(_unlinkAll(context, ref, link.settlementIds)),
    );
  }
  if (ask.isNotEmpty && context.mounted) {
    await LinkQuestionSheet.show(
      context,
      LinkQuestion(
        key: ask.first.questionKey ?? 'link:${ask.first.expenseId}',
        amount: 0,
        candidates: ask.first.candidates,
      ),
    );
  }
}

Future<void> _unlinkAll(
  BuildContext context,
  WidgetRef ref,
  List<int> ids,
) async {
  final api = ref.read(commitmentApiProvider);
  try {
    for (final id in ids) {
      await api.unlink(id);
    }
  } on Object {
    // The link stays; the commitment's page can unlink it.
  }
  refreshCommitments(ref);
}

/// «الـ 4,000 دي لأنهي واحد؟» with a button per candidate and «مش منهم».
class LinkQuestionSheet extends ConsumerWidget {
  const LinkQuestionSheet({super.key, required this.question});

  final LinkQuestion question;

  static Future<void> show(BuildContext context, LinkQuestion question) =>
      showSmartSpendSheet<void>(
        context: context,
        builder: (_) => LinkQuestionSheet(question: question),
      );

  Future<void> _answer(
    BuildContext context,
    WidgetRef ref,
    String answer,
  ) async {
    try {
      await ref.read(commitmentApiProvider).answer(question.key, answer);
    } on Object {
      // Asked again next time the app opens.
    }
    refreshCommitments(ref);
    if (context.mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
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
            question.amount > 0
                ? l10n.cmWhichOneAmount(moneyText(context, question.amount))
                : l10n.cmWhichOne,
            style: textTheme.titleLarge,
          ),
          if (question.description != null) ...[
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(question.description!, style: textTheme.bodySmall),
          ],
          const SizedBox(height: SmartSpendSpacing.md),
          for (final candidate in question.candidates) ...[
            SmartSpendButton(
              label: candidate.amount == null
                  ? candidate.title
                  : '${candidate.title} · ${moneyText(context, candidate.amount!)}',
              variant: ButtonVariant.secondary,
              onPressed: () => _answer(context, ref, candidate.answer),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          TextButton(
            onPressed: () => _answer(context, ref, 'none'),
            child: Text(l10n.cmNoneOfThem),
          ),
        ],
      ),
    );
  }
}
