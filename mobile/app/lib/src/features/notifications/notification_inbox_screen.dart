import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/cairo_time.dart';
import '../../core/deep_links.dart';
import '../../l10n/app_localizations.dart';
import 'notification_providers.dart';

/// Notification Inbox Screen with read/unread filtering, date grouping, and deep link navigation (NOT-01, FND-10).
class NotificationInboxScreen extends ConsumerStatefulWidget {
  const NotificationInboxScreen({super.key});

  static const path = '/notifications';

  @override
  ConsumerState<NotificationInboxScreen> createState() =>
      _NotificationInboxScreenState();
}

class _NotificationInboxScreenState
    extends ConsumerState<NotificationInboxScreen> {
  bool _showOnlyUnread = false;

  String _dateGroupKey(DateTime dt, AppLocalizations l10n) {
    final now = cairoNow();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(target).inDays;

    if (diff == 0) return l10n.notificationsToday;
    if (diff == 1) return l10n.notificationsYesterday;
    if (diff <= 7) return l10n.notificationsThisWeek;
    return l10n.notificationsOlder;
  }

  Future<void> _handleTap(InAppNotificationItem item) async {
    if (!item.isRead) {
      await ref.read(notificationsRepositoryProvider).markRead(item.id);
      ref.invalidate(inAppNotificationsProvider);
    }

    final targetRoute = resolveAppRoute(item.actionUrl);
    if (!mounted || targetRoute == null) return;

    try {
      unawaited(context.push(targetRoute));
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    await ref.read(notificationsRepositoryProvider).markAllRead();
    ref.invalidate(inAppNotificationsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final notifsAsync = ref.watch(inAppNotificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.notificationsTitle),
        actions: [
          IconButton(
            tooltip: l10n.notificationsMarkAllRead,
            icon: const Icon(Icons.done_all_rounded),
            onPressed: _markAllRead,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.screen,
              vertical: SmartSpendSpacing.sm,
            ),
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(l10n.notificationsFilterAll),
                  selected: !_showOnlyUnread,
                  onSelected: (val) => setState(() => _showOnlyUnread = !val),
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                ChoiceChip(
                  label: Text(l10n.notificationsFilterUnread),
                  selected: _showOnlyUnread,
                  onSelected: (val) => setState(() => _showOnlyUnread = val),
                ),
              ],
            ),
          ),
          Expanded(
            child: notifsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, stack) => Center(
                child: ErrorState(
                  message: l10n.genericActionFailed,
                  retryLabel: l10n.retry,
                  onRetry: () => ref.invalidate(inAppNotificationsProvider),
                ),
              ),
              data: (items) {
                final filtered = _showOnlyUnread
                    ? items.where((item) => !item.isRead).toList()
                    : items;

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.notifications_none_rounded,
                          size: 64,
                          color: colors.mutedForeground,
                        ),
                        const SizedBox(height: SmartSpendSpacing.md),
                        Text(
                          l10n.notificationsEmpty,
                          style: textTheme.bodyLarge?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                // Group by date
                final groups = <String, List<InAppNotificationItem>>{};
                for (final item in filtered) {
                  final group = _dateGroupKey(item.createdAt, l10n);
                  groups.putIfAbsent(group, () => []).add(item);
                }

                return RefreshIndicator(
                  onRefresh: () =>
                      ref.refresh(inAppNotificationsProvider.future),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                    itemCount: groups.length,
                    itemBuilder: (ctx, index) {
                      final groupTitle = groups.keys.elementAt(index);
                      final groupItems = groups[groupTitle]!;

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              vertical: SmartSpendSpacing.sm,
                            ),
                            child: Text(
                              groupTitle,
                              style: textTheme.labelLarge?.copyWith(
                                color: colors.accent,
                              ),
                            ),
                          ),
                          Card(
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(
                                SmartSpendRadii.md,
                              ),
                              side: BorderSide(color: colors.border),
                            ),
                            child: ListView.separated(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              itemCount: groupItems.length,
                              separatorBuilder: (ctx, i) =>
                                  const Divider(height: 1),
                              itemBuilder: (ctx, i) {
                                final item = groupItems[i];
                                final targetRoute = resolveAppRoute(
                                  item.actionUrl,
                                );
                                return ListTile(
                                  onTap: () => _handleTap(item),
                                  leading: Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: item.isRead
                                          ? Colors.transparent
                                          : colors.accent,
                                    ),
                                  ),
                                  title: Text(
                                    item.title,
                                    style: item.isRead
                                        ? textTheme.bodyMedium
                                        : textTheme.titleSmall,
                                  ),
                                  subtitle: Padding(
                                    padding: const EdgeInsets.only(
                                      top: SmartSpendSpacing.xs,
                                    ),
                                    child: Text(
                                      item.body,
                                      style: textTheme.bodySmall?.copyWith(
                                        color: colors.mutedForeground,
                                      ),
                                    ),
                                  ),
                                  trailing: targetRoute != null
                                      ? const Icon(
                                          Icons.chevron_right,
                                          size: 20,
                                        )
                                      : null,
                                );
                              },
                            ),
                          ),
                          const SizedBox(height: SmartSpendSpacing.md),
                        ],
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
