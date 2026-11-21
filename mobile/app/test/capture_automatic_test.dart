import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';

import 'support/test_app.dart';

FakeApi _api() {
  var answered = false;
  return FakeApi()
    ..answer('localAuth.me', (_) => phoneUser())
    ..answer(
      'capture.status',
      (_) => {
        'enabled': true,
        'mode': 'automatic',
        'questionsEnabled': true,
        'consent': {'capture': true, 'aiReading': true},
        'consentTextVersion': '2026-11-04',
      },
    )
    ..answer(
      'capture.activity',
      (_) => [
        {
          'key': 'event:3',
          'state': 'recorded',
          'eventId': 3,
          'expenseId': 12,
          'amountEgp': 100.25,
          'canUndo': true,
        },
      ],
    )
    ..answer(
      'capture.nextQuestion',
      (_) => answered
          ? null
          : {
              'questionId': 7,
              'expenseId': 12,
              'title': 'Synthetic payment',
              'amountEgp': 100.25,
              'feeEgp': 0,
              'direction': 'out',
              'categories': [
                {
                  'id': 'food',
                  'name': 'أكل وشرب',
                  'subcategories': [
                    {'id': 'general_food', 'name': 'عام'},
                  ],
                },
              ],
            },
    )
    ..answer('capture.answerQuestion', (_) {
      answered = true;
      return {'result': 'skipped', 'expenseId': 12};
    })
    ..answer('expense.list', (_) => {'items': <Object?>[], 'total': 0})
    ..answer(
      'expense.getMonthSummary',
      (_) => {'totalIncome': 0, 'totalExpense': 100.25, 'count': 1},
    );
}

void main() {
  testWidgets(
    'shows an optional question after save, keeps piastres and skipping sends no new ledger save',
    (tester) async {
      final api = _api();
      final app = TestApp(token: 'synthetic-session', api: api);
      await app.pump(tester);
      expect(find.text('اختياري. العملية اتسجلت بالفعل.'), findsOneWidget);
      expect(find.textContaining('100.25'), findsWidgets);
      await tester.ensureVisible(find.text('تخطي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تخطي'));
      await tester.pumpAndSettle();
      expect(api.lastInput('capture.answerQuestion'), {
        'questionId': 7,
        'action': 'skip',
      });
      expect(api.paths, isNot(contains('expense.create')));
      expect(api.paths, isNot(contains('expense.batchCreate')));
      expect(find.text('اختياري. العملية اتسجلت بالفعل.'), findsNothing);
    },
  );
  testWidgets(
    'a displayed purpose question is disabled offline at large text scale',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final app = TestApp(token: 'synthetic-session', api: _api());
      await app.pump(tester);
      app.container.read(networkStatusProvider.notifier).unreachable();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('تخطي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تخطي'), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(app.api.paths, isNot(contains('capture.answerQuestion')));
    },
  );
}
