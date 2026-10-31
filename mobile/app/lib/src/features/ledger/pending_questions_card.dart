import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'offline/ledger_store.dart';
import 'offline/outbox.dart';
import 'record_flow.dart';

/// Sentences waiting on the server for an answer (`expense.getPendingClarifications`, REC-09 in
/// .agents/mobile-program/features.json): from an earlier session, another device or WhatsApp/capture. Disappears
/// completely when none are waiting.
class PendingQuestionsCard extends ConsumerWidget {
  const PendingQuestionsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clarifications = ref.watch(pendingClarificationsProvider).value;
    if (clarifications == null || clarifications.isEmpty) {
      return const SizedBox.shrink();
    }
    final hiddenIds = ref.watch(hiddenClarificationIdsProvider);
    final outboxClarificationIds = <int>{
      for (final OutboxItem item
          in ref.watch(outboxProvider).value?.items ?? const <OutboxItem>[])
        if (item.parse?.clarificationId case final int id) id,
    };

    final visible = [
      for (final item in clarifications)
        if (!hiddenIds.contains(item.id) &&
            !outboxClarificationIds.contains(item.id))
          item,
    ];
    if (visible.isEmpty) return const SizedBox.shrink();

    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(top: SmartSpendSpacing.md),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: colors.ai.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                    ),
                    child: Icon(
                      Icons.help_outline_rounded,
                      color: colors.ai,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            '${l10n.pendingQuestionsTitle} (${visible.length})',
                            style: textTheme.titleMedium,
                          ),
                        ),
                        Text(
                          l10n.pendingQuestionsSubtitle,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              for (final (index, item) in visible.indexed) ...[
                const SizedBox(height: SmartSpendSpacing.md),
                if (index > 0) ...[
                  Divider(height: 1, color: colors.border),
                  const SizedBox(height: SmartSpendSpacing.md),
                ],
                _PendingQuestionTile(
                  key: ValueKey('pending-clarification-${item.id}'),
                  item: item,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingQuestionTile extends ConsumerStatefulWidget {
  const _PendingQuestionTile({super.key, required this.item});

  final PendingClarification item;

  @override
  ConsumerState<_PendingQuestionTile> createState() =>
      _PendingQuestionTileState();
}

class _PendingQuestionTileState extends ConsumerState<_PendingQuestionTile> {
  final _answerController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _answerController.dispose();
    super.dispose();
  }

  Future<void> _reply() async {
    final text = _answerController.text.trim();
    if (text.isEmpty || _busy) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(ledgerApiProvider)
          .answer(widget.item.id, text);
      if (result.nextQuestion != null) {
        _answerController.clear();
        ref.invalidate(pendingClarificationsProvider);
        if (mounted) {
          showSmartSpendNotice(context, l10n.pendingQuestionsNext);
        }
        return;
      }
      refreshLedger(ref);
      if (mounted && result.savedIds.isNotEmpty) {
        announceSaved(context, ref, result.savedItems, result.savedIds);
      }
    } on ApiException catch (error) {
      unawaited(SmartSpendHaptics.error());
      if (mounted) {
        setState(
          () => _error = error.message.isNotEmpty
              ? error.message
              : l10n.pendingQuestionsFailed,
        );
      }
    } on ApiNetworkException catch (error) {
      ref.read(networkStatusProvider.notifier).unreachable();
      unawaited(SmartSpendHaptics.error());
      if (mounted) {
        setState(
          () => _error = error.message.isNotEmpty
              ? error.message
              : l10n.pendingQuestionsFailed,
        );
      }
    } on Object {
      unawaited(SmartSpendHaptics.error());
      if (mounted) setState(() => _error = l10n.pendingQuestionsFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _dismiss() {
    if (_busy) return;
    final l10n = AppLocalizations.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final api = ref.read(ledgerApiProvider);
    final id = widget.item.id;

    container.read(hiddenClarificationIdsProvider.notifier).hide(id);
    unawaited(SmartSpendHaptics.selection());

    var undone = false;
    showSmartSpendNotice(
      context,
      l10n.pendingQuestionDismissed,
      undoLabel: l10n.undo,
      onUndo: () {
        undone = true;
        container.read(hiddenClarificationIdsProvider.notifier).restore(id);
      },
    ).closed.then((_) async {
      if (undone) return;
      try {
        await api.dismissClarification(id);
        container.read(hiddenClarificationIdsProvider.notifier).restore(id);
        container.invalidate(pendingClarificationsProvider);
      } on Object {
        container.read(hiddenClarificationIdsProvider.notifier).restore(id);
        if (mounted) {
          unawaited(SmartSpendHaptics.error());
          showSmartSpendNotice(context, l10n.pendingQuestionsFailed);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final hidden = MoneyPrivacy.hiddenOf(context);
    final sentence = hidden
        ? maskDigits(widget.item.originalText)
        : widget.item.originalText;
    final question = hidden
        ? maskDigits(widget.item.question)
        : widget.item.question;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (sentence.trim().isNotEmpty)
          Text(
            '«$sentence»',
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
        const SizedBox(height: SmartSpendSpacing.xs),
        Text(question, style: textTheme.titleSmall),
        const SizedBox(height: SmartSpendSpacing.sm),
        TextField(
          controller: _answerController,
          enabled: !_busy,
          maxLength: 500,
          textInputAction: TextInputAction.send,
          onSubmitted: (_) => _reply(),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          decoration: InputDecoration(
            labelText: l10n.clarifyAnswerLabel,
            counterText: '',
          ),
        ),
        if (_error case final String error) ...[
          const SizedBox(height: SmartSpendSpacing.xs),
          InlineMessage(error),
        ],
        const SizedBox(height: SmartSpendSpacing.sm),
        Wrap(
          spacing: SmartSpendSpacing.sm,
          runSpacing: SmartSpendSpacing.xs,
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SmartSpendButton(
              label: l10n.pendingQuestionsDismiss,
              variant: ButtonVariant.quiet,
              expand: false,
              onPressed: _busy ? null : _dismiss,
            ),
            SmartSpendButton(
              label: l10n.pendingQuestionsReply,
              expand: false,
              busy: _busy,
              onPressed: _reply,
            ),
          ],
        ),
      ],
    );
  }
}
