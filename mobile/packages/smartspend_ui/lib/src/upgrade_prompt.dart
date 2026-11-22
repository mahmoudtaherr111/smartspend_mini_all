import 'package:flutter/material.dart';

import 'bottom_sheet.dart';
import 'buttons.dart';
import 'haptics.dart';
import 'theme.dart';
import 'tokens.dart';
import 'typography.dart';

/// Global configuration for [UpgradePromptSheet] and [showUpgradePromptSheet].
///
/// Configure [defaultOnUpgrade] once during app bootstrap (for example navigating
/// to `/more/plan`) so tapping the primary CTA navigates cleanly even when a caller
/// does not pass an explicit `onUpgrade` callback.
abstract final class SmartSpendUpgradePrompt {
  static void Function(BuildContext context)? defaultOnUpgrade;
}

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

bool _isEnglish(BuildContext context) =>
    Localizations.maybeLocaleOf(context)?.languageCode == 'en';

_LimitCopy _defaultCopyFor(UpgradeLimitReason reason, {required bool english}) {
  if (english) {
    return switch (reason) {
      UpgradeLimitReason.voiceSeconds => const _LimitCopy(
        title: 'Unlimited voice recording with Pro',
        message: 'You used all your monthly voice seconds. Upgrade to Pro to record expenses by voice without monthly limits.',
        icon: Icons.mic_rounded,
      ),
      UpgradeLimitReason.receipts => const _LimitCopy(
        title: 'AI receipt scanning',
        message: 'Scanning receipts and extracting line items automatically is available with Pro.',
        icon: Icons.receipt_long_rounded,
      ),
      UpgradeLimitReason.goals => const _LimitCopy(
        title: 'Unlimited saving goals',
        message: 'You reached the Free plan goal limit. Pro gives you unlimited goals with AI guidance.',
        icon: Icons.flag_rounded,
      ),
      UpgradeLimitReason.budgets => const _LimitCopy(
        title: 'Custom category budgets',
        message:
            'Track every category closely and create custom budgets with Pro.',
        icon: Icons.pie_chart_rounded,
      ),
      UpgradeLimitReason.dailyEntries => const _LimitCopy(
        title: 'Uninterrupted smart recording',
        message: 'You reached the daily recording limit. Upgrade to Pro to log every transaction without waiting.',
        icon: Icons.bolt_rounded,
      ),
      UpgradeLimitReason.aiTokens => const _LimitCopy(
        title: 'More AI insights balance',
        message: 'You used your monthly AI allowance. Upgrade to Pro for higher limits and deeper analysis.',
        icon: Icons.auto_awesome_rounded,
      ),
      UpgradeLimitReason.export => const _LimitCopy(
        title: 'Export your financial reports',
        message: 'Exporting transactions and reports to CSV and PDF is available for Pro members.',
        icon: Icons.file_download_rounded,
      ),
      UpgradeLimitReason.general => const _LimitCopy(
        title: 'Upgrade to SmartSpend Pro',
        message: 'Unlock unlimited voice recording, receipt scanning, advanced AI analysis, and an ad-free experience.',
        icon: Icons.workspace_premium_rounded,
      ),
    };
  }

  return switch (reason) {
    UpgradeLimitReason.voiceSeconds => const _LimitCopy(
      title: 'تسجيل صوتي بلا حدود مع برو',
      message: 'استهلكت كل ثواني الصوت للشهر ده. اشترك في باقة برو وسجل كل مصاريفك بالصوت بدون أي قيود شهرية.',
      icon: Icons.mic_rounded,
    ),
    UpgradeLimitReason.receipts => const _LimitCopy(
      title: 'تصوير الفواتير بالذكاء الاصطناعي',
      message: 'ميزة تصوير الفواتير والإيصالات وقراءتها آلياً متاحة حصرياً لأعضاء باقة برو.',
      icon: Icons.receipt_long_rounded,
    ),
    UpgradeLimitReason.goals => const _LimitCopy(
      title: 'أهداف مالية غير محدودة',
      message: 'وصلت للحد الأقصى للأهداف المالية في الباقة المجانية. باقة برو تتيح لك إنشاء عدد لا نهائي من الأهداف وتحليلها.',
      icon: Icons.flag_rounded,
    ),
    UpgradeLimitReason.budgets => const _LimitCopy(
      title: 'ميزانيات مخصصة لكل فئة',
      message: 'تحكم بمصاريفك بدقة واصنع ميزانيات مخصصة لكل جوانب حياتك مع باقة برو.',
      icon: Icons.pie_chart_rounded,
    ),
    UpgradeLimitReason.dailyEntries => const _LimitCopy(
      title: 'تسجيل ذكي بلا توقف',
      message: 'وصلت للحد الأقصى للتسجيل اليومي. مع برو، سجّل كل عملياتك يومياً بدون انتظار.',
      icon: Icons.bolt_rounded,
    ),
    UpgradeLimitReason.aiTokens => const _LimitCopy(
      title: 'رصيد ذكاء اصطناعي إضافي',
      message: 'استهلكت رصيد الذكاء الاصطناعي للشهر الحالي. اشترك في برو للحصول على رصيد أكبر وتحليلات أعمق.',
      icon: Icons.auto_awesome_rounded,
    ),
    UpgradeLimitReason.export => const _LimitCopy(
      title: 'تصدير تقاريرك المالية',
      message:
          'تصدير كل معاملاتك وتقاريرك بصيغ Excel و PDF متاح لمشتركي باقة برو.',
      icon: Icons.file_download_rounded,
    ),
    UpgradeLimitReason.general => const _LimitCopy(
      title: 'ترقية الحساب لباقة برو',
      message: 'افتح إمكانيات سمارت سبند الكاملة: تسجيل صوتي وفواتير وتحليلات ذكاء اصطناعي وبدون إعلانات.',
      icon: Icons.workspace_premium_rounded,
    ),
  };
}

