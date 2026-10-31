import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/record_composer.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

void main() {
  testWidgets('shows mic and send buttons in composer', (tester) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);

    expect(find.byType(RecordComposer), findsOneWidget);
    expect(find.byKey(const Key('voice-mic-button')), findsOneWidget);
    expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
    expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
  });

  testWidgets('long press on mic starts recording and cancel button discards', (
    tester,
  ) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);

    // Long press starts recording (> 500ms for kLongPressTimeout)
    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const Key('voice-mic-button'))),
    );
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(seconds: 1));

    // Shows recording bar
    expect(find.byType(VoiceLevelMeter), findsOneWidget);
    expect(find.text('اسحب للإلغاء'), findsOneWidget);
    expect(find.byKey(const Key('voice-cancel-button')), findsOneWidget);

    // Tap cancel button
    await tester.tap(find.byKey(const Key('voice-cancel-button')));
    await gesture.up();
    await tester.pumpAndSettle();

    // Restores normal composer
    expect(find.byType(VoiceLevelMeter), findsNothing);
    expect(find.byKey(const Key('voice-mic-button')), findsOneWidget);
  });

  testWidgets(
    'recording voice parses and auto-saves transaction with undo toast',
    (tester) async {
      final fakeApi = FakeApi();
      fakeApi.answer('localAuth.me', (_) => phoneUser());
      answerSampleMonth(fakeApi);

      fakeApi.answer('ai.parseVoiceExpense', (input) {
        return {
          'text': 'دفعت 150 سوبرماركت',
          'decision': 'auto_save',
          'overallConfidence': 0.95,
          'classificationLogId': 789,
          'items': [
            {
              'amount': 150,
              'type': 'expense',
              'category': 'أكل وشرب',
              'subCategory': 'سوبرماركت',
              'description': 'سوبرماركت',
              'currency': 'EGP',
            },
          ],
        };
      });

      fakeApi.answer('expense.create', (input) {
        return {'id': 101};
      });

      final app = TestApp(token: 'stored-token', api: fakeApi);
      await app.pump(tester);

      // Start recording via gesture
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const Key('voice-mic-button'))),
      );
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump(const Duration(seconds: 2));

      // Releasing the hold completes and processes the recording
      await gesture.up();
      await tester.pump();
      await tester.pumpAndSettle();

      // Verifies parseVoiceExpense was called
      expect(fakeApi.paths, contains('ai.parseVoiceExpense'));
      expect(fakeApi.paths, contains('expense.create'));

      // Verifies undo toast was announced
      expect(find.textContaining('150'), findsOneWidget);
      expect(find.text('تراجع'), findsOneWidget);
    },
  );

  testWidgets(
    'tap-to-record accessibility mode allows single tap recording (Rule 12.2)',
    (tester) async {
      final fakeApi = FakeApi();
      fakeApi.answer('localAuth.me', (_) => phoneUser());
      answerSampleMonth(fakeApi);
      final app = TestApp(token: 'stored-token', api: fakeApi);
      await app.pump(tester);

      // Initially in hold mode. Toggle to tap-to-record mode via suffix icon
      expect(find.byIcon(Icons.gesture_rounded), findsOneWidget);
      await tester.tap(find.byIcon(Icons.gesture_rounded));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.touch_app_rounded), findsOneWidget);

      // Single tap on mic starts recording
      await tester.tap(find.byKey(const Key('voice-mic-button')));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(VoiceLevelMeter), findsOneWidget);
      expect(find.byKey(const Key('voice-stop-button')), findsOneWidget);

      // Tap cancel button stops it
      await tester.tap(find.byKey(const Key('voice-cancel-button')));
      await tester.pumpAndSettle();
      expect(find.byType(VoiceLevelMeter), findsNothing);
    },
  );

  testWidgets('voice quota limit trigger displays UpgradePromptSheet', (
    tester,
  ) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);

    // Backend refuses with quota limit
    fakeApi.answer('ai.parseVoiceExpense', (input) {
      throw const TrpcFailure(
        'FORBIDDEN',
        403,
        'استهلكت كل ثواني الصوت لهذا الشهر',
      );
    });

    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);

    // Start and complete recording
    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const Key('voice-mic-button'))),
    );
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(seconds: 2));
    await gesture.up();
    await tester.pump();
    await tester.pumpAndSettle();

    // Verify upgrade prompt sheet opened
    expect(find.byType(UpgradePromptSheet), findsOneWidget);
    expect(find.text('تسجيل صوتي بلا حدود مع برو'), findsOneWidget);
    expect(find.textContaining('استهلكت كل ثواني الصوت'), findsOneWidget);
  });
}
