import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import '../ledger/ledger_models.dart';
import '../ledger/ledger_providers.dart';
import 'wallet_models.dart';

/// The person's wallets and cards on the server (`api/wallet-router.ts`).
final class WalletsRepository {
  const WalletsRepository(this._client);

  final TrpcClient _client;

  Future<List<Wallet>> list() async {
    final data = await _client.query(Procedures.wallet.getWallets);
    return [
      for (final raw in (data as List<Object?>? ?? const []))
        if (raw is Map<String, Object?>) Wallet.fromJson(raw),
    ];
  }

  Future<WalletMonth> month(
    int walletId,
    String month, {
    int? salaryDay,
  }) async {
    final data = await _client.query(
      Procedures.wallet.getWalletMonth,
      input: {'walletId': walletId, 'month': month, 'salaryDay': ?salaryDay},
    );
    return WalletMonth.fromJson(data is Map<String, Object?> ? data : const {});
  }

  /// The wallet's latest transactions, newest first.
  Future<List<LedgerEntry>> transactions(int walletId, {int limit = 50}) async {
    final data = await _client.query(
      Procedures.wallet.getWalletTransactions,
      input: {'walletId': walletId, 'limit': limit},
    );
    return [
      for (final raw in (data as List<Object?>? ?? const []))
        if (raw is Map<String, Object?>) LedgerEntry.fromJson(raw),
    ];
  }

  /// [balance] as typed; the server reads Arabic digits and separators and refuses anything else with a message.
  Future<void> create({
    required String name,
    required WalletKind kind,
    String? lastFour,
    String? balance,
  }) async {
    await _client.mutate(
      Procedures.wallet.createWallet,
      input: {
        'name': name,
        'provider': kind.provider,
        if (lastFour != null && lastFour.isNotEmpty) 'lastFourDigits': lastFour,
        if (balance != null && balance.isNotEmpty) 'balance': balance,
      },
    );
  }

  Future<void> update(
    int id, {
    String? name,
    String? lastFour,
    String? balance,
  }) async {
    await _client.mutate(
      Procedures.wallet.updateWallet,
      input: {
        'id': id,
        'name': ?name,
        'lastFourDigits': ?lastFour,
        if (balance != null && balance.isNotEmpty) 'balance': balance,
      },
    );
  }

  Future<void> delete(int id) async {
    await _client.mutate(Procedures.wallet.deleteWallet, input: {'id': id});
  }
}

final walletsRepositoryProvider = Provider<WalletsRepository>(
  (ref) => WalletsRepository(ref.watch(trpcClientProvider)),
);

/// Who owns cached wallet answers right now: signing out or switching to another account resets any provider that
/// watches it, while `me` filling in extra profile fields for the same account does not re-fetch.
final _walletSessionScopeProvider =
    Provider<({bool signedIn, String? accountKey})>(
      (ref) => switch (ref.watch(sessionProvider)) {
        SignedIn(:final user?) => (
          signedIn: true,
          accountKey: '${user.kind.name}:${user.id}',
        ),
        SignedIn() => (signedIn: true, accountKey: null),
        _ => (signedIn: false, accountKey: null),
      },
    );

/// The person's wallets and cards; without a network, the last list seen for this account.
final walletsProvider = FutureProvider<List<Wallet>>((ref) async {
  final scope = ref.watch(_walletSessionScopeProvider);
  if (!scope.signedIn) return const [];
  final local = ref.watch(localLedgerProvider);
  try {
    final wallets = await ref.watch(walletsRepositoryProvider).list();
    ref.read(networkStatusProvider.notifier).reached();
    unawaited(
      local.update(
        (stored) => stored.copyWith(
          accountKey: scope.accountKey ?? stored.accountKey,
          wallets: wallets,
        ),
      ),
    );
    return wallets;
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    final stored = await local.snapshot();
    final sameAccount =
        scope.accountKey == null ||
        stored.accountKey == null ||
        stored.accountKey == scope.accountKey;
    if (sameAccount && stored.wallets != null) return stored.wallets!;
    rethrow;
  }
});

/// A wallet's detail: its row from the list, this month's money in and out, and its latest transactions.
final class WalletDetail {
  const WalletDetail({
    required this.wallet,
    required this.month,
    required this.transactions,
  });

  final Wallet wallet;
  final WalletMonth month;
  final List<LedgerEntry> transactions;
}

final walletDetailProvider = FutureProvider.family<WalletDetail?, int>((
  ref,
  id,
) async {
  final wallets = await ref.watch(walletsProvider.future);
  final wallet = wallets.where((w) => w.id == id).firstOrNull;
  if (wallet == null) return null;
  final repository = ref.watch(walletsRepositoryProvider);
  final monthKey = await ref.watch(currentMonthProvider.future);
  final salaryDay = await ref.watch(salaryDayProvider.future);
  try {
    final (month, transactions) = await (
      repository.month(id, monthKey, salaryDay: salaryDay),
      repository.transactions(id),
    ).wait;
    ref.read(networkStatusProvider.notifier).reached();
    return WalletDetail(
      wallet: wallet,
      month: month,
      transactions: transactions,
    );
  } on ApiNetworkException {
    ref.read(networkStatusProvider.notifier).unreachable();
    rethrow;
  }
});
