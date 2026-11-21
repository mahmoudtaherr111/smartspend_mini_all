import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  test('initials take one letter, two for a name written with capitals, and two words\' first letters', () {
    expect(LogoBadge.initials('Netflix'), 'N');
    expect(LogoBadge.initials('OSN+'), 'OS');
    expect(LogoBadge.initials('YouTube Premium'), 'YP');
    expect(LogoBadge.initials('شاهد'), 'ش');
    expect(LogoBadge.initials('  '), '');
  });

  testWidgets(
    'without a logo it draws the letters in a colour that reads on the brand',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: const Scaffold(
            body: Center(
              child: LogoBadge(label: 'Netflix', color: Color(0xFFE50914)),
            ),
          ),
        ),
      );
      final letter = tester.widget<Text>(find.text('N'));
      expect(letter.style?.color, Colors.white);
      expect(find.bySemanticsLabel('Netflix'), findsOneWidget);
      semantics.dispose();
    },
  );
}
