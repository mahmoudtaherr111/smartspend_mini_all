import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/auth_api.dart';
import '../auth/session_controller.dart';
import '../lock/app_lock.dart';
import '../lock/step_up_auth.dart';
import 'account_providers.dart';

/// Unswipeable Account Deletion Sheet (ACC-05, SEC-F1, SEC-F2).
///
/// Discloses immediate data erasure vs Egyptian Law 151/2020 retention,
/// requires typed confirmation phrase «احذف حسابي», requires password for
/// phone-based accounts, triggers Step-Up Authentication, and executes
/// full account purge on confirmation.
class DeleteAccountSheet extends ConsumerStatefulWidget {
  const DeleteAccountSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showSmartSpendSheet<bool>(
      context: context,
      isDismissible: false,
      builder: (ctx) => const DeleteAccountSheet(),
    );
  }

  @override
  ConsumerState<DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends ConsumerState<DeleteAccountSheet> {
  final _confirmationController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _deleting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    unawaited(ref.read(deviceLockProvider).setScreenProtected(true));
  }

  @override
  void dispose() {
    unawaited(ref.read(deviceLockProvider).setScreenProtected(false));
    _confirmationController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  bool _isConfirmed(String text) {
    final normalized = text
        .replaceAll('ـ', '')
        .replaceAll(RegExp(r'[أإآ]'), 'ا')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .toLowerCase();
    return normalized == 'احذف حسابي' || normalized == 'delete my account';
  }

  Future<void> _executeDelete() async {
    final l10n = AppLocalizations.of(context);
    final user = switch (ref.read(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    final isLocal = user?.kind == AccountKind.phone;

    setState(() {
      _errorMessage = null;
    });

    if (isLocal && _passwordController.text.trim().isEmpty) {
      setState(() {
        _errorMessage = l10n.deleteAccountPasswordHint;
      });
      return;
    }

    // Step-up authentication check (SEC-F1)
    final stepUpSuccess = await promptStepUpAuth(
      context,
      ref: ref,
      reason: l10n.deleteAccountTitle,
    );
    if (!stepUpSuccess || !mounted) return;

    setState(() => _deleting = true);

    try {
      await ref
          .read(accountRepositoryProvider)
          .deleteMyAccount(
            confirmation: _confirmationController.text.trim(),
            password: isLocal ? _passwordController.text.trim() : null,
          );

      if (!mounted) return;
      showSmartSpendNotice(context, l10n.deleteAccountSuccess);
      Navigator.of(context).pop(true);
      await ref.read(sessionProvider.notifier).signOut();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _deleting = false;
        _errorMessage = e.message;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _deleting = false;
        _errorMessage = l10n.deleteAccountFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final user = switch (ref.watch(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    final isLocal = user?.kind == AccountKind.phone;

    final canSubmit =
        _isConfirmed(_confirmationController.text) &&
        (!isLocal || _passwordController.text.trim().isNotEmpty) &&
        !_deleting;

    return PopScope(
      canPop: !_deleting,
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: colors.danger.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                      ),
                      child: Icon(
                        Icons.delete_forever_rounded,
                        color: colors.danger,
                        size: 26,
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.md),
                    Expanded(
                      child: Text(
                        l10n.deleteAccountTitle,
                        style: textTheme.titleMedium,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                Container(
                  padding: const EdgeInsets.all(SmartSpendSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                  child: Text(
                    l10n.deleteAccountBody,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.foreground,
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                Text(
                  l10n.deleteAccountPhraseInstruction,
                  style: textTheme.titleSmall,
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                TextField(
                  controller: _confirmationController,
                  enabled: !_deleting,
                  decoration: InputDecoration(
                    hintText: 'احذف حسابي',
                    prefixIcon: const Icon(Icons.edit_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                if (isLocal) ...[
                  const SizedBox(height: SmartSpendSpacing.md),
                  Text(
                    l10n.deleteAccountPasswordLabel,
                    style: textTheme.titleSmall,
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  TextField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    enabled: !_deleting,
                    decoration: InputDecoration(
                      hintText: l10n.deleteAccountPasswordHint,
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
                if (_errorMessage != null) ...[
                  const SizedBox(height: SmartSpendSpacing.md),
                  Container(
                    padding: const EdgeInsets.all(SmartSpendSpacing.sm),
                    decoration: BoxDecoration(
                      color: colors.danger.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          _errorMessage!,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.danger,
                          ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.xs),
                        GestureDetector(
                          onTap: () {
                            Navigator.of(context).pop();
                            context.push('/more/help');
                          },
                          child: Text(
                            l10n.deleteAccountContactSupport,
                            style: textTheme.labelMedium?.copyWith(
                              color: colors.accent,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: SmartSpendSpacing.xl),
                SmartSpendButton(
                  label: l10n.deleteAccountConfirmButton,
                  variant: ButtonVariant.destructive,
                  busy: _deleting,
                  onPressed: canSubmit ? _executeDelete : null,
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                SmartSpendButton(
                  label: l10n.deleteAccountCancelButton,
                  variant: ButtonVariant.quiet,
                  onPressed: _deleting
                      ? null
                      : () => Navigator.of(context).pop(false),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
