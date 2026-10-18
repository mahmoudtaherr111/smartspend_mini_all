import 'package:smartspend_api/smartspend_api.dart';

/// The number as the server keeps it (`cleanPhoneNumber` in `api/local-auth-utils.ts`): Arabic digits made Latin,
/// spaces removed and the country code dropped, so `+20 100 123 4567` becomes `01001234567`.
String normalizePhoneNumber(String input) {
  final latin = input.replaceAllMapped(
    RegExp('[٠-٩]'),
    (match) => String.fromCharCode(match[0]!.codeUnitAt(0) - 0x0660 + 0x30),
  );
  return latin.replaceAll(RegExp(r'\s'), '').replaceFirst(RegExp(r'^\+?2'), '');
}

/// Which table the account lives in on the server: `users` for Google, `local_users` for phone numbers (golden
/// rule 1 in the root `AGENTS.md`).
enum AccountKind { google, phone }

/// The signed-in person, as `auth.me`, `localAuth.me` or a sign-in answer describe them.
final class AppUser {
  const AppUser({
    required this.id,
    required this.kind,
    required this.name,
    this.email,
    this.phone,
    this.avatarUrl,
    this.role = 'user',
    this.plan = 'free',
  });

  /// Reads a user object of the API; [kind] says which table it came from.
  factory AppUser.fromJson(Map<String, Object?> json, AccountKind kind) {
    String? text(String key) => switch (json[key]) {
      final String value when value.isNotEmpty => value,
      _ => null,
    };
    final id = json['id'];
    if (id is! int) {
      throw const FormatException('A user answer without a numeric id');
    }
    return AppUser(
      id: id,
      kind: kind,
      name: text('name') ?? '',
      email: text('email'),
      phone: text('phone'),
      avatarUrl: text('avatar'),
      role: text('role') ?? 'user',
      plan: text('plan') ?? 'free',
    );
  }

  final int id;
  final AccountKind kind;
  final String name;
  final String? email;
  final String? phone;
  final String? avatarUrl;

  /// Admin or moderator access; not the subscription (golden rule 2).
  final String role;

  /// `free`, `pro` or `ultra`.
  final String plan;
}

/// A session the server opened: the token to keep and who it belongs to.
final class SignedInAnswer {
  const SignedInAnswer({required this.token, required this.user});

  final String token;
  final AppUser user;
}

/// A WhatsApp phone challenge (`localAuth.generateVerificationCode`): the code the user sends to the bot, the
/// ticket that later proves the number to `localAuth.register`, and the watch token that follows it.
final class PhoneChallenge {
  const PhoneChallenge({
    required this.code,
    required this.ticket,
    required this.watch,
    required this.expiresIn,
  });

  final String code;
  final String ticket;
  final String watch;
  final Duration expiresIn;
}

/// The sign-in procedures of `api/local-auth-router.ts` and `api/auth-router.ts`, with their answers read into
/// Dart types. Each answer shape is pinned by a test against a recorded answer (`test/auth_api_test.dart`).
final class AuthApi {
  const AuthApi(this._client);

  final TrpcClient _client;

  Future<SignedInAnswer> signInWithPhone({
    required String phone,
    required String password,
  }) async {
    final data = await _client.mutate(
      Procedures.localAuth.login,
      input: {'phone': phone, 'password': password},
    );
    return _signedIn(data, AccountKind.phone);
  }

  /// Creates a phone account. With WhatsApp verification on, [verificationTicket] must be the ticket of a
  /// challenge the bot verified for this very number.
  Future<SignedInAnswer> register({
    required String name,
    required String phone,
    required String password,
    String? referralCode,
    String? verificationTicket,
  }) async {
    final data = await _client.mutate(
      Procedures.localAuth.register,
      input: {
        'name': name,
        'phone': phone,
        'password': password,
        if (referralCode != null && referralCode.isNotEmpty)
          'referralCode': referralCode,
        'verificationTicket': ?verificationTicket,
      },
    );
    return _signedIn(data, AccountKind.phone);
  }

  /// Whether a new phone account must prove its number over WhatsApp first (`whatsapp_otp_enabled`).
  Future<bool> phoneVerificationRequired() async {
    final data = await _client.query(
      Procedures.localAuth.getVerificationSettings,
    );
    return data is Map<String, Object?> && data['enabled'] == true;
  }

  /// The WhatsApp number of the bot the code is sent to, digits only with the country code, or null while the bot
  /// is not connected (the server then answers a placeholder).
  Future<String?> verificationBotNumber() async {
    final data = await _client.query(Procedures.localAuth.getBotPhoneNumber);
    if (data is! String) return null;
    final digits = data.replaceAll(RegExp(r'\D'), '');
    return digits.isEmpty || digits == _botNumberPlaceholder ? null : digits;
  }

  Future<PhoneChallenge> startPhoneChallenge({
    required String phone,
    String? turnstileToken,
  }) async {
    final data = await _client.mutate(
      Procedures.localAuth.generateVerificationCode,
      input: {'phone': phone, 'turnstileToken': ?turnstileToken},
    );
    if (data case {
      'code': final String code,
      'ticket': final String ticket,
      'watch': final String watch,
      'expiresInSeconds': final num seconds,
    }) {
      return PhoneChallenge(
        code: code,
        ticket: ticket,
        watch: watch,
        expiresIn: Duration(seconds: seconds.round()),
      );
    }
    throw _malformed(Procedures.localAuth.generateVerificationCode);
  }

  /// Exchanges the ID token of the phone's Google sign-in for a session (`auth.signInWithGoogle`).
  Future<SignedInAnswer> signInWithGoogle(String idToken) async {
    final data = await _client.mutate(
      Procedures.auth.signInWithGoogle,
      input: {'idToken': idToken},
    );
    return _signedIn(data, AccountKind.google);
  }

  /// Who the stored token belongs to, or null when the server resolves it to nobody. Both kinds are asked, as the
  /// web app does: each answers null for the other kind's session.
  Future<AppUser?> me() async {
    final answers = await Future.wait([
      _client.query(Procedures.auth.me),
      _client.query(Procedures.localAuth.me),
    ]);
    if (answers[0] case final Map<String, Object?> google) {
      return AppUser.fromJson(google, AccountKind.google);
    }
    if (answers[1] case final Map<String, Object?> phone) {
      return AppUser.fromJson(phone, AccountKind.phone);
    }
    return null;
  }

  /// Ends this phone's session on the server; the other devices of the account stay signed in.
  ///
  /// `localAuth.logout` revokes whichever session the Bearer token names, Google or phone, and is public, so a token
  /// the server already dropped does not fail the sign-out.
  Future<void> signOut() async {
    await _client.mutate(Procedures.localAuth.logout);
  }

  /// What `localAuth.getBotPhoneNumber` answers while the bot has no number.
  static const _botNumberPlaceholder = '201000000000';

  static SignedInAnswer _signedIn(Object? data, AccountKind kind) {
    if (data
        case {
          'token': final String token,
          'user': final Map<String, Object?> user,
        }
        when token.isNotEmpty) {
      return SignedInAnswer(token: token, user: AppUser.fromJson(user, kind));
    }
    throw _malformed(
      kind == AccountKind.google
          ? Procedures.auth.signInWithGoogle
          : Procedures.localAuth.login,
    );
  }

  static ApiException _malformed(ApiProcedure procedure) => ApiException(
    code: 'MALFORMED_RESPONSE',
    httpStatus: 200,
    message: friendlyHttpMessage(500),
    path: procedure.path,
  );
}
