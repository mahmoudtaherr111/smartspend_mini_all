// Screens take colour, type, corners and spacing from the design system (mobile rule 12,
// docs/guides/mobile-design.md rules 1.1, 3.2 and 5.1). A value written in a screen is how a teal chat and black text
// on a dark card happened, so a new one fails here.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Files where a raw value is right, with why.
const _allowed = {
  // Each bank and wallet's own brand colour, a fact about the real world.
  'features/wallets/wallet_models.dart',
  'features/wallets/wallet_style.dart',
  // Hidden until the call has audio (decision 0040); they get their design when the call is rebuilt.
  'features/ai/voice/voice_call_screen.dart',
  'features/ai/voice/past_calls_view.dart',
};

final _rules = <String, RegExp>{
  'a raw colour': RegExp(r'\bColor\(0x|\bColors\.(?!transparent\b)[a-z]'),
  'a raw text style': RegExp(r'\bTextStyle\(|SmartSpendTypography\.style\('),
  'a raw font size or weight': RegExp(r'\b(fontSize|fontWeight):'),
  'a raw corner radius': RegExp(r'BorderRadius\.circular\(\d'),
  'raw spacing': RegExp(r'SizedBox\((height|width): \d|EdgeInsets\.all\(\d'),
  'a shadow': RegExp(r'\bBoxShadow\('),
  'money that ignores hidden amounts': RegExp(r'\bformatMoney\('),
  'a sheet opened without showSmartSpendSheet': RegExp(
    r'\bshowModalBottomSheet\b',
  ),
};

void main() {
  test('screens hold no raw design values', () {
    final found = <String>[];
    for (final file in Directory(
      'lib/src/features',
    ).listSync(recursive: true).whereType<File>()) {
      final path = file.path.replaceAll(r'\', '/').replaceFirst('lib/src/', '');
      if (!path.endsWith('.dart') || _allowed.contains(path)) continue;
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trimLeft().startsWith('//')) continue;
        for (final MapEntry(key: what, value: rule) in _rules.entries) {
          if (rule.hasMatch(lines[i])) found.add('$path:${i + 1}: $what');
        }
      }
    }
    expect(found, isEmpty);
  });
}
