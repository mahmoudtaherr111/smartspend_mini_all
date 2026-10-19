import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/session_controller.dart';

/// Who is signed in on this phone, and the way out.
class AccountCard extends ConsumerStatefulWidget {
  const AccountCard({super.key});

  @override
  ConsumerState<AccountCard> createState() => _AccountCardState();
}

class _AccountCardState extends ConsumerState<AccountCard> {
  bool _signingOut = false;

  Future<void> _signOut() async {
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
