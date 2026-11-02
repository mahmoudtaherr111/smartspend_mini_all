import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

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
      final expectedPhrase = widget.draft.confirmationPhrase ?? 'أكد العملية';
      final confirmed = await _showHighRiskConfirmationDialog(
        context,
        expectedPhrase: expectedPhrase,
        actionTitle: widget.draft.summary,
      );
      if (!confirmed) return;
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

        final msg = (res['message'] as String?) ?? 'تم تنفيذ العملية بنجاح';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: const Color(0xFF0F766E),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('فشل تنفيذ العملية: $e'),
            backgroundColor: Colors.red.shade700,
          ),
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

  Future<bool> _showHighRiskConfirmationDialog(
    BuildContext context, {
    required String expectedPhrase,
    required String actionTitle,
  }) async {
    final controller = TextEditingController();
    bool phraseMatches = false;

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.orange),
                  SizedBox(width: 8),
                  Text('تأكيد إجراء حساس'),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'هذا الإجراء ($actionTitle) لا يمكن التراجع عنه بسهولة.',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'للتأكيد، اكتب العبارة التالية بالضبط:\n«$expectedPhrase»',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: expectedPhrase,
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: (text) {
                      setDialogState(() {
                        phraseMatches = _matchesPhrase(text, expectedPhrase);
                      });
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogCtx).pop(false),
                  child: const Text('إلغاء'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.red.shade700,
                  ),
                  onPressed: phraseMatches
                      ? () => Navigator.of(dialogCtx).pop(true)
                      : null,
                  child: const Text('تأكيد التنفيذ'),
                ),
              ],
            );
          },
        );
      },
    );

    return result == true;
  }

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
    final draft = widget.draft;
    final isExpired = draft.isExpired;
    final isConfirmed = draft.status == 'confirmed';
    final isCancelled = draft.status == 'cancelled';
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isConfirmed
            ? (theme.brightness == Brightness.dark
                  ? const Color(0xFF064E3B).withValues(alpha: 0.3)
                  : const Color(0xFFF0FDF4))
            : isCancelled || isExpired
            ? (theme.brightness == Brightness.dark
                  ? colorScheme.surfaceContainerHigh
                  : Colors.grey.shade100)
            : colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isConfirmed
              ? const Color(0xFF86EFAC)
              : isCancelled || isExpired
              ? colorScheme.outlineVariant
              : colorScheme.outline,
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
                    ? const Color(0xFF16A34A)
                    : isCancelled || isExpired
                    ? colorScheme.onSurfaceVariant
                    : const Color(0xFF0F766E),
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  draft.summary,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: isCancelled || isExpired
                        ? colorScheme.onSurfaceVariant
                        : colorScheme.onSurface,
                  ),
                ),
              ),
              if (draft.isHighRisk &&
                  !isConfirmed &&
                  !isCancelled &&
                  !isExpired)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'حساس',
                    style: TextStyle(
                      color: Colors.deepOrange,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
          if (draft.amounts.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final amt in draft.amounts)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: colorScheme.surface,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: colorScheme.outlineVariant),
                    ),
                    child: AmountText(amt),
                  ),
              ],
            ),
          ],
          if (draft.date != null && draft.date!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'التاريخ: ${draft.date}',
              style: TextStyle(
                fontSize: 12,
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (isConfirmed)
            const Text(
              'تم تنفيذ الإجراء وتحديث الحسابات بنجاح ✓',
              style: TextStyle(
                color: Color(0xFF16A34A),
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
            )
          else if (isCancelled)
            Text(
              'تم إلغاء هذا الإجراء.',
              style: TextStyle(
                color: colorScheme.onSurfaceVariant,
                fontSize: 13,
              ),
            )
          else if (isExpired)
            Text(
              'انتهت صلاحية هذا الإجراء ولم يعد قابلاً للتنفيذ.',
              style: TextStyle(
                color: Colors.orange.shade800,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: _isSubmitting ? null : _handleCancel,
                  style: OutlinedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: colorScheme.onSurfaceVariant,
                  ),
                  child: const Text('إلغاء'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _isSubmitting ? null : _handleConfirm,
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    backgroundColor: draft.isHighRisk
                        ? Colors.deepOrange.shade700
                        : const Color(0xFF0F766E),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(draft.isHighRisk ? 'متابعة التأكيد' : 'تأكيد'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
