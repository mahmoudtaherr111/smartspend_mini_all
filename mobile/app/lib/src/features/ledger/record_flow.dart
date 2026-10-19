import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'category_style.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'offline/ledger_store.dart';
import 'offline/outbox.dart';

/// Text to put back in the sentence box: a sentence the person chose to edit from the outbox.
final composerDraftProvider = NotifierProvider<ComposerDraft, String?>(
  ComposerDraft.new,
);

class ComposerDraft extends Notifier<String?> {
  @override
  String? build() => null;

  void put(String text) => state = text;

  void taken() => state = null;
}

/// Says what was saved and offers to take it back (rule 7.5): «اتحفظت لوحدها: 185 ج.م · أكل وشرب».
void announceSaved(
  BuildContext context,
  WidgetRef ref,
  List<ParsedItem> items,
  List<int> ids, {
  bool automatic = false,
}) {
  if (!context.mounted) return;
  final l10n = AppLocalizations.of(context);
  final money = MoneyLocale.of(context);
  SmartSpendHaptics.success();
  final summary = items.length == 1
      ? '${formatMoney(items.single.amount, locale: money)} · ${items.single.categoryLabel}'
      : l10n.savedItemsSummary(
          items.length,
          formatMoney(
            items.fold<num>(0, (sum, item) => sum + item.amount),
            locale: money,
          ),
        );
  showSmartSpendNotice(
    context,
    automatic ? l10n.savedAuto(summary) : l10n.savedManual(summary),
    undoLabel: ids.isEmpty ? null : l10n.undo,
    onUndo: ids.isEmpty ? null : () => _undo(context, ref, ids),
  );
}

Future<void> _undo(BuildContext context, WidgetRef ref, List<int> ids) async {
  final l10n = AppLocalizations.of(context);
  final api = ref.read(ledgerApiProvider);
  try {
    await Future.wait(ids.map(api.delete));
    if (context.mounted) showSmartSpendNotice(context, l10n.undone);
  } on Object {
    if (context.mounted) {
      unawaited(SmartSpendHaptics.warning());
      showSmartSpendNotice(context, l10n.undoFailed);
    }
  } finally {
    refreshLedger(ref);
  }
}

/// Shows what the server read from [item] and saves it when the person agrees. Returns false when they chose to
/// edit the sentence instead, true when it was saved, and null when the sheet was closed.
Future<bool?> reviewAndSave(
  BuildContext context,
  WidgetRef ref,
  OutboxItem item,
) async {
  final l10n = AppLocalizations.of(context);
  final parse = item.parse;
  if (parse == null) return null;
  final items = parse.items.where((entry) => entry.isSavable).toList();
  final choice = await showSmartSpendSheet<bool>(
    context: context,
    builder: (sheetContext) => _ReviewSheet(
      items: items,
      alert: parse.alertMessage,
      title: l10n.reviewTitle,
      saveLabel: l10n.reviewSave,
      editLabel: l10n.reviewEdit,
    ),
  );
  if (choice != true || !context.mounted) return choice;
  final ids = await ref.read(outboxProvider.notifier).confirm(item);
  if (context.mounted) announceSaved(context, ref, items, ids);
  return true;
}

/// Asks the server's question about [item] until it is saved or the person leaves it for later, when it stays in
/// the outbox with its question.
Future<void> answerAndSave(
  BuildContext context,
  WidgetRef ref,
  OutboxItem item,
) async {
  final l10n = AppLocalizations.of(context);
  var current = item;
  while (true) {
    if (!context.mounted) return;
    final question =
        current.parse?.clarificationQuestion ?? l10n.clarifyDefault;
    if (current.parse?.clarificationId == null) {
      // A question the server could not store cannot be answered here: the person rephrases the sentence.
      await ref.read(outboxProvider.notifier).discard(current);
      ref.read(composerDraftProvider.notifier).put(current.text);
      if (context.mounted) showSmartSpendNotice(context, question);
      return;
    }
    final answer = await showSmartSpendSheet<String>(
      context: context,
      builder: (sheetContext) => _ClarifySheet(
        question: question,
        answerLabel: l10n.clarifyAnswerLabel,
        sendLabel: l10n.clarifySend,
        laterLabel: l10n.clarifyLater,
      ),
    );
    if (answer == null || answer.trim().isEmpty || !context.mounted) return;
    final result = await ref
        .read(outboxProvider.notifier)
        .answer(current, answer.trim());
    if (result.nextQuestion == null) {
      if (result.savedIds.isNotEmpty && context.mounted) {
        announceSaved(context, ref, result.savedItems, result.savedIds);
      }
      return;
    }
    final waiting = ref
        .read(outboxProvider)
        .value
        ?.items
        .where((entry) => entry.id == current.id)
        .firstOrNull;
    if (waiting == null) return;
    current = waiting;
  }
}

class _ReviewSheet extends StatelessWidget {
  const _ReviewSheet({
    required this.items,
    required this.alert,
    required this.title,
    required this.saveLabel,
    required this.editLabel,
  });

  final List<ParsedItem> items;
  final String? alert;
  final String title;
  final String saveLabel;
  final String editLabel;

  @override
  Widget build(BuildContext context) {
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
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: SmartSpendSpacing.sm),
          if (alert case final String note when note.isNotEmpty) ...[
            InlineMessage(note, warning: true),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          for (final item in items)
            TransactionRow(
              icon: categoryIcon(item.category),
              iconColor: categoryColor(context, item.category),
              title: item.description?.trim().isNotEmpty == true
                  ? item.description!
                  : item.categoryLabel,
              subtitle: item.categoryLabel,
              amount: item.amount,
              kind: itemKind(item),
            ),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: saveLabel,
            onPressed: () => Navigator.pop(context, true),
          ),
          SmartSpendButton(
            label: editLabel,
            variant: ButtonVariant.quiet,
            onPressed: () => Navigator.pop(context, false),
          ),
        ],
      ),
    );
  }
}

class _ClarifySheet extends StatefulWidget {
  const _ClarifySheet({
    required this.question,
    required this.answerLabel,
    required this.sendLabel,
    required this.laterLabel,
  });

  final String question;
  final String answerLabel;
  final String sendLabel;
  final String laterLabel;

  @override
  State<_ClarifySheet> createState() => _ClarifySheetState();
}

class _ClarifySheetState extends State<_ClarifySheet> {
  final _answer = TextEditingController();

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
          Text(widget.question, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: SmartSpendSpacing.lg),
          TextField(
            controller: _answer,
            autofocus: true,
            maxLength: 200,
            textInputAction: TextInputAction.send,
            onSubmitted: (value) => Navigator.pop(context, value),
            decoration: InputDecoration(labelText: widget.answerLabel),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: widget.sendLabel,
            onPressed: () => Navigator.pop(context, _answer.text),
          ),
          SmartSpendButton(
            label: widget.laterLabel,
            variant: ButtonVariant.quiet,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}
