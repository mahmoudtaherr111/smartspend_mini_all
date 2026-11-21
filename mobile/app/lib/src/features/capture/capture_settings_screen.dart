import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'capture_api.dart';
import 'capture_controller.dart';

/// What the person controls about bank message capture (decisions 0033 and 0034): the phones that send, the cards
/// and phrases ignored, and deleting what capture keeps.
class CaptureSettingsScreen extends ConsumerWidget {
  const CaptureSettingsScreen({super.key});

  static const path = '/more/capture-settings';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final devices = ref.watch(captureDevicesProvider).value ?? const [];
    final ignored = ref.watch(captureIgnoredProvider).value ?? const [];
    return Scaffold(
      appBar: AppBar(title: Text(l10n.captureSettingsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          Text(l10n.captureDevicesTitle, style: textTheme.titleMedium),
          if (devices.isEmpty)
            Text(l10n.captureDevicesEmpty, style: textTheme.bodyMedium),
          for (final device in devices) _DeviceTile(device: device),
          const SizedBox(height: SmartSpendSpacing.xl),
          Text(l10n.captureIgnoredTitle, style: textTheme.titleMedium),
          Text(l10n.captureIgnoredBody, style: textTheme.bodyMedium),
          for (final marker in ignored)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                marker.card
                    ? l10n.captureIgnoredCard(marker.value)
                    : inlineName(marker.value),
              ),
              trailing: IconButton(
                icon: const Icon(Icons.close),
                tooltip: l10n.captureIgnoredRemove,
                onPressed: () async {
                  await ref.read(captureApiProvider).unignore(marker.id);
                  ref.invalidate(captureIgnoredProvider);
                },
              ),
            ),
          const _AddIgnoredCard(),
          const SizedBox(height: SmartSpendSpacing.xl),
          Text(l10n.captureDeleteTitle, style: textTheme.titleMedium),
          Text(l10n.captureDeleteBody, style: textTheme.bodyMedium),
          const SizedBox(height: SmartSpendSpacing.md),
          const _DeleteMyData(),
        ],
      ),
    );
  }
}

class _DeviceTile extends ConsumerWidget {
  const _DeviceTile({required this.device});

  final CaptureDeviceRow device;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final connector = ref.read(captureConnectorProvider);
    return FutureBuilder<bool>(
      future: connector.isThisPhone(device),
      builder: (context, here) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          device.platform == 'ios' ? Icons.phone_iphone : Icons.phone_android,
        ),
        title: Text(
          here.data == true
              ? l10n.captureThisPhone
              : (device.label ?? l10n.captureOtherPhone),
        ),
        trailing: TextButton(
          onPressed: () async {
            final messenger = ScaffoldMessenger.of(context);
            try {
              await connector.revoke(device);
            } on Object {
              messenger.showSnackBar(
                SnackBar(content: Text(l10n.captureSettingsFailed)),
              );
            }
          },
          child: Text(l10n.captureDeviceStop),
        ),
      ),
    );
  }
}

class _AddIgnoredCard extends ConsumerStatefulWidget {
  const _AddIgnoredCard();

  @override
  ConsumerState<_AddIgnoredCard> createState() => _AddIgnoredCardState();
}

class _AddIgnoredCardState extends ConsumerState<_AddIgnoredCard> {
  final _digits = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _digits.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final l10n = AppLocalizations.of(context);
    final digits = _digits.text.trim();
    if (digits.length < 3 || digits.length > 4) {
      setState(() => _error = l10n.captureIgnoreDigitsNeeded);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(captureApiProvider).ignoreCard(digits);
      _digits.clear();
      ref.invalidate(captureIgnoredProvider);
    } on Object {
      _error = l10n.captureSettingsFailed;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _digits,
          keyboardType: TextInputType.number,
          maxLength: 4,
          decoration: InputDecoration(
            labelText: l10n.captureIgnoreDigitsLabel,
            errorText: _error,
          ),
        ),
        SmartSpendButton(
          label: l10n.captureIgnoreAdd,
          variant: ButtonVariant.secondary,
          busy: _busy,
          onPressed: _add,
        ),
      ],
    );
  }
}

class _DeleteMyData extends ConsumerStatefulWidget {
  const _DeleteMyData();

  @override
  ConsumerState<_DeleteMyData> createState() => _DeleteMyDataState();
}

class _DeleteMyDataState extends ConsumerState<_DeleteMyData> {
  bool _busy = false;

  Future<void> _delete() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.captureDeleteConfirmTitle),
        content: Text(l10n.captureDeleteConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.captureDeleteCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.captureDeleteConfirm),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(captureConnectorProvider).deleteMyData();
      messenger.showSnackBar(SnackBar(content: Text(l10n.captureDeleted)));
    } on Object {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.captureSettingsFailed)),
      );
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SmartSpendButton(
      label: l10n.captureDeleteButton,
      variant: ButtonVariant.secondary,
      busy: _busy,
      onPressed: _delete,
    );
  }
}
