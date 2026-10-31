import 'package:flutter/material.dart';

import 'bottom_sheet.dart';
import 'buttons.dart';
import 'haptics.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// Which quota or feature boundary triggered the upgrade prompt.
enum UpgradeLimitReason {
  voiceSeconds,
  receipts,
  goals,
  budgets,
  dailyEntries,
  aiTokens,
  export,
  general,
}

/// Details for displaying a specific limit prompt.
final class _LimitCopy {
  const _LimitCopy({
    required this.title,
    required this.message,
    required this.icon,
  });

  final String title;
  final String message;
  final IconData icon;
}

_LimitCopy _copyFor(UpgradeLimitReason reason) {
  switch (reason) {
    case UpgradeLimitReason.voiceSeconds:
      return const _LimitCopy(
        title: 'تسجيل صوتي بلا حدود مع برو',
        message: 'استهلكت كل ثواني الصوت للشهر ده. اشترك في باقة برو وسجل كل مصاريفك بالصوت بدون أي قيود شهرية.',
        icon: Icons.mic_rounded,
      );
    case UpgradeLimitReason.receipts:
      return const _LimitCopy(
        title: 'تصوير الفواتير بالذكاء الاصطناعي',
        message: 'ميزة تصوير الفواتير والإيصالات وقراءتها آلياً متاحة حصرياً لأعضاء باقة برو.',
        icon: Icons.receipt_long_rounded,
      );
    case UpgradeLimitReason.goals:
      return const _LimitCopy(
        title: 'أهداف مالية غير محدودة',
        message: 'وصلت للحد الأقصى للأهداف المالية في الباقة المجانية. باقة برو تتيح لك إنشاء عدد لا نهائي من الأهداف وتحليلها.',
        icon: Icons.flag_rounded,
      );
    case UpgradeLimitReason.budgets:
      return const _LimitCopy(
        title: 'ميزانيات مخصصة لكل فئة',
        message: 'تحكم بمصاريفك بدقة واصنع ميزانيات مخصصة لكل جوانب حياتك مع باقة برو.',
        icon: Icons.pie_chart_rounded,
      );
    case UpgradeLimitReason.dailyEntries:
      return const _LimitCopy(
        title: 'تسجيل ذكي بلا توقف',
        message: 'وصلت للحد الأقصى للتسجيل اليومي. مع برو، سجّل كل عملياتك يومياً بدون انتظار.',
        icon: Icons.bolt_rounded,
      );
    case UpgradeLimitReason.aiTokens:
      return const _LimitCopy(
        title: 'رصيد ذكاء اصطناعي إضافي',
        message: 'استهلكت رصيد الذكاء الاصطناعي للشهر الحالي. اشترك في برو للحصول على رصيد أكبر وتحليلات أعمق.',
        icon: Icons.auto_awesome_rounded,
      );
    case UpgradeLimitReason.export:
      return const _LimitCopy(
        title: 'تصدير تقاريرك المالية',
        message: 'تصدير كل معاملاتك وتقاريرك بصيغ Excel و PDF متاح لمشتركي باقة برو.',
        icon: Icons.file_download_rounded,
      );
    case UpgradeLimitReason.general:
      return const _LimitCopy(
        title: 'ترقية الحساب لباقة برو',
        message: 'افتح إمكانيات سمارت سبند الكاملة: تسجيل صوتي وفواتير وتحليلات ذكاء اصطناعي وبدون إعلانات.',
        icon: Icons.workspace_premium_rounded,
      );
  }
}

/// A modal sheet presenting an upgrade prompt when a plan limit is reached (PLN-06).
///
/// It never blocks what was typed, can be swiped down or dismissed, and explains the value of Pro in plain Egyptian Arabic.
class UpgradePromptSheet extends StatelessWidget {
  const UpgradePromptSheet({
    super.key,
    required this.reason,
    this.customMessage,
    this.priceText,
    this.onUpgrade,
  });

  final UpgradeLimitReason reason;
  final String? customMessage;
  final String? priceText;
  final VoidCallback? onUpgrade;

  static const List<String> _proHighlights = [
    'تسجيل صوتي غير محدود وبدون قيود شهرية',
    'تصوير الفواتير والإيصالات واستخراج بنودها آلياً',
    'عدد غير محدود من الأهداف والميزانيات المخصصة',
    'تحليل مالي شهري متقدم بالذكاء الاصطناعي وبدون إعلانات',
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final copy = _copyFor(reason);
    final displayedPrice = priceText ?? '99 ج.م / شهرياً';

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          SmartSpendSpacing.xl,
          SmartSpendSpacing.sm,
          SmartSpendSpacing.xl,
          SmartSpendSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Badge & Header Icon
            Center(
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: colors.accent.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: colors.accent.withValues(alpha: 0.3),
                    width: 1.5,
                  ),
                ),
                child: Icon(copy.icon, color: colors.accent, size: 28),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),

            // Title
            Text(
              copy.title,
              textAlign: TextAlign.center,
              style: SmartSpendTypography.style(
                18,
                FontWeight.w700,
              ).copyWith(color: colors.foreground),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),

            // Description
            Text(
              customMessage ?? copy.message,
              textAlign: TextAlign.center,
              style: SmartSpendTypography.style(
                14,
                FontWeight.w400,
              ).copyWith(color: colors.mutedForeground, height: 1.5),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),

            // Highlights Container
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final item in _proHighlights)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Icon(
                            Icons.check_circle_rounded,
                            size: 16,
                            color: colors.accent,
                          ),
                          const SizedBox(width: SmartSpendSpacing.sm),
                          Expanded(
                            child: Text(
                              item,
                              style: SmartSpendTypography.style(
                                13,
                                FontWeight.w500,
                              ).copyWith(color: colors.foreground),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),

            // Price tag
            Center(
              child: Text(
                displayedPrice,
                style: SmartSpendTypography.style(
                  15,
                  FontWeight.w600,
                ).copyWith(color: colors.accent),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),

            // Primary Action
            SmartSpendButton(
              label: 'اشترك الآن في برو',
              onPressed: () {
                SmartSpendHaptics.selection();
                Navigator.of(context).pop(true);
                onUpgrade?.call();
              },
            ),
            const SizedBox(height: SmartSpendSpacing.xs),

            // Dismiss Action
            SmartSpendButton(
              label: 'ربما لاحقاً',
              variant: ButtonVariant.quiet,
              onPressed: () {
                Navigator.of(context).pop(false);
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Opens the standard upgrade prompt sheet for [reason].
///
/// Returns `true` if the user chose to upgrade, `false` or `null` if dismissed.
Future<bool?> showUpgradePromptSheet({
  required BuildContext context,
  required UpgradeLimitReason reason,
  String? customMessage,
  String? priceText,
  VoidCallback? onUpgrade,
}) {
  return showSmartSpendSheet<bool>(
    context: context,
    isDismissible: true,
    builder: (sheetContext) => UpgradePromptSheet(
      reason: reason,
      customMessage: customMessage,
      priceText: priceText,
      onUpgrade: onUpgrade,
    ),
  );
}
