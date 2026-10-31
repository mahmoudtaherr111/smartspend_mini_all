// The stats tab and category drill-down (STA-01, STA-02): the month's figures as the server computes them,
// opening a category's transactions for the selected month, refund-netted negative categories, offline cached
// stats, and every state.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_api.dart';
import 'package:smartspend_app/src/features/stats/stats_models.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openStats(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  await tester.tap(find.text('إحصائيات').last);
  await tester.pumpAndSettle();
  return app;
}

void main() {
  testWidgets('the month leads with what was spent, and says how it compares', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    await _openStats(tester, api);

    expect(find.byType(HeroFigure), findsOneWidget);
    expect(find.text('${ltrIsolate('4,251')} ج.م'), findsOneWidget);
    expect(
      find.text('أقل من الشهر اللي فات بـ ${ltrIsolate('12%')}.'),
      findsOneWidget,
    );
    expect(find.text('متوسط يومي'), findsOneWidget);
    expect(find.text('صرفت على إيه'), findsOneWidget);
    expect(find.text('أكل وشرب'), findsOneWidget);
    expect(find.text('40%'), findsOneWidget);
    expect(find.text('أكتر حاجة بتتكرر: قهوة وكافيه، 9 مرات.'), findsOneWidget);
    expect(
      (api.lastInput('expense.getMonthlyStats')! as Map)['month'],
      matches(RegExp(r'^\d{4}-\d{2}$')),
    );
  });

  testWidgets(
    'tapping a category opens its transactions for the selected month, and swipe deletes with undo',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer('expense.delete', (_) => {'success': true});
      await _openStats(tester, api);

      // Move to the previous month first, so we prove the category view follows the selected month.
      await tester.tap(find.byTooltip('الشهر اللي قبله'));
      await tester.pumpAndSettle();
      final selectedMonth =
          (api.lastInput('expense.getMonthlyStats')! as Map)['month'] as String;

      final row = find.text('أكل وشرب');
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();

      final listInput = api.lastInput('expense.list')! as Map;
      expect(listInput['category'], 'أكل وشرب');
      expect(listInput['type'], 'expense');
      expect(listInput['startDate'], '$selectedMonth-01');
      expect(listInput['endDate'] as String, startsWith(selectedMonth));
      expect(listInput['endDate'] as String, endsWith('T23:59:59.999'));

      expect(find.text('${ltrIsolate('1,680')} ج.م'), findsOneWidget);
      expect(find.text(inlineName('Talabat')), findsOneWidget);
      expect(find.text('قهوة وكافيه'), findsOneWidget);
      expect(find.text(inlineName('UBER *TRIP')), findsNothing);

      // Swipe Talabat away and undo before the notice closes.
      await tester.drag(find.text(inlineName('Talabat')), const Offset(500, 0));
      await tester.pumpAndSettle();
      expect(find.text(inlineName('Talabat')), findsNothing);
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();
      expect(find.text(inlineName('Talabat')), findsOneWidget);
      expect(api.paths, isNot(contains('expense.delete')));
    },
  );

  testWidgets(
    'a refund-netted negative category shows a plus sign and word, and opens its rows',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getMonthlyStats',
        (_) => {
          'totalExpense': 1380,
          'totalIncome': 15000,
          'dailyAverage': 60,
          'totalTxnCount': 5,
          'categoryBreakdown': [
            {'name': 'أكل وشرب', 'value': 1680, 'count': 4},
            {'name': 'تسوق', 'value': -300, 'count': 1},
          ],
        },
      );
      api.answer(
        'expense.list',
        (_) => {
          'items': [
            {
              'id': 91,
              'amount': '-300.00',
              'type': 'expense',
              'category': 'تسوق',
              'description': 'مرتجع أمازون',
              'date': DateTime.now().toUtc().toIso8601String(),
            },
          ],
          'total': 1,
        },
      );
      await _openStats(tester, api);

      expect(find.text('مرتجع'), findsOneWidget);
      expect(find.text('${ltrIsolate('+300')} ج.م'), findsOneWidget);

      await tester.tap(find.text('تسوق'));
      await tester.pumpAndSettle();
      expect(find.text('مرتجع أمازون'), findsOneWidget);
      expect(find.textContaining('صافي مرتجع في'), findsOneWidget);
    },
  );

  testWidgets('offline shows cached statistics with the offline banner', (
    tester,
  ) async {
    final onlineApi = FakeApi();
    answerSampleMonth(onlineApi);
    final first = await _openStats(tester, onlineApi);
    expect(find.text('${ltrIsolate('4,251')} ج.م'), findsOneWidget);

    final offlineApi = FakeApi()..offline = true;
    final second = TestApp(token: 'stored-token', api: offlineApi);
    second.ledgerStore.ledger = first.ledgerStore.ledger;
    await second.pump(tester);
    await tester.tap(find.text('إحصائيات').last);
    await tester.pumpAndSettle();

    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.text('${ltrIsolate('4,251')} ج.م'), findsOneWidget);
    expect(find.text('أكل وشرب'), findsOneWidget);
  });

  testWidgets(
    'the previous month is asked for, and the next stays off on the current one',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openStats(tester, api);
      final current =
          (api.lastInput('expense.getMonthlyStats')! as Map)['month'] as String;

      final next = find.ancestor(
        of: find.byTooltip('الشهر اللي بعده'),
        matching: find.byType(IconButton),
      );
      expect(tester.widget<IconButton>(next).onPressed, isNull);

      await tester.tap(find.byTooltip('الشهر اللي قبله'));
      await tester.pumpAndSettle();

      final asked =
          (api.lastInput('expense.getMonthlyStats')! as Map)['month'] as String;
      final [year, month] = current.split('-').map(int.parse).toList();
      final before = DateTime.utc(year, month - 1);
      expect(
        asked,
        '${before.year}-${before.month.toString().padLeft(2, '0')}',
      );
      expect(tester.widget<IconButton>(next).onPressed, isNotNull);
    },
  );

  testWidgets('an empty month teaches what belongs here and offers to record', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer(
        'expense.getMonthlyStats',
        (_) => {'totalExpense': 0, 'totalIncome': 0, 'totalTxnCount': 0},
      )
      ..answer(
        'expense.getMonthSummary',
        (_) => {'totalIncome': 0, 'totalExpense': 0, 'count': 0},
      )
      ..answer('expense.list', (_) => {'items': <Object>[], 'total': 0});
    await _openStats(tester, api);

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('سجّل مصروف'), findsOneWidget);
    await tester.tap(find.text('سجّل مصروف'));
    await tester.pumpAndSettle();
    expect(find.byType(HeroFigure), findsNothing);
  });

  testWidgets('a failure shows the server message and tries again', (
    tester,
  ) async {
    var calls = 0;
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('expense.getMonthlyStats', (_) {
      calls++;
      throw const TrpcFailure(
        'INTERNAL_SERVER_ERROR',
        500,
        'حصلت مشكلة عندنا. جرّب تاني.',
      );
    });
    await _openStats(tester, api);

    expect(find.text('حصلت مشكلة عندنا. جرّب تاني.'), findsOneWidget);
    final before = calls;
    await tester.tap(find.text('جرّب تاني'));
    await tester.pumpAndSettle();
    expect(calls, greaterThan(before));
  });

  testWidgets(
    'meets the tap target, label and contrast guidelines in both themes',
    (tester) async {
      final semantics = tester.ensureSemantics();
      for (final brightness in Brightness.values) {
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        final api = FakeApi();
        answerSampleMonth(api);
        await _openStats(tester, api);
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));

        final row = find.text('أكل وشرب');
        await tester.ensureVisible(row);
        await tester.pumpAndSettle();
        await tester.tap(row);
        await tester.pumpAndSettle();
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
      }
      tester.platformDispatcher.clearPlatformBrightnessTestValue();
      semantics.dispose();
    },
  );

  testWidgets(
    'a server error on pull-to-refresh keeps monthly stats and shows a notice',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openStats(tester, api);
      expect(find.text('أكل وشرب'), findsOneWidget);

      api.answer(
        'expense.getMonthlyStats',
        (_) => throw const ApiException(
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          message: 'Internal error',
        ),
      );
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 500),
        1500,
      );
      await tester.pumpAndSettle();

      expect(find.text('أكل وشرب'), findsOneWidget);
      expect(find.byType(ErrorState), findsNothing);
      expect(
        find.text(
          'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'a server error on category transactions refresh keeps list and shows a notice',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openStats(tester, api);

      final row = find.text('أكل وشرب');
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();

      expect(find.text(inlineName('Talabat')), findsOneWidget);

      api.answer(
        'expense.list',
        (_) => throw const ApiException(
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          message: 'Internal error',
        ),
      );
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 500),
        1500,
      );
      await tester.pumpAndSettle();

      expect(find.text(inlineName('Talabat')), findsOneWidget);
      expect(find.byType(ErrorState), findsNothing);
      expect(
        find.text(
          'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.',
        ),
        findsOneWidget,
      );
    },
  );

  test(
    'reads and round-trips server answers and financial month boundaries',
    () {
      final stats = MonthStats.fromJson(const {
        'totalExpense': '4250.50',
        'categoryBreakdown': [
          {'name': 'أكل وشرب', 'value': 1680, 'count': 11},
          {'value': 3},
        ],
        'behavioralInsights': {
          'comparisonType': 'weekly',
          'expenseChangePercent': 8,
        },
      });
      expect(stats.expense, 4250.5);
      expect(stats.income, 0);
      expect(stats.categories.single.name, 'أكل وشرب');
      expect(stats.comparison, Comparison.weekly);
      expect(stats.changePercent, 8);
      expect(stats.isEmpty, isFalse);
      expect(MonthStats.fromJson(const {}).isEmpty, isTrue);

      final roundTrip = MonthStats.fromJson(stats.toJson());
      expect(roundTrip.expense, 4250.5);
      expect(roundTrip.comparison, Comparison.weekly);
      expect(roundTrip.changePercent, 8);
      expect(roundTrip.categories.single.amount, 1680);

      expect(financialMonthDayRange('2026-10'), (
        startDay: '2026-10-01',
        endDay: '2026-10-31',
      ));
      expect(financialMonthDayRange('2026-05', salaryDay: 5), (
        startDay: '2026-05-05',
        endDay: '2026-06-04',
      ));
      expect(financialMonthDayRange('2026-01', salaryDay: 31), (
        startDay: '2026-01-31',
        endDay: '2026-02-27',
      ));
    },
  );
}
