import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_app/src/features/stats/stats_models.dart';
import 'package:smartspend_app/src/features/wallets/wallet_models.dart';

void main() {
  final apiUrl = Platform.environment['SMARTSPEND_CONTRACT_API_URL'];
  final token =
      Platform.environment['SMARTSPEND_CONTRACT_TOKEN'] ?? 'test-session-token';
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

      test('stats: expense.getMonthlyStats contract', () async {
        final data = await client.query(
          Procedures.expense.getMonthlyStats,
          input: {'month': '2026-10'},
        );
        expect(data, isA<Map<String, Object?>>());
        final map = data! as Map<String, Object?>;
        final stats = MonthStats.fromJson(map);
        expect(stats.expense, isA<num>());
        expect(stats.income, isA<num>());
      });

      test('wallets: wallet.getWallets contract', () async {
        final data = await client.query(Procedures.wallet.getWallets);
        expect(data, isA<List<Object?>>());
        final list = [
          for (final raw in data! as List<Object?>)
            if (raw is Map<String, Object?>) Wallet.fromJson(raw),
        ];
        expect(list, isA<List<Wallet>>());
      });

      test('wallets: wallet.getWalletMonth contract', () async {
        final data = await client.query(
          Procedures.wallet.getWalletMonth,
          input: {'walletId': 1, 'month': '2026-10'},
        );
        expect(data, isA<Map<String, Object?>>());
        final summary = WalletMonth.fromJson(data! as Map<String, Object?>);
        expect(summary.moneyOut, isA<num>());
      });

      test('ledger: expense.getPendingClarifications contract', () async {
        final data = await client.query(
          Procedures.expense.getPendingClarifications,
        );
        expect(data, isA<List<Object?>>());
        final items = [
          for (final raw in data! as List<Object?>)
            if (raw is Map<String, Object?>) PendingClarification.fromJson(raw),
        ];
        expect(items, isA<List<PendingClarification>>());
      });

      test('ledger: expense.searchTransactions contract', () async {
        final data = await client.query(
          Procedures.expense.searchTransactions,
          input: {'query': 'قهوة', 'limit': 20},
        );
        expect(data, isA<List<Object?>>());
      });

      test('ledger: expense.previewCategory contract', () async {
        final data = await client.query(
          Procedures.expense.previewCategory,
          input: {'title': 'سوبرماركت كارفور'},
        );
        expect(data, isA<Map<String, Object?>>());
      });
    },
  );
}
