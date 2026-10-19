import 'dart:async';

import 'package:device_lock/device_lock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'app_lock.dart';
import 'pin_entry.dart';
import 'pin_rules.dart';

/// Security and privacy: the app lock, biometrics, when the lock asks again, the PIN, and hidden amounts.
///
/// While the lock is on, the screen first asks for the PIN (or biometrics), so a phone left unlocked cannot have
/// its lock turned off or its PIN changed.
class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  static const path = '/more/security';

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  late bool _confirmed = !ref.read(appLockProvider).enabled;

  Future<void> _setUpPin() async {
    final message = await context.push<String>(PinSetupScreen.path);
    if (message != null && mounted) showSmartSpendNotice(context, message);
  }

  Future<void> _turnOff() async {
    final l10n = AppLocalizations.of(context);
    await ref.read(appLockProvider.notifier).turnOff();
    if (mounted) showSmartSpendNotice(context, l10n.lockTurnedOff);
  }

  Future<void> _biometrics(bool on, String name) async {
    final l10n = AppLocalizations.of(context);
    final lock = ref.read(appLockProvider.notifier);
    if (!on) {
      await lock.turnOffBiometrics();
      return;
    }
    final outcome = await lock.turnOnBiometrics(biometricPrompt(l10n));
    if (!mounted) return;
    final message = switch (outcome) {
      BiometricOutcome.success => l10n.biometricsTurnedOn(name),
      BiometricOutcome.unavailable => l10n.biometricsUnavailable(name),
      _ => biometricMessage(l10n, outcome),
    };
    if (message != null) showSmartSpendNotice(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final lock = ref.watch(appLockProvider);
    final notifier = ref.read(appLockProvider.notifier);
    if (lock.enabled && !_confirmed) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.securityTitle)),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: PinEntry(
              title: l10n.securityConfirm,
              unlocks: false,
              onAccepted: () => setState(() => _confirmed = true),
            ),
          ),
        ),
      );
    }
    final name = biometricName(l10n, lock.capabilities?.kind);
    final availability = lock.capabilities?.availability;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.securityTitle)),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
        children: [
          _Section(l10n.securityLockSection),
          SwitchListTile(
            title: Text(l10n.securityLock),
            subtitle: Text(l10n.securityLockBody),
            value: lock.enabled,
            onChanged: (on) => unawaited(on ? _setUpPin() : _turnOff()),
          ),
          if (lock.enabled) ...[
            if (lock.biometrics || lock.biometricsReady)
              SwitchListTile(
                secondary: Icon(biometricIcon(lock.capabilities?.kind)),
                title: Text(l10n.lockUseBiometrics(name)),
                value: lock.biometrics,
                onChanged: (on) => unawaited(_biometrics(on, name)),
              )
            else if (availability == BiometricAvailability.notEnrolled)
              ListTile(
                enabled: false,
                leading: Icon(biometricIcon(lock.capabilities?.kind)),
                title: Text(l10n.lockUseBiometrics(name)),
                subtitle: Text(l10n.securityBiometricsNotEnrolled(name)),
              ),
            ListTile(
              title: Text(l10n.securityRelock),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: SmartSpendSpacing.sm),
                child: SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: 0, label: Text(l10n.relockNow)),
                    ButtonSegment(value: 60, label: Text(l10n.relockMinute)),
                    ButtonSegment(
                      value: 300,
                      label: Text(l10n.relockFiveMinutes),
                    ),
                  ],
                  selected: {lock.record.relockAfter.inSeconds},
                  onSelectionChanged: (choice) => unawaited(
                    notifier.setRelockAfter(Duration(seconds: choice.single)),
                  ),
                ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.password),
              title: Text(l10n.securityChangePin),
              trailing: const Icon(Icons.chevron_left),
              onTap: _setUpPin,
            ),
          ],
          _Section(l10n.securityPrivacySection),
          SwitchListTile(
            secondary: const Icon(Icons.visibility_off_outlined),
            title: Text(l10n.hideAmounts),
            subtitle: Text(l10n.hideAmountsBody),
            value: lock.hideAmounts,
            onChanged: (hide) => unawaited(notifier.setHideAmounts(hide)),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
    child: SectionHeader(title),
  );
}

enum _Step { choose, confirm, biometrics }

/// Choosing a PIN: six digits, a guessable one refused, typed twice. Turning the lock on then offers biometrics
/// when the phone has them. Pops with the notice to show.
class PinSetupScreen extends ConsumerStatefulWidget {
  const PinSetupScreen({super.key});

  static const path = '${SecurityScreen.path}/pin';

