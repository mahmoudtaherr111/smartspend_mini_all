import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

final class InAppNotificationItem {
  const InAppNotificationItem({
    required this.id,
    required this.title,
    required this.body,
    this.actionUrl,
    this.isRead = false,
    required this.createdAt,
  });

  factory InAppNotificationItem.fromJson(Map<String, Object?> json) {
    return InAppNotificationItem(
      id: json['id'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      actionUrl: json['actionUrl'] as String?,
      isRead: json['isRead'] as bool? ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  final int id;
  final String title;
  final String body;
  final String? actionUrl;
  final bool isRead;
  final DateTime createdAt;

  InAppNotificationItem copyWith({bool? isRead}) {
    return InAppNotificationItem(
      id: id,
      title: title,
      body: body,
      actionUrl: actionUrl,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }
}

final class NotificationsRepository {
  const NotificationsRepository(this._client);

  final TrpcClient _client;

  Future<List<InAppNotificationItem>> list() async {
    final data = await _client.query(Procedures.profile.getInAppNotifications);
    if (data is List<Object?>) {
      return [
        for (final item in data)
          if (item is Map<String, Object?>) InAppNotificationItem.fromJson(item),
      ];
    }
    return const [];
  }

  Future<void> markRead(int id) async {
    await _client.mutate(
      Procedures.profile.markInAppNotificationRead,
      input: {'id': id},
    );
  }

  Future<void> markAllRead() async {
    await _client.mutate(Procedures.profile.markAllInAppNotificationsRead);
  }
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.watch(trpcClientProvider));
});

final inAppNotificationsProvider = FutureProvider.autoDispose<List<InAppNotificationItem>>((ref) async {
  return ref.watch(notificationsRepositoryProvider).list();
});

final unreadNotificationsCountProvider = Provider.autoDispose<int>((ref) {
  final list = ref.watch(inAppNotificationsProvider).value ?? const [];
  return list.where((item) => !item.isRead).length;
});
