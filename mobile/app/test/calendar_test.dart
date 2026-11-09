import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/calendar/calendar_grid.dart';
import 'package:smartspend_app/src/features/calendar/calendar_models.dart';
import 'package:smartspend_app/src/features/calendar/calendar_screen.dart';
import 'package:smartspend_app/src/features/calendar/day_transactions_sheet.dart';
import 'package:smartspend_app/src/features/commitments/add_commitment_screen.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_calendar.dart';
import 'support/sample_commitments.dart';
import 'support/sample_month.dart';
import 'support/test_app.dart';

void _answerCalendarData(FakeApi api, {int? salaryDay}) {
  api.answer('localAuth.me', (_) => phoneUser());
  answerSampleCalendar(api, salaryDay: salaryDay);
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

    // The suggestions are asked for this due date.
    expect(api.lastInput('coach.paymentSuggestions'), {
      'cashflowId': 101,
      'dueDay': '2026-11-01',
    });

    // Tap confirm settle: paid off the records, for what is owed on that date.
    await tester.tap(find.text('أكد الدفع'));
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.settle'), {
      'cashflowId': 101,
      'dueDay': '2026-11-01',
      'amount': 2500,
    });
  });

  testWidgets('Picking a suggestion links that payment to the due date', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);
    await tester.drag(_calendarScroll(tester), const Offset(0, -200));
    await tester.pumpAndSettle();

    await tester.tap(find.text('ادفع').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحويل إيجار الشقة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('أكد الدفع'));
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.settle'), {
      'cashflowId': 101,
      'dueDay': '2026-11-01',
      'expenseId': 501,
      'amount': 2500,
    });
  });

  testWidgets('Adding from the calendar opens the commitment types', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    answerSampleCommitments(api);
    await _openCalendar(tester, api);

    await tester.tap(find.byTooltip('ضيف التزام أو دخل'));
    await tester.pumpAndSettle();

    expect(find.byType(AddCommitmentScreen), findsOneWidget);
    expect(find.text('إيه اللي عايز تسجله؟'), findsOneWidget);
    expect(find.text('اشتراك'), findsOneWidget);
    expect(find.text('جمعية'), findsOneWidget);
  });

  testWidgets(
    'A subscription shows its logo on its day, and the day says it is due',
    (tester) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final api = FakeApi();
      answerSampleCommitments(api);
      await _openCalendar(tester, api);

      // Netflix's mark sits on the 12th of the month shown.
      final mark = find.descendant(
        of: find.byType(CalendarGrid),
        matching: find.byWidgetPredicate(
          (widget) => widget is LogoBadge && widget.label == 'Netflix',
        ),
      );
      expect(mark, findsOneWidget);
      expect(api.lastInput('commitments.month'), {'month': '2026-11'});

      await tester.tap(find.text('12').first);
      await tester.pumpAndSettle();

      expect(find.byType(DayTransactionsSheet), findsOneWidget);
      expect(find.text('عليك تدفع اليوم ده'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(DayTransactionsSheet),
          matching: find.text('دفعته'),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('Undoing a paid date unlinks its payment', (tester) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);
    await tester.drag(_calendarScroll(tester), const Offset(0, -200));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('اتدفع (دوس للإلغاء)'));
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.unsettle'), {'settlementId': 77});
  });

  testWidgets('Stopping a commitment ends it after the user confirms', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);
    await tester.drag(_calendarScroll(tester), const Offset(0, -200));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('اختيارات تانية').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('وقّف الالتزام ده'));
    await tester.pumpAndSettle();
    expect(find.textContaining('«إيجار الشقة»'), findsOneWidget);
    await tester.tap(find.text('وقّف'));
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.updateCashflow'), {
      'id': 101,
      'status': 'ended',
    });
  });

  testWidgets('A step reminder is set for 9:00 tomorrow on the server day', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = FakeApi();
    await _openCalendar(tester, api);
    await tester.drag(_calendarScroll(tester), const Offset(0, -600));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('شغّل تذكير').first);
    await tester.pumpAndSettle();

    expect(api.lastInput('coach.setReminder'), {
      'stepId': 201,
      'at': '2026-10-20T09:00',
    });
  });

  test('The overview reads the server answer as it is', () {
    final overview = CoachOverviewData.fromJson(sampleCoachOverview());

    expect(overview.today, '2026-10-19');
    expect(overview.due.map((item) => item.dueDay), [
      '2026-10-15',
      '2026-11-01',
    ]);
    final electricity = overview.due.first;
    expect(electricity.isPaid, isTrue);
    expect(electricity.settlements.single.id, 77);
    expect(electricity.settlements.single.amount, 350);
    final rent = overview.due.last;
    expect(rent.cashflowId, 101);
    expect(rent.remaining, 2500);
    expect(rent.settlements, isEmpty);
    expect(overview.position.unknownBalanceAge, isFalse);
    expect(overview.plan!.steps.first.hasReminder, isFalse);

    final withUndated = sampleCoachOverview();
    (withUndated['position']! as Map<String, Object?>)['wallets'] = {
      'total': 0,
      'count': 1,
      'oldestObservedDay': null,
      'unknownAge': 1,
    };
    expect(
      CoachOverviewData.fromJson(withUndated).position.unknownBalanceAge,
      isTrue,
    );
  });

  test('Day keys move on calendar days', () {
    expect(addDaysToDayKey('2026-10-31', 1), '2026-11-01');
    expect(addDaysToDayKey('2026-12-31', 1), '2027-01-01');
    expect(addDaysToDayKey('2028-02-28', 1), '2028-02-29');
    expect(addDaysToDayKey('not a day', 1), isNull);
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
