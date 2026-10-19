import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:device_lock/device_lock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/lock/lock_store.dart';
import 'package:smartspend_app/src/features/lock/pin_rules.dart';

import 'support/test_app.dart';

const _pin = '482915';
const _lockTitle = 'اكتب الرمز السري';

final _prompt = BiometricPromptText(title: 't', reason: 'r', usePin: 'p');

/// A lock already on for the test account, made the way the app makes it.
Future<LockRecord> _lockWithPin(
  FakeDeviceLock device, {
  int failures = 0,
  DateTime? lastFailureAt,
  bool biometrics = false,
  Duration relockAfter = LockRecord.defaultRelockAfter,
  bool hideAmounts = false,
}) async {
  final salt = Uint8List.fromList(List.filled(16, 3));
  final tag = await device.pinTag(
    Uint8List.fromList([...salt, ...utf8.encode(_pin)]),
    create: true,
  );
  var record = LockRecord(
    accountKey: 'phone:42',
    pinSalt: salt,
    pinTag: tag,
    failures: failures,
    lastFailureAt: lastFailureAt,
    relockAfter: relockAfter,
    hideAmounts: hideAmounts,
  );
  if (biometrics) {
    final enrolled = await device.enrollBiometrics(_prompt);
    device.prompts = 0;
    record = record.withBiometrics(
      Uint8List.fromList(sha256.convert(enrolled.secret!).bytes),
      enrolled.sealed,
    );
  }
  return record;
}

/// The app signed in to the test account, with the lock as [record] on the phone.
Future<TestApp> _open(
  WidgetTester tester, {
  LockRecord? record,
  FakeApi? api,
  Future<LockRecord> Function(FakeDeviceLock device)? lock,
}) async {
  final fake = (api ?? FakeApi())..answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'session-token', api: fake);
  _phoneScreen(tester);
  if (record != null) app.lockStore.record = record;
  if (lock != null) app.lockStore.record = await lock(app.deviceLock);
  await app.pump(tester);
  return app;
}

