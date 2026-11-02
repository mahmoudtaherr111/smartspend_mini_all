import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../account/profile_screen.dart';
import '../auth/session_controller.dart';
import '../ledger/offline/outbox.dart';

/// Who is signed in on this phone; it opens their profile.
class AccountCard extends ConsumerWidget {
  const AccountCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final user = switch (ref.watch(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    // A phone number or an email reads left to right inside the Arabic card, aligned with the rest of it.
    final contact = user?.phone ?? user?.email;
    if (user == null) return const SizedBox.shrink();

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go(ProfileScreen.path),
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          child: Row(
            children: [
              CircleAvatar(
                radius: SmartSpendSpacing.xl,
                backgroundColor: colors.accent.withValues(alpha: 0.14),
                child: Text(
                  user.name.isEmpty ? '👤' : user.name.characters.first,
                  style: textTheme.titleLarge?.copyWith(color: colors.accent),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user.name, style: textTheme.titleMedium),
                    if (contact != null)
                      Text(
                        inlineName(contact),
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: colors.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}

/// The way out, which warns first about sentences that have not reached the server.
class SignOutButton extends ConsumerStatefulWidget {
  const SignOutButton({super.key});

  @override
  ConsumerState<SignOutButton> createState() => _SignOutButtonState();
}

class _SignOutButtonState extends ConsumerState<SignOutButton> {
  bool _signingOut = false;

  Future<void> _signOut() async {
    final outbox = ref.read(outboxProvider).value;
    final unsent = outbox?.items.length ?? 0;

    if (unsent > 0 && mounted) {
      final proceed = await showSmartSpendSheet<bool>(
        context: context,
        builder: (ctx) => _SignOutWarningSheet(unsentCount: unsent),
      );
      if (proceed != true) return;
    }

    if (!mounted) return;
    setState(() => _signingOut = true);
    await ref.read(sessionProvider.notifier).signOut();
    if (mounted) setState(() => _signingOut = false);
  }

  @override
  Widget build(BuildContext context) {
    return SmartSpendButton(
      label: AppLocalizations.of(context).signOut,
      variant: ButtonVariant.secondary,
      icon: Icons.logout,
      busy: _signingOut,
      onPressed: _signOut,
    );
  }
}

class _SignOutWarningSheet extends StatelessWidget {
  const _SignOutWarningSheet({required this.unsentCount});

  final int unsentCount;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.all(SmartSpendSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: colors.warning.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                ),
                child: Icon(
                  Icons.warning_amber_rounded,
                  color: colors.warning,
                  size: 24,
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(child: Text(l10n.signOut, style: textTheme.titleMedium)),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          Text(
            l10n.signOutPendingOutboxWarning(unsentCount),
            style: textTheme.bodyMedium?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: l10n.signOutConfirmAnyway,
            variant: ButtonVariant.destructive,
            onPressed: () => Navigator.of(context).pop(true),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: l10n.signOutCancel,
            variant: ButtonVariant.quiet,
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}
