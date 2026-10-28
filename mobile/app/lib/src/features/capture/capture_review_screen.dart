import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'capture_api.dart';
import 'capture_controller.dart';

/// The captured bank transactions waiting for the person (decision 0028): each one is recorded or dismissed here,
/// as from its notification, and one whose amount the message gave in another currency asks for the pounds first.
class CaptureReviewScreen extends ConsumerWidget {
  const CaptureReviewScreen({super.key});

  static const path = '/more/capture';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final pending = ref.watch(capturePendingProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.captureReviewTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(capturePendingProvider.future),
        child: switch (pending) {
          AsyncData(:final value) when value.isEmpty => ListView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            children: [Center(child: Text(l10n.captureReviewEmpty))],
          ),
          AsyncData(:final value) => ListView.separated(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            itemCount: value.length,
            separatorBuilder: (_, _) =>
                const SizedBox(height: SmartSpendSpacing.lg),
            itemBuilder: (context, index) => _PendingCard(
              key: ValueKey(value[index].signalId),
              item: value[index],
            ),
          ),
          AsyncError() => ListView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            children: [Center(child: Text(l10n.captureReviewFailed))],
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _PendingCard extends ConsumerStatefulWidget {
  const _PendingCard({super.key, required this.item});

  final PendingCapture item;

  @override
  ConsumerState<_PendingCard> createState() => _PendingCardState();
}

class _PendingCardState extends ConsumerState<_PendingCard> {
  final _amount = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _answer({required bool record}) async {
    final l10n = AppLocalizations.of(context);
    final item = widget.item;
    double? amountEgp;
    if (record && item.amountEgp == null) {
      final typed = parseAmount(_amount.text);
      if (typed == null || typed <= 0) {
        setState(() => _error = l10n.captureAmountNeeded);
        return;
      }
      amountEgp = typed.toDouble();
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(captureApiProvider)
          .answer(item.signalId, record: record, amountEgp: amountEgp);
      ref.invalidate(capturePendingProvider);
      // A recorded transaction changes the ledger's lists and totals.
      if (record) refreshLedger(ref);
      if (mounted) setState(() => _busy = false);
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = l10n.captureAnswerFailed;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final colors = context.smartSpendColors;
    final item = widget.item;
    final foreign = item.amountEgp == null;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (item.source != null)
              Text(
                item.source!,
                style: textTheme.labelLarge?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            const SizedBox(height: SmartSpendSpacing.sm),
            if (foreign)
              Text(
                inlineName(
                  '${item.currency} ${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)}',
                ),
                style: textTheme.titleLarge,
              )
            else
              AmountText(item.amountEgp!, kind: AmountKind.pending),
            if (item.party != null)
              Text(inlineName(item.party!), style: textTheme.bodyLarge),
            Text(
              '${item.category} · ${item.subCategory}',
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
            if (!item.certain && !foreign) ...[
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                l10n.captureCheckAmount,
                style: textTheme.bodySmall?.copyWith(color: colors.warning),
              ),
            ],
            if (foreign) ...[
              const SizedBox(height: SmartSpendSpacing.md),
              Text(l10n.captureAmountNeeded, style: textTheme.bodySmall),
              const SizedBox(height: SmartSpendSpacing.sm),
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(labelText: l10n.captureAmountLabel),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                _error!,
                style: textTheme.bodySmall?.copyWith(color: colors.danger),
              ),
            ],
            const SizedBox(height: SmartSpendSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: SmartSpendButton(
                    label: l10n.captureRecord,
                    busy: _busy,
                    onPressed: () => _answer(record: true),
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: SmartSpendButton(
                    label: l10n.captureDismiss,
                    variant: ButtonVariant.secondary,
                    onPressed: _busy ? null : () => _answer(record: false),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
