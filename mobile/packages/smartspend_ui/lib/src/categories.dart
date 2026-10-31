import 'package:flutter/material.dart';

import 'bidi.dart';
import 'theme.dart';
import 'tokens.dart';

/// The icon and colour of every category the server returns (`contracts/categories.ts` and
/// `api/expense-router.ts`), all from Material's rounded family so every row, chart and detail screen speaks one
/// visual language (FND-03, design brief §6).
const knownCategoryStyles = <String, (IconData, Color)>{
  'أكل وشرب': (Icons.restaurant_rounded, Color(0xFFF97316)),
  'مواصلات': (Icons.directions_car_rounded, Color(0xFF3B82F6)),
  'فواتير': (Icons.receipt_long_rounded, Color(0xFFEAB308)),
  'سكن': (Icons.home_rounded, Color(0xFF8B5CF6)),
  'تسوق': (Icons.shopping_bag_rounded, Color(0xFFEC4899)),
  'عناية شخصية': (Icons.content_cut_rounded, Color(0xFFD946EF)),
  'صحة': (Icons.medical_services_rounded, Color(0xFFEF4444)),
  'أطفال': (Icons.child_care_rounded, Color(0xFFFB7185)),
  'تعليم': (Icons.school_rounded, Color(0xFF6366F1)),
  'ترفيه': (Icons.sports_esports_rounded, Color(0xFFF59E0B)),
  'اشتراكات': (Icons.subscriptions_rounded, Color(0xFF14B8A6)),
  'تدخين': (Icons.smoking_rooms_rounded, Color(0xFF6B7280)),
  'هدايا وصدقات': (Icons.card_giftcard_rounded, Color(0xFFF43F5E)),
  'أقساط وفوايد': (Icons.request_quote_rounded, Color(0xFF7C3AED)),
  'خدمات حكومية': (Icons.account_balance_rounded, Color(0xFF78716C)),
  'عمل': (Icons.work_rounded, Color(0xFF64748B)),
  'حيوانات أليفة': (Icons.pets_rounded, Color(0xFFA855F7)),
  'العائلة': (Icons.family_restroom_rounded, Color(0xFFE11D48)),
  'أصدقاء': (Icons.handshake_rounded, Color(0xFF10B981)),
  'موظفين': (Icons.engineering_rounded, Color(0xFF475569)),
  'متنوعات': (Icons.category_rounded, Color(0xFF94A3B8)),
  'مرتب': (Icons.payments_rounded, Color(0xFF22C55E)),
  'عمل حر': (Icons.laptop_mac_rounded, Color(0xFF06B6D4)),
  'عوائد استثمار': (Icons.trending_up_rounded, Color(0xFF84CC16)),
  'هدايا وعيديات': (Icons.redeem_rounded, Color(0xFF16A34A)),
  'دخل آخر': (Icons.savings_rounded, Color(0xFF15803D)),
  'تحويل': (Icons.swap_horiz_rounded, Color(0xFF0EA5E9)),
  'استثمار': (Icons.show_chart_rounded, Color(0xFFCA8A04)),
  // Retired or fallback names that older rows and rollups may still carry.
  'خدمات سيارات': (Icons.build_circle_rounded, Color(0xFF3B82F6)),
  'خدمات رقمية': (Icons.cloud_rounded, Color(0xFF14B8A6)),
  'التزامات وجمعيات': (Icons.event_repeat_rounded, Color(0xFF7C3AED)),
  'دخل': (Icons.payments_rounded, Color(0xFF22C55E)),
  'ادخار': (Icons.savings_rounded, Color(0xFF0EA5E9)),
  'غير مصنف': (Icons.help_outline_rounded, Color(0xFF94A3B8)),
};

/// The neutral rounded icon used for a custom or unknown category.
const neutralCategoryIcon = Icons.label_rounded;

/// The rounded icon of [category], or [neutralCategoryIcon] when it is a custom or unknown name.
IconData categoryStyleIcon(String category) =>
    knownCategoryStyles[category.trim()]?.$1 ?? neutralCategoryIcon;

/// The colour of [category]'s icon, or a neutral muted tone when unknown. Darkened on the light theme so pale hues
/// such as the bills' yellow still stand out on white.
Color categoryStyleColor(BuildContext context, String category) {
  final colors = context.smartSpendColors;
  final entry = knownCategoryStyles[category.trim()];
  if (entry == null) return colors.mutedForeground;
  final base = entry.$2;
  return colors.brightness == Brightness.light
      ? Color.lerp(base, Colors.black, 0.25)!
      : base;
}

/// A category's tinted icon tile, optionally paired with its written name so colour and shape are never the only
/// signal (FND-03, design brief §6 and §9).
class CategoryTile extends StatelessWidget {
  const CategoryTile({
    super.key,
    required this.category,
    this.icon,
    this.tint,
    this.size = 44,
    this.showLabel = false,
  });

  final String category;
  final IconData? icon;
  final Color? tint;
  final double size;

  /// Shows [category] beside the icon tile as one merged accessible label.
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final resolvedIcon = icon ?? categoryStyleIcon(category);
    final resolvedTint = tint ?? categoryStyleColor(context, category);
    final tile = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: resolvedTint.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      ),
      child: Icon(resolvedIcon, color: resolvedTint, size: size * 0.5),
    );
    if (!showLabel) return tile;
    return MergeSemantics(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(child: tile),
          const SizedBox(width: SmartSpendSpacing.sm),
          Flexible(
            child: Text(
              inlineName(category),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}
