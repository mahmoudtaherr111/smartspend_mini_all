/// Whether a sentence is worth keeping offline until it can be read: the web's check
/// (`src/lib/clientRulesEngine.ts#validateOfflineInput`), so a phone does not queue what the server would only
/// refuse. Returns why it is not, or null when it is.
///
/// One difference: the web compares its word lists with the normalized sentence without normalizing the lists, so
/// «فاتورة» and «جنية» never match; here both sides are normalized.
OfflineRefusal? checkOfflineSentence(String text) {
  final trimmed = text.trim();
  if (trimmed.length < 5) return OfflineRefusal.tooShort;
  // A character other than a space or «ه» (laughter) five times in a row.
  if (RegExp(r'(?![ه\s])(.)\1{4,}').hasMatch(trimmed)) {
    return OfflineRefusal.unreadable;
  }
  final normalized = normalizeArabic(trimmed);
  final hasDigits = RegExp('[0-9٠-٩]').hasMatch(normalized);
  final hasWord = [
    ..._currencyWords,
    ..._numberWords,
  ].map(normalizeArabic).any(normalized.contains);
  return hasDigits || hasWord ? null : OfflineRefusal.noAmount;
}

enum OfflineRefusal {
  /// «الجملة قصيرة. اكتب صرفت في إيه وبكام.»
  tooShort,

  /// «مش فاهمين الجملة دي. اكتب صرفت في إيه وبكام.»
  unreadable,

  /// «مش لاقيين مبلغ في الجملة…»
  noAmount,
}

/// Folds the letters people write in several ways, as the web's `normalizeArabicText` does.
String normalizeArabic(String text) => text
    .trim()
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ة', 'ه')
    .replaceAll('ى', 'ي')
    .replaceAll(RegExp('[\u064B-\u065F]'), '')
    .toLowerCase();

const _currencyWords = [
  'جنيه',
  'جنية',
  'جنيهات',
  'جنيها',
  'ج.م',
  'قرش',
  'قروش',
  'مبلغ',
  'مرتب',
  'راتب',
  'فواتير',
  'فاتورة',
  'اشتراك',
  'قسط',
  'فلوس',
  'مصاريف',
  'دولار',
  'يورو',
  'ريال',
  'دينار',
];

const _numberWords = [
  'واحد',
  'اثنين',
  'تلاته',
  'ثلاثه',
  'اربعه',
  'خمسه',
  'سته',
  'سبعه',
  'تمانيه',
  'تسعه',
  'عشره',
  'عشرين',
  'تلاتين',
  'اربعين',
  'خمسين',
  'ستين',
  'سبعين',
  'تمانين',
  'تسعين',
  'ميه',
  'مائه',
  'ماتين',
  'مائتين',
  'الف',
  'الاف',
  'مليون',
];
