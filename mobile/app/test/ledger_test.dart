import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/ledger/transactions_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

final _now = DateTime(2026, 10, 19, 14, 30);

/// A row of `expenses` as `expense.list` returns it: MySQL decimals arrive as strings.
Map<String, Object?> _entry(
  int id,
  String amount,
  String category, {
  String type = 'expense',
  String? description,
  String? subCategory,
  DateTime? date,
}) => {
  'id': id,
  'amount': amount,
  'type': type,
  'category': category,
  'subCategory': subCategory,
  'description': description,
  'date': (date ?? _now.subtract(const Duration(hours: 2)))
      .toUtc()
      .toIso8601String(),
};

/// What `ai.parseExpense` answers.
Map<String, Object?> _parsed(
  String decision,
  List<Map<String, Object?>> items, {
  String? question,
  int? clarificationId,
}) => {
  'decision': decision,
  'items': items,
  'clarificationQuestion': question,
  'clarificationId': clarificationId,
  'classificationLogId': 901,
};

Map<String, Object?> _item(num amount, String category, {String? sub}) => {
  'amount': amount,
  'type': 'expense',
  'category': category,
  'subCategory': sub ?? 'عام',
  'description': category,
  'currency': 'EGP',
};

Future<TestApp> _signedIn(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'session-token', api: api);
  await app.pump(tester);
  return app;
}

Future<void> _send(WidgetTester tester, String sentence) async {
  await tester.enterText(find.byType(TextField), sentence);
  await tester.tap(find.byTooltip('ابعت'));
  await tester.pumpAndSettle();
}

