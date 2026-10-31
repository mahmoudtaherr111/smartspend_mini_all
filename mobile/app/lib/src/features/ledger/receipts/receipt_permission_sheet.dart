import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// Bottom sheet explaining why camera permission is needed for receipt scanning.
class ReceiptPermissionSheet extends StatelessWidget {
  const ReceiptPermissionSheet({
    super.key,
    required this.onGranted,
    required this.onDenied,
  });

  final VoidCallback onGranted;
  final VoidCallback onDenied;

  static Future<bool> show(BuildContext context) async {
    final result = await showSmartSpendSheet<bool>(
      context: context,
      builder: (sheetContext) => ReceiptPermissionSheet(
        onGranted: () => Navigator.of(sheetContext).pop(true),
        onDenied: () => Navigator.of(sheetContext).pop(false),
      ),
    );
    return result ?? false;
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
          Center(
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.camera_alt_rounded,
                size: 28,
                color: colors.accent,
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          Text(
            'تصوير الفواتير بالكاميرا',
            style: SmartSpendTypography.style(18, FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            'عشان تقدر تصوّر الفواتير والإيصالات وتقرأها بالذكاء الاصطناعي، محتاجين إذن استخدام الكاميرا.',
            style: SmartSpendTypography.style(
              14,
              FontWeight.w400,
            ).copyWith(color: colors.mutedForeground),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Container(
            padding: const EdgeInsets.all(SmartSpendSpacing.sm),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.shield_outlined,
                  size: 20,
                  color: colors.mutedForeground,
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                Expanded(
                  child: Text(
                    'الصور بتستخدم لقراءة أرقام وتفاصيل الفاتورة فقط، وما بتتبعتش لأي جهة تانية.',
                    style: SmartSpendTypography.style(
                      12,
                      FontWeight.w400,
                    ).copyWith(color: colors.mutedForeground),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: 'السماح بالكاميرا',
            variant: ButtonVariant.primary,
            onPressed: onGranted,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          SmartSpendButton(
            label: 'مش دلوقتي',
            variant: ButtonVariant.quiet,
            onPressed: onDenied,
          ),
        ],
      ),
    );
  }
}
