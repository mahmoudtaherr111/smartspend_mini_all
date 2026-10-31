// Pending clarifications card (REC-09, GAP-01): ambiguous transactions waiting for AI clarification,
// immediate inline reply, and dismiss-with-undo.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/pending_questions_card.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openApp(WidgetTester tester, FakeApi api) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  return app;
}

Map<String, Object?> _sampleClarification({
  int id = 101,
  String text = 'دفعت 200 جنيه لمحمد',
  String question = 'الـ 200 دي سلفة ولا هدية؟',
}) => {
  'id': id,
  'originalText': text,
  'question': question,
  'createdAt': DateTime.now().toUtc().toIso8601String(),
};

void main() {
  testWidgets('hidden completely when no pending questions wait on server', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('expense.getPendingClarifications', (_) => <Object?>[]);

    await _openApp(tester, api);

    expect(find.text('محتاج ردّك'), findsNothing);
    expect(find.byType(PendingQuestionsCard), findsOneWidget);
    // When empty, it renders SizedBox.shrink
    expect(find.text('جمل وقفت عند سؤال ولسه ماتسجّلتش.'), findsNothing);
  });

  testWidgets('renders card when pending questions wait on server', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer(
      'expense.getPendingClarifications',
      (_) => [_sampleClarification()],
    );

    await _openApp(tester, api);

    expect(find.text('محتاج ردّك (1)'), findsOneWidget);
    expect(find.text('جمل وقفت عند سؤال ولسه ماتسجّلتش.'), findsOneWidget);
    expect(find.text('«دفعت 200 جنيه لمحمد»'), findsOneWidget);
    expect(find.text('الـ 200 دي سلفة ولا هدية؟'), findsOneWidget);
    expect(find.text('رد'), findsOneWidget);
    expect(find.text('شيلها'), findsOneWidget);
  });

  testWidgets('replying sends answer to server and clears question on save', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer(
      'expense.getPendingClarifications',
      (_) => [_sampleClarification()],
    );

    int answeredId = 0;
    String answeredText = '';
    api.answer('expense.answerClarification', (input) {
      if (input is Map) {
        answeredId = input['clarificationId'] as int? ?? 0;
        answeredText = input['answer'] as String? ?? '';
      }
      return {
        'success': true,
        'saved': [
          {
            'id': 102,
            'amount': 200,
            'type': 'expense',
            'category': 'هدايا وتبرعات',
            'subCategory': 'هدية',
            'description': 'هدية لمحمد',
          },
        ],
      };
    });

    await _openApp(tester, api);

    await tester.enterText(find.widgetWithText(TextField, 'ردّك'), 'هدية');
    await tester.tap(find.text('رد'));
    await tester.pumpAndSettle();

    expect(answeredId, 101);
    expect(answeredText, 'هدية');
    // Notice shown for saved item
    expect(find.text('تراجع'), findsOneWidget);
  });

  testWidgets('dismissing hides question with undo, restoring on undo', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer(
      'expense.getPendingClarifications',
      (_) => [_sampleClarification()],
    );

    var dismissed = false;
    api.answer('expense.dismissClarification', (_) {
      dismissed = true;
      return {'success': true};
    });

    await _openApp(tester, api);

    expect(find.text('الـ 200 دي سلفة ولا هدية؟'), findsOneWidget);

    // Tap dismiss
    await tester.tap(find.text('شيلها'));
    await tester.pumpAndSettle();

    // Optimistically hidden
    expect(find.text('الـ 200 دي سلفة ولا هدية؟'), findsNothing);
    expect(find.text('اتشال السؤال.'), findsOneWidget);
    expect(find.text('تراجع'), findsOneWidget);

    // Tap undo
    await tester.tap(find.text('تراجع'));
    await tester.pumpAndSettle();

    // Restored back on screen
    expect(find.text('الـ 200 دي سلفة ولا هدية؟'), findsOneWidget);
    expect(dismissed, isFalse);
  });
}
