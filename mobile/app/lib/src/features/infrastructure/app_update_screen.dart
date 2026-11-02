import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../ledger/ledger_providers.dart';

/// Screen displayed when the server signals that the installed app build is too old (FND-11).
///
/// Works offline and displays a clear explanation with a store update action.
class AppUpdateScreen extends ConsumerWidget {
  const AppUpdateScreen({
    super.key,
    this.minimumVersion,
    this.storeUrl = 'https://smartspend.eg/download',
    this.onUpdate,
  });

  static const path = '/update-required';

  final String? minimumVersion;
  final String storeUrl;
  final VoidCallback? onUpdate;

  void _handleUpdate(BuildContext context) {
    if (onUpdate != null) {
      onUpdate!();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalizations.of(context).appPleaseUpdateTheAppFrom(storeUrl),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final online = ref.watch(networkStatusProvider);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: colors.accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.system_update_rounded,
                    size: 48,
                    color: colors.accent,
                  ),
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              Text(
                AppLocalizations.of(context).appPleaseUpdateTheApp,
                textAlign: TextAlign.center,
                style: textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                AppLocalizations.of(context).appThisVersionIsNoLonger,
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                  height: 1.5,
                ),
              ),
              if (minimumVersion != null) ...[
                const SizedBox(height: SmartSpendSpacing.md),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    border: Border.all(color: colors.border),
                  ),
                  child: Text(
                    AppLocalizations.of(context)
                        .appMinimumVersionP0('$minimumVersion'),
                    textAlign: TextAlign.center,
                    style: textTheme.labelMedium?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              if (!online) ...[
                Container(
                  padding: const EdgeInsets.all(SmartSpendSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    border: Border.all(
                      color: colors.warning.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.wifi_off_rounded,
                        color: colors.warning,
                        size: 20,
                      ),
                      const SizedBox(width: SmartSpendSpacing.sm),
                      Expanded(
                        child: Text(
                          AppLocalizations.of(context).appYouReOfflineYourSaved,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.warning,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
              ],
              SmartSpendButton(
                label: AppLocalizations.of(context).appUpdateNow2,
                variant: ButtonVariant.primary,
                icon: Icons.open_in_new_rounded,
                onPressed: () => _handleUpdate(context),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              SmartSpendButton(
                label: AppLocalizations.of(context).appContinueOffline,
                variant: ButtonVariant.quiet,
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
