import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
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
      expect(
        fakeApi.lastInput('expense.create'),
        containsPair('source', 'voice'),
      );

      // Verifies undo toast was announced
      expect(find.textContaining('150'), findsOneWidget);
      expect(find.text('تراجع'), findsOneWidget);
    },
  );

  testWidgets('a voice question with no items can be answered after restart', (
    tester,
  ) async {
    final fakeApi = FakeApi()
      ..answer('localAuth.me', (_) => phoneUser())
      ..answer(
        'ai.parseVoiceExpense',
        (_) => {
          'text': 'دفعت الكهربا',
          'decision': 'clarify',
          'items': <Object?>[],
          'clarificationQuestion': 'دفعت كام؟',
          'clarificationId': 32,
        },
      )
      ..answer(
        'expense.answerClarification',
        (_) => {
          'success': true,
          'saved': [
            {'id': 88, 'amount': 500, 'category': 'فواتير', 'type': 'expense'},
          ],
        },
      );
    answerSampleMonth(fakeApi);
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);
    await _recordVoice(tester);

    expect(find.text('دفعت كام؟'), findsOneWidget);
    await tester.tap(find.text('بعدين'));
    await tester.pumpAndSettle();
    final saved = app.ledgerStore.ledger.toJson();
    expect(saved.toString(), isNot(contains('دفعت الكهربا')));
    expect(app.ledgerStore.ledger.outbox.single.state, OutboxState.needsYou);

    await tester.pumpWidget(const SizedBox.shrink());
    final restarted = TestApp(token: 'stored-token', api: fakeApi);
    restarted.ledgerStore.ledger = StoredLedger.fromJson(saved);
    await restarted.pump(tester);
    await tester.tap(find.text('محتاجة رد منك'));
    await tester.pumpAndSettle();
    expect(find.text('دفعت كام؟'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, '500');
    await tester.tap(find.text('ابعت الرد'));
    await tester.pumpAndSettle();

    expect(fakeApi.lastInput('expense.answerClarification'), {
      'clarificationId': 32,
      'answer': '500',
    });
    expect(restarted.ledgerStore.ledger.outbox, isEmpty);
  });

  testWidgets('voice partial booking survives a lost reply and restart', (
    tester,
  ) async {
    var attempts = 0;
    final fakeApi = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    fakeApi
      ..answer(
        'ai.parseVoiceExpense',
        (_) => {
          'text': 'دفعت 150 سوبرماركت ودفعت الكهربا',
          'decision': 'review',
          'classificationLogId': 789,
          'partialReady': true,
          'items': [
            {'amount': 150, 'type': 'expense', 'category': 'أكل وشرب'},
          ],
        },
      )
      ..answer('expense.commitPartialReading', (_) {
        if (++attempts == 1) throw http.ClientException('Lost reply');
        return {
          'savedIds': [101],
          'questions': [
            {'id': 32, 'question': 'الكهربا كانت بكام؟'},
          ],
        };
      })
      ..answer('expense.getPendingClarifications', (_) {
        if (attempts < 2) return <Object?>[];
        return [
          {'id': 32, 'question': 'الكهربا كانت بكام؟'},
        ];
      });
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);
    await _recordVoice(tester);

    expect(
      fakeApi.lastInput('ai.parseVoiceExpense'),
      containsPair('partialBooking', true),
    );
    final stored = app.ledgerStore.ledger.toJson();
    expect(
      stored.toString(),
      isNot(contains('دفعت 150 سوبرماركت ودفعت الكهربا')),
    );
    expect(
      app.ledgerStore.ledger.outbox.single.parse?.classificationLogId,
      789,
    );
    expect(app.ledgerStore.ledger.outbox.single.state, OutboxState.queued);

    await tester.pumpWidget(const SizedBox.shrink());
    final restarted = TestApp(token: 'stored-token', api: fakeApi);
    restarted.ledgerStore.ledger = StoredLedger.fromJson(stored);
    await restarted.pump(tester);

    expect(restarted.ledgerStore.ledger.outbox, isEmpty);
    expect(
      fakeApi.paths.where((path) => path == 'ai.parseVoiceExpense'),
      hasLength(1),
    );
    expect(
      fakeApi.calls
          .where((call) => call.path == 'expense.commitPartialReading')
          .map((call) => call.input),
      [
        {'classificationLogId': 789},
        {'classificationLogId': 789},
      ],
    );
    expect(
      find.byKey(const ValueKey('pending-clarification-32')),
      findsOneWidget,
    );
  });

  testWidgets('voice review survives a failed save with the same request id', (
    tester,
  ) async {
    var unavailable = true;
    final fakeApi = FakeApi()
      ..answer('localAuth.me', (_) => phoneUser())
      ..answer(
        'ai.parseVoiceExpense',
        (_) => {
          'decision': 'review',
          'classificationLogId': 789,
          'items': [
            {'amount': 150, 'type': 'expense', 'category': 'أكل وشرب'},
          ],
        },
      )
      ..answer('expense.create', (_) {
        if (unavailable) {
          throw const TrpcFailure('SERVICE_UNAVAILABLE', 503, 'جرّب تاني');
        }
        return {'id': 101};
      });
    answerSampleMonth(fakeApi);
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);
    await _recordVoice(tester);
    await tester.tap(find.text('احفظ'));
    await tester.pumpAndSettle();

    final pending = app.ledgerStore.ledger.outbox.single;
    expect(pending.state, OutboxState.needsYou);
    expect(
      fakeApi.lastInput('expense.create'),
      containsPair('clientRequestId', pending.id),
    );
    expect(find.text('جرّب تاني'), findsOneWidget);

    unavailable = false;
    await tester.tap(find.text('محتاجة مراجعة منك'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('احفظ'));
    await tester.pumpAndSettle();

    expect(
      fakeApi.lastInput('expense.create'),
      containsPair('clientRequestId', pending.id),
    );
    expect(
      fakeApi.paths.where((path) => path == 'ai.parseVoiceExpense'),
      hasLength(1),
    );
    expect(app.ledgerStore.ledger.outbox, isEmpty);
  });

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

Future<void> _recordVoice(WidgetTester tester) async {
  final gesture = await tester.startGesture(
    tester.getCenter(find.byKey(const Key('voice-mic-button'))),
  );
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(seconds: 2));
  await gesture.up();
  await tester.pump();
  await tester.pumpAndSettle();
}
