import 'dart:async';

import 'package:device_lock/device_lock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'app_lock.dart';
import 'pin_entry.dart';

/// Prompts for Step-Up Authentication before a sensitive operation (SEC-F1).
///
/// If AppLock is not enabled, returns true immediately.
/// If AppLock is enabled, attempts biometrics if active, or displays a sheet with PIN entry.
/// Returns true if authentication succeeds, false if cancelled or failed.
Future<bool> promptStepUpAuth(
  BuildContext context, {
  required WidgetRef ref,
  required String reason,
}) async {
  final lock = ref.read(appLockProvider);
  if (!lock.enabled) {
    return true;
  }

  // If biometrics are ready and enabled, try biometrics prompt first
  if (lock.biometrics && lock.biometricsReady) {
    final l10n = AppLocalizations.of(context);
    final outcome = await ref
        .read(appLockProvider.notifier)
        .unlockWithBiometrics(
          BiometricPromptText(
            title: l10n.securityTitle,
            reason: reason,
            usePin: l10n.biometricPromptUsePin,
          ),
        );
    if (outcome == BiometricOutcome.success) {
      return true;
    }
  }

  if (!context.mounted) return false;

  // Otherwise, show Step-Up PIN sheet
  final confirmed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(SmartSpendRadii.sheet),
      ),
    ),
    builder: (ctx) => _StepUpAuthSheet(reason: reason),
  );

  return confirmed == true;
}

class _StepUpAuthSheet extends ConsumerStatefulWidget {
  const _StepUpAuthSheet({required this.reason});

  final String reason;

  @override
  ConsumerState<_StepUpAuthSheet> createState() => _StepUpAuthSheetState();
}

class _StepUpAuthSheetState extends ConsumerState<_StepUpAuthSheet> {
  late final DeviceLock _deviceLock;

  @override
  void initState() {
    super.initState();
    _deviceLock = ref.read(deviceLockProvider);
    unawaited(_deviceLock.setScreenProtected(true));
  }

  @override
  void dispose() {
    unawaited(_deviceLock.setScreenProtected(false));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              Text(
                widget.reason,
                style: textTheme.bodyLarge?.copyWith(
                  color: colors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              PinEntry(
                title: l10n.securityConfirm,
                unlocks: false,
                onAccepted: () {
                  Navigator.of(context).pop(true);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
