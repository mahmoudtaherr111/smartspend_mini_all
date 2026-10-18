import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

const _destinations = [
  SmartSpendDestination(
    icon: Icons.add_circle_outline,
    selectedIcon: Icons.add_circle,
    label: 'تسجيل',
  ),
  SmartSpendDestination(
    icon: Icons.bar_chart_outlined,
    selectedIcon: Icons.bar_chart,
    label: 'إحصائيات',
  ),
];

Widget _app(Widget home) => MaterialApp(
  theme: SmartSpendTheme.dark(),
  home: Directionality(textDirection: TextDirection.rtl, child: home),
);

void main() {
  group('theme', () {
    test(
      'the dark theme is the brand: navy background, emerald accent, Cairo',
      () {
        final theme = SmartSpendTheme.dark();

        expect(theme.brightness, Brightness.dark);
        expect(theme.scaffoldBackgroundColor, const Color(0xFF090D16));
        expect(theme.colorScheme.primary, SmartSpendColors.dark.accent);
        expect(
          theme.textTheme.bodyMedium?.fontFamily,
          SmartSpendTypography.fontFamily,
        );
        expect(
          theme.extension<SmartSpendColorsTheme>()?.colors,
          SmartSpendColors.dark,
        );
      },
    );

    test('text styles move the variable font along with the weight', () {
      final style = SmartSpendTypography.style(16, FontWeight.w700);

      expect(style.fontWeight, FontWeight.w700);
      expect(style.fontVariations?.single.axis, 'wght');
      expect(style.fontVariations?.single.value, 700);
    });
  });

  group('navigation bar', () {
    late List<String> haptics;

    setUp(() {
      haptics = [];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'HapticFeedback.vibrate') {
              haptics.add(call.arguments as String);
            }
            return null;
          });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    testWidgets('a new tab ticks and reports its index', (tester) async {
      final selected = <int>[];
      await tester.pumpWidget(
        _app(
          Scaffold(
            bottomNavigationBar: SmartSpendNavigationBar(
              destinations: _destinations,
              selectedIndex: 0,
              onSelected: selected.add,
            ),
          ),
        ),
      );

      await tester.tap(find.text('إحصائيات'));
      await tester.pump();

      expect(selected, [1]);
      expect(haptics, ['HapticFeedbackType.selectionClick']);
    });

    testWidgets('the current tab reports again without a tick', (tester) async {
      final selected = <int>[];
      await tester.pumpWidget(
        _app(
          Scaffold(
            bottomNavigationBar: SmartSpendNavigationBar(
              destinations: _destinations,
              selectedIndex: 0,
              onSelected: selected.add,
            ),
          ),
        ),
      );

      await tester.tap(find.text('تسجيل'));
      await tester.pump();

      expect(selected, [0]);
      expect(haptics, isEmpty);
    });
  });

  group('bottom sheet', () {
    Future<void> openSheet(
      WidgetTester tester, {
      bool isDismissible = true,
    }) async {
      await tester.pumpWidget(
        _app(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showSmartSpendSheet<void>(
                    context: context,
                    isDismissible: isDismissible,
                    builder: (_) => const SizedBox(
                      height: 240,
                      child: Center(child: Text('محتوى')),
                    ),
                  ),
                  child: const Text('افتح'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('افتح'));
      await tester.pumpAndSettle();
    }

    testWidgets('closes when swiped down', (tester) async {
      await openSheet(tester);
      expect(find.text('محتوى'), findsOneWidget);

      await tester.fling(find.text('محتوى'), const Offset(0, 400), 2000);
      await tester.pumpAndSettle();

      expect(find.text('محتوى'), findsNothing);
    });

    testWidgets('that must end in a choice stays when swiped', (tester) async {
      await openSheet(tester, isDismissible: false);

      await tester.fling(find.text('محتوى'), const Offset(0, 400), 2000);
      await tester.pumpAndSettle();

      expect(find.text('محتوى'), findsOneWidget);
    });
  });
}
