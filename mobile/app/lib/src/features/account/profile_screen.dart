import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/auth_api.dart';
import '../auth/session_controller.dart';
import 'account_providers.dart';
import 'phone_change_sheet.dart';

/// Screen allowing in-place editing of display name, avatar, and starting phone change (ACC-01).
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  static const path = '/more/profile';

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameController = TextEditingController();
  bool _saving = false;
  String? _selectedAvatar;

  static const _avatarPresets = [
    '👤',
    '👨‍💼',
    '👩‍💼',
    '🧑‍💻',
    '👨‍🎨',
    '👩‍🎨',
    '🦁',
    '🦉',
    '🚀',
    '🌟',
  ];

  @override
  void initState() {
    super.initState();
    final user = switch (ref.read(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    if (user != null) {
      _nameController.text = user.name;
      _selectedAvatar = user.avatarUrl;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    setState(() => _saving = true);
    try {
      await ref
          .read(accountRepositoryProvider)
          .updateUserInfo(name: name, avatar: _selectedAvatar);
      await ref.read(sessionProvider.notifier).refresh();
      ref.invalidate(userProfileProvider);
      if (!mounted) return;
      showSmartSpendNotice(context, l10n.profileSaved);
    } on ApiException catch (e) {
      if (!mounted) return;
      showSmartSpendNotice(context, e.message);
    } on Object {
      if (!mounted) return;
      showSmartSpendNotice(context, l10n.captureStatusFailed);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;

    final user = switch (ref.watch(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    final isPhoneUser = user?.kind == AccountKind.phone;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 40,
                    backgroundColor: colors.accent.withValues(alpha: 0.15),
                    foregroundImage:
                        _selectedAvatar?.startsWith('http') ?? false
                        ? NetworkImage(_selectedAvatar!)
                        : null,
                    child: Text(
                      _selectedAvatar != null &&
                              !_selectedAvatar!.startsWith('http')
                          ? _selectedAvatar!
                          : (user != null && user.name.isNotEmpty
                                ? user.name.characters.first
                                : '👤'),
                      style: Theme.of(context).textTheme.displaySmall,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  Wrap(
                    spacing: SmartSpendSpacing.xs,
                    children: [
                      for (final avatar in _avatarPresets)
                        InkWell(
                          onTap: () => setState(() => _selectedAvatar = avatar),
                          borderRadius: BorderRadius.circular(
                            SmartSpendRadii.lg,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(SmartSpendSpacing.xs),
                            child: Text(
                              avatar,
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            TextField(
              controller: _nameController,
              enabled: !_saving,
              decoration: InputDecoration(
                labelText: l10n.profileName,
                prefixIcon: const Icon(Icons.person_outline),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            if (user?.phone != null) ...[
              TextFormField(
                initialValue: user!.phone,
                readOnly: true,
                decoration: InputDecoration(
                  labelText: l10n.profilePhone,
                  prefixIcon: const Icon(Icons.phone_outlined),
                ),
              ),
              if (isPhoneUser)
                SmartSpendButton(
                  label: l10n.profileChangePhone,
                  variant: ButtonVariant.quiet,
                  onPressed: () => PhoneChangeSheet.show(context),
                ),
              const SizedBox(height: SmartSpendSpacing.md),
            ],
            if (user?.email != null) ...[
              TextFormField(
                initialValue: user!.email,
                readOnly: true,
                decoration: InputDecoration(
                  labelText: l10n.profileEmail,
                  prefixIcon: const Icon(Icons.email_outlined),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
            ],
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: l10n.profileSave,
              busy: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
