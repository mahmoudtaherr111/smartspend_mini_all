import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/contacts/contact_models.dart';
import 'package:smartspend_app/src/features/contacts/contacts_screen.dart';
import 'package:smartspend_app/src/features/contacts/delete_contact_dialog.dart';
import 'package:smartspend_app/src/features/contacts/merge_contacts_sheet.dart';
import 'package:smartspend_app/src/features/contacts/person_transactions_sheet.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('People & Debts (REC-19 / ACC-06)', () {
    testWidgets(
      'ContactsScreen displays hero summary, open debts with badges, and settled accounts',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());

        api.answer(
          'profile.listContacts',
          (_) => {
            'contacts': [
              {
                'id': 1,
                'name': 'محمد عبد الرحمن إبراهيم الدسوقي',
                'relation': 'صاحبي',
                'transactionCount': 5,
              },
              {
                'id': 2,
                'name': 'أحمد السيد',
                'relation': 'زميل شغل',
                'transactionCount': 3,
              },
              {
                'id': 3,
                'name': 'محمود كمال',
                'relation': 'قريب',
                'transactionCount': 8,
              },
            ],
          },
        );

        api.answer(
          'expense.getDebtBalances',
          (_) => {
            'balances': [
              {
                'contactId': 1,
                'name': 'محمد عبد الرحمن إبراهيم الدسوقي',
                'balance': 1500,
                'lent': 2000,
                'received': 500,
                'count': 5,
              },
              {
                'contactId': 2,
                'name': 'أحمد السيد',
                'balance': -300,
                'lent': 0,
                'received': 300,
                'count': 3,
              },
            ],
            'owedToYou': 1500,
            'youOwe': 300,
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(ContactsScreen.path);
        await tester.pumpAndSettle();

        // Verify Header
        expect(find.text('الناس والديون'), findsOneWidget);
        expect(find.text('صافي الفلوس برّه'), findsOneWidget);
        expect(find.text('+ 1,500 ج.م'), findsWidgets);
        expect(find.text('- 300 ج.م'), findsWidgets);

        // Verify Active Debts
        expect(find.text('حسابات مفتوحة'), findsOneWidget);
        expect(find.text('محمد عبد الرحمن إبراهيم الدسوقي'), findsOneWidget);
        expect(find.text('+ 1,500 ج.م (ليك)'), findsOneWidget);

        expect(find.text('أحمد السيد'), findsOneWidget);
        expect(find.text('- 300 ج.م (عليك)'), findsOneWidget);

        // Drag up to reveal settled accounts
        await tester.drag(find.byType(ListView), const Offset(0, -300));
        await tester.pumpAndSettle();

        expect(find.text('حسابات متصفية'), findsOneWidget);
        expect(find.text('محمود كمال'), findsOneWidget);
        expect(find.text('0 ج.م (متصفي)'), findsOneWidget);
      },
    );

    testWidgets('Searching filters contacts by name', (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());

      api.answer(
        'profile.listContacts',
        (_) => {
          'contacts': [
            {
              'id': 1,
              'name': 'أحمد كهربائي',
              'relation': 'فني',
              'transactionCount': 2,
            },
            {
              'id': 2,
              'name': 'مينا جرجس',
              'relation': 'صديق',
              'transactionCount': 4,
            },
          ],
        },
      );

      api.answer(
        'expense.getDebtBalances',
        (_) => {
          'balances': [
            {
              'contactId': 1,
              'name': 'أحمد كهربائي',
              'balance': 500,
              'lent': 500,
              'received': 0,
              'count': 2,
            },
          ],
          'owedToYou': 500,
          'youOwe': 0,
        },
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(ContactsScreen.path);
      await tester.pumpAndSettle();

      expect(find.text('أحمد كهربائي'), findsOneWidget);
      expect(find.text('مينا جرجس'), findsOneWidget);

      // Enter search query
      await tester.enterText(find.byType(TextField).first, 'مينا');
      await tester.pumpAndSettle();

      expect(find.text('أحمد كهربائي'), findsNothing);
      expect(find.text('مينا جرجس'), findsOneWidget);
    });

    testWidgets('Tapping contact opens transactions sheet', (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());

      api.answer(
        'profile.listContacts',
        (_) => {
          'contacts': [
            {
              'id': 1,
              'name': 'كريم حسني',
              'relation': 'صديق',
              'transactionCount': 1,
            },
          ],
        },
      );

      api.answer(
        'expense.getDebtBalances',
        (_) => {
          'balances': [
            {
              'contactId': 1,
              'name': 'كريم حسني',
              'balance': 200,
              'lent': 200,
              'received': 0,
              'count': 1,
            },
          ],
          'owedToYou': 200,
          'youOwe': 0,
        },
      );

      api.answer('expense.searchTransactions', (_) => <Object?>[]);
      api.answer('expense.list', (_) => {'items': <Object?>[], 'total': 0});

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(ContactsScreen.path);
      await tester.pumpAndSettle();

      await tester.tap(find.text('كريم حسني'));
      await tester.pumpAndSettle();

      expect(find.byType(PersonTransactionsSheet), findsOneWidget);
      expect(find.textContaining('كريم حسني'), findsWidgets);
    });

    testWidgets('Delete contact dialog explains transactions stay in ledger', (
      tester,
    ) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(ContactsScreen.path);
      await tester.pumpAndSettle();

      final context = tester.element(find.byType(ContactsScreen));
      unawaited(
        showDialog<bool>(
          context: context,
          builder: (_) => const DeleteContactDialog(
            contact: ContactDebtItem(contactId: 5, name: 'طارق سليم'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تمسح "طارق سليم"؟'), findsOneWidget);
      expect(
        find.text('العمليات المسجلة معاه هتفضل، والشخص بس اللي هيتمسح.'),
        findsOneWidget,
      );
    });

    testWidgets('Merge contacts sheet shows survivor choice', (tester) async {
      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());

      api.answer(
        'profile.listContacts',
        (_) => {
          'contacts': [
            {
              'id': 1,
              'name': 'أحمد كهربائي',
              'relation': null,
              'transactionCount': 3,
            },
            {
              'id': 2,
              'name': 'أحمد الكهرباء',
              'relation': null,
              'transactionCount': 1,
            },
          ],
        },
      );

      final app = TestApp(token: 'test-token', api: api);
      await app.pump(tester);

      app.container.read(routerProvider).go(ContactsScreen.path);
      await tester.pumpAndSettle();

      final context = tester.element(find.byType(ContactsScreen));
      unawaited(
        showSmartSpendSheet<bool>(
          context: context,
          builder: (_) => const MergeContactsSheet(
            currentContact: ContactDebtItem(contactId: 1, name: 'أحمد كهربائي'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('ادمج المكررين'), findsOneWidget);
      expect(
        find.text('اختار الاسم اللي هيفضل، وكل العمليات هتتنقل عليه.'),
        findsOneWidget,
      );
    });
  });
}
