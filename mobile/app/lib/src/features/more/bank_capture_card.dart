import 'package:bank_capture/bank_capture.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';

/// How this phone hands bank and wallet messages to the app, and the way to switch it on. The status is read
/// again whenever the app comes back from the settings screen it opened.
class BankCaptureCard extends ConsumerStatefulWidget {
  const BankCaptureCard({super.key});

  @override
  ConsumerState<BankCaptureCard> createState() => _BankCaptureCardState();
}

class _BankCaptureCardState extends ConsumerState<BankCaptureCard> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.invalidate(captureStatusProvider),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final status = ref.watch(captureStatusProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: switch (status) {
          AsyncData(:final value) => _StatusBody(status: value),
          AsyncError() => Text(l10n.captureStatusFailed),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _StatusBody extends ConsumerWidget {
  const _StatusBody({required this.status});

  final CaptureStatus status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final android = status.method == CaptureMethod.notificationListener;
    final granted = status.access == CaptureAccess.granted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                android ? l10n.captureAndroidTitle : l10n.captureIosTitle,
                style: textTheme.titleMedium,
              ),
            ),
            if (status.access != CaptureAccess.unknown)
              Text(
                granted ? l10n.captureOn : l10n.captureOff,
                style: textTheme.labelLarge?.copyWith(
                  color: granted ? colors.accent : colors.warning,
                ),
              ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        Text(
          android ? l10n.captureAndroidBody : l10n.captureIosBody,
          style: textTheme.bodyMedium?.copyWith(color: colors.mutedForeground),
        ),
        if (!granted) ...[
          const SizedBox(height: SmartSpendSpacing.lg),
          FilledButton(
            onPressed: () => ref.read(bankCaptureProvider).openAccessSettings(),
            child: Text(
              android ? l10n.captureOpenSettings : l10n.captureOpenShortcuts,
            ),
          ),
        ],
      ],
    );
  }
}
