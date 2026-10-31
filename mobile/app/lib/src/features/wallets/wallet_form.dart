import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'wallet_models.dart';
import 'wallet_providers.dart';

/// The name a person reads for a wallet kind.
String walletKindName(AppLocalizations l10n, WalletKind kind) => switch (kind) {
  WalletKind.card => l10n.walletKindCard,
  WalletKind.vodafoneCash => l10n.walletKindVodafoneCash,
  WalletKind.instaPay => l10n.walletKindInstaPay,
  WalletKind.cib => l10n.walletKindCib,
  WalletKind.nbe => l10n.walletKindNbe,
  WalletKind.banqueMisr => l10n.walletKindBanqueMisr,
  WalletKind.qnb => l10n.walletKindQnb,
  WalletKind.fawry => l10n.walletKindFawry,
  WalletKind.orangeCash => l10n.walletKindOrangeCash,
  WalletKind.etisalatCash => l10n.walletKindEtisalatCash,
};

/// The kind's colour, darkened on the light theme so it reads on white.
Color walletKindColor(BuildContext context, WalletKind kind) =>
    context.smartSpendColors.brightness == Brightness.light
    ? Color.lerp(kind.color, Colors.black, 0.2)!
    : kind.color;

/// Opens the sheet that adds a wallet, or edits [wallet]'s name, last digits and balance. Returns true when saved.
Future<bool> showWalletForm(BuildContext context, {Wallet? wallet}) async {
  final saved = await showSmartSpendSheet<bool>(
    context: context,
    builder: (_) => _WalletForm(wallet: wallet),
  );
  return saved ?? false;
}

class _WalletForm extends ConsumerStatefulWidget {
  const _WalletForm({this.wallet});

  final Wallet? wallet;

  @override
  ConsumerState<_WalletForm> createState() => _WalletFormState();
}

class _WalletFormState extends ConsumerState<_WalletForm> {
  late final _name = TextEditingController(text: widget.wallet?.name);
  late final _lastFour = TextEditingController(text: widget.wallet?.lastFour);
  late final _balance = TextEditingController(
    text: widget.wallet == null ? '' : _plain(widget.wallet!.balance),
  );
  late WalletKind _kind = widget.wallet?.kind ?? WalletKind.card;
  bool _busy = false;
  String? _nameError;
  String? _lastFourError;
  String? _balanceError;
  String? _error;

  static String _plain(num value) => value == value.roundToDouble()
      ? value.round().toString()
      : value.toStringAsFixed(2);

  @override
  void dispose() {
    _name.dispose();
    _lastFour.dispose();
    _balance.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    final l10n = AppLocalizations.of(context);
    final name = _name.text.trim();
    final lastFour = normalizeDigits(_lastFour.text.trim());
    final balanceText = _balance.text.trim();
    setState(() {
      _nameError = name.isEmpty ? l10n.walletNameRequired : null;
      _lastFourError =
          lastFour.isNotEmpty && !RegExp(r'^\d{4}$').hasMatch(lastFour)
          ? l10n.walletLastFourInvalid
          : null;
      _balanceError =
          balanceText.isNotEmpty &&
              parseAmount(balanceText, signed: true) == null
          ? l10n.walletBalanceInvalid
          : null;
      _error = null;
    });
    if (_nameError != null || _lastFourError != null || _balanceError != null) {
      return;
    }

    setState(() => _busy = true);
    final repository = ref.read(walletsRepositoryProvider);
    final balance = balanceText.isEmpty
        ? null
        : parseAmount(balanceText, signed: true).toString();
    try {
      final wallet = widget.wallet;
      if (wallet == null) {
        await repository.create(
          name: name,
          kind: _kind,
          lastFour: lastFour,
          balance: balance,
        );
      } else {
        await repository.update(
          wallet.id,
          name: name,
          lastFour: lastFour,
          balance: balance,
        );
      }
      unawaited(SmartSpendHaptics.success());
      ref.invalidate(walletsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on ApiNetworkException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final editing = widget.wallet != null;
    final error = _error;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            editing
                ? l10n.walletFormEditTitle(widget.wallet!.name)
                : l10n.walletFormAddTitle,
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          if (error != null) ...[
            InlineMessage(error),
            const SizedBox(height: SmartSpendSpacing.md),
          ],
          if (!editing) ...[
            Text(l10n.walletKindLabel, style: textTheme.labelLarge),
            const SizedBox(height: SmartSpendSpacing.sm),
            Wrap(
              spacing: SmartSpendSpacing.sm,
              runSpacing: SmartSpendSpacing.sm,
              children: [
                for (final kind in WalletKind.values)
                  ChoiceChip(
                    avatar: Icon(
                      kind.icon,
                      size: 18,
                      color: walletKindColor(context, kind),
                    ),
                    label: Text(walletKindName(l10n, kind)),
                    selected: _kind == kind,
                    onSelected: (_) {
                      unawaited(SmartSpendHaptics.selection());
                      setState(() => _kind = kind);
                    },
                  ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
          ],
          TextField(
            controller: _name,
            textInputAction: TextInputAction.next,
            maxLength: 100,
            decoration: InputDecoration(
              labelText: l10n.walletNameLabel,
              hintText: l10n.walletNameHint,
              errorText: _nameError,
              counterText: '',
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _lastFour,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            maxLength: 4,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[0-9٠-٩]')),
            ],
            decoration: InputDecoration(
              labelText: l10n.walletLastFourLabel,
              errorText: _lastFourError,
              counterText: '',
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _balance,
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
              signed: true,
            ),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(
              labelText: l10n.walletBalanceLabel,
              errorText: _balanceError,
              suffixText: MoneyLocale.of(context).symbol,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: l10n.walletSave,
            busy: _busy,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
