import 'package:bank_capture/bank_capture.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import '../capture/capture_api.dart';
import '../capture/capture_controller.dart';
import '../capture/capture_review_screen.dart';
import '../capture/capture_settings_screen.dart';

/// Bank and wallet message capture on this phone (decision 0028): turning it on (consent, a device token, the
/// native side connected), the notification access it still needs, and once it runs, what waits to be sent and the
/// transactions waiting for the person. The status is read again whenever the app comes back from a settings screen.
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
      onResume: () => ref
        ..invalidate(captureStatusProvider)
        ..invalidate(capturePendingProvider),
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

class _StatusBody extends ConsumerStatefulWidget {
  const _StatusBody({required this.status});

  final CaptureStatus status;

  @override
  ConsumerState<_StatusBody> createState() => _StatusBodyState();
}

class _StatusBodyState extends ConsumerState<_StatusBody> {
  bool _busy = false;

  Future<void> _start() async {
    final l10n = AppLocalizations.of(context);
    final agreed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.captureConsentTitle),
        content: Text(l10n.captureConsentBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.captureConsentAgree),
          ),
        ],
      ),
    );
    if (agreed != true || !mounted) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final outcome = await ref.read(captureConnectorProvider).connect();
      if (outcome == CaptureConnectOutcome.unavailable) {
        messenger.showSnackBar(
          SnackBar(content: Text(l10n.captureUnavailable)),
        );
      } else {
        final status = await ref.read(bankCaptureProvider).status();
        if (status.access != CaptureAccess.granted) {
          await ref.read(bankCaptureProvider).openAccessSettings();
        }
      }
    } on Object {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.captureConnectFailed)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final status = widget.status;
    final android = status.method == CaptureMethod.notificationListener;
    final granted = status.access == CaptureAccess.granted;
    final running = android && status.connected && granted;
    final muted = textTheme.bodyMedium?.copyWith(color: colors.mutedForeground);

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
                running ? l10n.captureOn : l10n.captureOff,
                style: textTheme.labelLarge?.copyWith(
                  color: running ? colors.accent : colors.warning,
                ),
              ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        Text(
          android ? l10n.captureAndroidBody : l10n.captureIosBody,
          style: muted,
        ),
        if (!android) ...[
          // iPhone capture comes with the Shortcuts step of the plan; for now the card opens the Shortcuts app.
          if (!granted) ...[
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: l10n.captureOpenShortcuts,
              onPressed: () =>
                  ref.read(bankCaptureProvider).openAccessSettings(),
            ),
          ],
        ] else if (!status.connected) ...[
          if (status.lastError == 'device_revoked') ...[
            const SizedBox(height: SmartSpendSpacing.sm),
            Text(l10n.captureRevoked, style: muted),
          ],
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.captureStart,
            busy: _busy,
            onPressed: _start,
          ),
        ] else if (!granted) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(l10n.captureNeedsAccess, style: muted),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.captureOpenSettings,
            onPressed: () => ref.read(bankCaptureProvider).openAccessSettings(),
          ),
        ] else ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(l10n.captureWaiting(status.waiting), style: muted),
          const _UsageLines(),
          const _AiReadingSwitch(),
          if (status.lastError == 'offline')
            Text(l10n.captureOffline, style: muted),
          if (status.lastError == 'update_required')
            Text(
              l10n.captureUpdateRequired,
              style: textTheme.bodyMedium?.copyWith(color: colors.warning),
            ),
          if (!status.notificationsAllowed)
            Text(l10n.captureNotificationsOff, style: muted),
          const SizedBox(height: SmartSpendSpacing.sm),
          const _PendingLink(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.captureSettingsTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go(CaptureSettingsScreen.path),
          ),
        ],
      ],
    );
  }
}

/// The month's use against the plan's limit, and what is held over it.
class _UsageLines extends ConsumerWidget {
  const _UsageLines();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final server = ref.watch(captureServerStatusProvider).value;
    if (server == null || server.limit == 0) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.captureUsage(server.used, server.limit),
          style: textTheme.bodyMedium?.copyWith(color: colors.mutedForeground),
        ),
        if (server.held > 0)
          Text(
            l10n.captureHeld(server.held),
            style: textTheme.bodyMedium?.copyWith(color: colors.warning),
          ),
        if (server.held > 0 && server.heldUntil != null)
          Text(
            l10n.captureHeldUntil(
              MaterialLocalizations.of(context)
                  .formatMediumDate(server.heldUntil!.toLocal()),
            ),
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
      ],
    );
  }
}

/// The consent to let the admin's model read messages the code could not read with confidence (decision 0031).
class _AiReadingSwitch extends ConsumerStatefulWidget {
  const _AiReadingSwitch();

  @override
  ConsumerState<_AiReadingSwitch> createState() => _AiReadingSwitchState();
}

class _AiReadingSwitchState extends ConsumerState<_AiReadingSwitch> {
  bool _busy = false;

  Future<void> _set(CaptureServerStatus server, bool granted) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref
          .read(captureApiProvider)
          .setAiReading(granted, server.consentTextVersion);
      ref.invalidate(captureServerStatusProvider);
    } on Object {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.captureAiReadingFailed)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final server = ref.watch(captureServerStatusProvider).value;
    if (server == null) return const SizedBox.shrink();
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(l10n.captureAiReadingTitle),
      subtitle: Text(l10n.captureAiReadingBody),
      value: server.aiReading,
      onChanged: _busy ? null : (granted) => _set(server, granted),
    );
  }
}

class _PendingLink extends ConsumerWidget {
  const _PendingLink();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final count = ref.watch(capturePendingProvider).value?.length ?? 0;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(l10n.captureReviewEntry(count)),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.go(CaptureReviewScreen.path),
    );
  }
}
