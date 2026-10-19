import 'dart:async';
import 'dart:convert';

import 'package:bank_capture/bank_capture.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/core/session_store.dart';
import 'package:smartspend_app/src/features/auth/google_identity.dart';
import 'package:smartspend_app/src/features/auth/human_check.dart';
import 'package:smartspend_app/src/features/auth/register_screen.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';

/// A tRPC error the fake API answers with.
final class TrpcFailure implements Exception {
  const TrpcFailure(
    this.code,
    this.status,
    this.message, {
    this.retryAfterSeconds,
  });

  final String code;
  final int status;
  final String message;
  final int? retryAfterSeconds;
}

/// The API as the app sees it: answers each procedure by its path the way `api/` does, and records what was
/// asked. Unknown procedures answer 404.
final class FakeApi {
  FakeApi() {
    answer('auth.me', (_) => null);
    answer('localAuth.me', (_) => null);
    answer('localAuth.getVerificationSettings', (_) => {'enabled': false});
    answer('localAuth.getBotPhoneNumber', (_) => '201555000111');
    answer('localAuth.logout', (_) => {'success': true});
    // An account with nothing recorded yet: the record tab asks these as it opens.
    answer(
      'profile.getSmartProfile',
      (_) => {'financialInfo': <String, Object?>{}},
    );
    answer('expense.list', (_) => {'items': <Object?>[], 'total': 0});
    answer(
      'expense.getMonthSummary',
      (_) => {'totalIncome': 0, 'totalExpense': 0, 'count': 0},
    );
  }

  final _answers = <String, Object? Function(Object? input)>{};

  /// Every call, in order, as `<path>` with the Bearer token it carried (or `-`).
  final calls = <({String path, String? token, Object? input})>[];

  void answer(String path, Object? Function(Object? input) handler) =>
      _answers[path] = handler;

  List<String> get paths => [for (final call in calls) call.path];

  Object? lastInput(String path) =>
      calls.lastWhere((call) => call.path == path).input;

  late final http.Client client = MockClient((request) async {
    final path = request.url.path.replaceFirst('/api/trpc/', '');
    final rawInput = request.method == 'GET'
        ? request.url.queryParameters['input']
        : (request.body.isEmpty ? null : request.body);
    final input = rawInput == null ? null : jsonDecode(rawInput);
    final authorization = request.headers['authorization'];
    calls.add((
      path: path,
      token: authorization?.replaceFirst('Bearer ', ''),
      input: input,
    ));
    final handler = _answers[path];
    if (handler == null) {
      return _json({
        'error': {
          'message': 'No procedure $path',
          'code': -32004,
          'data': {'code': 'NOT_FOUND', 'httpStatus': 404, 'path': path},
        },
      }, 404);
    }
    try {
      return _json({
        'result': {'data': handler(input)},
      }, 200);
    } on TrpcFailure catch (failure) {
      return _json({
        'error': {
          'message': failure.message,
          'code': -32000,
          'data': {
            'code': failure.code,
            'httpStatus': failure.status,
            'path': path,
            'retryAfterSeconds': ?failure.retryAfterSeconds,
          },
        },
      }, failure.status);
    }
  });

  static http.Response _json(Object body, int status) => http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}

/// The Keychain or Keystore, in memory.
final class MemorySessionStore extends SessionStore {
  MemorySessionStore([this.token]);

  String? token;

  @override
  Future<String?> readToken() async => token;

  @override
  Future<void> writeToken(String token) async => this.token = token;

  @override
  Future<void> clear() async => token = null;
}

final class FakeGoogleIdentity implements GoogleIdentity {
  FakeGoogleIdentity({this.isAvailable = true});

  @override
  final bool isAvailable;

  /// What the account picker returns; null is the person closing it.
  String? idToken = 'google-id-token';
  Object? failure;
  int requests = 0;
  int signOuts = 0;

  @override
  Future<String?> requestIdToken() async {
    requests++;
    final failure = this.failure;
    if (failure != null) throw failure;
    return idToken;
  }

  @override
  Future<void> signOut() async => signOuts++;
}

/// `/api/sse/otp`, scripted: every connection waits until the test sends an outcome or the app cancels it.
final class FakeChallengeEvents {
  final watches = <String>[];
  Completer<PhoneChallengeOutcome?>? _open;

  Future<PhoneChallengeOutcome?> next(String watch, {Future<void>? cancel}) {
    watches.add(watch);
    final open = _open = Completer<PhoneChallengeOutcome?>();
    unawaited(
      cancel?.then((_) {
        if (!open.isCompleted) open.complete(null);
      }),
    );
    return open.future;
  }

  bool get connected => _open != null && !_open!.isCompleted;

  void send(PhoneChallengeOutcome outcome) => _open!.complete(outcome);
}

final class _FakeBankCapture implements BankCapture {
  @override
  Future<CaptureStatus> status() async => CaptureStatus(
    method: CaptureMethod.notificationListener,
    access: CaptureAccess.notGranted,
  );

  @override
  Future<void> openAccessSettings() async {}
}

/// A phone user as `localAuth.me` answers it.
Map<String, Object?> phoneUser({String name = 'منى'}) => {
  'id': 42,
  'name': name,
  'phone': '01012345678',
  'email': null,
  'avatar': null,
  'role': 'user',
  'plan': 'free',
  'createdAt': '2026-10-01T09:00:00.000Z',
};

/// A Google user as `auth.me` answers it.
Map<String, Object?> googleUser() => {
  'id': 7,
  'name': 'Sara Ali',
  'email': 'sara@example.com',
  'avatar': 'https://lh3.googleusercontent.com/a/photo',
  'role': 'user',
  'plan': 'pro',
  'createdAt': '2026-10-01T09:00:00.000Z',
  'unionId': '109876543210',
};

/// The app as it starts on a phone, with every outside dependency replaced.
final class TestApp {
  TestApp({
    String? token,
    FakeApi? api,
    FakeGoogleIdentity? google,
    this.humanCheck,
  }) : store = MemorySessionStore(token),
       api = api ?? FakeApi(),
       google = google ?? FakeGoogleIdentity(isAvailable: false);

  final MemorySessionStore store;
  final FakeApi api;
  final FakeGoogleIdentity google;
  final HumanCheckBuilder? humanCheck;
  final challenges = FakeChallengeEvents();
  final openedLinks = <Uri>[];
  bool linksOpen = true;

  late ProviderContainer container;

  SessionState get session => container.read(sessionProvider);

  Future<void> pump(WidgetTester tester, {bool settle = true}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(
            AppConfig(
              environment: 'development',
              apiBaseUri: Uri.parse('http://localhost:3000'),
              userAgent: 'SmartSpend-Mobile (test)',
            ),
          ),
          sessionStoreProvider.overrideWithValue(store),
          httpClientProvider.overrideWithValue(api.client),
          googleIdentityProvider.overrideWithValue(google),
          humanCheckProvider.overrideWithValue(humanCheck),
          nextChallengeOutcomeProvider.overrideWithValue(challenges.next),
          externalLinkOpenerProvider.overrideWithValue((uri) async {
            openedLinks.add(uri);
            return linksOpen;
          }),
          bankCaptureProvider.overrideWithValue(_FakeBankCapture()),
        ],
        child: const SmartSpendApp(),
      ),
    );
    container = ProviderScope.containerOf(
      tester.element(find.byType(SmartSpendApp)),
    );
    if (settle) await tester.pumpAndSettle();
  }
}
