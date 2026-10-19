import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'ledger_models.dart';
import 'offline/ledger_store.dart';
import 'offline/outbox.dart';
import 'record_flow.dart';

/// The sentences recorded but not in the ledger yet, shown the moment they are written: waiting for the network,
/// being sent, waiting for the person's review or answer, or refused. Tapping one finishes it.
class OutboxSection extends ConsumerWidget {
  const OutboxSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(outboxProvider).value?.items ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(l10n.outboxTitle),
        for (final item in items.reversed) _OutboxRow(item: item),
      ],
    );
  }
}

class _OutboxRow extends ConsumerWidget {
  const _OutboxRow({required this.item});

  final OutboxItem item;

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    final parse = item.parse;
    if (item.state == OutboxState.needsYou && parse != null) {
      if (parse.decision == ParseDecision.clarify) {
        await answerAndSave(context, ref, item);
        return;
      }
      final saved = await reviewAndSave(context, ref, item);
      if (saved == false) {
        await ref.read(outboxProvider.notifier).discard(item);
        ref.read(composerDraftProvider.notifier).put(item.text);
      }
      return;
    }
    if (item.state == OutboxState.sending) return;
    await showSmartSpendSheet<void>(
      context: context,
      builder: (sheetContext) => _OutboxActions(item: item),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final (icon, color, status) = switch (item.state) {
      OutboxState.queued => (Icons.schedule, colors.warning, l10n.outboxQueued),
      OutboxState.sending => (Icons.sync, colors.info, l10n.outboxSending),
      OutboxState.needsYou =>
        item.parse?.decision == ParseDecision.clarify
            ? (Icons.help_outline, colors.ai, l10n.outboxNeedsAnswer)
            : (Icons.fact_check_outlined, colors.ai, l10n.outboxNeedsReview),
      OutboxState.failed => (
        Icons.error_outline,
        colors.danger,
        item.message ?? l10n.outboxFailed,
      ),
    };
    final total = item.parse?.items
        .where((entry) => entry.isSavable)
        .fold<num>(0, (sum, entry) => sum + entry.amount);

    return InkWell(
      onTap: () => _open(context, ref),
      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      item.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.titleSmall,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      status,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (total != null && total > 0) ...[
                const SizedBox(width: SmartSpendSpacing.md),
                AmountText(total, kind: AmountKind.pending),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// What can be done with a sentence still waiting or refused: send it now, or delete it.
class _OutboxActions extends ConsumerWidget {
  const _OutboxActions({required this.item});

  final OutboxItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final outbox = ref.read(outboxProvider.notifier);
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
          Text(item.text, style: Theme.of(context).textTheme.titleLarge),
          if (item.message case final String message) ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            InlineMessage(message),
          ],
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.outboxSendNow,
            icon: Icons.send_outlined,
            onPressed: () {
              Navigator.pop(context);
              outbox.retry(item);
            },
          ),
          SmartSpendButton(
            label: l10n.outboxDelete,
            variant: ButtonVariant.quiet,
            onPressed: () {
              Navigator.pop(context);
              outbox.discard(item);
            },
          ),
        ],
      ),
    );
  }
}