/// A phone's screen, so the whole pad fits above the tab bar as it does on a phone.
void _phoneScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> _type(WidgetTester tester, String digits) async {
  for (final digit in digits.split('')) {
    await tester.tap(find.text(digit).last);
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

Future<void> _lifecycle(
  WidgetTester tester,
  List<AppLifecycleState> states,
) async {
  for (final state in states) {
    tester.binding.handleAppLifecycleStateChanged(state);
  }
  await tester.pumpAndSettle();
}

const _toBackground = [
  AppLifecycleState.inactive,
  AppLifecycleState.hidden,
  AppLifecycleState.paused,
];
const _toForeground = [
  AppLifecycleState.hidden,
  AppLifecycleState.inactive,
  AppLifecycleState.resumed,
];

void main() {
  group('PIN rules', () {
    test('refuse what anyone would try first', () {
      for (final pin in [
        '000000',
        '123456',
        '654321',
        '789012',
        '121212',
        '123123',
        '112233',
        '12345',
        '12a456',
      ]) {
        expect(PinRules.isGuessable(pin), isTrue, reason: pin);
      }
      expect(PinRules.isGuessable(_pin), isFalse);
    });

    test('wait longer after each wrong PIN from the fifth', () {
      expect(PinRules.waitAfter(4), Duration.zero);
      expect(PinRules.waitAfter(5), const Duration(seconds: 30));
      expect(PinRules.waitAfter(7), const Duration(minutes: 5));
      expect(PinRules.waitAfter(9), const Duration(hours: 1));
    });

    test('a clock set back does not shorten the wait', () {
      final failedAt = DateTime(2026, 10, 19, 12);
      expect(
        PinRules.waitLeft(
          failures: 5,
          lastFailureAt: failedAt,
          now: failedAt.add(const Duration(seconds: 20)),
        ),
        const Duration(seconds: 10),
      );
      expect(
        PinRules.waitLeft(
          failures: 5,
          lastFailureAt: failedAt,
          now: failedAt.subtract(const Duration(days: 1)),
        ),
        const Duration(seconds: 30),
      );
    });
  });

  group('turning the lock on', () {
    testWidgets(
      'a guessable PIN is refused, the PIN is typed twice, and only its tag is kept',
      (tester) async {
        final app = await _open(tester);

        await tester.tap(find.text('المزيد').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('الأمان والخصوصية'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('اقفل التطبيق'));
        await tester.pumpAndSettle();

        await _type(tester, '123456');
        expect(
          find.text('الرمز ده سهل يتخمّن. اختار رمز تاني.'),
          findsOneWidget,
        );

        await _type(tester, _pin);
        expect(find.text('اكتبه تاني للتأكيد'), findsOneWidget);
        await _type(tester, '482916');
        expect(
          find.text('الرمزين مش زي بعض. اختار الرمز من الأول.'),
          findsOneWidget,
        );

        await _type(tester, _pin);
        await _type(tester, _pin);
        expect(find.text('تفتح بالبصمة كمان؟'), findsOneWidget);
        await tester.tap(find.text('مش دلوقتي'));
        await tester.pumpAndSettle();

        expect(find.text('القفل اشتغل.'), findsOneWidget);
        expect(app.lockStore.record.enabled, isTrue);
        expect(
          jsonEncode(app.lockStore.record.toJson()),
          isNot(contains(_pin)),
        );
        // The app switcher no longer shows the app's content.
        expect(app.deviceLock.cover, isTrue);
      },
    );

    testWidgets(
      'biometrics offered after the PIN are turned on with one prompt',
      (tester) async {
        final app = await _open(tester);
        await app.container.read(appLockProvider.notifier).setPin(_pin);
        expect(
          await app.container
              .read(appLockProvider.notifier)
              .turnOnBiometrics(_prompt),
          BiometricOutcome.success,
        );

        expect(app.lockStore.record.biometrics, isTrue);
        expect(app.deviceLock.prompts, 1);
      },
    );
  });

  group('the lock screen', () {
    testWidgets(
      'a cold start opens locked, with nothing of the account drawn',
      (tester) async {
        await _open(tester, lock: _lockWithPin);

        expect(find.text(_lockTitle), findsOneWidget);
        expect(find.text('آخر العمليات'), findsNothing);

        await _type(tester, _pin);

        expect(find.text(_lockTitle), findsNothing);
        expect(find.text('آخر العمليات'), findsOneWidget);
      },
    );

    testWidgets('biometrics are offered at once and open the app', (
      tester,
    ) async {
      final app = await _open(
        tester,
        lock: (device) => _lockWithPin(device, biometrics: true),
      );

      expect(app.deviceLock.prompts, 1);
      expect(find.text(_lockTitle), findsNothing);
    });

    testWidgets(
      'a fingerprint added to the phone turns biometrics off; the PIN still opens',
      (tester) async {
        final app = await _open(
          tester,
          lock: (device) async {
            final record = await _lockWithPin(device, biometrics: true);
            device.changeEnrolment();
            return record;
          },
        );

        expect(
          find.textContaining('البصمات على الموبايل اتغيّرت'),
          findsOneWidget,
        );
        expect(app.lockStore.record.biometrics, isFalse);

        await _type(tester, _pin);
        expect(find.text(_lockTitle), findsNothing);
      },
    );

    testWidgets(
      'wrong PINs are counted across restarts, and the fifth blocks the pad',
      (tester) async {
        final app = await _open(tester, lock: _lockWithPin);

        for (var i = 0; i < 4; i++) {
          await _type(tester, '111222');
        }
        expect(find.text('الرمز غلط. جرّب تاني.'), findsOneWidget);
        await _type(tester, '111222');
        expect(find.text('جرّب تاني بعد 0:30.'), findsOneWidget);
        expect(app.lockStore.record.failures, 5);

        // Closing the app does not reset the count or the wait.
        final again = TestApp(token: 'session-token', api: app.api)
          ..lockStore.record = app.lockStore.record;
        // The same phone, so the same PIN key.
        await again.deviceLock.pinTag(Uint8List(0), create: true);
        await again.pump(tester);
        await _type(tester, _pin);
        expect(find.text(_lockTitle), findsOneWidget);

        await tester.pump(const Duration(seconds: 31));
        await tester.pumpAndSettle();
        await _type(tester, _pin);
        expect(find.text(_lockTitle), findsNothing);
        expect(again.lockStore.record.failures, 0);
      },
    );

    testWidgets('the tenth wrong PIN signs out and removes the lock', (
      tester,
    ) async {
      final app = await _open(
        tester,
        lock: (device) =>
            _lockWithPin(device, failures: 9, lastFailureAt: DateTime(2020)),
      );
      expect(find.text(_lockTitle), findsOneWidget);
      expect(find.textContaining('فاضل'), findsNothing);

      await _type(tester, '111222');

      expect(app.session, isA<SignedOut>());
      expect(app.lockStore.record.enabled, isFalse);
      expect(app.deviceLock.hasPinKey, isFalse);
      expect(find.text(_lockTitle), findsNothing);
    });

    testWidgets('three tries before signing out, the screen warns', (
      tester,
    ) async {
      await _open(
        tester,
        lock: (device) =>
            _lockWithPin(device, failures: 6, lastFailureAt: DateTime(2020)),
      );

      await _type(tester, '111222');

      expect(find.textContaining('فاضل 3 محاولات'), findsOneWidget);
    });

    testWidgets(
      'a forgotten PIN signs out, after saying which sentences would be lost',
      (tester) async {
        final app = TestApp(token: 'session-token', api: FakeApi());
        _phoneScreen(tester);
        app.api.answer('localAuth.me', (_) => phoneUser());
        app.lockStore.record = await _lockWithPin(app.deviceLock);
        app.ledgerStore.ledger = StoredLedger(
          accountKey: 'phone:42',
          outbox: [
            OutboxItem(
              id: 'a',
              text: 'قهوة 50',
              createdAt: DateTime(2026, 10, 19),
              state: OutboxState.needsYou,
            ),
          ],
        );
        await app.pump(tester);

        await tester.tap(find.text('نسيت الرمز؟'));
        await tester.pumpAndSettle();
        expect(
          find.text('فيه عملية واحدة على الموبايل لسه ماتبعتتش، وهتتمسح.'),
          findsOneWidget,
        );
        await tester.tap(find.text('اخرج من الحساب'));
        await tester.pumpAndSettle();

        expect(app.session, isA<SignedOut>());
        expect(app.lockStore.record.enabled, isFalse);
      },
    );

    testWidgets(
      'a lock that cannot be read stays shut and offers signing out',
      (tester) async {
        await _open(tester, record: const LockRecord(damaged: true));

        expect(
          find.text(
            'مش قادرين نقرأ قفل التطبيق على الموبايل ده. اخرج من الحساب وادخل تاني.',
          ),
          findsOneWidget,
        );
        expect(find.text('آخر العمليات'), findsNothing);
        expect(find.text('اخرج من الحساب'), findsOneWidget);
      },
    );

    testWidgets(
      'Android back on the lock leaves the app without moving the screens under it',
      (tester) async {
        final popped = <String>[];
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          (call) async {
            popped.add(call.method);
            return null;
          },
        );
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            SystemChannels.platform,
            null,
          ),
        );
        await _open(
          tester,
          lock: (device) => _lockWithPin(device, relockAfter: Duration.zero),
        );
        await _type(tester, _pin);
        await tester.tap(find.text('الكل'));
        await tester.pumpAndSettle();
        expect(find.text('كل العمليات'), findsOneWidget);

        await _lifecycle(tester, _toBackground);
        await _lifecycle(tester, _toForeground);
        expect(find.text(_lockTitle), findsOneWidget);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();

        expect(popped, contains('SystemNavigator.pop'));
        await _type(tester, _pin);
        expect(find.text('كل العمليات'), findsOneWidget);
      },
    );
  });

  group('locking again after the app was away', () {
    testWidgets('not within the chosen time', (tester) async {
      await _open(tester, lock: _lockWithPin);
      await _type(tester, _pin);

      await _lifecycle(tester, _toBackground);
      await tester.pump(const Duration(seconds: 40));
      await _lifecycle(tester, _toForeground);

      expect(find.text(_lockTitle), findsNothing);
    });

    testWidgets('once the chosen time passed', (tester) async {
      await _open(tester, lock: _lockWithPin);
      await _type(tester, _pin);

      await _lifecycle(tester, _toBackground);
      await tester.pump(const Duration(seconds: 61));
      await _lifecycle(tester, _toForeground);

      expect(find.text(_lockTitle), findsOneWidget);
    });
  });

  group('whose lock it is', () {
    testWidgets('signing out removes it with its keys', (tester) async {
      final app = await _open(tester, lock: _lockWithPin);
      await _type(tester, _pin);

      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();

      expect(app.lockStore.record.enabled, isFalse);
      expect(app.deviceLock.hasPinKey, isFalse);
      expect(app.deviceLock.cover, isFalse);
    });

    testWidgets('another account signing in does not inherit it', (
      tester,
    ) async {
      final app = TestApp(token: 'session-token', api: FakeApi());
      _phoneScreen(tester);
      app.api.answer('localAuth.me', (_) => phoneUser());
      app.lockStore.record = (await _lockWithPin(app.deviceLock))
          .copyWith(accountKey: 'phone:7');
      await app.pump(tester);

      expect(find.text(_lockTitle), findsNothing);
      expect(app.lockStore.record.enabled, isFalse);
      expect(app.lockStore.record.accountKey, 'phone:42');
    });
  });

  group('hidden amounts', () {
    testWidgets('the eye hides every amount and the choice is kept', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'expense.getMonthSummary',
          (_) => {'totalIncome': 0, 'totalExpense': '4250.50', 'count': 12},
        );
      final app = await _open(tester, api: api);
      expect(find.text('\u20664,251\u2069 ج.م'), findsOneWidget);

      await tester.tap(find.byTooltip('اخفي المبالغ'));
      await tester.pumpAndSettle();

      expect(find.text('\u20664,251\u2069 ج.م'), findsNothing);
      expect(find.text('•••• ج.م'), findsWidgets);
      expect(app.lockStore.record.hideAmounts, isTrue);
      expect(find.byTooltip('اظهر المبالغ'), findsOneWidget);
    });
  });

  group('changing the lock', () {
    testWidgets('asks for the PIN first, and counts wrong ones too', (
      tester,
    ) async {
      final app = await _open(tester, lock: _lockWithPin);
      await _type(tester, _pin);

      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('الأمان والخصوصية'));
      await tester.pumpAndSettle();
      expect(
        find.text('اكتب الرمز السري عشان تغيّر إعدادات القفل'),
        findsOneWidget,
      );

      await _type(tester, '111222');
      expect(app.lockStore.record.failures, 1);
      await _type(tester, _pin);
      await tester.tap(find.text('اقفل التطبيق'));
      await tester.pumpAndSettle();

      expect(find.text('وقفنا قفل التطبيق.'), findsOneWidget);
      expect(app.lockStore.record.enabled, isFalse);
      expect(app.deviceLock.cover, isFalse);
    });
  });
}
