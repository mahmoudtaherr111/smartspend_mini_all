import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/session_controller.dart';
import 'account_providers.dart';

/// Screen listing active logins and device sessions with revoke controls (ACC-04, GAP-25).
class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  static const path = '/more/sessions';

  IconData _deviceIcon(String? userAgent) {
    final ua = userAgent?.toLowerCase() ?? '';
    if (ua.contains('iphone') || ua.contains('ipad') || ua.contains('ios')) {
      return Icons.phone_iphone_rounded;
    }
    if (ua.contains('android')) {
      return Icons.phone_android_rounded;
    }
    if (ua.contains('macintosh') ||
        ua.contains('windows') ||
        ua.contains('linux')) {
      return Icons.computer_rounded;
    }
    return Icons.devices_other_rounded;
  }

  String _deviceName(String? userAgent) {
    final ua = userAgent?.toLowerCase() ?? '';
    if (ua.contains('iphone')) return 'Apple iPhone';
    if (ua.contains('ipad')) return 'Apple iPad';
    if (ua.contains('android')) return 'Android Device';
    if (ua.contains('macintosh')) return 'Mac Web Browser';
    if (ua.contains('windows')) return 'Windows PC Browser';
    if (ua.contains('linux')) return 'Linux Browser';
    return userAgent ?? 'Unknown device';
  }

  Future<void> _revoke(
    BuildContext context,
    WidgetRef ref,
    UserSession session,
  ) async {
    final l10n = AppLocalizations.of(context);
    final isCurrent = session.isCurrent;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.sessionsRevoke),
        content: Text(
          isCurrent
              ? l10n.sessionsRevokeCurrentWarning
              : l10n.sessionsRevokeConfirm,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.signOutCancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.sessionsRevoke),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(accountRepositoryProvider).revokeSession(session.id);
      if (!context.mounted) return;

      if (isCurrent) {
        await ref.read(sessionProvider.notifier).signOut();
      } else {
        ref.invalidate(userSessionsProvider);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appSignedOutOfThatDevice,
        );
      }
    } on ApiException catch (e) {
      if (!context.mounted) return;
      showSmartSpendNotice(context, e.message);
    } on Object {
      if (!context.mounted) return;
      showSmartSpendNotice(context, l10n.captureStatusFailed);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final sessionsAsync = ref.watch(userSessionsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.sessionsTitle)),
      body: sessionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(l10n.captureStatusFailed),
              const SizedBox(height: SmartSpendSpacing.md),
              SmartSpendButton(
                label: AppLocalizations.of(context).appTryAgain,
                onPressed: () => ref.invalidate(userSessionsProvider),
              ),
            ],
          ),
        ),
        data: (sessions) {
          if (sessions.isEmpty) {
            return Center(
              child: Text(AppLocalizations.of(context).appNoSessionsRecorded),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(userSessionsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              itemCount: sessions.length,
              separatorBuilder: (ctx, i) =>
                  const SizedBox(height: SmartSpendSpacing.sm),
              itemBuilder: (ctx, i) {
                final s = sessions[i];
                final isCurrent =
                    s.isCurrent ||
                    (i == 0 && sessions.every((item) => !item.isCurrent));
                final icon = _deviceIcon(s.userAgent);
                final name = _deviceName(s.userAgent);

                return Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(
                      color: isCurrent ? colors.accent : colors.border,
                      width: isCurrent ? 2 : 1,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(SmartSpendSpacing.md),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: colors.accent.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(
                              SmartSpendRadii.md,
                            ),
                          ),
                          child: Icon(icon, color: colors.accent),
                        ),
                        const SizedBox(width: SmartSpendSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      name,
                                      style: textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  if (isCurrent)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: colors.accent.withValues(
                                          alpha: 0.15,
                                        ),
                                        borderRadius: BorderRadius.circular(
                                          SmartSpendRadii.sm,
                                        ),
                                      ),
                                      child: Text(
                                        l10n.sessionsCurrentDevice,
                                        style: textTheme.labelSmall?.copyWith(
                                          color: colors.accent,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: SmartSpendSpacing.xs),
                              if (s.ipAddress != null)
                                Text(
                                  'IP: ${s.ipAddress}',
                                  style: textTheme.bodySmall?.copyWith(
                                    color: colors.mutedForeground,
                                  ),
                                ),
                              if (s.createdAt != null)
                                Text(
                                  AppLocalizations.of(context).appActiveSince(
                                    DateWords.of(context).day(
                                      s.createdAt!.toLocal(),
                                      now: DateTime.now(),
                                    ),
                                  ),
                                  style: textTheme.bodySmall?.copyWith(
                                    color: colors.mutedForeground,
                                  ),
                                ),
                              const SizedBox(height: SmartSpendSpacing.sm),
                              Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: TextButton.icon(
                                  style: TextButton.styleFrom(
                                    foregroundColor: colors.danger,
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  icon: const Icon(
                                    Icons.logout_rounded,
                                    size: 16,
                                  ),
                                  label: Text(l10n.sessionsRevoke),
                                  onPressed: () => _revoke(context, ref, s),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
