import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../ledger/ledger_providers.dart';

/// Reusable banner displayed when the device is offline or requests fail (FND-12).
class NetworkRetryBanner extends ConsumerWidget {
  const NetworkRetryBanner({super.key, this.onRetry, this.message});

  final VoidCallback? onRetry;
  final String? message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(networkStatusProvider);
    if (online && message == null) return const SizedBox.shrink();

    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.lg,
        vertical: SmartSpendSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.warning.withValues(alpha: 0.14),
        border: Border(
          bottom: BorderSide(color: colors.warning.withValues(alpha: 0.25)),
        ),
      ),
      child: Row(
        children: [
          Icon(
            online ? Icons.sync_problem_rounded : Icons.wifi_off_rounded,
            color: colors.warning,
            size: 18,
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: Text(
              message ??
                  (!online
                      ? AppLocalizations.of(context).appYouReOfflineChangesSave
                      : AppLocalizations.of(context).appConnectionError),
              style: textTheme.bodySmall?.copyWith(color: colors.warning),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: SmartSpendSpacing.sm),
            GestureDetector(
              onTap: onRetry,
              child: Text(
                AppLocalizations.of(context).appTryAgain,
                style: textTheme.labelSmall?.copyWith(
                  color: colors.accent,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
