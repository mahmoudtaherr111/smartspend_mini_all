import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import 'plan_providers.dart';

/// Screen allowing users to cancel Pro renewal with feedback survey (PLN-03).
class CancelPlanScreen extends ConsumerStatefulWidget {
  const CancelPlanScreen({super.key});

  static const path = '/more/cancel-plan';

  @override
  ConsumerState<CancelPlanScreen> createState() => _CancelPlanScreenState();
}

class _CancelPlanScreenState extends ConsumerState<CancelPlanScreen> {
  int _selectedReason = 0;
  bool _cancelling = false;

  static const _reasons = [
    'سعر الاشتراك مرتفع بالنسبة لي',
    'لم أعد بحاجة للميزات الإضافية',
    'واجهت مشاكل تقنية أثناء الاستخدام',
    'سأشترك مجدداً في وقت لاحق',
    'سبب آخر',
  ];

  Future<void> _cancel() async {
    setState(() => _cancelling = true);
    try {
      final client = ref.read(trpcClientProvider);
      await client.mutate(Procedures.pro.cancel);
      ref.invalidate(userPlanProvider);
      if (!mounted) return;
      showSmartSpendNotice(context, 'تم إلغاء التجديد التلقائي للاشتراك بنجاح');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      showSmartSpendNotice(context, e.message);
    } on Object {
      if (!mounted) return;
      showSmartSpendNotice(context, 'تعذر إلغاء الاشتراك حالياً');
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.cancelPlanTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.warning.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: colors.warning),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Text(
                      l10n.cancelPlanRetainNotice,
                      style: textTheme.bodySmall?.copyWith(height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            Text(
              'ساعدنا نفهم سبب الإلغاء:',
              style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                side: BorderSide(color: colors.border),
              ),
              child: RadioGroup<int>(
                groupValue: _selectedReason,
                onChanged: (val) => setState(() => _selectedReason = val ?? 0),
                child: Column(
                  children: [
                    for (int i = 0; i < _reasons.length; i++)
                      RadioListTile<int>(
                        title: Text(_reasons[i], style: textTheme.bodyMedium),
                        value: i,
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: l10n.cancelPlanConfirm,
              variant: ButtonVariant.destructive,
              busy: _cancelling,
              onPressed: _cancelling ? null : _cancel,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            SmartSpendButton(
              label: 'التراجع والاحتفاظ بالباقة',
              variant: ButtonVariant.quiet,
              onPressed: _cancelling ? null : () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
