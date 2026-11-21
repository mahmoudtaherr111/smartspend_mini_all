import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../capture/capture_activity_providers.dart';
import '../capture/capture_controller.dart';
import '../ledger/ledger_providers.dart';
import 'wallet_providers.dart';

class WalletBalanceKindChoice extends ConsumerStatefulWidget {
  const WalletBalanceKindChoice({
    super.key,
    required this.walletId,
    required this.kind,
  });
  final int walletId;
  final String kind;
  @override
  ConsumerState<WalletBalanceKindChoice> createState() =>
      _WalletBalanceKindChoiceState();
}

class _WalletBalanceKindChoiceState
    extends ConsumerState<WalletBalanceKindChoice> {
  bool _busy = false;
  Future<void> _choose(String kind) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(captureActivityApiProvider)
          .setWalletKind(widget.walletId, kind);
      if (!mounted) return;
      refreshLedger(ref);
      ref.invalidate(walletsProvider);
      ref.invalidate(walletDetailProvider(widget.walletId));
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).walletKindFailed,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled =
        ref.watch(captureServerStatusProvider).value?.walletTypesEnabled ==
        true;
    if (!enabled) return const SizedBox.shrink();
    final online = ref.watch(networkStatusProvider);
    final l10n = AppLocalizations.of(context);
    final labels = {
      'unknown': l10n.walletKindUnknown,
      'cash': l10n.walletKindCash,
      'bank': l10n.walletKindBank,
      'debit': l10n.walletKindDebit,
      'credit': l10n.walletKindCredit,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.walletBalanceKindTitle,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          DropdownButton<String>(
            isExpanded: true,
            value: labels.containsKey(widget.kind) ? widget.kind : 'unknown',
            items: [
              for (final entry in labels.entries)
                DropdownMenuItem(value: entry.key, child: Text(entry.value)),
            ],
            onChanged: online && !_busy
                ? (value) {
                    if (value != null) _choose(value);
                  }
                : null,
          ),
          Text(l10n.walletBalanceKindBody),
        ],
      ),
    );
  }
}
