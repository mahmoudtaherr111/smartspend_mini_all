import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'commitment_api.dart';
import 'commitment_models.dart';
import 'commitment_ui.dart';

/// Asks, when the app opens and when it comes back after a while, about dates that passed without a payment
/// («اتدفع؟», with a skip that leaves them unpaid) and payments waiting for "which commitment is it?".
class CommitmentPromptHost extends ConsumerStatefulWidget {
  const CommitmentPromptHost({super.key, required this.child});

  final Widget child;

  /// How long the app must have been away before it asks again.
  static const quiet = Duration(hours: 6);

  @override
  ConsumerState<CommitmentPromptHost> createState() =>
      _CommitmentPromptHostState();
}

class _CommitmentPromptHostState extends ConsumerState<CommitmentPromptHost>
    with WidgetsBindingObserver {
  DateTime? _asked;
  bool _asking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_ask()));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final asked = _asked;
    if (state == AppLifecycleState.resumed &&
        (asked == null ||
            clock.now().difference(asked) > CommitmentPromptHost.quiet)) {
      unawaited(_ask());
    }
  }

  Future<void> _ask() async {
    if (_asking || !mounted) return;
    _asking = true;
    _asked = clock.now();
    try {
      final questions = await ref.read(commitmentApiProvider).questions();
      if (!mounted || questions.isEmpty) return;
      if (questions.dueChecks.isNotEmpty) {
        await DueChecksSheet.show(context, questions.dueChecks);
      }
      if (mounted && questions.links.isNotEmpty) {
        await LinkQuestionSheet.show(context, questions.links.first);
      }
    } on Object {
      // No commitments in the plan, or no network: nothing to ask now.
    } finally {
      _asking = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// «المواعيد دي عدّت: اتدفعت؟» — each with «دفعته», «اتدفع بره التسجيل» and «لسه»; «تخطي» leaves them all unpaid.
class DueChecksSheet extends ConsumerStatefulWidget {
  const DueChecksSheet({super.key, required this.checks});

  final List<DueDate> checks;

  static Future<void> show(BuildContext context, List<DueDate> checks) =>
      showSmartSpendSheet<void>(
        context: context,
        builder: (_) => DueChecksSheet(checks: checks),
      );

  @override
  ConsumerState<DueChecksSheet> createState() => _DueChecksSheetState();
}

class _DueChecksSheetState extends ConsumerState<DueChecksSheet> {
  late final _open = [...widget.checks];
  final _busy = <String>{};
  bool _skipping = false;

  String _keyOf(DueDate due) =>
      due.key ?? 'due:${due.cashflowId}:${due.dueDay}';

  Future<void> _answer(DueDate due, String answer) async {
    final key = _keyOf(due);
    setState(() => _busy.add(key));
    try {
      await ref.read(commitmentApiProvider).answer(key, answer);
      if (!mounted) return;
      setState(() => _open.remove(due));
      if (answer != 'not_yet') refreshLedger(ref);
      refreshCommitments(ref);
      if (_open.isEmpty) Navigator.of(context).pop();
    } on Object {
      if (mounted) {
        setState(() => _busy.remove(key));
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).cmChangeFailed,
        );
      }
    }
  }

  /// «تخطي»: every date left here is not paid; it stays in the list as unpaid and is not asked again.
  Future<void> _skipAll() async {
    setState(() => _skipping = true);
    final api = ref.read(commitmentApiProvider);
    for (final due in [..._open]) {
      try {
        await api.answer(_keyOf(due), 'not_yet');
      } on Object {
        // Asked again next time.
      }
    }
    refreshCommitments(ref);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
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
          Text(l10n.cmDueChecksTitle, style: textTheme.titleLarge),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            l10n.cmDueChecksBody,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final due in _open)
                    _DueCheck(
                      key: ValueKey(_keyOf(due)),
                      due: due,
                      busy: _busy.contains(_keyOf(due)) || _skipping,
                      onAnswer: (answer) => _answer(due, answer),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            key: const ValueKey('due-checks-skip'),
            label: l10n.cmSkip,
            variant: ButtonVariant.quiet,
            busy: _skipping,
            onPressed: _skipping ? null : _skipAll,
          ),
        ],
      ),
    );
  }
}

class _DueCheck extends StatelessWidget {
  const _DueCheck({
    super.key,
    required this.due,
    required this.busy,
    required this.onAnswer,
  });

  final DueDate due;
  final bool busy;
  final ValueChanged<String> onAnswer;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final amount = due.remaining ?? due.amount;
    return Card(
      margin: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
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
                      Text(due.title, style: textTheme.titleSmall),
                      Text(
                        l10n.cmWasDueOn(commitmentDayLabel(context, due.day)),
                        style: textTheme.labelSmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                if (amount != null)
                  AmountText(amount, style: textTheme.titleSmall),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Wrap(
              spacing: SmartSpendSpacing.sm,
              runSpacing: SmartSpendSpacing.xs,
              children: [
                FilledButton(
                  onPressed: busy ? null : () => onAnswer('paid'),
                  child: Text(due.isIncome ? l10n.cmGotIt : l10n.cmPaidIt),
                ),
                OutlinedButton(
                  onPressed: busy ? null : () => onAnswer('paid_off_records'),
                  child: Text(l10n.cmPaidOffRecords),
                ),
                TextButton(
                  onPressed: busy ? null : () => onAnswer('not_yet'),
                  child: Text(l10n.cmNotYet),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
