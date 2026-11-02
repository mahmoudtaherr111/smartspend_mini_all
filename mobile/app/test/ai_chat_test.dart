import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/src/internals.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/ai/ai_action_card.dart';
import 'package:smartspend_app/src/features/ai/ai_api.dart';
import 'package:smartspend_app/src/features/ai/ai_chat_view.dart';
import 'package:smartspend_app/src/features/ai/ai_conversations_sheet.dart';
import 'package:smartspend_app/src/features/ai/ai_memories_sheet.dart';
import 'package:smartspend_app/src/features/ai/ai_models.dart';
import 'package:smartspend_app/src/features/ai/ai_providers.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

class _TestChatMessagesNotifier extends ChatMessagesNotifier {
  @override
  AsyncValue<List<ChatMessage>> build() {
    return AsyncValue.data([
      ChatMessage(
        id: 1,
        role: 'user',
        content: 'صرفت كام على الأكل؟',
        createdAt: DateTime.now(),
      ),
      ChatMessage(
        id: 2,
        role: 'assistant',
        content: 'إجمالي مصاريف الأكل هذا الشهر هو 1200 جنيه.',
        createdAt: DateTime.now(),
      ),
    ]);
  }
}

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
    ...extra,
  ];
}

void main() {
  group('AiChatView & Action Cards Tests (AI-01, AI-02, AI-04)', () {
    testWidgets('renders user and assistant chat bubbles with markdown', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi, [
            chatMessagesProvider.overrideWith(_TestChatMessagesNotifier.new),
          ]),
          child: const MaterialApp(home: Scaffold(body: AiChatView())),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('صرفت كام على الأكل؟'), findsOneWidget);
      expect(find.textContaining('1200 جنيه'), findsOneWidget);
    });

    testWidgets('renders action card and handles confirm with debounce', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      int confirmCalls = 0;
      fakeApi.answer('chat.confirmAction', (input) {
        confirmCalls++;
        return {'ok': true, 'message': 'تم تسجيل المصروف'};
      });

      final draft = AiActionDraft(
        id: 'draft_10',
        actionId: 10,
        actionName: 'expense.create',
        summary: 'تسجيل مصروف غداء',
        amounts: const [60.0],
        status: 'pending',
        expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            home: Scaffold(
              body: Center(child: AiActionCard(draft: draft)),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تسجيل مصروف غداء'), findsOneWidget);
      expect(find.byType(AmountText), findsOneWidget);

      // Tap confirm button
      final confirmBtn = find.text('تأكيد');
      expect(confirmBtn, findsOneWidget);
      await tester.tap(confirmBtn);
      // Immediate second tap should be debounced
      await tester.tap(confirmBtn);
      await tester.pumpAndSettle();

      expect(confirmCalls, 1);
    });

    testWidgets('renders expired action card with disabled actions', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      final expiredDraft = AiActionDraft(
        id: 'draft_expired',
        actionId: 99,
        actionName: 'expense.create',
        summary: 'إضافة بقالة',
        amounts: const [200.0],
        status: 'expired',
        expiresAt: DateTime.now().subtract(const Duration(minutes: 10)),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            home: Scaffold(
              body: Center(child: AiActionCard(draft: expiredDraft)),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('انتهت صلاحية هذا الإجراء'), findsOneWidget);
      expect(find.text('تأكيد'), findsNothing);
    });

    testWidgets('requires exact phrase confirmation for high-risk action', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      bool confirmedCalled = false;
      fakeApi.answer('chat.confirmAction', (input) {
        confirmedCalled = true;
        return {'ok': true};
      });

      final highRiskDraft = AiActionDraft(
        id: 'draft_wipe',
        actionId: 77,
        actionName: 'action.undo',
        summary: 'مسح جميع المعاملات',
        isHighRisk: true,
        confirmationPhrase: 'تأكيد مسح كل المعاملات',
        status: 'pending',
        expiresAt: DateTime.now().add(const Duration(minutes: 10)),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            home: Scaffold(
              body: Center(child: AiActionCard(draft: highRiskDraft)),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('حساس'), findsOneWidget);

      // Tap confirm button -> opens phrase dialog
      await tester.tap(find.text('متابعة التأكيد'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('للتأكيد، اكتب العبارة التالية'),
        findsOneWidget,
      );

      // Typing wrong phrase keeps confirm disabled
      final inputField = find.byType(TextField);
      await tester.enterText(inputField, 'عبارة غير صحيحة');
      await tester.pumpAndSettle();

      // Submit button should be disabled
      final dialogConfirm = find.widgetWithText(FilledButton, 'تأكيد التنفيذ');
      expect(tester.widget<FilledButton>(dialogConfirm).onPressed, isNull);

      // Typing the exact phrase enables button
      await tester.enterText(inputField, 'تأكيد مسح كل المعاملات');
      await tester.pumpAndSettle();

      expect(tester.widget<FilledButton>(dialogConfirm).onPressed, isNotNull);
      await tester.tap(dialogConfirm);
      await tester.pumpAndSettle();

      expect(confirmedCalled, isTrue);
    });

    testWidgets(
      'shows daily limit error banner with upgrade button on TOO_MANY_REQUESTS',
      (tester) async {
        final fakeApi = FakeApi();
        fakeApi.answer('chat.sendMessage', (_) {
          throw const TrpcFailure(
            'TOO_MANY_REQUESTS',
            429,
            'وصلت للحد الأقصى لرسائل الذكاء الاصطناعي اليومية في باقتك.',
          );
        });

        await tester.pumpWidget(
          ProviderScope(
            overrides: _testOverrides(fakeApi),
            child: const MaterialApp(home: Scaffold(body: AiChatView())),
          ),
        );
        await tester.pumpAndSettle();

        // Type message and hit send
        await tester.enterText(find.byType(TextField), 'سؤال جديد');
        await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
        await tester.pumpAndSettle();

        // Daily limit banner is displayed
        expect(
          find.textContaining('وصلت للحد الأقصى لرسائل الذكاء الاصطناعي'),
          findsOneWidget,
        );
        expect(find.text('ترقية للبرو'), findsOneWidget);
        // Composer retains draft text
        expect(find.widgetWithText(TextField, 'سؤال جديد'), findsOneWidget);
      },
    );
  });

  group('AiConversationsSheet & AiMemoriesSheet (AI-03, AI-05)', () {
    testWidgets(
      'AiConversationsSheet displays thread list and switches active thread',
      (tester) async {
        final fakeApi = FakeApi();
        fakeApi.answer('chat.getConversations', (_) {
          return [
            {
              'id': 101,
              'title': 'محادثة ميزانية رمضان',
              'createdAt': '2026-10-25T12:00:00Z',
            },
            {
              'id': 102,
              'title': 'تحليل فواتير البيت',
              'createdAt': '2026-10-26T14:00:00Z',
            },
          ];
        });

        late ProviderContainer container;
        await tester.pumpWidget(
          ProviderScope(
            overrides: _testOverrides(fakeApi),
            child: Consumer(
              builder: (context, ref, _) {
                container = ProviderScope.containerOf(context);
                return MaterialApp(
                  home: Scaffold(
                    body: Builder(
                      builder: (sheetCtx) => ElevatedButton(
                        onPressed: () => AiConversationsSheet.show(sheetCtx),
                        child: const Text('افتح المحادثات'),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('افتح المحادثات'));
        await tester.pumpAndSettle();

        expect(find.text('المحادثات السابقة'), findsOneWidget);
        expect(find.text('محادثة ميزانية رمضان'), findsOneWidget);
        expect(find.text('تحليل فواتير البيت'), findsOneWidget);

        // Tap on second conversation
        await tester.tap(find.text('تحليل فواتير البيت'));
        await tester.pumpAndSettle();

        // Active conversation id switched to 102
        expect(container.read(activeConversationIdProvider), 102);
      },
    );

    testWidgets('AiMemoriesSheet displays remembered items and forgets one', (
      tester,
    ) async {
      final fakeApi = FakeApi();

      bool forgetCalled = false;
      fakeApi.answer('chat.listMemories', (_) {
        return [
          {
            'id': 1,
            'content': 'المستخدم يفضل التوفير للمصيف في الصيف',
            'category': 'preference',
            'confidence': 0.95,
          },
        ];
      });

      fakeApi.answer('chat.forgetMemory', (input) {
        forgetCalled = true;
        return {'ok': true};
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: _testOverrides(fakeApi),
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => ElevatedButton(
                  onPressed: () => AiMemoriesSheet.show(context),
                  child: const Text('افتح الذاكرة'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('افتح الذاكرة'));
      await tester.pumpAndSettle();

      expect(find.text('ذاكرة المساعد الذكي'), findsOneWidget);
      expect(
        find.text('المستخدم يفضل التوفير للمصيف في الصيف'),
        findsOneWidget,
      );

      // Tap delete icon
      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pumpAndSettle();

      expect(forgetCalled, isTrue);
    });
  });
}
