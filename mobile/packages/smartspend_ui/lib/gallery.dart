/// Every component of the design system on one scrolling page, with Egyptian sample data, for reviewing the
/// design: the screenshot workflow photographs it in both themes on both platforms. Not part of the app's screens;
/// import it only from tests and tools.
library;

import 'package:flutter/material.dart';

import 'smartspend_ui.dart';

class ComponentGallery extends StatelessWidget {
  const ComponentGallery({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colors = context.smartSpendColors;
    return Scaffold(
      appBar: AppBar(title: const Text('مكوّنات SmartSpend')),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'صرفت الشهر ده',
                    style: textTheme.bodyMedium?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  AmountText(12480, style: textTheme.displaySmall),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    'أقل من الشهر اللي فات بـ 1,320 ج.م',
                    style: textTheme.bodySmall?.copyWith(color: colors.accent),
                  ),
                ],
              ),
            ),
          ),
          SectionHeader('النهارده', actionLabel: 'الكل', onAction: () {}),
          const TransactionRow(
            icon: Icons.restaurant,
            title: 'Talabat',
            subtitle: 'أكل وشرب · 9:41 م',
            amount: 185,
          ),
          const TransactionRow(
            icon: Icons.local_taxi_outlined,
            title: 'UBER *TRIP',
            subtitle: 'مواصلات · لسه بيتسجّل',
            amount: 96,
            kind: AmountKind.pending,
          ),
          const TransactionRow(
            icon: Icons.payments_outlined,
            title: 'مرتب',
            subtitle: 'دخل · CIB',
            amount: 15000,
            kind: AmountKind.income,
          ),
          const SectionHeader('الأزرار'),
          SmartSpendButton(label: 'سجّل مصروف', onPressed: () {}),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: 'تعديل',
            variant: ButtonVariant.secondary,
            icon: Icons.edit_outlined,
            onPressed: () {},
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          const SmartSpendButton(label: 'بيتحفظ', busy: true, onPressed: null),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: 'امسح الحساب',
            variant: ButtonVariant.destructive,
            onPressed: () {},
          ),
          SmartSpendButton(
            label: 'اعرف أكتر',
            variant: ButtonVariant.quiet,
            onPressed: () {},
          ),
          const SectionHeader('الرسائل'),
          const InlineMessage('اكتب المبلغ.'),
          const SizedBox(height: SmartSpendSpacing.sm),
          const InlineMessage(
            'فاضل 3 تسجيلات تلقائية الشهر ده.',
            warning: true,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          const OfflineBanner('النت فاصل. هنحفظ وهنبعت لما يرجع.'),
          const SectionHeader('بيحمّل'),
          const _SkeletonRow(),
          const _SkeletonRow(),
          const SectionHeader('فاضي'),
          EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'لسه مفيش مصاريف',
            message: 'اكتب أول مصروف بالعامية وهنصنّفه لوحدنا.',
            actionLabel: 'سجّل مصروف',
            onAction: () {},
          ),
          const SectionHeader('حصلت مشكلة'),
          ErrorState(
            message: 'مش قادرين نوصل للسيرفر. اتأكد من النت وجرّب تاني.',
            retryLabel: 'جرّب تاني',
            onRetry: () {},
          ),
          const SectionHeader('المبالغ مخفية'),
          const MoneyPrivacy(
            hidden: true,
            child: TransactionRow(
              icon: Icons.restaurant,
              title: 'Talabat',
              subtitle: 'أكل وشرب · 9:41 م',
              amount: 185,
              kind: AmountKind.expense,
            ),
          ),
          const SectionHeader('الرمز السري'),
          const Center(
            child: PinDots(
              length: 6,
              filled: 2,
              semanticsLabel: 'اتكتب 2 من 6',
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          PinPad(
            onDigit: (_) {},
            onDelete: () {},
            deleteLabel: 'امسح رقم',
            leading: IconButton(
              onPressed: () {},
              tooltip: 'افتح بالبصمة',
              icon: const Icon(Icons.fingerprint, size: 32),
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: SmartSpendSpacing.sm),
      child: Row(
        children: [
          Skeleton(width: 44, height: 44),
          SizedBox(width: SmartSpendSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Skeleton(width: 140),
                SizedBox(height: SmartSpendSpacing.xs),
                Skeleton(width: 90, height: 12),
              ],
            ),
          ),
          Skeleton(width: 64, height: 18),
        ],
      ),
    );
  }
}
