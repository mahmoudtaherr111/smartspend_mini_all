import 'package:bank_capture/bank_capture.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/lock/lock_store.dart';

import 'support/test_app.dart';

class _FakeBankCapture implements BankCapture {
  _FakeBankCapture(this.answer);

  CaptureStatus answer;
  int opened = 0;

  @override
  Future<CaptureStatus> status() async => answer;

  @override
  Future<void> openAccessSettings() async => opened++;
}

/// The app with a phone account already signed in.
Future<_FakeBankCapture> _pumpApp(
  WidgetTester tester, {
  CaptureMethod method = CaptureMethod.notificationListener,
  CaptureAccess access = CaptureAccess.notGranted,
}) async {
  final capture = _FakeBankCapture(
    CaptureStatus(method: method, access: access),
  );
  final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
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
        sessionStoreProvider.overrideWithValue(
          MemorySessionStore('session-token'),
        ),
        httpClientProvider.overrideWithValue(api.client),
        bankCaptureProvider.overrideWithValue(capture),
        lockStoreProvider.overrideWithValue(MemoryLockStore()),
        deviceLockProvider.overrideWithValue(FakeDeviceLock()),
      ],
      child: const SmartSpendApp(),
    ),
  );
  await tester.pumpAndSettle();
  return capture;
}

void main() {
  testWidgets('opens on the record tab, in Arabic, right to left', (
    tester,
  ) async {
    await _pumpApp(tester);

    for (final label in ['تسجيل', 'إحصائيات', 'مركز AI', 'تقويم', 'المزيد']) {
      expect(find.text(label), findsWidgets);
    }
    final context = tester.element(find.byType(NavigationBar));
    expect(Directionality.of(context), TextDirection.rtl);
    // The record tab: the month, an invitation to record, and the sentence box.
    expect(find.textContaining('صرفت في'), findsOneWidget);
    expect(find.text('لسه مفيش عمليات'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('the More tab shows that bank notifications are off', (
    tester,
  ) async {
    final capture = await _pumpApp(tester);

    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();

    expect(find.text('إشعارات البنك والمحفظة'), findsOneWidget);
    expect(find.text('مش شغّالة'), findsOneWidget);

    await tester.tap(find.text('افتح الإعدادات'));
    await tester.pump();
    expect(capture.opened, 1);
  });

  testWidgets('on iPhone it points at Shortcuts and claims no state', (
    tester,
  ) async {
    await _pumpApp(
      tester,
      method: CaptureMethod.shortcutsAutomation,
      access: CaptureAccess.unknown,
    );

    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();

    expect(find.text('رسايل البنك من الاختصارات'), findsOneWidget);
    expect(find.text('افتح الاختصارات'), findsOneWidget);
    expect(find.text('شغّالة'), findsNothing);
    expect(find.text('مش شغّالة'), findsNothing);
  });
}
