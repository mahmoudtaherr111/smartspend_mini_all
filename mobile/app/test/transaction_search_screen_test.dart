// Transaction search screen (REC-11): debounced search, Arabic letter folding,
// empty query states, offline cache search with notice, and detail navigation.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/transaction_search_screen.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openApp(WidgetTester tester, {FakeApi? api}) async {
  final fakeApi = api ?? FakeApi();
  fakeApi.answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(fakeApi);
  final app = TestApp(token: 'stored-token', api: fakeApi);
  await app.pump(tester);
  return app;
}

void main() {
  testWidgets('renders search field, shows initial prompt, and debounces query to api', (
    tester,
  ) async {
    final api = FakeApi();
    await _openApp(tester, api: api);

    String? queried;
    api.answer('expense.searchTransactions', (input) {
      if (input is Map) queried = input['query'] as String?;
      return [
        {
          'id': 101,
          'amount': 65,
          'type': 'expense',
          'category': 'مواصلات',
          'subCategory': 'عام',
          'description': 'مشوار أوبر',
          'rawText': 'أوبر 65 جنيه',
          'source': 'ai_parsed',
          'date': DateTime.utc(2026, 10, 20, 12, 0).toIso8601String(),
          'createdAt': DateTime.utc(2026, 10, 20, 12, 0).toIso8601String(),
        },
      ];
    });

    // Open search from RecordScreen AppBar
    await tester.tap(find.byIcon(Icons.search_rounded).first);
    await tester.pumpAndSettle();

    expect(find.byType(TransactionSearchScreen), findsOneWidget);
    expect(find.text('بحث في العمليات'), findsOneWidget);

    // Enter full query 'اوبر'
    await tester.enterText(find.byType(TextField).last, 'اوبر');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    expect(queried, 'اوبر');
    expect(find.text('مشوار أوبر'), findsOneWidget);
    expect(find.textContaining('مواصلات'), findsOneWidget);

    // Tap clear button
    await tester.tap(find.byIcon(Icons.clear_rounded));
    await tester.pumpAndSettle();
    expect(find.text('مشوار أوبر'), findsNothing);
  });

  testWidgets('displays empty state when query returns no results', (
    tester,
  ) async {
    final api = FakeApi();
    await _openApp(tester, api: api);

    api.answer('expense.searchTransactions', (_) => []);

    await tester.tap(find.byIcon(Icons.search_rounded).first);
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'سينما');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    expect(find.text('مفيش نتائج لـ "سينما"'), findsOneWidget);
    expect(
      find.text('جرّب تبحث بكلمة تانية أو اتأكد من الحروف.'),
      findsOneWidget,
    );
  });

  testWidgets('offline search filters cached entries with Arabic normalization and shows notice', (
    tester,
  ) async {
    final api = FakeApi();
    final app = await _openApp(tester, api: api);

    // Seed local cache with sample transactions in recent page
    final local = app.container.read(localLedgerProvider);
    await local.update((stored) => stored.copyWith(
      recent: LedgerPage(
        total: 1,
        entries: [
          LedgerEntry(
            id: 202,
            amount: 80,
            type: 'expense',
            category: 'علاج',
            subCategory: 'صيدلية',
            rawText: 'صيدلية 80 جنيه',
            source: 'ai_parsed',
            date: DateTime.utc(2026, 10, 21, 10, 0),
          ),
        ],
      ),
    ));

    // Turn offline
    api.offline = true;

    await tester.tap(find.byIcon(Icons.search_rounded).first);
    await tester.pumpAndSettle();

    // Search with 'صيدليه' (ending in ha 'ه' instead of ta-marbuta 'ة')
    await tester.enterText(find.byType(TextField).last, 'صيدليه');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    // Offline notice shown
    expect(
      find.text('البحث دلوقتي شغال على العمليات المحفوظة على جهازك بس.'),
      findsOneWidget,
    );
    // Cached entry matched despite 'ه' vs 'ة'
    expect(find.textContaining('علاج'), findsOneWidget);
    expect(find.textContaining('صيدلية'), findsOneWidget);
  });
}
