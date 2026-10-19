import 'dart:async';

import 'package:device_lock/device_lock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'app_lock.dart';
import 'pin_rules.dart';

/// The name of the phone's biometric, to put after «افتح ب…».
String biometricName(AppLocalizations l10n, BiometricKind? kind) =>
    switch (kind) {
      BiometricKind.face => l10n.biometricFace,
      BiometricKind.iris => l10n.biometricIris,
      _ => l10n.biometricFingerprint,
    };

IconData biometricIcon(BiometricKind? kind) => switch (kind) {
  BiometricKind.face => Icons.face_outlined,
  BiometricKind.iris => Icons.remove_red_eye_outlined,
  _ => Icons.fingerprint,
};

BiometricPromptText biometricPrompt(AppLocalizations l10n) =>
    BiometricPromptText(
      title: l10n.biometricPromptTitle,
      reason: l10n.biometricPromptReason,
      usePin: l10n.biometricPromptUsePin,
    );

/// The message after a biometric prompt that did not open the app, or null when there is nothing to say (the
/// person closed it, or it worked).
String? biometricMessage(AppLocalizations l10n, BiometricOutcome outcome) =>
    switch (outcome) {
      BiometricOutcome.changed => l10n.lockBiometricsChanged,
      BiometricOutcome.lockedOut => l10n.lockBiometricsLockedOut,
      BiometricOutcome.failed => l10n.lockBiometricsFailed,
      BiometricOutcome.success ||
      BiometricOutcome.cancelled ||
      BiometricOutcome.unavailable => null,
    };

/// «0:30», in Western digits, for the wait after wrong PINs.
String waitText(Duration left) {
  final seconds = (left.inMilliseconds / 1000).ceil();
  final hours = seconds ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  final rest = (seconds % 60).toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${minutes.toString().padLeft(2, '0')}:$rest'
      : '$minutes:$rest';
}

/// Six dots, the pad and the message under them: the PIN check shared by the lock screen and the confirmation
/// before changing the lock. Wrong PINs are counted by [AppLock.checkPin] either way.
///
/// With [unlocks] a right PIN opens the app; without, [onAccepted] runs and the app stays as it is.
class PinEntry extends ConsumerStatefulWidget {
  const PinEntry({
    super.key,
    required this.title,
    this.unlocks = true,
    this.onAccepted,
    this.onUnverifiable,
  });

  final String title;
  final bool unlocks;
  final VoidCallback? onAccepted;

  /// The PIN can no longer be checked on this phone.
  final VoidCallback? onUnverifiable;

  @override
  ConsumerState<PinEntry> createState() => PinEntryState();
}

class PinEntryState extends ConsumerState<PinEntry> {
  String _typed = '';
  bool _checking = false;
  bool _error = false;
  String? _message;
  Duration _wait = Duration.zero;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _followWait(ref.read(appLockProvider.notifier).waitLeft);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Shows [message] under the dots and reads it out.
  void say(String? message, {bool error = false}) {
    setState(() {
      _message = message;
      _error = error;
    });
    if (message != null) announceForAccessibility(context, message);
  }

  void _followWait(Duration left) {
    _ticker?.cancel();
    _wait = left;
    if (left <= Duration.zero) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      final now = ref.read(appLockProvider.notifier).waitLeft;
      setState(() => _wait = now);
      if (now <= Duration.zero) {
        _ticker?.cancel();
        setState(() => _message = null);
      }
    });
  }

  void _digit(String digit) {
    if (_checking || _typed.length >= PinRules.length) return;
    setState(() {
      _typed += digit;
      _error = false;
    });
    if (_typed.length == PinRules.length) unawaited(_check());
  }

  void _delete() {
    if (_typed.isEmpty) return;
    setState(() => _typed = _typed.substring(0, _typed.length - 1));
  }

  Future<void> _check() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _checking = true);
    final result = await ref
        .read(appLockProvider.notifier)
        .checkPin(_typed, unlock: widget.unlocks);
    if (!mounted) return;
    setState(() {
      _checking = false;
      _typed = '';
    });
    switch (result) {
      case PinAccepted():
        unawaited(SmartSpendHaptics.success());
        widget.onAccepted?.call();
      case PinRejected(:final triesLeft, :final wait):
        unawaited(SmartSpendHaptics.error());
        _followWait(wait);
        // The warning before signing out, and under it the wait, if any; the wait line counts down by itself.
        final warning = triesLeft <= PinRules.warnWhenLeft
            ? l10n.lockWrongWarning(triesLeft)
            : (wait == Duration.zero ? l10n.lockWrong : null);
        say(warning, error: true);
        if (warning == null) {
          announceForAccessibility(context, l10n.lockWait(waitText(wait)));
        }
      case PinWait(:final left):
        _followWait(left);
        announceForAccessibility(context, l10n.lockWait(waitText(left)));
      case PinSignedOut():
        break;
      case PinUnverifiable():
        say(l10n.lockDamaged, error: true);
        widget.onUnverifiable?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final blocked = _wait > Duration.zero;
    final message = [
      ?_message,
      if (blocked) l10n.lockWait(waitText(_wait)),
    ].join('\n');
    final lock = ref.watch(appLockProvider);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.title,
          style: textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: SmartSpendSpacing.xl),
        PinDots(
          length: PinRules.length,
          filled: _typed.length,
          error: _error,
          semanticsLabel: l10n.lockDigitsEntered(
            _typed.length,
            PinRules.length,
          ),
        ),
        SizedBox(
          height: 72,
          child: Center(
            child: message.isEmpty
                ? null
                : Text(
                    message,
                    textAlign: TextAlign.center,
                    style: textTheme.bodyMedium?.copyWith(
                      color: _error || blocked
                          ? colors.danger
                          : colors.mutedForeground,
                    ),
                  ),
          ),
        ),
        PinPad(
          enabled: !_checking && !blocked,
          onDigit: _digit,
          onDelete: _delete,
          deleteLabel: l10n.lockDelete,
          leading: lock.biometrics ? _BiometricKey(entry: this) : null,
        ),
      ],
    );
  }

  /// Asks for biometrics, and says why when they did not open the app.
  Future<void> askBiometrics() async {
    final l10n = AppLocalizations.of(context);
    final outcome = await ref
        .read(appLockProvider.notifier)
        .unlockWithBiometrics(biometricPrompt(l10n));
    if (!mounted) return;
    if (outcome == BiometricOutcome.success) {
      widget.onAccepted?.call();
      return;
    }
    final message = biometricMessage(l10n, outcome);
    if (message != null) say(message, error: true);
  }
}

class _BiometricKey extends ConsumerWidget {
  const _BiometricKey({required this.entry});

  final PinEntryState entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final kind = ref.watch(appLockProvider).capabilities?.kind;
    return IconButton(
      onPressed: entry.askBiometrics,
      tooltip: l10n.lockUseBiometrics(biometricName(l10n, kind)),
      icon: Icon(biometricIcon(kind), size: 34),
    );
  }
}
