import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

/// What the server says the stores can sell here (`pro.storeBilling`).
final class StoreBilling {
  const StoreBilling({
    required this.available,
    required this.productIds,
    required this.accountToken,
  });

  factory StoreBilling.fromJson(Map<String, Object?> json) => StoreBilling(
    available: (Platform.isIOS ? json['appStore'] : json['googlePlay']) == true,
    productIds: [
      for (final id in json['productIds'] as List<Object?>? ?? const [])
        if (id is String) id,
    ],
    accountToken: json['accountToken'] as String? ?? '',
  );

  final bool available;
  final List<String> productIds;

  /// Passed to the store with a purchase, so the purchase stays tied to this account.
  final String accountToken;
}

enum PurchaseOutcome { active, pending, cancelled, failed }

/// Buying and restoring Pro. The store sells; the server decides. Nothing here grants a plan: a purchase counts only
/// after `pro.verifyStorePurchase` confirms it with the store.
abstract interface class StorePurchases {
  Future<List<ProductDetails>> products(List<String> ids);
  Future<PurchaseOutcome> buy(ProductDetails product, String accountToken);
  Future<bool> restore();
}

final class InAppStorePurchases implements StorePurchases {
  InAppStorePurchases(this._client);

  final TrpcClient _client;
  final _store = InAppPurchase.instance;

  String get _storeId => Platform.isIOS ? 'app_store' : 'google_play';

  @override
  Future<List<ProductDetails>> products(List<String> ids) async {
    if (!await _store.isAvailable()) return const [];
    final answer = await _store.queryProductDetails(ids.toSet());
    return answer.productDetails;
  }

  Future<bool> _confirm(PurchaseDetails purchase) async {
    await _client.mutate(
      Procedures.pro.verifyStorePurchase,
      input: {
        'store': _storeId,
        'purchaseToken': purchase.verificationData.serverVerificationData,
      },
    );
    return true;
  }

  @override
  Future<PurchaseOutcome> buy(
    ProductDetails product,
    String accountToken,
  ) async {
    final done = Completer<PurchaseOutcome>();
    late final StreamSubscription<List<PurchaseDetails>> subscription;
    subscription = _store.purchaseStream.listen((purchases) async {
      for (final purchase in purchases) {
        if (purchase.productID != product.id) continue;
        switch (purchase.status) {
          case PurchaseStatus.pending:
            if (!done.isCompleted) done.complete(PurchaseOutcome.pending);
          case PurchaseStatus.canceled:
            if (!done.isCompleted) done.complete(PurchaseOutcome.cancelled);
          case PurchaseStatus.error:
            if (!done.isCompleted) done.complete(PurchaseOutcome.failed);
          case PurchaseStatus.purchased:
          case PurchaseStatus.restored:
            try {
              await _confirm(purchase);
              // Finished only after the server has it, so a lost answer is delivered again by the store.
              if (purchase.pendingCompletePurchase) {
                await _store.completePurchase(purchase);
              }
              if (!done.isCompleted) done.complete(PurchaseOutcome.active);
            } on Object {
              if (!done.isCompleted) done.complete(PurchaseOutcome.failed);
            }
        }
      }
    });
    try {
      final started = await _store.buyNonConsumable(
        purchaseParam: PurchaseParam(
          productDetails: product,
          applicationUserName: accountToken,
        ),
      );
      if (!started) return PurchaseOutcome.failed;
      return await done.future;
    } finally {
      await subscription.cancel();
    }
  }

  @override
  Future<bool> restore() async {
    var restored = false;
    final subscription = _store.purchaseStream.listen((purchases) async {
      for (final purchase in purchases) {
        if (purchase.status != PurchaseStatus.restored &&
            purchase.status != PurchaseStatus.purchased) {
          continue;
        }
        try {
          restored = await _confirm(purchase) || restored;
          if (purchase.pendingCompletePurchase) {
            await _store.completePurchase(purchase);
          }
        } on Object {
          // Another account's purchase, or the store refused it: it restores nothing here.
        }
      }
    });
    await _store.restorePurchases();
    // The store reports restored purchases on its stream with no end marker.
    await Future<void>.delayed(const Duration(seconds: 4));
    await subscription.cancel();
    return restored;
  }
}

final storePurchasesProvider = Provider<StorePurchases>(
  (ref) => InAppStorePurchases(ref.watch(trpcClientProvider)),
);

final storeBillingProvider = FutureProvider<StoreBilling>((ref) async {
  final data = await ref
      .watch(trpcClientProvider)
      .query(Procedures.pro.storeBilling);
  return StoreBilling.fromJson(data is Map<String, Object?> ? data : const {});
});

/// The Pro products as the store prices them, or empty while the store cannot sell here.
final storeProductsProvider = FutureProvider<List<ProductDetails>>((ref) async {
  final billing = await ref.watch(storeBillingProvider.future);
  if (!billing.available) return const [];
  return ref.watch(storePurchasesProvider).products(billing.productIds);
});
