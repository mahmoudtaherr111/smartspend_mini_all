import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'category_style.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';

/// Where a sentence is typed, at the bottom of the record tab within the thumb's reach (rule 3.3). It follows the
/// web's form (`src/components/expenses/ExpenseForm.tsx`): `ai.parseExpense` reads the sentence, then what the
/// server decided happens — saved at once, shown for review, or a question — and every save offers an undo.
class RecordComposer extends ConsumerStatefulWidget {
  const RecordComposer({super.key});

  @override
  ConsumerState<RecordComposer> createState() => _RecordComposerState();
}

class _RecordComposerState extends ConsumerState<RecordComposer> {
  final _text = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final sentence = _text.text.trim();
    if (sentence.isEmpty || _busy) return;
    final l10n = AppLocalizations.of(context);
    final api = ref.read(ledgerApiProvider);
    try {
      final result = await _working(() => api.parse(sentence));
      if (!mounted) return;
      switch (result.decision) {
        case ParseDecision.autoSave:
          await _save(result, sentence, automatic: true);
        case ParseDecision.review:
          final items = result.items.where((item) => item.isSavable).toList();
          if (items.isEmpty) {
            _tell(l10n.nothingToSave, warning: true);
            return;
          }
          final confirmed = await _review(items, result.alertMessage);
          if (confirmed && mounted) await _save(result, sentence);
        case ParseDecision.clarify:
          await _clarify(
            result.clarificationQuestion ?? l10n.clarifyDefault,
            result.clarificationId,
          );
      }
    } on ApiNetworkException {
      _tell(l10n.offlineKeepText, warning: true);
    } on ApiException catch (error) {
      _tell(error.message, warning: true);
    }
  }

  /// Shows the send button spinning while [task] talks to the server, and only then: not while a sheet waits for
  /// the person.
  Future<T> _working<T>(Future<T> Function() task) async {
    setState(() => _busy = true);
    try {
      return await task();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save(
    ParseResult result,
    String sentence, {
    bool automatic = false,
  }) async {
    final l10n = AppLocalizations.of(context);
    final items = result.items.where((item) => item.isSavable).toList();
    if (items.isEmpty) {
      _tell(l10n.nothingToSave, warning: true);
      return;
    }
    final ids = await _working(
      () => ref
          .read(ledgerApiProvider)
          .save(
            items,
            rawText: sentence,
            classificationLogId: result.classificationLogId,
          ),
    );
    _saved(items, ids, automatic: automatic);
  }

  /// After a save: clear the sentence, refresh the ledger, and offer to take it back.
  void _saved(List<ParsedItem> items, List<int> ids, {bool automatic = false}) {
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    final money = MoneyLocale.of(context);
    _text.clear();
    SmartSpendHaptics.success();
    refreshLedger(ref);
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
      onUndo: ids.isEmpty ? null : () => _undo(ids),
    );
  }

  Future<void> _undo(List<int> ids) async {
    final l10n = AppLocalizations.of(context);
    final api = ref.read(ledgerApiProvider);
    try {
      await Future.wait(ids.map(api.delete));
      if (mounted) _tell(l10n.undone);
    } on Object {
      if (mounted) _tell(l10n.undoFailed, warning: true);
    } finally {
      if (mounted) refreshLedger(ref);
    }
  }

  Future<bool> _review(List<ParsedItem> items, String? alert) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showSmartSpendSheet<bool>(
      context: context,
      builder: (sheetContext) => _ReviewSheet(
        items: items,
        alert: alert,
        saveLabel: l10n.reviewSave,
        editLabel: l10n.reviewEdit,
        title: l10n.reviewTitle,
      ),
    );
    return confirmed ?? false;
  }

  /// Asks the server's question until the sentence is saved or the person leaves it for later.
  Future<void> _clarify(String question, int? clarificationId) async {
    final l10n = AppLocalizations.of(context);
    var currentQuestion = question;
    var currentId = clarificationId;
    while (currentId != null) {
      if (!mounted) return;
      final answer = await showSmartSpendSheet<String>(
        context: context,
        builder: (sheetContext) => _ClarifySheet(
          question: currentQuestion,
          answerLabel: l10n.clarifyAnswerLabel,
          sendLabel: l10n.clarifySend,
          laterLabel: l10n.clarifyLater,
        ),
      );
      if (answer == null || answer.trim().isEmpty || !mounted) return;
      final id = currentId;
      final result = await _working(
        () => ref.read(ledgerApiProvider).answer(id, answer.trim()),
      );
      if (result.nextQuestion == null) {
        if (result.savedIds.isNotEmpty) {
          _saved(result.savedItems, result.savedIds);
        }
        return;
      }
      currentQuestion = result.nextQuestion!;
      currentId = result.clarificationId ?? currentId;
    }
    // A question the server could not store cannot be answered here; the person can rephrase the sentence.
    if (mounted && currentId == null) _tell(currentQuestion, warning: true);
  }

  void _tell(String message, {bool warning = false}) {
    if (!mounted) return;
    if (warning) SmartSpendHaptics.warning();
    showSmartSpendNotice(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            SmartSpendSpacing.lg,
            SmartSpendSpacing.sm,
            SmartSpendSpacing.lg,
            SmartSpendSpacing.sm,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  minLines: 1,
                  maxLines: 4,
                  enabled: !_busy,
                  textInputAction: TextInputAction.send,
                  keyboardType: TextInputType.text,
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(hintText: l10n.composerHint),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.sm),
              SizedBox.square(
                dimension: 52,
                child: IconButton.filled(
                  tooltip: l10n.composerSend,
                  onPressed: _busy ? null : _submit,
                  icon: _busy
                      ? SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: colors.foreground,
                          ),
                        )
                      : const Icon(Icons.arrow_upward),
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