  @override
  ConsumerState<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends ConsumerState<PinSetupScreen> {
  /// Changing the PIN of a lock already on, rather than turning it on.
  late final bool _changing = ref.read(appLockProvider).enabled;
  var _step = _Step.choose;
  var _typed = '';
  var _first = '';
  String? _message;
  bool _saving = false;

  void _say(String message) {
    setState(() => _message = message);
    announceForAccessibility(context, message);
  }

  Future<void> _digit(String digit) async {
    if (_saving || _typed.length >= PinRules.length) return;
    setState(() {
      _typed += digit;
      _message = null;
    });
    if (_typed.length < PinRules.length) return;
    final l10n = AppLocalizations.of(context);
    final pin = _typed;
    setState(() => _typed = '');
    switch (_step) {
      case _Step.choose:
        if (PinRules.isGuessable(pin)) {
          unawaited(SmartSpendHaptics.warning());
          _say(l10n.pinGuessable);
          return;
        }
        setState(() {
          _first = pin;
          _step = _Step.confirm;
        });
      case _Step.confirm:
        if (pin != _first) {
          unawaited(SmartSpendHaptics.error());
          setState(() => _step = _Step.choose);
          _say(l10n.pinMismatch);
          return;
        }
        setState(() => _saving = true);
        await ref.read(appLockProvider.notifier).setPin(pin);
        if (!mounted) return;
        final lock = ref.read(appLockProvider);
        if (!_changing && lock.biometricsReady && !lock.biometrics) {
          setState(() {
            _saving = false;
            _step = _Step.biometrics;
          });
        } else {
          unawaited(SmartSpendHaptics.success());
          context.pop(_changing ? l10n.pinChanged : l10n.lockTurnedOn);
        }
      case _Step.biometrics:
        break;
    }
  }

  void _delete() {
    if (_typed.isEmpty) return;
    setState(() => _typed = _typed.substring(0, _typed.length - 1));
  }

  Future<void> _offerBiometrics(bool accept) async {
    final l10n = AppLocalizations.of(context);
    final name = biometricName(
      l10n,
      ref.read(appLockProvider).capabilities?.kind,
    );
    if (!accept) {
      context.pop(l10n.lockTurnedOn);
      return;
    }
    final outcome = await ref
        .read(appLockProvider.notifier)
        .turnOnBiometrics(biometricPrompt(l10n));
    if (!mounted) return;
    context.pop(
      outcome == BiometricOutcome.success
          ? l10n.biometricsTurnedOn(name)
          : l10n.lockTurnedOn,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final lock = ref.watch(appLockProvider);
    final name = biometricName(l10n, lock.capabilities?.kind);
    return Scaffold(
      appBar: AppBar(
        title: Text(_changing ? l10n.securityChangePin : l10n.securityLock),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: _step == _Step.biometrics
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        biometricIcon(lock.capabilities?.kind),
                        size: 56,
                        color: colors.accent,
                      ),
                      const SizedBox(height: SmartSpendSpacing.lg),
                      Text(
                        l10n.pinOfferBiometricsTitle(name),
                        style: textTheme.titleLarge,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      Text(
                        l10n.pinOfferBiometricsBody,
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: SmartSpendSpacing.xl),
                      SmartSpendButton(
                        label: l10n.pinOfferYes,
                        onPressed: () => _offerBiometrics(true),
                      ),
                      const SizedBox(height: SmartSpendSpacing.sm),
                      SmartSpendButton(
                        label: l10n.pinOfferNo,
                        variant: ButtonVariant.quiet,
                        onPressed: () => _offerBiometrics(false),
                      ),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _step == _Step.choose
                            ? l10n.pinChooseTitle
                            : l10n.pinConfirmTitle,
                        style: textTheme.titleLarge,
                        textAlign: TextAlign.center,
                      ),
                      if (_step == _Step.choose) ...[
                        const SizedBox(height: SmartSpendSpacing.sm),
                        Text(
                          l10n.pinChooseBody,
                          style: textTheme.bodyMedium?.copyWith(
                            color: colors.mutedForeground,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                      const SizedBox(height: SmartSpendSpacing.xl),
                      PinDots(
                        length: PinRules.length,
                        filled: _typed.length,
                        error: _message != null,
                        semanticsLabel: l10n.lockDigitsEntered(
                          _typed.length,
                          PinRules.length,
                        ),
                      ),
                      SizedBox(
                        height: 72,
                        child: Center(
                          child: _message == null
                              ? null
                              : Text(
                                  _message!,
                                  textAlign: TextAlign.center,
                                  style: textTheme.bodyMedium?.copyWith(
                                    color: colors.danger,
                                  ),
                                ),
                        ),
                      ),
                      PinPad(
                        enabled: !_saving,
                        onDigit: (digit) => unawaited(_digit(digit)),
                        onDelete: _delete,
                        deleteLabel: l10n.lockDelete,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
