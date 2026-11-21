// Every text a person reads lives in the translation files (mobile rule 6). Arabic written in a screen breaks the
// English interface, so a new one fails here.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Files where Arabic is data the server or the matching rules need, not interface text, with why.
const _allowed = {
  // The taxonomy's own names, shared with the server and never translated (decision 0020).
  'features/ledger/category_style.dart',
  // Words the sentence rules match.
  'features/ledger/offline/offline_rules.dart',
  // Letter folding for phrases and search, and phrases the server compares.
  'features/ai/ai_models.dart',
  // Prompts sent to the assistant in the language it reads.
  'features/ai/ai_api.dart',
  // Season names as the server's calendar has them.
  'features/seasons/season_models.dart',
  // Hidden until the call has audio (decision 0040).
  'features/ai/voice/voice_call_models.dart',
  'features/ai/voice/voice_call_controller.dart',
  // Sent to the server as the business description.
  'features/business/business_api.dart',
  // Legal pages wait for a lawyer's reviewed text; they are not to be translated by a model.
  'features/infrastructure/terms_screen.dart',
  'features/infrastructure/data_stored_screen.dart',
};

/// Single values that are data wherever they appear: what the server and the matching rules read.
const _dataWords = {
  // The phrase the server compares before deleting an account.
  'احذف حسابي',
  'عام',
  'الكل',
  'أكل وشرب',
  'مرتب',
  'تحويل',
  'متنوعات',
  'غير مصنف',
  'السبت',
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'أ',
  'إ',
  'آ',
  'ا',
  'ؤ',
  'و',
  'ئ',
  'ي',
  'ى',
  'ة',
  'ه',
  'ـ',
  '٠',
  '١',
  '٢',
  '٣',
  '٤',
  '٥',
  '٦',
  '٧',
  '٨',
  '٩',
  '، ',
  '؟',
};

void main() {
  test('screens hold no Arabic text outside the translation files', () {
    final arabic = RegExp('[؀-ۿ]');
    final literal = RegExp(r"""'((?:[^'\\\n]|\\.)*)'""");
    final found = <String>[];
    for (final file in Directory(
      'lib/src',
    ).listSync(recursive: true).whereType<File>()) {
      final path = file.path.replaceAll(r'\', '/').replaceFirst('lib/src/', '');
      if (!path.endsWith('.dart') ||
          path.startsWith('l10n/') ||
          _allowed.contains(path)) {
        continue;
      }
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trimLeft().startsWith('//')) continue;
        for (final match in literal.allMatches(lines[i])) {
          final text = match.group(1)!;
          // A digit class in a pattern or an unknown name's placeholder is no text.
          if (arabic.hasMatch(text) &&
              !text.contains('٠-٩') &&
              !text.contains('أإآ') &&
              !_dataWords.contains(text)) {
            found.add('$path:${i + 1}: $text');
          }
        }
      }
    }
    expect(found, isEmpty);
  });
}
