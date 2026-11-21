import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'ai_models.dart';
import 'ai_providers.dart';

/// An action card embedded within chat messages proposing a change to the user's ledger (AI-02).
class AiActionCard extends ConsumerStatefulWidget {
  const AiActionCard({required this.draft, super.key});

  final AiActionDraft draft;

  @override
  ConsumerState<AiActionCard> createState() => _AiActionCardState();
}

class _AiActionCardState extends ConsumerState<AiActionCard> {
  bool _isSubmitting = false;

  Future<void> _handleConfirm() async {
    if (_isSubmitting || widget.draft.isExpired) return;

    // High-risk actions require explicit phrase input
    if (widget.draft.isHighRisk) {
      final expectedPhrase =
          widget.draft.confirmationPhrase ??
          AppLocalizations.of(context).aiConfirmIt;
      final confirmed = await showSmartSpendSheet<bool>(
        context: context,
        isDismissible: false,
        builder: (_) => _HighRiskConfirmSheet(
          expectedPhrase: expectedPhrase,
          actionTitle: widget.draft.summary,
        ),
      );
      if (confirmed != true) return;
    }

    setState(() => _isSubmitting = true);

    try {
      final res = await ref
          .read(aiApiProvider)
          .confirmAction(
            actionId: widget.draft.actionId,
            confirmationPhrase: widget.draft.confirmationPhrase,
          );

      if (mounted) {
        ref
            .read(chatMessagesProvider.notifier)
            .updateActionStatus(widget.draft.id, 'confirmed');
        refreshLedgerViewsFromWidget(ref);

        final msg =
            (res['message'] as String?) ?? AppLocalizations.of(context).aiDone;
        showSmartSpendNotice(context, msg);
      }
    } catch (e) {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiItDidnTGoThrough,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _handleCancel() async {
    if (_isSubmitting || widget.draft.isExpired) return;

    setState(() => _isSubmitting = true);
    try {
      await ref.read(aiApiProvider).cancelAction(widget.draft.actionId);
      if (mounted) {
        ref
            .read(chatMessagesProvider.notifier)
            .updateActionStatus(widget.draft.id, 'cancelled');
      }
    } catch (_) {
      // Best-effort cancel
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    final isExpired = draft.isExpired;
    final isConfirmed = draft.status == 'confirmed';
    final isCancelled = draft.status == 'cancelled';
    final isClosed = isCancelled || isExpired;
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context);
    final muted = textTheme.bodySmall?.copyWith(color: colors.mutedForeground);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    isConfirmed
                        ? Icons.check_circle_rounded
                        : isCancelled
                        ? Icons.cancel_outlined
                        : isExpired
                        ? Icons.timer_off_outlined
                        : Icons.bolt_rounded,
                    color: isConfirmed
                        ? colors.accent
                        : isClosed
                        ? colors.mutedForeground
                        : colors.ai,
                    size: 20,
                  ),
                  const SizedBox(width: SmartSpendSpacing.sm),
                  Expanded(
                    child: Text(
                      draft.summary,
                      style: textTheme.titleSmall?.copyWith(
                        color: isClosed
                            ? colors.mutedForeground
                            : colors.foreground,
                      ),
                    ),
                  ),
                  if (draft.isHighRisk && !isConfirmed && !isClosed) ...[
                    const SizedBox(width: SmartSpendSpacing.sm),
                    StatusTag(l10n.aiSensitive, color: colors.warning),
                  ],
                ],
              ),
              if (draft.amounts.isNotEmpty) ...[
                const SizedBox(height: SmartSpendSpacing.sm),
                Wrap(
                  spacing: SmartSpendSpacing.lg,
                  runSpacing: SmartSpendSpacing.xs,
                  children: [for (final amt in draft.amounts) AmountText(amt)],
                ),
              ],
              if (draft.date != null && draft.date!.isNotEmpty) ...[
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(l10n.aiDateP0('${draft.date}'), style: muted),
              ],
              const SizedBox(height: SmartSpendSpacing.md),
              if (isConfirmed)
                Text(l10n.aiDoneAndYourRecordsAre, style: muted)
              else if (isCancelled)
                Text(l10n.aiCancelled, style: muted)
              else if (isExpired)
                InlineMessage(
                  l10n.aiThisHasExpiredAndCan,
                  tone: MessageTone.warning,
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: SmartSpendButton(
                        label: l10n.aiCancel,
                        variant: ButtonVariant.secondary,
                        onPressed: _isSubmitting ? null : _handleCancel,
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.sm),
                    Expanded(
                      child: SmartSpendButton(
                        label: draft.isHighRisk
                            ? l10n.aiContinue
                            : l10n.aiConfirm2,
                        variant: draft.isHighRisk
                            ? ButtonVariant.destructive
                            : ButtonVariant.primary,
                        busy: _isSubmitting,
                        onPressed: _handleConfirm,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Asks for the exact phrase before a high-risk action: the button wakes only when the phrase matches.
class _HighRiskConfirmSheet extends StatefulWidget {
  const _HighRiskConfirmSheet({
    required this.expectedPhrase,
    required this.actionTitle,
  });

  final String expectedPhrase;
  final String actionTitle;

  @override
  State<_HighRiskConfirmSheet> createState() => _HighRiskConfirmSheetState();
}

class _HighRiskConfirmSheetState extends State<_HighRiskConfirmSheet> {
  bool _phraseMatches = false;

  static bool _matchesPhrase(String given, String expected) {
    return _normalize(given) == _normalize(expected);
  }

  static String _normalize(String input) {
    return input
        .toLowerCase()
        .replaceAll(RegExp(r'[\u064B-\u065F\u0670]'), '') // diacritics
        .replaceAll(RegExp(r'[أإآٱ]'), 'ا')
        .replaceAll('ؤ', 'و')
        .replaceAll('ئ', 'ي')
        .replaceAll('ى', 'ي')
        .replaceAll('ة', 'ه')
        .replaceAll(RegExp(r'''[«»"'؟?،,.!]'''), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
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
            Semantics(
              header: true,
              child: Text(
                l10n.aiConfirmASensitiveAction,
                style: textTheme.titleLarge,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Text(
              l10n.aiThisActionP0CanT(widget.actionTitle),
              style: textTheme.titleSmall,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Text(
              l10n.aiToConfirmTypeExactlyP0(widget.expectedPhrase),
              style: textTheme.bodyMedium,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              autofocus: true,
              decoration: InputDecoration(hintText: widget.expectedPhrase),
              onChanged: (text) => setState(() {
                _phraseMatches = _matchesPhrase(text, widget.expectedPhrase);
              }),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: l10n.aiConfirm,
              variant: ButtonVariant.destructive,
              onPressed: _phraseMatches
                  ? () => Navigator.of(context).pop(true)
                  : null,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            SmartSpendButton(
              label: l10n.aiCancel,
              variant: ButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
