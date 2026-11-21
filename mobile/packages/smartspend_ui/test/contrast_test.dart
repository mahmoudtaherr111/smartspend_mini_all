// Rule 6.1 of docs/guides/mobile-design.md: text and the colours it sits on reach WCAG 2 level AA in both themes.
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// The WCAG 2 contrast ratio of two opaque colours, from 1 to 21.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final lighter = la > lb ? la : lb;
  final darker = la > lb ? lb : la;
  return (lighter + 0.05) / (darker + 0.05);
}

/// Normal text: 4.5 to 1.
const _text = 4.5;

void main() {
  for (final (name, c) in [
    ('dark', SmartSpendColors.dark),
    ('light', SmartSpendColors.light),
  ]) {
    group('$name theme', () {
      final backgrounds = {
        'background': c.background,
        'surface': c.surface,
        'surfaceRaised': c.surfaceRaised,
        // Both ends of the hero wash, which text sits on.
        'washStart': c.washStart,
        'washEnd': c.washEnd,
      };
      final texts = {
        'foreground': c.foreground,
        'mutedForeground': c.mutedForeground,
        'accent': c.accent,
        'ai': c.ai,
        'warning': c.warning,
        'danger': c.danger,
        'info': c.info,
      };

      for (final MapEntry(key: textName, value: text) in texts.entries) {
        for (final MapEntry(key: backName, value: back)
            in backgrounds.entries) {
          test('$textName text on $backName reads at 4.5:1', () {
            expect(
              contrast(text, back),
              greaterThanOrEqualTo(_text),
              reason:
                  '$textName on $backName is '
                  '${contrast(text, back).toStringAsFixed(2)}:1',
            );
          });
        }
      }

      test('a button label on the accent reads at 4.5:1', () {
        expect(
          contrast(c.onAccent, c.accent),
          greaterThanOrEqualTo(_text),
          reason: '${contrast(c.onAccent, c.accent).toStringAsFixed(2)}:1',
        );
      });
    });
  }
}
