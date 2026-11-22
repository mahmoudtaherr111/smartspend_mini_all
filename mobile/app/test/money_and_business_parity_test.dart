import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/src/internals.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/preferences.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/auth/auth_api.dart';
import 'package:smartspend_app/src/features/auth/session_controller.dart';
import 'package:smartspend_app/src/features/business/business_models.dart';
import 'package:smartspend_app/src/features/business/business_providers.dart';
import 'package:smartspend_app/src/features/business/business_screen.dart';
import 'package:smartspend_app/src/features/contacts/add_contact_sheet.dart';
import 'package:smartspend_app/src/features/contacts/contact_models.dart';
import 'package:smartspend_app/src/features/contacts/merge_contacts_sheet.dart';
import 'package:smartspend_app/src/features/goals/goal_detail_sheet.dart';
import 'package:smartspend_app/src/features/goals/goal_models.dart';
import 'package:smartspend_app/src/features/goals/goals_providers.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/l10n/app_localizations.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

final class _SignedInSession extends SessionController {
  @override
  SessionState build() =>
      const SignedIn(AppUser(id: 1, kind: AccountKind.phone, name: 'منى'));
}

Widget _buildTestHarness({
  required Widget child,
  List<Override> overrides = const [],
  http.Client? httpClient,
}) {
  final client =
      httpClient ??
      MockClient((request) async {
        return http.Response.bytes(
          utf8.encode(
            jsonEncode({
              'result': {'data': <String, Object?>{}},
            }),
          ),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

  return ProviderScope(
    overrides: [
      appConfigProvider.overrideWithValue(
        AppConfig(
          environment: 'development',
          apiBaseUri: Uri.parse('http://localhost:3000'),
          userAgent: 'SmartSpend-Mobile (test)',
        ),
      ),
      sessionStoreProvider.overrideWithValue(MemorySessionStore('test-token')),
      ledgerStoreProvider.overrideWithValue(MemoryLedgerStore()),
      preferencesStoreProvider.overrideWithValue(MemoryPreferencesStore()),
      bankCaptureProvider.overrideWithValue(FakeBankCapture()),
      httpClientProvider.overrideWithValue(client),
      sessionProvider.overrideWith(_SignedInSession.new),
      ...overrides,
    ],
    child: MaterialApp(
      theme: SmartSpendTheme.dark(),
      locale: const Locale('ar'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  group('Wave 2C Slice 3 — Money & Business Parity Tests', () {
    testWidgets(
      'ActiveBusinessBanner shows when business mode is active and switches back to personal',
      (tester) async {
        await tester.pumpWidget(
          _buildTestHarness(
            overrides: [
              businessDashboardProvider.overrideWith(
                (ref) async => const BusinessState(
                  business: BusinessInfo(
                    id: 1,
                    name: 'متجر النور',
                    type: 'retail',
                    typeLabel: 'تجزئة',
                    isActive: true,
                  ),
                ),
              ),
            ],
            child: const ActiveBusinessBanner(),
          ),
        );
        await tester.pumpAndSettle();

        final container = ProviderScope.containerOf(
          tester.element(find.byType(ActiveBusinessBanner)),
        );

        // Initially personal mode -> banner is hidden
        expect(find.textContaining('متجر النور'), findsNothing);

        // Activate business mode
        container.read(isBusinessModeActiveProvider.notifier).set(true);
        await tester.pumpAndSettle();

        expect(find.textContaining('متجر النور'), findsOneWidget);
        expect(find.text('ارجع للشخصي'), findsOneWidget);

        // Tap switch to personal
        await tester.tap(find.text('ارجع للشخصي'));
        await tester.pumpAndSettle();

        expect(container.read(isBusinessModeActiveProvider), isFalse);
        expect(find.text('اتحولت للشخصي'), findsOneWidget);
      },
    );

    testWidgets(
      'GoalDetailSheet resolves live Goal updates and asks confirmation before deleting',
      (tester) async {
        var deletedGoalId = 0;
        var currentGoals = <Map<String, Object?>>[
          {
            'id': 55,
            'title': 'شراء سيارة',
            'targetAmount': 250000,
            'status': 'active',
          },
        ];

        final client = MockClient((request) async {
          final path = request.url.path.replaceFirst('/api/trpc/', '');
          if (path == 'goals.list') {
            return http.Response.bytes(
              utf8.encode(
                jsonEncode({
                  'result': {
                    'data': {'goals': currentGoals, 'isPro': true},
                  },
                }),
              ),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          if (path == 'goals.delete') {
            final body = jsonDecode(request.body) as Map<String, Object?>;
            deletedGoalId = (body['goalId'] as num).toInt();
            return http.Response.bytes(
              utf8.encode(
                jsonEncode({
                  'result': {
                    'data': {'success': true},
                  },
                }),
              ),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response.bytes(
            utf8.encode(
              jsonEncode({
                'result': {'data': <String, Object?>{}},
              }),
            ),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });

        const initialGoal = Goal(
          id: 55,
          title: 'شراء سيارة',
          targetAmount: 250000,
          status: 'active',
        );

        await tester.pumpWidget(
          _buildTestHarness(
            httpClient: client,
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => unawaited(
                  GoalDetailSheet.show(context, goal: initialGoal, isPro: true),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('open'));
        await tester.pumpAndSettle();

        expect(find.text('شراء سيارة'), findsOneWidget);
        expect(find.text('حلل الهدف'), findsOneWidget);

        // Simulate live provider update adding AI analysis to goal 55
        currentGoals = [
          {
            'id': 55,
            'title': 'شراء سيارة',
            'targetAmount': 250000,
            'status': 'active',
            'aiPlan': {
              'insight': 'خطة توفير ممتازة خلال 10 شهور.',
              'plan': ['توفير 25,000 ج.م شهرياً'],
            },
          },
        ];
        final container = ProviderScope.containerOf(
          tester.element(find.byType(GoalDetailSheet)),
        );
        await container.read(goalsProvider.notifier).refresh();
        await tester.pumpAndSettle();

        // Sheet reflects the updated AI analysis live!
        expect(find.text('خطة توفير ممتازة خلال 10 شهور.'), findsOneWidget);
        expect(find.text('توفير 25,000 ج.م شهرياً'), findsOneWidget);

        // Tap delete icon -> confirmation dialog must appear
        await tester.ensureVisible(find.byIcon(Icons.delete_outline_rounded));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.delete_outline_rounded));
        await tester.pumpAndSettle();

        expect(find.text('تمسح الهدف؟'), findsOneWidget);
        expect(
          find.text('الهدف ده هيتمسح من قايمة أهدافك. المسح مابيترجعش.'),
          findsOneWidget,
        );
        expect(deletedGoalId, 0);

        // Confirm delete
        await tester.tap(find.text('أكد المسح'));
        await tester.pumpAndSettle();

        expect(deletedGoalId, 55);
      },
    );

    testWidgets(
      'AddContactSheet in edit mode pre-fills fields and calls profile.updateContact',
      (tester) async {
        Map<String, Object?>? updatedInput;
        final client = MockClient((request) async {
          final path = request.url.path.replaceFirst('/api/trpc/', '');
          if (path == 'profile.updateContact') {
            updatedInput = jsonDecode(request.body) as Map<String, Object?>;
            return http.Response.bytes(
              utf8.encode(
                jsonEncode({
                  'result': {
                    'data': {'success': true},
                  },
                }),
              ),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response.bytes(
            utf8.encode(
              jsonEncode({
                'result': {'data': <String, Object?>{}},
              }),
            ),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });

        await tester.pumpWidget(
          _buildTestHarness(
            httpClient: client,
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => unawaited(
                  showSmartSpendSheet<bool>(
                    context: context,
                    scrollable: true,
                    builder: (_) => const AddContactSheet(
                      existing: ContactDebtItem(
                        contactId: 7,
                        name: 'كريم حسني',
                        relation: 'زميل',
                      ),
                    ),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('open'));
        await tester.pumpAndSettle();

        expect(find.text('تعديل بيانات الشخص'), findsOneWidget);
        expect(find.text('كريم حسني'), findsOneWidget);
        expect(find.text('زميل'), findsOneWidget);

        await tester.enterText(find.byType(TextField).first, 'كريم حسني محمود');
        await tester.enterText(find.byType(TextField).last, 'صديق مقرب');
        await tester.pumpAndSettle();

        await tester.ensureVisible(
          find.widgetWithText(SmartSpendButton, 'احفظ التعديلات'),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(SmartSpendButton, 'احفظ التعديلات'),
        );
        await tester.pumpAndSettle();

        expect(updatedInput, isNotNull);
        expect(updatedInput!['id'], 7);
        expect(updatedInput!['name'], 'كريم حسني محمود');
        expect(updatedInput!['relation'], 'صديق مقرب');
      },
    );

    testWidgets(
      'MergeContactsSheet dropdown handles very long Arabic contact names without overflow',
      (tester) async {
        tester.view
          ..physicalSize = const Size(320 * 3, 700 * 3)
          ..devicePixelRatio = 3;
        addTearDown(tester.view.reset);

        const longName =
            'محمد عبد الرحمن إبراهيم الدسوقي المنشاوي الشرقاوي الكبير';
        const longRelation = 'زميل شغل في الشركة القديمة بمدينة نصر';

        await tester.pumpWidget(
          _buildTestHarness(
            overrides: [
              contactsProvider.overrideWith(
                (ref) async => const [
                  ContactSummary(id: 1, name: 'محمد الدسوقي'),
                  ContactSummary(id: 2, name: longName, relation: longRelation),
                ],
              ),
            ],
            child: const MergeContactsSheet(
              currentContact: ContactDebtItem(
                contactId: 1,
                name: 'محمد الدسوقي',
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('ادمج المكررين'), findsOneWidget);

        // Open dropdown and select the very long contact name on a 320dp screen
        await tester.tap(find.byType(DropdownButtonFormField<int>));
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('المنشاوي').last);
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.text('أنهي اسم يفضل؟'), findsOneWidget);
      },
    );
  });
}
