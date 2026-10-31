import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
  testWidgets('shows debounced category hint while typing with digits', (tester) async {
    final api = FakeApi();

    await _openApp(tester, api: api);

    api.answer('expense.previewCategory', (input) {
      final text = (input as Map<String, Object?>)['text'] as String?;
      if (text != null && text.contains('قهوة')) {
        return {
          'amount': 45,
          'category': 'أكل وشرب',
          'subCategory': 'كافيهات',
          'itemCount': 1,
        };
      }
      return null;
    });

    await tester.pumpAndSettle();

    final inputFinder = find.byType(TextField);
    expect(inputFinder, findsOneWidget);

    // Type text with digits: 'قهوة 45'
    await tester.enterText(inputFinder, 'قهوة 45');

    // Before debounce (e.g. 200ms), hint should not appear yet
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const Key('category-hint')), findsNothing);

    // After debounce (450ms total), hint appears
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('category-hint')), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('category-hint')),
        matching: find.textContaining('كافيهات'),
      ),
      findsOneWidget,
    );

    // Verify it is wrapped in ExcludeSemantics so screen reader is not spammed on keystrokes
    final excludeSemanticsFinder = find.ancestor(
      of: find.byKey(const Key('category-hint')),
      matching: find.byType(ExcludeSemantics),
    );
    expect(excludeSemanticsFinder, findsOneWidget);
  });

  testWidgets('hides hint when offline or when input has no digits', (tester) async {
    final api = FakeApi();

    await _openApp(tester, api: api);

    api.answer('expense.previewCategory', (input) {
      return {
        'amount': 100,
        'category': 'سوبرماركت',
        'subCategory': 'عام',
        'itemCount': 1,
      };
    });

    await tester.pumpAndSettle();

    final inputFinder = find.byType(TextField);

    // Type text without digits: 'سوبرماركت' -> no hint
    await tester.enterText(inputFinder, 'سوبرماركت');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('category-hint')), findsNothing);

    // Turn offline
    api.offline = true;

    // Type text with digits: 'سوبرماركت 100' -> offline prevents hint query/display
    await tester.enterText(inputFinder, 'سوبرماركت 100');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('category-hint')), findsNothing);
  });
}