const List<String> _defaultArabicHighlights = [
  'تسجيل صوتي غير محدود وبدون قيود شهرية',
  'تصوير الفواتير والإيصالات واستخراج بنودها آلياً',
  'عدد غير محدود من الأهداف والميزانيات المخصصة',
  'تحليل مالي شهري متقدم بالذكاء الاصطناعي وبدون إعلانات',
];

const List<String> _defaultEnglishHighlights = [
  'Unlimited voice recording with no monthly caps',
  'Scan receipts and extract items automatically',
  'Unlimited saving goals and custom category budgets',
  'Advanced monthly AI analysis with zero ads',
];

/// A modal sheet presenting an upgrade prompt when a plan limit is reached (PLN-06).
///
/// It never blocks what was typed, can be swiped down or dismissed, supports full
/// localization overrides (with Arabic and English defaults), omits hardcoded prices
/// unless [priceText] is provided, and delegates to [SmartSpendUpgradePrompt.defaultOnUpgrade]
/// when [onUpgrade] is omitted.
class UpgradePromptSheet extends StatelessWidget {
  const UpgradePromptSheet({
    super.key,
    required this.reason,
    this.title,
    this.customMessage,
    this.highlights,
    this.priceText,
    this.upgradeLabel,
    this.dismissLabel,
    this.onUpgrade,
    this.invokeDefaultOnPop = true,
  });

  final UpgradeLimitReason reason;
  final String? title;
  final String? customMessage;
  final List<String>? highlights;

  /// Optional live store/server price label. Hidden when null or empty.
  final String? priceText;
  final String? upgradeLabel;
  final String? dismissLabel;
  final VoidCallback? onUpgrade;

  /// Internal coordination flag: when opened via [showUpgradePromptSheet], the host
  /// invokes [SmartSpendUpgradePrompt.defaultOnUpgrade] with the mounted caller context
  /// right after pop. When mounted directly, the button calls it with this context.
  final bool invokeDefaultOnPop;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final english = _isEnglish(context);
    final copy = _defaultCopyFor(reason, english: english);
    final resolvedTitle = title ?? copy.title;
    final resolvedMessage = customMessage ?? copy.message;
    final resolvedHighlights =
        highlights ??
        (english ? _defaultEnglishHighlights : _defaultArabicHighlights);
    final resolvedUpgradeLabel =
        upgradeLabel ?? (english ? 'Upgrade to Pro' : 'اشترك الآن في برو');
    final resolvedDismissLabel =
        dismissLabel ?? (english ? 'Maybe later' : 'ربما لاحقاً');
    final displayedPrice = priceText?.trim();
    final hasPrice = displayedPrice != null && displayedPrice.isNotEmpty;

    return SingleChildScrollView(
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

          Text(
            resolvedTitle,
            textAlign: TextAlign.center,
            style: SmartSpendTypography.style(
              18,
              FontWeight.w700,
            ).copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),

          Text(
            resolvedMessage,
            textAlign: TextAlign.center,
            style: SmartSpendTypography.style(
              14,
              FontWeight.w400,
            ).copyWith(color: colors.mutedForeground, height: 1.5),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),

          if (resolvedHighlights.isNotEmpty) ...[
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
                  for (final item in resolvedHighlights)
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
          ],

          if (hasPrice) ...[
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
          ],

          SmartSpendButton(
            label: resolvedUpgradeLabel,
            onPressed: () {
              SmartSpendHaptics.selection();
              Navigator.of(context).pop(true);
              if (onUpgrade != null) {
                onUpgrade!();
              } else if (invokeDefaultOnPop) {
                SmartSpendUpgradePrompt.defaultOnUpgrade?.call(context);
              }
            },
          ),
          const SizedBox(height: SmartSpendSpacing.xs),

          SmartSpendButton(
            label: resolvedDismissLabel,
            variant: ButtonVariant.quiet,
            onPressed: () {
              Navigator.of(context).pop(false);
            },
          ),
        ],
      ),
    );
  }
}

/// Opens the standard upgrade prompt sheet for [reason].
///
/// Returns `true` if the user chose to upgrade, `false` or `null` if dismissed.
/// When [onUpgrade] is omitted and the user taps upgrade, invokes
/// [SmartSpendUpgradePrompt.defaultOnUpgrade] with the mounted caller [context].
Future<bool?> showUpgradePromptSheet({
  required BuildContext context,
  required UpgradeLimitReason reason,
  String? title,
  String? customMessage,
  List<String>? highlights,
  String? priceText,
  String? upgradeLabel,
  String? dismissLabel,
  VoidCallback? onUpgrade,
}) async {
  final result = await showSmartSpendSheet<bool>(
    context: context,
    isDismissible: true,
    builder: (sheetContext) => UpgradePromptSheet(
      reason: reason,
      title: title,
      customMessage: customMessage,
      highlights: highlights,
      priceText: priceText,
      upgradeLabel: upgradeLabel,
      dismissLabel: dismissLabel,
      onUpgrade: onUpgrade,
      invokeDefaultOnPop: false,
    ),
  );
  if (result == true && onUpgrade == null && context.mounted) {
    SmartSpendUpgradePrompt.defaultOnUpgrade?.call(context);
  }
  return result;
}
