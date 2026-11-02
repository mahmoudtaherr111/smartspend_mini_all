import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/calendar/calendar_grid.dart';
import 'package:smartspend_app/src/features/calendar/calendar_screen.dart';
import 'package:smartspend_app/src/features/calendar/day_transactions_sheet.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

void _answerCalendarData(FakeApi api, {int? salaryDay}) {
  api.answer('localAuth.me', (_) => phoneUser());
  api.answer(
    'profile.getSmartProfile',
    (_) => {
      'financialInfo': {
        if (salaryDay != null) ...{
          'hasFixedSalary': true,
          'salaryDay': salaryDay,
        },
      },
    },
  );
  api.answer(
    'coach.overview',
    (_) => {
      'position': {
        'untilIsPayday': true,
        'until': '2026-10-25',
        'days': 6,
        'wallets': {'count': 1, 'total': 12000},
        'duesKnown': 3000,
        'freeBeforeIncome': 9000,
        'incomeConfirmed': 0,
        'incomeEstimated': 0,
      },
      'cashflows': [
        {
          'id': 101,
          'title': 'إيجار الشقة',
          'kind': 'rent',
          'direction': 'out',
          'amount': 2500,
          'dueDay': 1,
          'recurrence': 'monthly',
          'status': 'due',
        },
        {
          'id': 102,
          'title': 'فاتورة الكهرباء',
          'kind': 'bill',
          'direction': 'out',
          'amount': 350,
          'dueDay': 15,
          'recurrence': 'monthly',
          'status': 'paid',
        },
      ],
      'plan': {
        'id': 1,
        'title': 'خطة توفير مصاريف المدارس',
        'goal': 'توفير 5000 ج.م قبل نهاية الشهر',
        'steps': [
          {
            'id': 201,
            'title': 'تقليل الأكل برة',
            'status': 'pending',
            'remindAt': null,
          },
          {
            'id': 202,
            'title': 'شراء مستلزمات بالجملة',
            'status': 'done',
            'remindAt': null,
          },
        ],
      },
    },
  );
  api.answer(
    'expense.getMonthlyStats',
    (_) => {
      'totalExpense': 5000,
      'totalIncome': 15000,
      'dailyAverage': 160,
      'totalTxnCount': 20,
      'categoryBreakdown': <Map<String, Object?>>[],
      'dayTrend': [
        {'date': '2026-10-01', 'amount': 250, 'income': 0},
        {'date': '2026-10-02', 'amount': 150, 'income': 0},
        {'date': '2026-10-15', 'amount': 350, 'income': 0},
      ],
    },
  );
  api.answer(
    'coach.paymentSuggestions',
    (_) => [
      {
        'id': 501,
        'amount': 2500,
        'category': 'إيجار',
        'description': 'تحويل إيجار الشقة',
        'date': '2026-10-01T10:00:00Z',
      },
    ],
  );
  api.answer('coach.settle', (_) => {'success': true});
  api.answer('coach.setStepStatus', (_) => {'success': true});
  answerSampleMonth(api);
}

Future<TestApp> _openCalendar(
  WidgetTester tester,
  FakeApi api, {
  int? salaryDay,
}) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(800, 1400);
  _answerCalendarData(api, salaryDay: salaryDay);
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  await tester.tap(find.text('تقويم').last);
  await tester.pumpAndSettle();
  return app;
}

Finder _calendarScroll(WidgetTester tester) {
  return find.descendant(
    of: find.byType(CalendarScreen),
    matching: find.byType(ListView),
  );
}

void main() {
  testWidgets(
    'Calendar screen mounts and renders hero, grid, commitments and plan',
    (tester) async {
      // A tall screen: the month the server names may need six rows of days.
      tester.view.physicalSize = const Size(1080, 4800);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final api = FakeApi();
      await _openCalendar(tester, api, salaryDay: 25);

      expect(find.byType(CalendarScreen), findsOneWidget);
      // Payday month banner (STA-12)
      expect(
        find.text('شهرك المالي بيبدأ يوم 25 وبيخلص يوم 24.'),
        findsOneWidget,
      );
      // Hero free before income (CAL-02)
      expect(find.text('المتاح لحد القبض'), findsOneWidget);
      expect(find.text('9,000 ج.م'), findsOneWidget);
      expect(
        find.textContaining('الأيام الباقية على القبض (يوم 25): 6'),
        findsOneWidget,
      );

      // Calendar grid (CAL-01)
      expect(find.byType(CalendarGrid), findsOneWidget);
      expect(find.text('السبت'), findsOneWidget);
      expect(find.text('الأحد'), findsWidgets);

      // Commitments list (CAL-03, CAL-04)
      expect(find.text('الالتزامات والدخل المتوقع'), findsOneWidget);
      expect(find.text('إيجار الشقة'), findsOneWidget);
      expect(find.text('2,500 ج.م'), findsOneWidget);
      expect(find.text('ادفع'), findsOneWidget);
      expect(find.text('فاتورة الكهرباء'), findsOneWidget);
      expect(find.text('اتدفع'), findsOneWidget);

      // Drag slightly to reveal active plan (CAL-05, CAL-06)
      await tester.drag(_calendarScroll(tester), const Offset(0, -300));
      await tester.pumpAndSettle();

      expect(find.text('خطة التوفير الحالية'), findsOneWidget);
      expect(find.text('توفير 5000 ج.م قبل نهاية الشهر'), findsOneWidget);
      expect(find.text('تقليل الأكل برة'), findsOneWidget);
      expect(find.text('شراء مستلزمات بالجملة'), findsOneWidget);
    },
  );

  testWidgets('Tapping settle opens SettleCommitmentSheet with suggestions', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);

    // Drag slightly so settle button is well above the bottom navigation bar
    await tester.drag(_calendarScroll(tester), const Offset(0, -200));
    await tester.pumpAndSettle();

    await tester.tap(find.text('ادفع').first);
    await tester.pumpAndSettle();

    expect(find.text('دفع: إيجار الشقة'), findsOneWidget);
    expect(find.textContaining('عمليات ممكن تكون هي:'), findsOneWidget);
    expect(find.text('أكد الدفع'), findsOneWidget);

    // Tap confirm settle
    await tester.tap(find.text('أكد الدفع'));
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.settle') != null, isTrue);
  });

  testWidgets('Tapping a day in the grid opens DayTransactionsSheet', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);

    final dayCell = find.text('15').first;
    await tester.tap(dayCell);
    await tester.pumpAndSettle();

    expect(find.byType(DayTransactionsSheet), findsOneWidget);
  });

  testWidgets(
    'At text scale 2.0 calendar renders vertical day list without overflow',
    (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(() {
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });

      final api = FakeApi();
      await _openCalendar(tester, api);

      expect(find.byType(CalendarScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
