import 'dart:async';
import 'dart:convert';

import 'package:bank_capture/bank_capture.dart';
import 'package:crypto/crypto.dart';
import 'package:device_lock/device_lock.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/preferences.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/core/session_store.dart';
import 'package:smartspend_app/src/features/auth/google_identity.dart';
import 'package:smartspend_app/src/features/auth/human_check.dart';
import 'package:smartspend_app/src/features/auth/register_screen.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/ledger/offline/outbox.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/lock/lock_store.dart';

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
      'ai.getUserLimits',
      (_) => {
        'offline': {'limit': 3},
      },
    );
    answer(
      'expense.getMonthSummary',
      (_) => {'totalIncome': 0, 'totalExpense': 0, 'count': 0},
    );
  }

  final _answers = <String, Object? Function(Object? input)>{};

  /// Every call, in order, as `<path>` with the Bearer token it carried (or `-`).
  final calls = <({String path, String? token, Object? input})>[];

  /// Whether the phone has lost the internet: every call then fails before reaching the server.
  bool offline = false;

  void answer(String path, Object? Function(Object? input) handler) =>
      _answers[path] = handler;

  final _held = <String, Completer<void>>{};

  /// Holds the next call to [path] until the returned completer completes, as a slow network would.
  Completer<void> hold(String path) => _held[path] = Completer<void>();

  List<String> get paths => [for (final call in calls) call.path];

  Object? lastInput(String path) =>
      calls.lastWhere((call) => call.path == path).input;

  late final http.Client client = MockClient((request) async {
    if (offline) throw http.ClientException('No internet', request.url);
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
    final held = _held.remove(path);
    if (held != null) await held.future;
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
  String nonce = 'nonce-made-for-this-sign-in-0123456789abcdef';
  Object? failure;
  int requests = 0;
  int signOuts = 0;

  @override
  Future<GoogleCredential?> requestCredential() async {
    requests++;
    final failure = this.failure;
    if (failure != null) throw failure;
    final idToken = this.idToken;
    return idToken == null
        ? null
        : GoogleCredential(idToken: idToken, nonce: nonce);
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

/// The native capture, in Dart: what it was told and what it answers.
final class FakeBankCapture implements BankCapture {
  CaptureAccess access = CaptureAccess.notGranted;
  CaptureSetup? setup;
  int disconnects = 0;
  int settingsOpened = 0;
  int waiting = 0;
  String? language;

  @override
  Future<CaptureStatus> status() async => CaptureStatus(
    method: CaptureMethod.notificationListener,
    access: access,
    connected: setup != null,
    notificationsAllowed: true,
    waiting: waiting,
  );

  @override
  Future<void> openAccessSettings() async => settingsOpened++;

  @override
  Future<void> connect(CaptureSetup setup) async => this.setup = setup;

  @override
  Future<void> disconnect() async {
    disconnects++;
    setup = null;
  }

  @override
  Future<void> setLanguage(String language) async => this.language = language;

  @override
  Future<void> sendNow() async {}

  @override
  Future<bool> requestNotificationPermission() async => true;
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

  /// The outbox and the offline copy of the ledger.
  final ledgerStore = MemoryLedgerStore();

  /// The app lock as kept on the phone, and the phone's side of it.
  final lockStore = MemoryLockStore();
  final deviceLock = FakeDeviceLock();

  /// The native bank message capture.
  final bankCapture = FakeBankCapture();

  /// The phone's own choices, such as the interface language, as bootstrap() reads them before the first frame.
  final preferences = MemoryPreferencesStore();

  /// Whether the phone has a network; send false to cut it, true to bring it back.
  final connection = StreamController<bool>.broadcast();
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
          bankCaptureProvider.overrideWithValue(bankCapture),
          ledgerStoreProvider.overrideWithValue(ledgerStore),
          connectivityProvider.overrideWith((ref) => connection.stream),
          outboxRetryDelaysProvider.overrideWithValue(const []),
          lockStoreProvider.overrideWithValue(lockStore),
          deviceLockProvider.overrideWithValue(deviceLock),
          preferencesStoreProvider.overrideWithValue(preferences),
          initialPreferencesProvider.overrideWithValue(preferences.preferences),
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

/// The phone's side of the app lock, in Dart: a PIN key that tags like the Keystore's HMAC key, and biometrics that
/// answer what the test asks.
class FakeDeviceLock implements DeviceLock {
  FakeDeviceLock({
    this.kind = BiometricKind.fingerprint,
    this.availability = BiometricAvailability.ready,
  });

  BiometricKind kind;
  BiometricAvailability availability;

  /// What the next biometric prompts answer, in order; success when empty.
  final outcomes = <BiometricOutcome>[];

  /// Prompts shown so far.
  int prompts = 0;
  bool cover = false;
  List<int>? _pinKey;
  Uint8List? _secret;

  /// Someone enrolled another finger: the key no longer opens.
  void changeEnrolment() => _secret = null;

  bool get hasPinKey => _pinKey != null;

  @override
  Future<LockCapabilities> capabilities() async =>
      LockCapabilities(kind: kind, availability: availability);

  BiometricOutcome _next() {
    prompts++;
    return outcomes.isEmpty ? BiometricOutcome.success : outcomes.removeAt(0);
  }

  @override
  Future<BiometricResult> enrollBiometrics(BiometricPromptText text) async {
    final outcome = _next();
    if (outcome != BiometricOutcome.success) {
      return BiometricResult(outcome: outcome);
    }
    _secret = Uint8List.fromList(List.generate(32, (i) => i * 7 % 256));
    return BiometricResult(
      outcome: outcome,
      secret: _secret,
      sealed: Uint8List.fromList([9, ..._secret!]),
    );
  }

  @override
  Future<BiometricResult> unlockWithBiometrics(
    BiometricPromptText text,
    Uint8List? sealed,
  ) async {
    final outcome = _next();
    if (outcome != BiometricOutcome.success) {
      return BiometricResult(outcome: outcome);
    }
    if (_secret == null) {
      return BiometricResult(outcome: BiometricOutcome.changed);
    }
    return BiometricResult(outcome: outcome, secret: _secret);
  }

  @override
  Future<void> forgetBiometrics() async => _secret = null;

  @override
  Future<Uint8List> pinTag(Uint8List input, {required bool create}) async {
    if (_pinKey == null) {
      if (!create) {
        throw PlatformException(code: 'no-pin-key', message: 'gone');
      }
      _pinKey = List.generate(32, (i) => (i * 31 + 5) % 256);
    }
    return Uint8List.fromList(Hmac(sha256, _pinKey!).convert(input).bytes);
  }

  @override
  Future<void> forgetPinKey() async => _pinKey = null;

  @override
  Future<void> setSwitcherCover(bool enabled) async => cover = enabled;
}
