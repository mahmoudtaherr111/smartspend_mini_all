import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

final class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.subject,
    required this.message,
    required this.status,
    required this.createdAt,
  });

  factory SupportTicket.fromJson(Map<String, Object?> json) {
    return SupportTicket(
      id: json['id'] as int? ?? 0,
      subject: json['subject'] as String? ?? '',
      message: json['message'] as String? ?? '',
      status: json['status'] as String? ?? 'open',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  final int id;
  final String subject;
  final String message;
  final String status;
  final DateTime createdAt;
}

final class SupportRepository {
  const SupportRepository(this._client);

  final TrpcClient _client;

  Future<List<SupportTicket>> listMine() async {
    final data = await _client.query(Procedures.support.listMine);
    if (data is List<Object?>) {
      return [
        for (final item in data)
          if (item is Map<String, Object?>) SupportTicket.fromJson(item),
      ];
    }
    return const [];
  }

  Future<int> createTicket({
    required String subject,
    required String message,
  }) async {
    final data = await _client.mutate(
      Procedures.support.create,
      input: {
        'subject': subject,
        'message': message,
      },
    );
    if (data is Map<String, Object?> && data['ticketId'] is int) {
      return data['ticketId']! as int;
    }
    return 0;
  }
}

final supportRepositoryProvider = Provider<SupportRepository>((ref) {
  return SupportRepository(ref.watch(trpcClientProvider));
});

final mySupportTicketsProvider = FutureProvider.autoDispose<List<SupportTicket>>((ref) async {
  return ref.watch(supportRepositoryProvider).listMine();
});
