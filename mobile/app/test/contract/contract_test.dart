// Contract suite executing against a real local backend server
// (MySQL 3399 & Redis 6389 throwaway containers, API on port 3005).
// Exercises real tRPC serialization, authorization, and Dart model mappings.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/stats/stats_models.dart';
import 'package:smartspend_app/src/features/wallets/wallet_models.dart';

void main() {
  final apiUrl = Platform.environment['SMARTSPEND_CONTRACT_API_URL'];
  final token = Platform.environment['SMARTSPEND_CONTRACT_TOKEN'] ?? 'test-session-token';
  final shouldRun = apiUrl != null && apiUrl.isNotEmpty;

  group(
    'Contract Suite (Real tRPC API & Dart Models)',
    skip: shouldRun ? false : 'SMARTSPEND_CONTRACT_API_URL is not set: skipping real API contract tests',
    () {
      late TrpcClient client;

      setUpAll(() {
        if (!shouldRun) return;
        client = TrpcClient(
          baseUri: Uri.parse(apiUrl),
          readSessionToken: () => token,
        );
      });

      test('1. month summary: expense.getMonthSummary real contract', () async {
        final data = await client.query(
          Procedures.expense.getMonthSummary,
          input: {'month': '2026-10'},
        );
        expect(data, isA<Map<String, Object?>>());
        final summary = MonthSummary.fromJson(data! as Map<String, Object?>);
        expect(summary.expense, greaterThanOrEqualTo(185));
        expect(summary.income, 15000);
        expect(summary.count, greaterThanOrEqualTo(2));
      });

      test('2. list: expense.list pagination and LedgerEntry mapping', () async {
        final data = await client.query(
          Procedures.expense.list,
          input: {'limit': 20},
        );
        expect(data, isA<Map<String, Object?>>());
        final map = data! as Map<String, Object?>;
        expect(map['items'], isA<List<Object?>>());
        final page = LedgerPage.fromJson(map);
        expect(page.entries, isNotEmpty);
        expect(page.total, greaterThanOrEqualTo(2));

        final talabat = page.entries.firstWhere((e) => e.id == 101);
        expect(talabat.description, 'Talabat');
        expect(talabat.category, 'أكل وشرب');
        expect(talabat.subCategory, 'دليفري');
        expect(talabat.type, 'expense');
        expect(talabat.walletId, 1);
      });

      test('3. getById: expense.getById retrieves full single transaction', () async {
        final data = await client.query(
          Procedures.expense.getById,
          input: {'id': 101},
        );
        expect(data, isA<Map<String, Object?>>());
        final entry = LedgerEntry.fromJson(data! as Map<String, Object?>);
        expect(entry.id, 101);
        expect(entry.amount, 185);
        expect(entry.description, 'Talabat');
        expect(entry.walletId, 1);
      });

      test('4. update: expense.update modifies amounts, notes, and clears wallet', () async {
        // Update amount, note, and clear wallet (walletId: null)
        await client.mutate(
          Procedures.expense.update,
          input: {
            'id': 101,
            'amount': 210.0,
            'description': 'Talabat Express',
            'walletId': null,
          },
        );

        // Verify changes reflected on server
        final after = await client.query(
          Procedures.expense.getById,
          input: {'id': 101},
        );
        final entry = LedgerEntry.fromJson(after! as Map<String, Object?>);
        expect(entry.amount, 210);
        expect(entry.description, 'Talabat Express');
        expect(entry.walletId, isNull);

        // Revert back and re-link wallet for remaining tests
        await client.mutate(
          Procedures.expense.update,
          input: {
            'id': 101,
            'amount': 185.0,
            'description': 'Talabat',
            'walletId': 1,
          },
        );
      });

      test('5. delete & create: expense.create and expense.delete', () async {
        // Create an entry
        final created = await client.mutate(
          Procedures.expense.create,
          input: {
            'amount': 50.0,
            'type': 'expense',
            'category': 'أكل وشرب',
            'subCategory': 'قهوة وكافيه',
            'description': 'قهوة سريعة',
            'rawText': 'قهوة سريعة 50 جنيه',
            'source': 'manual',
            'clientRequestId': 'req-contract-test-del-1',
          },
        );
        expect(created, isA<Map<String, Object?>>());
        final createdMap = created! as Map<String, Object?>;
        final newId = createdMap['id'] as int;

        // Verify exists
        final fetched = await client.query(
          Procedures.expense.getById,
          input: {'id': newId},
        );
        expect(fetched, isNotNull);

        // Delete entry
        final deleteResult = await client.mutate(
          Procedures.expense.delete,
          input: {'id': newId},
        );
        expect(deleteResult, isA<Map<String, Object?>>());

        // Verify deleted
        final afterDelete = await client.query(
          Procedures.expense.getById,
          input: {'id': newId},
        );
        expect(afterDelete, isNull);
      });

      test('6. clarifications: getPendingClarifications and dismissClarification', () async {
        final data = await client.query(
          Procedures.expense.getPendingClarifications,
        );
        expect(data, isA<List<Object?>>());
        final items = [
          for (final raw in data! as List<Object?>)
            if (raw is Map<String, Object?>) PendingClarification.fromJson(raw),
        ];
        expect(items.any((q) => q.id == 501), isTrue);
        final item = items.firstWhere((q) => q.id == 501);
        expect(item.question, 'مين محمد؟');

        // Dismiss clarification
        final dismissRes = await client.mutate(
          Procedures.expense.dismissClarification,
          input: {'clarificationId': 501},
        );
        expect(dismissRes, isA<Map<String, Object?>>());
        expect((dismissRes! as Map<String, Object?>)['success'], isTrue);

        // Verify it no longer appears in pending list
        final after = await client.query(
          Procedures.expense.getPendingClarifications,
        );
        final itemsAfter = [
          for (final raw in after! as List<Object?>)
            if (raw is Map<String, Object?>) PendingClarification.fromJson(raw),
        ];
        expect(itemsAfter.any((q) => q.id == 501), isFalse);
      });

      test('7. stats: expense.getMonthlyStats contract', () async {
        final data = await client.query(
          Procedures.expense.getMonthlyStats,
          input: {'month': '2026-10'},
        );
        expect(data, isA<Map<String, Object?>>());
        final map = data! as Map<String, Object?>;
        final stats = MonthStats.fromJson(map);
        expect(stats.expense, greaterThanOrEqualTo(185));
        expect(stats.income, 15000);
        expect(stats.categories, isNotEmpty);
        expect(stats.categories.any((c) => c.name == 'أكل وشرب'), isTrue);
      });

      test('8. category drilldown: expense.list filtered by category and month', () async {
        final data = await client.query(
          Procedures.expense.list,
          input: {
            'limit': 30,
            'category': 'أكل وشرب',
            'type': 'expense',
            'startDate': '2026-10-01',
            'endDate': '2026-10-31T23:59:59.999',
          },
        );
        expect(data, isA<Map<String, Object?>>());
        final page = LedgerPage.fromJson(data! as Map<String, Object?>);
        expect(page.entries, isNotEmpty);
        for (final entry in page.entries) {
          expect(entry.category, 'أكل وشرب');
          expect(entry.type, 'expense');
          expect(entry.date.year, 2026);
          expect(entry.date.month, 10);
        }
      });

      test('9. wallets: CRUD operations (getWallets, createWallet, updateWallet, deleteWallet)', () async {
        // Read existing wallets
        final initial = await client.query(Procedures.wallet.getWallets);
        expect(initial, isA<List<Object?>>());
        final list = [
          for (final raw in initial! as List<Object?>)
            if (raw is Map<String, Object?>) Wallet.fromJson(raw),
        ];
        expect(list.any((w) => w.id == 1), isTrue);
        final cib = list.firstWhere((w) => w.id == 1);
        expect(cib.name, 'كارت CIB');
        expect(cib.balance, 5000.0);
        expect(cib.lastFour, '1234');

        // Create new wallet
        final created = await client.mutate(
          Procedures.wallet.createWallet,
          input: {
            'name': 'محفظة كونتراكت',
            'provider': 'VodafoneCash',
            'balance': '750.50',
          },
        );
        expect(created, isA<Map<String, Object?>>());
        final createdWalletId = (created! as Map<String, Object?>)['insertId'] as int;

        // Update newly created wallet
        await client.mutate(
          Procedures.wallet.updateWallet,
          input: {
            'id': createdWalletId,
            'name': 'محفظة كونتراكت معدلة',
            'balance': '900',
          },
        );

        // Verify update
        final afterUpdate = await client.query(Procedures.wallet.getWallets);
        final updatedList = [
          for (final raw in afterUpdate! as List<Object?>)
            if (raw is Map<String, Object?>) Wallet.fromJson(raw),
        ];
        final updated = updatedList.firstWhere((w) => w.id == createdWalletId);
        expect(updated.name, 'محفظة كونتراكت معدلة');
        expect(updated.balance, 900.0);

        // Delete newly created wallet
        final deleteResult = await client.mutate(
          Procedures.wallet.deleteWallet,
          input: {'id': createdWalletId},
        );
        expect(deleteResult, isA<Map<String, Object?>>());

        // Verify deleted
        final afterDelete = await client.query(Procedures.wallet.getWallets);
        final finalList = [
          for (final raw in afterDelete! as List<Object?>)
            if (raw is Map<String, Object?>) Wallet.fromJson(raw),
        ];
        expect(finalList.any((w) => w.id == createdWalletId), isFalse);
      });

      test('10. wallet month & transactions: getWalletMonth and getWalletTransactions', () async {
        final monthData = await client.query(
          Procedures.wallet.getWalletMonth,
          input: {'walletId': 1, 'month': '2026-10'},
        );
        expect(monthData, isA<Map<String, Object?>>());
        final summary = WalletMonth.fromJson(monthData! as Map<String, Object?>);
        expect(summary.moneyIn, 15000);
        expect(summary.moneyOut, greaterThanOrEqualTo(185));
        expect(summary.count, greaterThanOrEqualTo(2));

        final txData = await client.query(
          Procedures.wallet.getWalletTransactions,
          input: {'walletId': 1, 'limit': 20},
        );
        expect(txData, isA<List<Object?>>());
        final txList = [
          for (final raw in txData! as List<Object?>)
            if (raw is Map<String, Object?>) LedgerEntry.fromJson(raw),
        ];
        expect(txList, isNotEmpty);
        for (final entry in txList) {
          expect(entry.walletId, 1);
        }
      });

      test('11. sign in & sign out: localAuth.login and localAuth.logout contract', () async {
        final loginRes = await client.mutate(
          Procedures.localAuth.login,
          input: {
            'phone': '01012345678',
            'password': 'testpass123',
          },
        );
        expect(loginRes, isA<Map<String, Object?>>());
        final loginMap = loginRes! as Map<String, Object?>;
        expect(loginMap['success'], isTrue);
        final freshToken = loginMap['token'] as String?;
        expect(freshToken, isNotNull);

        // Test logout on the newly issued token without invalidating suite token
        final logoutClient = TrpcClient(
          baseUri: Uri.parse(apiUrl!),
          readSessionToken: () => freshToken,
        );
        final result = await logoutClient.mutate(Procedures.localAuth.logout);
        expect(result, isA<Map<String, Object?>>());
        expect((result! as Map<String, Object?>)['success'], isTrue);
      });
    },
  );
}
