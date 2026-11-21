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
  bool _starting = false;

  Future<void> _start() async {
    if (_starting) return;
    _starting = true;
    setState(() => _busy = true);
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final server = await ref.read(captureApiProvider).status();
      if (!mounted) return;
      setState(() => _busy = false);
      final agreed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l10n.captureConsentTitle),
          content: SingleChildScrollView(
            child: Text(
              server.automatic
                  ? l10n.captureAutomaticConsentBody
                  : l10n.captureConsentBody,
            ),
          ),
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
      final outcome = await ref
          .read(captureConnectorProvider)
          .connect(automaticConsentAccepted: server.automatic);
      if (!mounted) return;
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
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text(l10n.captureConnectFailed)),
        );
      }
    } finally {
      _starting = false;
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
    final server = ref.watch(captureServerStatusProvider).value;
    final needsRenewal =
        server?.automatic == true && (!server!.consented || !server.aiReading);
    final running = android && status.connected && granted && !needsRenewal;
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
          android
              ? (server?.automatic == true
                    ? l10n.captureAutomaticBody
                    : l10n.captureAndroidBody)
              : l10n.captureIosBody,
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
        ] else if (!status.connected || needsRenewal) ...[
          if (needsRenewal) Text(l10n.captureRenewConsent),
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
          const _QuestionsSwitch(),
          const _SamplesSwitch(),
          if (status.smsSupported == true) _SmsSection(status: status),
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
            trailing: Transform.scale(
              scaleX: Directionality.of(context) == TextDirection.rtl ? -1 : 1,
              child: const Icon(Icons.chevron_right),
            ),
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
      title: Text(
        server.automatic
            ? l10n.captureAutomaticAiTitle
            : l10n.captureAiReadingTitle,
      ),
      subtitle: Text(
        server.automatic
            ? l10n.captureAutomaticAiBody
            : l10n.captureAiReadingBody,
      ),
      value: server.aiReading,
      onChanged: _busy ? null : (granted) => _set(server, granted),
    );
  }
}

/// Reading bank SMS directly, in the SMS build only (plan v6 §6.1): the permission, then a one-time import of the
/// last 30 days.
class _SmsSection extends ConsumerStatefulWidget {
  const _SmsSection({required this.status});

  final CaptureStatus status;

  @override
  ConsumerState<_SmsSection> createState() => _SmsSectionState();
}

class _SmsSectionState extends ConsumerState<_SmsSection> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
      ref.invalidate(captureStatusProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final capture = ref.read(bankCaptureProvider);
    final granted = widget.status.smsAccess == CaptureAccess.granted;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.captureSmsTitle),
          subtitle: Text(granted ? l10n.captureSmsOn : l10n.captureSmsBody),
          trailing: granted
              ? null
              : TextButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                          await capture.requestSmsPermission();
                        }),
                  child: Text(l10n.captureSmsAllow),
                ),
        ),
        if (granted)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: _busy
                  ? null
                  : () => _run(() async {
                      final count = await capture.importSmsInbox();
                      messenger.showSnackBar(
                        SnackBar(content: Text(l10n.captureSmsImported(count))),
                      );
                    }),
              child: Text(l10n.captureSmsImport),
            ),
          ),
      ],
    );
  }
}

/// The consent to keep messages with names and numbers hidden, offered only while the admin keeps them (v7 §8).
/// "Ask me what it was for": after a payment is saved under "general", the app asks once (decision 0049).
class _QuestionsSwitch extends ConsumerStatefulWidget {
  const _QuestionsSwitch();

  @override
  ConsumerState<_QuestionsSwitch> createState() => _QuestionsSwitchState();
}

class _QuestionsSwitchState extends ConsumerState<_QuestionsSwitch> {
  bool _busy = false;

  Future<void> _set(CaptureServerStatus server, bool granted) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref
          .read(captureApiProvider)
          .setQuestions(granted, server.consentTextVersion);
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
    if (server == null || !server.questionsEnabled) {
      return const SizedBox.shrink();
    }
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(l10n.captureQuestionsTitle),
      subtitle: Text(l10n.captureQuestionsBody),
      value: server.questions,
      onChanged: _busy ? null : (granted) => _set(server, granted),
    );
  }
}

class _SamplesSwitch extends ConsumerStatefulWidget {
  const _SamplesSwitch();

  @override
  ConsumerState<_SamplesSwitch> createState() => _SamplesSwitchState();
}

class _SamplesSwitchState extends ConsumerState<_SamplesSwitch> {
  bool _busy = false;

  Future<void> _set(CaptureServerStatus server, bool granted) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await ref
          .read(captureApiProvider)
          .setSamples(granted, server.consentTextVersion);
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
    if (server == null || !server.samplesOffered) {
      return const SizedBox.shrink();
    }
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(l10n.captureSamplesTitle),
      subtitle: Text(l10n.captureSamplesBody),
      value: server.samples,
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
      title: Text(
        ref.watch(captureServerStatusProvider).value?.automatic == true
            ? l10n.captureAutomaticTitle
            : l10n.captureReviewEntry(count),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.go(CaptureReviewScreen.path),
    );
  }
}
