import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

/// Active device session metadata returned by the server.
final class UserSession {
  const UserSession({
    required this.id,
    required this.userId,
    required this.userType,
    this.ipAddress,
    this.userAgent,
    this.expiresAt,
    this.createdAt,
    this.isCurrent = false,
  });

  factory UserSession.fromJson(Map<String, Object?> json) {
    return UserSession(
      id: json['id'] as int? ?? 0,
      userId: json['userId'] as int? ?? 0,
      userType: json['userType'] as String? ?? 'local',
      ipAddress: json['ipAddress'] as String?,
      userAgent: json['userAgent'] as String?,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'].toString())
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      isCurrent: json['isCurrent'] as bool? ?? false,
    );
  }

  final int id;
  final int userId;
  final String userType;
  final String? ipAddress;
  final String? userAgent;
  final DateTime? expiresAt;
  final DateTime? createdAt;
  final bool isCurrent;
}

/// Profile information from the server (`api/profile-router.ts`).
final class UserProfile {
  const UserProfile({
    this.userId = 0,
    this.userType = 'local',
    this.monthlyIncome,
    this.financialGoal,
    this.salaryDay = 1,
    this.currency = 'EGP',
    this.decimalPlaces = 2,
    this.profileCompleted = false,
    this.rawPreferences = const {},
  });

  factory UserProfile.fromJson(Map<String, Object?> json) {
    final prefs = json['preferences'] is Map<String, Object?>
        ? json['preferences']! as Map<String, Object?>
        : const <String, Object?>{};

    return UserProfile(
      userId: json['userId'] as int? ?? 0,
      userType: json['userType'] as String? ?? 'local',
      monthlyIncome: json['monthlyIncome'] != null
          ? double.tryParse(json['monthlyIncome'].toString())
          : null,
      financialGoal: json['financialGoal'] as String?,
      salaryDay: prefs['salaryDay'] as int? ?? (json['salaryDay'] as int? ?? 1),
      currency:
          prefs['currency'] as String? ??
          (json['currency'] as String? ?? 'EGP'),
      decimalPlaces: prefs['decimalPlaces'] as int? ?? 2,
      profileCompleted: json['profileCompleted'] as bool? ?? false,
      rawPreferences: prefs,
    );
  }

  final int userId;
  final String userType;
  final double? monthlyIncome;
  final String? financialGoal;
  final int salaryDay;
  final String currency;
  final int decimalPlaces;
  final bool profileCompleted;
  final Map<String, Object?> rawPreferences;
}

final class AccountRepository {
  const AccountRepository(this._client);

  final TrpcClient _client;

  Future<UserProfile> getMyProfile() async {
    final data = await _client.query(Procedures.profile.getMyProfile);
    if (data is Map<String, Object?>) {
      return UserProfile.fromJson(data);
    }
    return const UserProfile();
  }

  Future<void> updateUserInfo({String? name, String? avatar}) async {
    await _client.mutate(
      Procedures.profile.updateUserInfo,
      input: {'name': ?name, 'avatar': ?avatar},
    );
  }

  Future<void> updateMoneyPreferences({
    int? salaryDay,
    String? currency,
    int? decimalPlaces,
  }) async {
    await _client.mutate(
      Procedures.profile.updateSmartProfile,
      input: {
        'preferences': {
          'salaryDay': ?salaryDay,
          'currency': ?currency,
          'decimalPlaces': ?decimalPlaces,
        },
      },
    );
  }

  Future<Map<String, Object?>> requestPhoneChange(String newPhone) async {
    final res = await _client.mutate(
      Procedures.profile.requestPhoneChange,
      input: {'newPhone': newPhone},
    );
    return res is Map<String, Object?> ? res : const {};
  }

  Future<Map<String, Object?>> confirmPhoneChange({
    required String code,
    required String verificationTicket,
  }) async {
    final res = await _client.mutate(
      Procedures.profile.confirmPhoneChange,
      input: {'code': code, 'verificationTicket': verificationTicket},
    );
    return res is Map<String, Object?> ? res : const {};
  }

  Future<List<UserSession>> listSessions() async {
    final data = await _client.query(Procedures.session.listMine);
    if (data is List<Object?>) {
      return [
        for (final item in data)
          if (item is Map<String, Object?>) UserSession.fromJson(item),
      ];
    }
    return const [];
  }

  Future<void> revokeSession(int sessionId) async {
    await _client.mutate(
      Procedures.session.revokeMine,
      input: {'sessionId': sessionId},
    );
  }

  Future<void> deleteMyAccount({
    required String confirmation,
    String? password,
  }) async {
    await _client.mutate(
      Procedures.profile.deleteMyAccount,
      input: {
        'confirmation': confirmation,
        if (password != null && password.isNotEmpty) 'password': password,
      },
    );
  }

  Future<Map<String, Object?>?> getNextOnboardingQuestion() async {
    final data = await _client.query(
      Procedures.profile.getNextOnboardingQuestion,
    );
    return data is Map<String, Object?> ? data : null;
  }

  Future<void> submitOnboardingAnswer({
    required String questionId,
    required Object? answer,
  }) async {
    await _client.mutate(
      Procedures.profile.submitOnboardingAnswer,
      input: {'questionId': questionId, 'answer': answer},
    );
  }

  Future<void> dismissOnboarding() async {
    await _client.mutate(Procedures.profile.dismissOnboarding);
  }
}

final accountRepositoryProvider = Provider<AccountRepository>((ref) {
  return AccountRepository(ref.watch(trpcClientProvider));
});

/// The next question that helps the assistant, or null when none is waiting.
final nextPersonalQuestionProvider =
    FutureProvider.autoDispose<Map<String, Object?>?>(
      (ref) => ref.watch(accountRepositoryProvider).getNextOnboardingQuestion(),
    );

final userProfileProvider = FutureProvider.autoDispose<UserProfile>((
  ref,
) async {
  return ref.watch(accountRepositoryProvider).getMyProfile();
});

final userSessionsProvider = FutureProvider.autoDispose<List<UserSession>>((
  ref,
) async {
  return ref.watch(accountRepositoryProvider).listSessions();
});
