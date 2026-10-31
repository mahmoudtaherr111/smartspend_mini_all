import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/ledger/offline/offline_rules.dart';
import 'package:smartspend_app/src/features/ledger/offline/outbox.dart';

import 'support/test_app.dart';

Map<String, Object?> _parsed(
  String decision,
  List<Map<String, Object?>> items,
) => {'decision': decision, 'items': items, 'classificationLogId': 901};

Map<String, Object?> _item(num amount, String category) => {
  'amount': amount,
  'type': 'expense',
  'category': category,
  'subCategory': 'عام',
  'description': category,
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
  group('what may wait offline (the web\'s rules)', () {
    test('a sentence with an amount', () {
      expect(checkOfflineSentence('قهوة 50'), isNull);
      expect(checkOfflineSentence('دفعت خمسين مواصلات'), isNull);
      expect(checkOfflineSentence('دفعت الفاتورة'), isNull);
    });

    test('not a short, unreadable or amountless one', () {
      expect(checkOfflineSentence('اكل'), OfflineRefusal.tooShort);
      expect(checkOfflineSentence('ههههههه aaaaaa'), OfflineRefusal.unreadable);
      expect(
        checkOfflineSentence('روحت السوبر ماركت'),
        OfflineRefusal.noAmount,
      );
    });
  });

  group('the store on disk', () {
    late Directory folder;

    setUp(() async => folder = await Directory.systemTemp.createTemp('ledger'));
    tearDown(() async => folder.delete(recursive: true));

    test(
      'keeps the outbox across restarts, in the order it was written',
      () async {
        final store = FileLedgerStore(() async => folder);
        await store.write(
          StoredLedger(
            accountKey: 'phone:42',
            outbox: [
              OutboxItem(
                id: 'a',
                text: 'قهوة 50',
                createdAt: DateTime(2026, 10, 19, 9),
              ),
              OutboxItem(
                id: 'b',
                text: 'أوبر 120',
                createdAt: DateTime(2026, 10, 19, 10),
                // Caught mid-send when the app closed: sent again.
                state: OutboxState.sending,
              ),
            ],
          ),
        );

        final read = await FileLedgerStore(() async => folder).read();
        expect(read.accountKey, 'phone:42');
        expect([for (final item in read.outbox) item.id], ['a', 'b']);
        expect(read.outbox.last.state, OutboxState.queued);
      },
    );

    test('an unreadable file counts as empty', () async {
      await File('${folder.path}${Platform.pathSeparator}ledger.json')
          .writeAsString('{not json');
      expect(
        (await FileLedgerStore(() async => folder).read()).outbox,
        isEmpty,
      );
    });
  });

  group('recording without internet', () {
    testWidgets(
      'a sentence is kept, shown at once, and saved when the internet returns',
      (tester) async {
        final api = FakeApi()
          ..answer(
            'ai.parseExpense',
            (_) => _parsed('auto_save', [_item(50, 'أكل وشرب')]),
          )
          ..answer('expense.create', (_) => {'id': 77});
        final app = await _signedIn(tester, api);

        api.offline = true;
        await _send(tester, 'قهوة 50');

        expect(
          find.text('النت فاصل. حفظناها هنا وهنبعتها أول ما يرجع.'),
          findsOneWidget,
        );
        expect(find.text('لسه ماتسجّلتش'), findsOneWidget);
        expect(find.text('قهوة 50'), findsOneWidget);
        expect(find.text('مستنية النت'), findsOneWidget);
        expect(
          find.text('النت فاصل. اللي بتسجّله بيتحفظ هنا وهيتبعت لما يرجع.'),
          findsOneWidget,
        );
        expect(app.ledgerStore.ledger.outbox, hasLength(1));
        final requestId = app.ledgerStore.ledger.outbox.single.id;

        api.offline = false;
        app.connection.add(true);
        await tester.pumpAndSettle();

        expect(app.ledgerStore.ledger.outbox, isEmpty);
        expect(find.text('لسه ماتسجّلتش'), findsNothing);
        final saved = api.lastInput('expense.create')! as Map<String, Object?>;
        // The save carries the sentence's own id, so a retry after a lost answer is stored once.
        expect(saved['clientRequestId'], requestId);
        expect(
          find.text('النت فاصل. اللي بتسجّله بيتحفظ هنا وهيتبعت لما يرجع.'),
          findsNothing,
        );
      },
    );

    testWidgets('sentences are sent in the order they were written', (
      tester,
    ) async {
      final read = <String>[];
      final api = FakeApi()
        ..answer('ai.parseExpense', (input) {
          read.add((input! as Map)['text'] as String);
          return _parsed('auto_save', [_item(10, 'أكل وشرب')]);
        })
        ..answer('expense.create', (_) => {'id': read.length});
      final app = await _signedIn(tester, api);

      api.offline = true;
      await _send(tester, 'قهوة 50');
      await _send(tester, 'أوبر 120');
      api.offline = false;
      app.connection.add(true);
      await tester.pumpAndSettle();

      expect(read, ['قهوة 50', 'أوبر 120']);
    });

    testWidgets(
      'a sentence sent while older ones are still going out waits its turn, and is read once, for its writer',
      (tester) async {
        final api = FakeApi()
          ..answer(
            'ai.parseExpense',
            (input) => (input! as Map)['text'] == 'أوبر 120'
                ? _parsed('auto_save', [_item(120, 'مواصلات')])
                : _parsed('review', [_item(50, 'أكل وشرب')]),
          )
          ..answer('expense.create', (_) => {'id': 5})
          ..answer('localAuth.me', (_) => phoneUser())
          ..offline = true;
        final app = TestApp(token: 'session-token', api: api);
        app.ledgerStore.ledger = StoredLedger(
          accountKey: 'phone:42',
          outbox: [
            OutboxItem(
              id: 'older',
              text: 'أوبر 120',
              createdAt: DateTime(2026, 10, 19, 9),
            ),
          ],
        );
        await app.pump(tester);

        // The network returns, and the older sentence starts going out on a slow line.
        api.offline = false;
        final slow = api.hold('ai.parseExpense');
        app.connection.add(true);
        await tester.pump();
        // Sent while that one is held; no settling, which would let the slow call time out.
        await tester.enterText(find.byType(TextField), 'قهوة 50');
        await tester.tap(find.byTooltip('ابعت'));
        await tester.pump();
        slow.complete();
        await tester.pumpAndSettle();

        final reads = [
          for (final call in api.calls)
            if (call.path == 'ai.parseExpense') (call.input! as Map)['text'],
        ];
        expect(reads, ['أوبر 120', 'قهوة 50']);
        // Read after the older sentence was saved, not alongside it.
        expect(
          api.paths.indexOf('expense.create'),
          lessThan(api.paths.lastIndexOf('ai.parseExpense')),
        );
        // The person who wrote it reviews it now, instead of finding it in the waiting list later.
        expect(find.text('احفظ'), findsOneWidget);
      },
    );

    testWidgets('a sentence without an amount is not kept offline', (
      tester,
    ) async {
      final api = FakeApi();
      final app = await _signedIn(tester, api);

      api.offline = true;
      await _send(tester, 'روحت السوبر ماركت');

      expect(find.textContaining('مش لاقيين مبلغ في الجملة'), findsOneWidget);
      expect(app.ledgerStore.ledger.outbox, isEmpty);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'روحت السوبر ماركت',
      );
    });

    testWidgets('the outbox holds no more than the plan allows', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.getUserLimits',
          (_) => {
            'offline': {'limit': 2},
          },
        );
      final app = await _signedIn(tester, api);

      api.offline = true;
      await _send(tester, 'قهوة 50');
      await _send(tester, 'أوبر 120');
      await _send(tester, 'عيش 10 جنيه');

      expect(app.ledgerStore.ledger.outbox, hasLength(2));
      expect(
        find.textContaining('قايمة الأوفلاين مليانة (عمليتين في باقتك)'),
        findsOneWidget,
      );
    });

    testWidgets('a sentence read later for review waits for the person', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'ai.parseExpense',
          (_) => _parsed('review', [_item(50, 'أكل وشرب')]),
        )
        ..answer('expense.create', (_) => {'id': 9});
      final app = await _signedIn(tester, api);

      api.offline = true;
      await _send(tester, 'قهوة 50');
      api.offline = false;
      app.connection.add(true);
      await tester.pumpAndSettle();

      expect(find.text('محتاجة مراجعة منك'), findsOneWidget);
      expect(api.paths, isNot(contains('expense.create')));

      await tester.tap(find.text('قهوة 50'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('احفظ'));
      await tester.pumpAndSettle();

      expect(api.paths, contains('expense.create'));
      expect(app.ledgerStore.ledger.outbox, isEmpty);
      expect(find.text('اتحفظت: 50 ج.م · أكل وشرب'), findsOneWidget);
    });

    testWidgets('the last month and transactions seen stay on screen offline', (
      tester,
    ) async {
      final api = FakeApi()
        ..answer(
          'expense.getMonthSummary',
          (_) => {'totalIncome': 0, 'totalExpense': '4250.50', 'count': 12},
        );
      final app = await _signedIn(tester, api);
      expect(find.text('\u20664,251\u2069 ج.م'), findsOneWidget);

      api.offline = true;
      app.container.invalidate(outboxProvider);
      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pumpAndSettle();

      expect(find.text('\u20664,251\u2069 ج.م'), findsOneWidget);
      expect(
        find.text('النت فاصل. اللي بتسجّله بيتحفظ هنا وهيتبعت لما يرجع.'),
        findsOneWidget,
      );
    });
  });

  group('whose outbox it is', () {
    testWidgets('signing out empties it', (tester) async {
      final api = FakeApi();
      final app = await _signedIn(tester, api);
      api.offline = true;
      await _send(tester, 'قهوة 50');
      expect(app.ledgerStore.ledger.outbox, hasLength(1));

      api.offline = false;
      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();
      if (find.text('اخرج على أي حال').evaluate().isNotEmpty) {
        await tester.tap(find.text('اخرج على أي حال'));
        await tester.pumpAndSettle();
      }

      expect(app.ledgerStore.ledger.outbox, isEmpty);
    });

    testWidgets('another account never sends the previous one\'s sentences', (
      tester,
    ) async {
      final api = FakeApi()..answer('expense.create', (_) => {'id': 1});
      final app = TestApp(token: 'session-token', api: api);
      api.answer('localAuth.me', (_) => phoneUser());
      app.ledgerStore.ledger = StoredLedger(
        accountKey: 'phone:7',
        outbox: [
          OutboxItem(
            id: 'x',
            text: 'قهوة 50',
            createdAt: DateTime(2026, 10, 19),
          ),
        ],
      );
      await app.pump(tester);

      expect(app.ledgerStore.ledger.outbox, isEmpty);
      expect(app.ledgerStore.ledger.accountKey, 'phone:42');
      expect(api.paths, isNot(contains('ai.parseExpense')));
    });
  });
}
