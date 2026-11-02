import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_purchase/in_app_purchase.dart' show ProductDetails;
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'cancel_plan_screen.dart';
import 'plan_providers.dart';
import 'store_purchases.dart';

/// Plan comparison, store billing purchase, and restore screen (PLN-01, PLN-02).
///
/// Compares Free vs Pro plans cleanly without residual Ultra references (PLN-04, GAP-44).
/// Handles purchase lifecycle: pending, cancelled, failure, and restore while preserving
/// active plan state on failure.
class PlanScreen extends ConsumerStatefulWidget {
  const PlanScreen({super.key});

  static const path = '/more/plan';

  static const _proFeatures = [
    'مسح وقراءة إيصالات الشراء الذكية بالكاميرا',
    'فصل حسابات الشغل والبيزنس عن المصاريف الشخصية',
    'تحليلات مالية ومقارنات سنوية غير محدودة بالذكاء الاصطناعي',
    'إزالة كافة الإعلانات الممولة تماماً',
    'دعم فني مخصص ذو أولوية',
  ];

  @override
  ConsumerState<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends ConsumerState<PlanScreen> {
  bool _purchasing = false;
  bool _restoring = false;

  Future<void> _buy(ProductDetails product) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _purchasing = true);
    try {
      final billing = await ref.read(storeBillingProvider.future);
      final outcome = await ref
          .read(storePurchasesProvider)
          .buy(product, billing.accountToken);
      if (outcome == PurchaseOutcome.active) ref.invalidate(userPlanProvider);
      if (!mounted) return;
      switch (outcome) {
        case PurchaseOutcome.active:
          showSmartSpendNotice(context, l10n.planActivated);
        case PurchaseOutcome.pending:
          showSmartSpendNotice(context, l10n.planPurchasePending);
        case PurchaseOutcome.failed:
          showSmartSpendNotice(context, l10n.planPurchaseFailed);
        case PurchaseOutcome.cancelled:
          break;
      }
    } on Object {
      if (mounted) showSmartSpendNotice(context, l10n.planPurchaseFailed);
    } finally {
      if (mounted) setState(() => _purchasing = false);
    }
  }

  Future<void> _restorePurchases() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _restoring = true);
    try {
      final restored = await ref.read(storePurchasesProvider).restore();
      if (restored) ref.invalidate(userPlanProvider);
      if (mounted) {
        showSmartSpendNotice(
          context,
          restored ? l10n.planRestored : l10n.planNothingToRestore,
        );
      }
    } on Object {
      if (mounted) showSmartSpendNotice(context, l10n.planPurchaseFailed);
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final products =
        ref.watch(storeProductsProvider).value ?? const <ProductDetails>[];
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final planAsync = ref.watch(userPlanProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.planTitle)),
      body: planAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text(l10n.captureStatusFailed)),
        data: (planInfo) {
          final isPro = planInfo.isPro;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(
                      color: isPro ? colors.accent : colors.border,
                      width: 2,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(SmartSpendSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              l10n.planCurrent,
                              style: textTheme.labelLarge?.copyWith(
                                color: colors.mutedForeground,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color:
                                    (isPro
                                            ? colors.accent
                                            : colors.surfaceRaised)
                                        .withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(
                                  SmartSpendRadii.sm,
                                ),
                              ),
                              child: Text(
                                isPro ? l10n.planPro : l10n.planFree,
                                style: textTheme.labelMedium?.copyWith(
                                  color: isPro
                                      ? colors.accent
                                      : colors.foreground,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: SmartSpendSpacing.md),
                        Text(
                          isPro
                              ? 'أنت تستمتع حالياً بكافة مميزات خطة Pro بدون قيود.'
                              : 'أنت على الخطة المجانية. يمكنك الترقية إلى Pro للحصول على تجربة متكاملة وبدون إعلانات.',
                          style: textTheme.bodyMedium,
                        ),
                        if (isPro) ...[
                          const SizedBox(height: SmartSpendSpacing.lg),
                          TextButton(
                            onPressed: () =>
                                context.push(CancelPlanScreen.path),
                            child: Text(
                              l10n.cancelPlanTitle,
                              style: TextStyle(color: colors.mutedForeground),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xl),
                Text(
                  l10n.planFeaturesTitle,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(color: colors.border),
                  ),
                  child: Column(
                    children: [
                      for (final feat in PlanScreen._proFeatures)
                        ListTile(
                          leading: Icon(
                            Icons.check_circle_rounded,
                            color: colors.accent,
                          ),
                          title: Text(feat, style: textTheme.bodyMedium),
                        ),
                    ],
                  ),
                ),
                if (!isPro) ...[
                  const SizedBox(height: SmartSpendSpacing.xl),
                  for (final product in products) ...[
                    SmartSpendButton(
                      label: l10n.planBuy(product.price),
                      busy: _purchasing,
                      onPressed: _restoring ? null : () => _buy(product),
                    ),
                    const SizedBox(height: SmartSpendSpacing.sm),
                  ],
                  if (products.isEmpty)
                    Text(
                      l10n.planStoreSoon,
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium,
                    )
                  else
                    SmartSpendButton(
                      label: l10n.planRestore,
                      variant: ButtonVariant.quiet,
                      busy: _restoring,
                      onPressed: _purchasing ? null : _restorePurchases,
                    ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
