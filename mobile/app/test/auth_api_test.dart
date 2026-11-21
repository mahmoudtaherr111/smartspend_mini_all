import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/auth/auth_api.dart';

import 'support/test_app.dart';

/// Answers recorded from the procedures in `api/local-auth-router.ts` and `api/auth-router.ts`. A change to their
/// shape on the server has to show up here.
void main() {
  late FakeApi server;
  late AuthApi api;

  setUp(() {
    server = FakeApi();
    api = AuthApi(
      TrpcClient(
        baseUri: Uri.parse('http://localhost:3000'),
        httpClient: server.client,
      ),
    );
  });

  test('localAuth.login', () async {
    server.answer(
      'localAuth.login',
      (_) => {
        'success': true,
        'token': 'eyJhbGciOiJIUzI1NiJ9.session',
        'user': {
          'id': 42,
          'name': 'منى',
          'phone': '01012345678',
          'role': 'user',
          'plan': 'free',
        },
      },
    );

    final answer = await api.signInWithPhone(
      phone: '01012345678',
      password: 'secret-pass',
    );

    expect(answer.token, 'eyJhbGciOiJIUzI1NiJ9.session');
    expect(answer.user.id, 42);
    expect(answer.user.kind, AccountKind.phone);
    expect(answer.user.phone, '01012345678');
    expect(answer.user.email, isNull);
  });

  test('auth.signInWithGoogle', () async {
    server.answer(
      'auth.signInWithGoogle',
      (_) => {
        'success': true,
        'token': 'eyJhbGciOiJIUzI1NiJ9.google',
        'user': {
          'id': 7,
          'name': 'Sara Ali',
          'email': 'sara@example.com',
          'avatar': 'https://lh3.googleusercontent.com/a/photo',
          'role': 'user',
          'plan': 'pro',
        },
      },
    );

    final answer = await api.signInWithGoogle(
      idToken: 'id-token',
      nonce: 'the-sign-in-nonce',
    );

    expect(server.lastInput('auth.signInWithGoogle'), {
      'idToken': 'id-token',
      'nonce': 'the-sign-in-nonce',
    });
    expect(answer.user.kind, AccountKind.google);
    expect(answer.user.avatarUrl, 'https://lh3.googleusercontent.com/a/photo');
    expect(answer.user.plan, 'pro');
  });

  test('localAuth.generateVerificationCode', () async {
    server.answer(
      'localAuth.generateVerificationCode',
      (_) => {
        'success': true,
        'ticket': '12.4f2a',
        'expiresInSeconds': 600,
        'resendInSeconds': 60,
      },
    );

    final challenge = await api.startPhoneChallenge(phone: '01012345678');

    expect(challenge.ticket, '12.4f2a');
    expect(challenge.expiresIn, const Duration(minutes: 10));
    expect(challenge.resendIn, const Duration(minutes: 1));
    expect(server.lastInput('localAuth.generateVerificationCode'), {
      'phone': '01012345678',
    });
  });

  test('localAuth.confirmVerificationCode', () async {
    server.answer(
      'localAuth.confirmVerificationCode',
      (_) => {'verified': true},
    );

    await api.confirmPhoneCode(ticket: '12.4f2a', code: '482913');

    expect(server.lastInput('localAuth.confirmVerificationCode'), {
      'verificationTicket': '12.4f2a',
      'code': '482913',
    });
  });

  test('localAuth.getVerificationSettings', () async {
    server.answer(
      'localAuth.getVerificationSettings',
      (_) => {'enabled': true},
    );
    expect(await api.phoneVerificationRequired(), isTrue);

    server.answer(
      'localAuth.getVerificationSettings',
      (_) => {'enabled': false},
    );
    expect(await api.phoneVerificationRequired(), isFalse);
  });

  test('auth.me and localAuth.me: whichever knows the token answers', () async {
    expect(await api.me(), isNull);

    server.answer('localAuth.me', (_) => phoneUser());
    final phone = await api.me();
    expect(phone?.kind, AccountKind.phone);
    expect(phone?.name, 'منى');

    server.answer('auth.me', (_) => googleUser());
    server.answer('localAuth.me', (_) => null);
    final google = await api.me();
    expect(google?.kind, AccountKind.google);
    expect(google?.email, 'sara@example.com');
  });

  test('an answer without a token is refused, not trusted', () async {
    server.answer('localAuth.login', (_) => {'success': true});

    await expectLater(
      api.signInWithPhone(phone: '01012345678', password: 'x'),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'MALFORMED_RESPONSE'),
      ),
    );
  });

  test('phone numbers are written the way the server keeps them', () {
    expect(normalizePhoneNumber('01012345678'), '01012345678');
    expect(normalizePhoneNumber('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
    expect(normalizePhoneNumber('+20 101 234 5678'), '01012345678');
    expect(normalizePhoneNumber('201012345678'), '01012345678');
    expect(normalizePhoneNumber(''), '');
  });
}
