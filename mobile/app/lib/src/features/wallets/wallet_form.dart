import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'wallet_models.dart';
import 'wallet_providers.dart';
import 'wallet_style.dart';

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

  late final String _initialName = (widget.wallet?.name ?? '').trim();
  late final String _initialLastFour = (widget.wallet?.lastFour ?? '').trim();
  late final String _initialBalance =
      widget.wallet == null ? '' : _plain(widget.wallet!.balance).trim();
  late final WalletKind _initialKind = widget.wallet?.kind ?? WalletKind.card;

  bool get _isDirty =>
      _name.text.trim() != _initialName ||
      _lastFour.text.trim() != _initialLastFour ||
      _balance.text.trim() != _initialBalance ||
      _kind != _initialKind;

  Future<bool> _confirmDiscard(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.discardChangesTitle),
        content: Text(l10n.discardChangesBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.discardChangesCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.discardChangesConfirm),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  static String _plain(num value) => value == value.roundToDouble()
      ? value.round().toString()
      : value.toStringAsFixed(2);

  @override
  void initState() {
    super.initState();
    _name.addListener(_onFieldChanged);
    _lastFour.addListener(_onFieldChanged);
    _balance.addListener(_onFieldChanged);
  }

  void _onFieldChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _name.removeListener(_onFieldChanged);
    _lastFour.removeListener(_onFieldChanged);
    _balance.removeListener(_onFieldChanged);
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
    return PopScope(
      canPop: !_isDirty || _busy,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final discard = await _confirmDiscard(context);
        if (discard && context.mounted) {
          Navigator.of(context).pop(false);
        }
      },
      child: SingleChildScrollView(
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
      ),
    );
  }
}