void main() {
  group('the month', () {
    test('runs from the 1st without a payday', () {
      expect(currentMonthKey(_now), '2026-10');
      expect(currentMonthKey(_now, salaryDay: 1), '2026-10');
    });

    test('before payday, today belongs to last month\'s cycle', () {
      expect(currentMonthKey(_now, salaryDay: 25), '2026-09');
      expect(currentMonthKey(_now, salaryDay: 19), '2026-10');
      expect(currentMonthKey(DateTime(2026, 1, 3), salaryDay: 5), '2025-12');
    });

    test('a payday past the month\'s last day falls on that last day', () {
      expect(currentMonthKey(DateTime(2026, 2, 28), salaryDay: 31), '2026-02');
    });
  });

  group('reading the API', () {
    test('amounts arrive as numbers or as decimal strings', () {
      expect(readAmount('185.00'), 185);
      expect(readAmount(96), 96);
      expect(readAmount(null), isNull);
    });

    test('a refund keeps its direction, a person needs both parts', () {
      final refund = ParsedItem.fromJson({
        'amount': 600,
        'type': 'expense',
        'category': 'سفر',
        'direction': 'incoming',
        'person_mentioned': 'ابني',
      });
      expect(refund.directionToSave, 'incoming');
      expect(refund.personToSave, isEmpty);
      expect(
        ParsedItem.fromJson({
          'amount': 1,
          'type': 'transfer',
          'category': 'تحويل',
          'direction': 'sideways',
        }).directionToSave,
        isNull,
      );
    });

    test('an entry is called by its description, else what it was', () {
      expect(
        LedgerEntry.fromJson(_entry(1, '50', 'أكل وشرب')).title,
        'أكل وشرب',
      );
      expect(
        LedgerEntry.fromJson(
          _entry(2, '50', 'مواصلات', subCategory: 'أوبر/كريم'),
        ).title,
        'أوبر/كريم',
      );
      expect(
        LedgerEntry.fromJson(
          _entry(3, '50', 'أكل وشرب', description: 'Talabat'),
        ).title,
        'Talabat',
      );
    });
  });

  group('saving', () {
    test('one item goes through expense.create, with a request id', () async {
      final api = FakeApi()..answer('expense.create', (_) => {'id': 77});
      final ledger = LedgerApi(
        TrpcClient(baseUri: Uri.parse('http://test'), httpClient: api.client),
      );

      final ids = await ledger.save(
        [ParsedItem.fromJson(_item(185, 'أكل وشرب'))],
        rawText: 'طلبات 185',
        classificationLogId: 901,
      );

      expect(ids, [77]);
      final input = api.lastInput('expense.create')! as Map<String, Object?>;
      expect(input['source'], 'ai_parsed');
      expect(input['rawText'], 'طلبات 185');
      expect(input['classificationLogId'], 901);
      expect((input['clientRequestId']! as String).length, 32);
    });

    test(
      'several go through expense.batchCreate, numbered from one request',
      () async {
        final api = FakeApi()
          ..answer(
            'expense.batchCreate',
            (_) => {
              'ids': [5, 6],
            },
          );
        final ledger = LedgerApi(
          TrpcClient(baseUri: Uri.parse('http://test'), httpClient: api.client),
        );

        final ids = await ledger.save([
          ParsedItem.fromJson(_item(50, 'أكل وشرب')),
          ParsedItem.fromJson(_item(120, 'مواصلات')),
        ], rawText: 'قهوة 50 وأوبر 120');

        expect(ids, [5, 6]);
        final input = api.lastInput('expense.batchCreate')! as List<Object?>;
        final first = (input[0]! as Map)['clientRequestId'] as String;
        final second = (input[1]! as Map)['clientRequestId'] as String;
        expect(first.endsWith(':0'), isTrue);
        expect(second, '${first.substring(0, first.length - 2)}:1');
      },
    );
  });

  group('the record tab', () {
    testWidgets('shows the month and the latest transactions by day', (
      tester,
    ) async {
      await withClock(Clock.fixed(_now), () async {
        final api = FakeApi()
          ..answer(
            'expense.getMonthSummary',
            (_) => {
              'totalIncome': '15000.00',
              'totalExpense': '4250.50',
              'count': 12,
            },
          )
          ..answer(
            'expense.list',
            (_) => {
              'items': [
                _entry(3, '185.00', 'أكل وشرب', description: 'Talabat'),
                _entry(
                  2,
                  '15000.00',
                  'مرتب',
                  type: 'income',
                  date: DateTime(2026, 10, 18, 9),
                ),
              ],
              'total': 2,
            },
          );
        await _signedIn(tester, api);

        expect(find.text('صرفت في أكتوبر'), findsOneWidget);
        expect(find.text('\u20664,251\u2069 ج.م'), findsOneWidget);
        expect(find.text('12 عملية'), findsOneWidget);
        expect(find.text('النهارده'), findsOneWidget);
        expect(find.text('امبارح'), findsOneWidget);
        expect(find.text('\u2066Talabat\u2069'), findsOneWidget);
        expect(find.text('\u2066+15,000\u2069 ج.م'), findsWidgets);
      });
    });

    testWidgets('a sentence the server is sure of is saved and can be undone', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => _parsed('auto_save', [_item(185, 'أكل وشرب')]),
        )
        ..answer('expense.create', (_) => {'id': 77})
        ..answer('expense.delete', (_) => {'success': true});
      await _signedIn(tester, api);

      await _send(tester, 'طلبات 185');

      expect(find.text('اتحفظت لوحدها: 185 ج.م · أكل وشرب'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        isEmpty,
      );

      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();
      expect(api.lastInput('expense.delete'), {'id': 77});
      expect(find.text('اترجعت.'), findsOneWidget);
    });

    testWidgets('a sentence to review is saved only after the person agrees', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => _parsed('review', [
            _item(50, 'أكل وشرب', sub: 'قهوة وكافيه'),
            _item(120, 'مواصلات', sub: 'أوبر/كريم'),
          ]),
        )
        ..answer(
          'expense.batchCreate',
          (_) => {
            'ids': [5, 6],
          },
        );
      await _signedIn(tester, api);

      await _send(tester, 'قهوة 50 وأوبر 120');

      expect(find.text('راجع قبل ما نحفظ'), findsOneWidget);
      expect(api.paths, isNot(contains('expense.batchCreate')));

      await tester.tap(find.text('احفظ'));
      await tester.pumpAndSettle();

      expect(api.paths, contains('expense.batchCreate'));
      expect(find.text('اتحفظت: عمليتين · 170 ج.م'), findsOneWidget);
    });

    testWidgets('editing instead of saving keeps the sentence', (tester) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => _parsed('review', [_item(50, 'أكل وشرب')]),
        );
      await _signedIn(tester, api);

      await _send(tester, 'قهوة 50');
      await tester.tap(find.text('عدّل الجملة'));
      await tester.pumpAndSettle();

      expect(api.paths, isNot(contains('expense.create')));
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'قهوة 50',
      );
    });

    testWidgets('a question is answered and the sentence saved', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => _parsed(
            'clarify',
            [],
            question: 'مين محمد؟',
            clarificationId: 31,
          ),
        )
        ..answer(
          'expense.answerClarification',
          (_) => {
            'success': true,
            'needsClarification': false,
            'saved': [
              {
                'id': 88,
                'amount': 500,
                'category': 'تحويل',
                'subCategory': 'سلفة',
                'type': 'transfer',
              },
            ],
          },
        );
      await _signedIn(tester, api);

      await _send(tester, 'سلفت محمد 500');
      expect(find.text('مين محمد؟'), findsOneWidget);

      await tester.enterText(find.byType(TextField).last, 'صاحبي');
      await tester.tap(find.text('ابعت الرد'));
      await tester.pumpAndSettle();

      expect(api.lastInput('expense.answerClarification'), {
        'clarificationId': 31,
        'answer': 'صاحبي',
      });
      expect(find.text('اتحفظت: 500 ج.م · تحويل/سلفة'), findsOneWidget);
    });

    testWidgets('a refusal from the server is shown and the sentence kept', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => throw const TrpcFailure(
            'TOO_MANY_REQUESTS',
            429,
            'خلصت تسجيلات النهارده. ترجع بكرة الساعة 12.',
          ),
        );
      await _signedIn(tester, api);

      await _send(tester, 'قهوة 50');

      expect(
        find.text('خلصت تسجيلات النهارده. ترجع بكرة الساعة 12.'),
        findsOneWidget,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'قهوة 50',
      );
    });
  });

  group('the full list', () {
    testWidgets('a swiped row can be brought back before it is deleted', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'expense.list',
          (_) => {
            'items': [_entry(3, '185.00', 'أكل وشرب', description: 'Talabat')],
            'total': 1,
          },
        )
        ..answer('expense.delete', (_) => {'success': true});
      final app = await _signedIn(tester, api);
      app.container.read(routerProvider).go(TransactionsScreen.path);
      await tester.pumpAndSettle();
      expect(find.text('كل العمليات'), findsOneWidget);

      await tester.drag(find.text('\u2066Talabat\u2069'), const Offset(500, 0));
      await tester.pumpAndSettle();
      expect(find.text('\u2066Talabat\u2069'), findsNothing);

      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();
      expect(find.text('\u2066Talabat\u2069'), findsOneWidget);
      expect(api.paths, isNot(contains('expense.delete')));
    });

    testWidgets('a swiped row is deleted once its notice closes', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'expense.list',
          (_) => {
            'items': [_entry(3, '185.00', 'أكل وشرب', description: 'Talabat')],
            'total': 1,
          },
        )
        ..answer('expense.delete', (_) => {'success': true});
      final app = await _signedIn(tester, api);
      app.container.read(routerProvider).go(TransactionsScreen.path);
      await tester.pumpAndSettle();

      await tester.drag(find.text('\u2066Talabat\u2069'), const Offset(500, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close).last);
      await tester.pumpAndSettle();

      expect(api.lastInput('expense.delete'), {'id': 3});
    });
  });
}
