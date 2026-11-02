import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/stats/stats_screen.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openStatsScreen(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  await tester.tap(find.text('إحصائيات').last);
  await tester.pumpAndSettle();
  return app;
}

void main() {
  testWidgets(
    'weekday spending rollup displays 7 days starting Saturday (STA-03)',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getMonthlyStats',
        (_) => {
          'totalExpense': 6000,
          'totalIncome': 18000,
          'dailyAverage': 200,
          'totalTxnCount': 15,
          'categoryBreakdown': [
            {'name': 'أكل وشرب', 'value': 4000, 'count': 10},
          ],
          'dayOfWeekTrend': [
            {'name': 'السبت', 'amount': 800},
            {'name': 'الأحد', 'amount': 400},
            {'name': 'الإثنين', 'amount': 600},
            {'name': 'الثلاثاء', 'amount': 500},
            {'name': 'الأربعاء', 'amount': 700},
            {'name': 'الخميس', 'amount': 2500},
            {'name': 'الجمعة', 'amount': 500},
          ],
        },
      );

      await _openStatsScreen(tester, api);

      // Scroll to Weekday spending chart
      await tester.drag(
        find.descendant(
          of: find.byType(StatsScreen),
          matching: find.byType(ListView),
        ),
        const Offset(0, -400),
      );
      await tester.pumpAndSettle();

      expect(find.text('أيام الصرف'), findsOneWidget);
      expect(find.byType(SmartSpendBarChart), findsOneWidget);
      expect(find.textContaining('أكتر يوم بتصرف فيه: الخميس'), findsOneWidget);
    },
  );

  testWidgets(
    'spending personality renders label and explanation from SSOT (STA-07, STA-08, BUG-04)',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getMonthlyStats',
        (_) => {
          'totalExpense': 4000,
          'totalIncome': 12000,
          'dailyAverage': 130,
          'totalTxnCount': 12,
          'categoryBreakdown': [
            {'name': 'أكل وشرب', 'value': 2000, 'count': 6},
          ],
          'behavioralInsights': {
            'spendingBehavior': 'balanced',
            'spendingBehaviorLabelAr': 'نمط متزن',
            'spendingBehaviorLabelEn': 'Balanced',
          },
        },
      );

      await _openStatsScreen(tester, api);

      expect(find.text('نمط وسلوك الصرف'), findsOneWidget);
      expect(find.text('نمط متزن'), findsOneWidget);
      expect(find.textContaining('مصاريفك متوزعة بشكل متوازن'), findsOneWidget);
    },
  );

  testWidgets(
    'budget comparison handles budget limit, overflow, and income fallback (STA-04, GAP-15)',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getMonthlyStats',
        (_) => {
          'totalExpense': 7500,
          'totalIncome': 10000,
          'dailyAverage': 250,
          'totalTxnCount': 20,
          'categoryBreakdown': [
            {'name': 'أكل وشرب', 'value': 5000, 'count': 10},
          ],
        },
      );
      api.answer(
        'budget.list',
        (_) => {
          'budgets': [
            {
              'id': 1,
              'title': 'ميزانية الشهر العامة',
              'category': null,
              'monthlyLimit': 6000,
              'currentSpent': 7500,
              'percentage': 125,
              'isExceeded': true,
            },
          ],
        },
      );

      await _openStatsScreen(tester, api);

      expect(find.text('الميزانية والصرف'), findsOneWidget);
      expect(find.text('125%'), findsOneWidget);
      expect(find.textContaining('تجاوزت الميزانية بـ'), findsOneWidget);
    },
  );

  testWidgets(
    'debts rollup renders per person balances and empty state guide (STA-05)',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getDebtBalances',
        (_) => {
          'balances': [
            {
              'contactId': 10,
              'name': 'أحمد إبراهيم',
              'balance': 500,
              'lent': 1000,
              'received': 500,
              'count': 2,
            },
          ],
          'totalLent': 1000,
          'totalBorrowed': 500,
          'net': 500,
        },
      );

      await _openStatsScreen(tester, api);

      // Scroll down to debts section
      await tester.drag(
        find.descendant(
          of: find.byType(StatsScreen),
          matching: find.byType(ListView),
        ),
        const Offset(0, -700),
      );
      await tester.pumpAndSettle();

      expect(find.text('فلوس مع الناس (ديون وسلف)'), findsOneWidget);
      expect(find.text('أحمد إبراهيم'), findsOneWidget);
      expect(find.text('عرض كل الناس والديون'), findsOneWidget);
    },
  );

  testWidgets(
    'year in review renders line chart with gaps for missing months (STA-09, GAP-18)',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      api.answer(
        'expense.getYearlyStats',
        (_) => {
          'year': '2026',
          'totalExpense': 45000,
          'totalIncome': 120000,
          'netFlow': 75000,
          'count': 120,
          'monthlyData': [
            {
              'month': 'يناير',
              'monthKey': '2026-01',
              'amount': 12000,
              'hasData': true,
            },
            {
              'month': 'فبراير',
              'monthKey': '2026-02',
              'amount': 15000,
              'hasData': true,
            },
            {
              'month': 'مارس',
              'monthKey': '2026-03',
              'amount': 0,
              'hasData': false,
            }, // GAP!
            {
              'month': 'إبريل',
              'monthKey': '2026-04',
              'amount': 18000,
              'hasData': true,
            },
          ],
        },
      );

      await _openStatsScreen(tester, api);

      // Scroll to yearly review section
      await tester.drag(
        find.descendant(
          of: find.byType(StatsScreen),
          matching: find.byType(ListView),
        ),
        const Offset(0, -900),
      );
      await tester.pumpAndSettle();

      expect(find.byType(SmartSpendLineChart), findsOneWidget);
      expect(find.textContaining('السنة دي'), findsAtLeastNWidgets(1));
    },
  );

  testWidgets('smart profile displays Law 151 compliance note (STA-11)', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer(
      'profile.getSmartProfile',
      (_) => {
        'profileCompleted': true,
        'financialInfo': {'salaryDay': 25},
      },
    );

    await _openStatsScreen(tester, api);

    // Scroll to smart profile note
    await tester.drag(
      find.descendant(
        of: find.byType(StatsScreen),
        matching: find.byType(ListView),
      ),
      const Offset(0, -1100),
    );
    await tester.pumpAndSettle();

    expect(find.text('الملف المالي الذكي والخصوصية'), findsOneWidget);
    expect(
      find.textContaining('القانون المصري رقم 151 لسنة 2020'),
      findsOneWidget,
    );
    expect(find.textContaining('يوم الراتب المحفوظ: يوم 25'), findsOneWidget);
  });
}
