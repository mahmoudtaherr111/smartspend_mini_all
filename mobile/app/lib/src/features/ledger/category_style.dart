import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'ledger_models.dart';

/// The icon and colour of each main category. The colours are the web app's (`contracts/categories.ts`), so a
/// category looks the same on both; the icons are Material's closest to the web's emoji.
const _styles = <String, (IconData, Color)>{
  'أكل وشرب': (Icons.restaurant, Color(0xFFF97316)),
  'مواصلات': (Icons.directions_car_outlined, Color(0xFF3B82F6)),
  'فواتير': (Icons.receipt_long_outlined, Color(0xFFEAB308)),
  'سكن': (Icons.home_outlined, Color(0xFF8B5CF6)),
  'تسوق': (Icons.shopping_bag_outlined, Color(0xFFEC4899)),
  'عناية شخصية': (Icons.content_cut, Color(0xFFD946EF)),
  'صحة': (Icons.medical_services_outlined, Color(0xFFEF4444)),
  'أطفال': (Icons.child_care, Color(0xFFFB7185)),
  'تعليم': (Icons.school_outlined, Color(0xFF6366F1)),
  'ترفيه': (Icons.sports_esports_outlined, Color(0xFFF59E0B)),
  'اشتراكات': (Icons.subscriptions_outlined, Color(0xFF14B8A6)),
  'تدخين': (Icons.smoking_rooms, Color(0xFF6B7280)),
  'هدايا وصدقات': (Icons.card_giftcard, Color(0xFFF43F5E)),
  'أقساط وفوايد': (Icons.request_quote_outlined, Color(0xFF7C3AED)),
  'خدمات حكومية': (Icons.account_balance_outlined, Color(0xFF78716C)),
  'عمل': (Icons.work_outline, Color(0xFF64748B)),
  'حيوانات أليفة': (Icons.pets, Color(0xFFA855F7)),
  'العائلة': (Icons.family_restroom, Color(0xFFE11D48)),
  'أصدقاء': (Icons.handshake_outlined, Color(0xFF10B981)),
  'موظفين': (Icons.engineering_outlined, Color(0xFF475569)),
  'متنوعات': (Icons.category_outlined, Color(0xFF94A3B8)),
  'مرتب': (Icons.payments_outlined, Color(0xFF22C55E)),
  'عمل حر': (Icons.laptop_mac, Color(0xFF06B6D4)),
  'عوائد استثمار': (Icons.trending_up, Color(0xFF84CC16)),
  'هدايا وعيديات': (Icons.redeem, Color(0xFF16A34A)),
  'دخل آخر': (Icons.savings_outlined, Color(0xFF15803D)),
  'تحويل': (Icons.swap_horiz, Color(0xFF0EA5E9)),
  'استثمار': (Icons.show_chart, Color(0xFFCA8A04)),
};

/// The icon of [category], or a receipt for a category the app does not know yet.
IconData categoryIcon(String category) =>
    _styles[category]?.$1 ?? Icons.receipt_outlined;

/// The colour of [category]'s icon. On the light theme it is darkened by a quarter, so pale hues such as the bills'
/// yellow still stand out on white.
Color categoryColor(BuildContext context, String category) {
  final colors = context.smartSpendColors;
  final base = _styles[category]?.$2 ?? colors.accent;
  return colors.brightness == Brightness.light
      ? Color.lerp(base, Colors.black, 0.25)!
      : base;
}

/// What an amount of this type means on screen: its sign, colour and spoken word (rule 6.2).
AmountKind amountKindOf(String type, num amount) => switch (type) {
  'income' => AmountKind.income,
  // A refund is saved negative in its category: money that came back.
  'expense' when amount < 0 => AmountKind.income,
  'expense' => AmountKind.expense,
  _ => AmountKind.neutral,
};

AmountKind entryKind(LedgerEntry entry) =>
    amountKindOf(entry.type, entry.amount);

AmountKind itemKind(ParsedItem item) => item.directionToSave == 'incoming'
    ? AmountKind.income
    : amountKindOf(item.type, item.amount);
