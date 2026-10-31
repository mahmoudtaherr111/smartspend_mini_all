import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'ledger_models.dart';

/// One main category from `contracts/categories.ts`: its movement type and its Arabic subcategories.
final class CategoryTaxonomy {
  const CategoryTaxonomy({
    required this.name,
    required this.type,
    required this.subcategories,
  });

  final String name;
  final String type;
  final List<String> subcategories;
}

/// The 28 canonical categories of `contracts/categories.ts`. Categories and subcategories stay in Arabic even when the
/// phone's interface is in English (decision 0020).
const categoryTaxonomy = <CategoryTaxonomy>[
  CategoryTaxonomy(
    name: 'أكل وشرب',
    type: 'expense',
    subcategories: [
      'وجبات سريعة',
      'مطعم',
      'قهوة وكافيه',
      'سناكس',
      'بقالة',
      'مخبوزات',
      'مشروبات',
      'دليفري',
      'لحوم ودواجن',
      'سي فود',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'مواصلات',
    type: 'expense',
    subcategories: [
      'أوبر/كريم',
      'مترو',
      'أتوبيس',
      'ميكروباص',
      'قطر',
      'تاكسي',
      'توكتوك',
      'بنزين',
      'صيانة عربية',
      'ركنة',
      'كارتة',
      'طيران',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'فواتير',
    type: 'expense',
    subcategories: [
      'كهرباء',
      'مياه',
      'غاز',
      'إنترنت',
      'تليفون',
      'شحن رصيد',
      'تأمين',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'سكن',
    type: 'expense',
    subcategories: [
      'إيجار',
      'أثاث',
      'صيانة',
      'نظافة',
      'أجهزة منزلية',
      'منظفات',
      'خدمات البيت',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'تسوق',
    type: 'expense',
    subcategories: ['ملابس', 'أحذية', 'أجهزة إلكترونية', 'إكسسوارات', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'عناية شخصية',
    type: 'expense',
    subcategories: ['حلاق وكوافير', 'مستحضرات وعناية', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'صحة',
    type: 'expense',
    subcategories: [
      'دكتور',
      'صيدلية',
      'تحاليل',
      'مستشفى',
      'أسنان',
      'نظارات',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'أطفال',
    type: 'expense',
    subcategories: [
      'حضانة',
      'بامبرز ولبن أطفال',
      'هدوم ولعب',
      'مصروف العيال',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'تعليم',
    type: 'expense',
    subcategories: ['مدرسة', 'جامعة', 'كورسات', 'كتب', 'دروس خصوصية', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'ترفيه',
    type: 'expense',
    subcategories: [
      'خروجة',
      'سينما',
      'ألعاب',
      'رياضة وجيم',
      'سفر',
      'كورنيش',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'اشتراكات',
    type: 'expense',
    subcategories: ['منصات مشاهدة', 'موسيقى', 'أدوات AI', 'برمجيات', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'تدخين',
    type: 'expense',
    subcategories: ['سجائر', 'فيب/ليكود', 'شيشة/معسل', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'هدايا وصدقات',
    type: 'expense',
    subcategories: [
      'عيد ميلاد',
      'فرح/خطوبة',
      'نقطة وواجب',
      'عيدية',
      'صدقة/تبرع',
      'زكاة',
      'أضحية',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'أقساط وفوايد',
    type: 'expense',
    subcategories: ['أقساط', 'فوايد قروض', 'رسوم بنكية', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'خدمات حكومية',
    type: 'expense',
    subcategories: [
      'رخصة',
      'جواز سفر',
      'بطاقة رقم قومي',
      'مخالفة مرور',
      'ضرائب',
      'توثيق',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'عمل',
    type: 'expense',
    subcategories: [
      'مستلزمات مكتب',
      'استضافة',
      'واجهات برمجية',
      'مساحة عمل',
      'عام',
    ],
  ),
  CategoryTaxonomy(
    name: 'حيوانات أليفة',
    type: 'expense',
    subcategories: ['أكل', 'طبيب بيطري', 'مستلزمات'],
  ),
  CategoryTaxonomy(
    name: 'العائلة',
    type: 'expense',
    subcategories: ['عام', 'الوالدين', 'الإخوة', 'الأبناء'],
  ),
  CategoryTaxonomy(name: 'أصدقاء', type: 'expense', subcategories: ['عام']),
  CategoryTaxonomy(name: 'موظفين', type: 'expense', subcategories: ['عام']),
  CategoryTaxonomy(
    name: 'متنوعات',
    type: 'expense',
    subcategories: ['عام', 'بقشيش'],
  ),
  CategoryTaxonomy(
    name: 'مرتب',
    type: 'income',
    subcategories: ['مرتب أساسي', 'أوفر تايم', 'مكافأة/بونص', 'بدلات'],
  ),
  CategoryTaxonomy(
    name: 'عمل حر',
    type: 'income',
    subcategories: ['مشروع', 'عمولة', 'سبوبة'],
  ),
  CategoryTaxonomy(
    name: 'عوائد استثمار',
    type: 'income',
    subcategories: ['أرباح', 'فوائد', 'كاش باك'],
  ),
  CategoryTaxonomy(
    name: 'هدايا وعيديات',
    type: 'income',
    subcategories: ['عيدية', 'هدية فلوس', 'نقطة', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'دخل آخر',
    type: 'income',
    subcategories: ['مرتجعات واسترداد', 'بيع حاجة', 'عام'],
  ),
  CategoryTaxonomy(
    name: 'تحويل',
    type: 'transfer',
    subcategories: [
      'سحب ATM',
      'تحويل بنكي',
      'انستاباي',
      'فودافون كاش',
      'تحويل كاش',
      'ادخار',
      'جمعية',
      'دين/سلفة',
      'أشخاص',
    ],
  ),
  CategoryTaxonomy(
    name: 'استثمار',
    type: 'investment',
    subcategories: ['ذهب', 'أسهم', 'شهادات', 'عقارات', 'عملات رقمية'],
  ),
];

/// The categories offered for [type], plus the person's custom expense categories and [current] when an older or
/// custom category is already on the transaction.
List<String> categoriesForType(
  String type, {
  String? current,
  List<String> custom = const [],
}) {
  final seen = <String>{};
  final result = <String>[];
  void add(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isNotEmpty && seen.add(trimmed)) {
      result.add(trimmed);
    }
  }

  for (final item in categoryTaxonomy) {
    if (item.type == type) add(item.name);
  }
  if (type == 'expense') {
    for (final name in custom) {
      add(name);
    }
  }
  if (current != null) add(current);
  return result;
}

/// The subcategories of [category], keeping [current] when the transaction already carries a custom or older one.
List<String> subcategoriesForCategory(String category, {String? current}) {
  final match = categoryTaxonomy
      .where((item) => item.name == category)
      .firstOrNull;
  final base = match?.subcategories ?? const ['عام'];
  final trimmed = current?.trim();
  if (trimmed == null || trimmed.isEmpty || base.contains(trimmed)) {
    return base;
  }
  return [trimmed, ...base];
}

/// What subcategory a newly picked [category] starts with: «عام» when it has one, else its first subcategory.
String defaultSubCategory(String category) {
  final subs = subcategoriesForCategory(category);
  if (subs.contains('عام')) return 'عام';
  return subs.first;
}

/// The icon of [category], or a neutral tag for a category the app does not know yet (FND-03).
IconData categoryIcon(String category) => categoryStyleIcon(category);

/// The colour of [category]'s icon, darkened on the light theme so pale hues stand out on white.
Color categoryColor(BuildContext context, String category) =>
    categoryStyleColor(context, category);

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
