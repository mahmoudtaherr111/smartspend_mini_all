import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/session_controller.dart';
import '../ledger/offline/outbox.dart';

/// Who is signed in on this phone, and the way out.
class AccountCard extends ConsumerStatefulWidget {
  const AccountCard({super.key});

  @override
  ConsumerState<AccountCard> createState() => _AccountCardState();
}

class _AccountCardState extends ConsumerState<AccountCard> {
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
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final user = switch (ref.watch(sessionProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    // A phone number or an email reads left to right inside the Arabic card, aligned with the rest of it.
    final contact = user?.phone ?? user?.email;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.accountTitle,
              style: textTheme.labelLarge?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
            if (user != null) ...[
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(user.name, style: textTheme.titleMedium),
              if (contact != null)
                Text(
                  inlineName(contact),
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
            ],
            const SizedBox(height: SmartSpendSpacing.lg),
            SmartSpendButton(
              label: l10n.signOut,
              variant: ButtonVariant.secondary,
              icon: Icons.logout,
              busy: _signingOut,
              onPressed: _signOut,
            ),
          ],
        ),
      ),
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
