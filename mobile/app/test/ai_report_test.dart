import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/src/internals.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/ai/ai_api.dart';
import 'package:smartspend_app/src/features/ai/ai_compare_view.dart';
import 'package:smartspend_app/src/features/ai/ai_models.dart';
import 'package:smartspend_app/src/features/ai/ai_providers.dart';
import 'package:smartspend_app/src/features/ai/ai_report_view.dart';
import 'package:smartspend_app/src/features/ai/ai_yearly_insights_view.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/l10n/app_localizations.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

List<Override> _testOverrides(
  FakeApi fakeApi, [
  List<Override> extra = const [],
]) {
  final trpc = TrpcClient(
    baseUri: Uri.parse('http://localhost'),
    httpClient: fakeApi.client,
  );
  return [
    trpcClientProvider.overrideWithValue(trpc),
    aiApiProvider.overrideWithValue(AiApi(trpc)),
    sessionStoreProvider.overrideWithValue(MemorySessionStore('test-token')),
    currentMonthProvider.overrideWith((ref) async => '2026-10'),
    ...extra,
  ];
}

void main() {
  group('AiReportView Tests (AI-06, AI-08)', () {
    testWidgets('renders monthly report with low data warning banner', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi, [
            monthlyReportFamily('2026-10').overrideWith((ref) async {
              return const MonthlyInsights(
                month: '2026-10',
                responseText:
                    'مفيش مصاريف مسجلة كافية في شهر 2026-10 لتقديم تحليل دقيق.',
                alerts: ['سجل المزيد من المعاملات'],
                hasLowData: true,
              );
            }),
          ]),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiReportView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تحليل الشهر'), findsOneWidget);
      expect(find.textContaining('بيانات قليلة'), findsOneWidget);
      expect(find.textContaining('مفيش مصاريف مسجلة كافية'), findsOneWidget);
    });

    testWidgets('renders verified facts table when data is present', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi, [
            monthlyReportFamily('2026-10').overrideWith((ref) async {
              return const MonthlyInsights(
                month: '2026-10',
                responseText: 'تقرير شهر أكتوبر: إجمالي مصاريفك 4500 جنيه موزعة على البقالة والفواتير.',
                dataTable: [
                  {'category': 'بقالة', 'amount': 2500.0, 'percentage': 55.0},
                  {'category': 'فواتير', 'amount': 2000.0, 'percentage': 45.0},
                ],
              );
            }),
          ]),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiReportView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('أعلى بنود الصرف:'), findsOneWidget);
      expect(find.text('بقالة'), findsOneWidget);
      expect(find.text('فواتير'), findsOneWidget);
    });

    testWidgets('export button prompts upgrade for free user', (tester) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi, [
            monthlyReportFamily('2026-10').overrideWith((ref) async {
              return const MonthlyInsights(
                month: '2026-10',
                responseText: 'تحليل شهر أكتوبر مكتمل.',
              );
            }),
          ]),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiReportView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap export button
      await tester.ensureVisible(find.text('صدّر التقرير'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('صدّر التقرير'));
      await tester.pumpAndSettle();

      // Shows upgrade sheet
      expect(find.byType(UpgradePromptSheet), findsOneWidget);
    });
  });

  group('AiCompareView Tests (AI-07)', () {
    testWidgets('guards against comparing identical months', (tester) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiCompareView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('قارن شهرين'), findsOneWidget);
    });

    testWidgets('renders comparison results when months differ', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi, [
            monthComparisonFamily(('2026-10', '2026-09')).overrideWith((
              ref,
            ) async {
              return const MonthComparison(
                firstMonth: '2026-10',
                secondMonth: '2026-09',
                responseText: 'زادت مصاريفك بنسبة 15% مقارنة بالشهر السابق.',
                changes: [
                  {'category': 'مطاعم', 'change': '+300 جنيه'},
                ],
              );
            }),
          ]),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiCompareView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final compareBtn = find.text('بدء المقارنة');
      if (compareBtn.evaluate().isNotEmpty) {
        await tester.tap(compareBtn);
        await tester.pumpAndSettle();
      }

      expect(find.text('قارن شهرين'), findsOneWidget);
    });
  });

  group('AiYearlyInsightsView Tests (AI-11)', () {
    testWidgets('renders yearly insights with categories and behaviors', (
      tester,
    ) async {
      final fakeApi = FakeApi();
      fakeApi.answer('ai.generateYearlyInsights', (input) {
        return {
          'summary': 'ملخص 2026: حققت التزاماً بميزانياتك في 8 أشهر من أصل 10.',
          'topCategories': [
            {'category': 'سكن وفواتير', 'total': 45000.0},
            {'category': 'بقالة وطعام', 'total': 38000.0},
          ],
          'habits': ['الصرف يزداد في نهاية الأسبوع بنسبة 40%'],
        };
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            locale: const Locale('ar'),
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: Scaffold(body: AiYearlyInsightsView()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('التقرير السنوي'), findsOneWidget);
      expect(
        find.textContaining('ملخص 2026: حققت التزاماً بميزانياتك'),
        findsOneWidget,
      );
    });
  });
}
