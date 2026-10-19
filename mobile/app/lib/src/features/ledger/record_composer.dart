import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'offline/offline_rules.dart';
import 'offline/outbox.dart';
import 'record_flow.dart';

/// Where a sentence is typed, at the bottom of the record tab within the thumb's reach (rule 3.3). Every sentence
/// goes through the outbox: read at once when the network allows — saved, shown for review, or answered — and
/// kept on the phone to be sent later when it does not.
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
    final outbox = ref.read(outboxProvider.notifier);
    final outcome = await _working(() async {
      await ref.read(outboxProvider.future);
      return outbox.submit(sentence);
    });
    if (!mounted) return;
    switch (outcome) {
      case SubmitSaved(:final items, :final ids, :final automatic):
        _text.clear();
        announceSaved(context, ref, items, ids, automatic: automatic);
      case SubmitNeedsReview(:final item):
        final saved = await reviewAndSave(context, ref, item);
        if (saved == true) {
          _text.clear();
        } else {
          // Not saved: the sentence stays in the box to be edited, and leaves the outbox.
          await outbox.discard(item);
        }
      case SubmitNeedsAnswer(:final item):
        _text.clear();
        await answerAndSave(context, ref, item);
      case SubmitQueued():
        _text.clear();
        _tell(l10n.queuedOffline);
      case SubmitRefused(:final reason, :final fullAt):
        _tell(switch ((reason, fullAt)) {
          (OfflineRefusal.tooShort, _) => l10n.offlineTooShort,
          (OfflineRefusal.unreadable, _) => l10n.offlineUnreadable,
          (OfflineRefusal.noAmount, _) => l10n.offlineNoAmount,
          (_, final int limit) => l10n.offlineFull(limit),
          _ => l10n.offlineNoAmount,
        });
      case SubmitFailed(:final message):
        _tell(message);
      case SubmitEmpty():
        _tell(l10n.nothingToSave);
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

  void _tell(String message) {
    if (!mounted) return;
    SmartSpendHaptics.warning();
    showSmartSpendNotice(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    // A sentence taken back from the outbox to be edited.
    ref.listen(composerDraftProvider, (_, draft) {
      if (draft == null) return;
      _text.text = draft;
      ref.read(composerDraftProvider.notifier).taken();
    });
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
