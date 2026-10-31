import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

enum ReceiptSource { camera, gallery }

/// Bottom sheet offering camera or gallery selection.
class ReceiptSourceSheet extends StatelessWidget {
  const ReceiptSourceSheet({super.key});

  static Future<ReceiptSource?> show(BuildContext context) {
    return showSmartSpendSheet<ReceiptSource>(
      context: context,
      builder: (context) => const ReceiptSourceSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.lg,
        vertical: SmartSpendSpacing.md,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'تصوير الفاتورة',
            style: SmartSpendTypography.style(18, FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            'صوّر الفاتورة أو اختار صورتها من المعرض، والذكاء الاصطناعي هيقرأ المبلغ والتفاصيل تلقائياً.',
            style: SmartSpendTypography.style(
              12,
              FontWeight.w400,
            ).copyWith(color: colors.mutedForeground),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          ListTile(
            leading: CircleAvatar(
              backgroundColor: colors.accent.withValues(alpha: 0.12),
              child: Icon(Icons.camera_alt_rounded, color: colors.accent),
            ),
            title: Text(
              'الكاميرا',
              style: SmartSpendTypography.style(15, FontWeight.w600),
            ),
            subtitle: Text(
              'التقط صورة واضحة للفاتورة',
              style: SmartSpendTypography.style(
                12,
                FontWeight.w400,
              ).copyWith(color: colors.mutedForeground),
            ),
            onTap: () => Navigator.of(context).pop(ReceiptSource.camera),
          ),
          const Divider(),
          ListTile(
            leading: CircleAvatar(
              backgroundColor: colors.surfaceRaised,
              child: Icon(
                Icons.photo_library_outlined,
                color: colors.foreground,
              ),
            ),
            title: Text(
              'اختيار من المعرض',
              style: SmartSpendTypography.style(15, FontWeight.w600),
            ),
            subtitle: Text(
              'اختر صورة محفوظة على هاتفك',
              style: SmartSpendTypography.style(
                12,
                FontWeight.w400,
              ).copyWith(color: colors.mutedForeground),
            ),
            onTap: () => Navigator.of(context).pop(ReceiptSource.gallery),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
      ),
    );
  }
}
