// Rules 3.1, 6.1 and 12.1 of docs/guides/mobile-design.md, checked on the rendered components with Flutter's own
// accessibility guidelines: targets of at least 48 by 48 (Android) and 44 by 44 (iOS), a label on every target,
// and readable text contrast.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/gallery.dart';
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
  SmartSpendDestination(
    icon: Icons.menu,
    selectedIcon: Icons.menu_open,
    label: 'المزيد',
  ),
];

Future<void> _meetsAllGuidelines(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

void main() {
  for (final (name, theme) in [
    ('dark', SmartSpendTheme.dark()),
    ('light', SmartSpendTheme.light()),
  ]) {
    testWidgets('the tab bar meets the guidelines in the $name theme', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              bottomNavigationBar: SmartSpendNavigationBar(
                destinations: _destinations,
                selectedIndex: 0,
                onSelected: (_) {},
              ),
            ),
          ),
        ),
      );

      await _meetsAllGuidelines(tester);
      semantics.dispose();
    });

    testWidgets(
      'an open bottom sheet meets the guidelines in the $name theme',
      (tester) async {
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Builder(
                builder: (context) => Scaffold(
                  body: Center(
                    child: FilledButton(
                      onPressed: () => showSmartSpendSheet<void>(
                        context: context,
                        builder: (_) => Padding(
                          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
                          child: FilledButton(
                            onPressed: () {},
                            child: const Text('حفظ'),
                          ),
                        ),
                      ),
                      child: const Text('افتح'),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('افتح'));
        await tester.pumpAndSettle();

        await _meetsAllGuidelines(tester);
        semantics.dispose();
      },
    );

    testWidgets(
      'every component in the gallery meets the guidelines in the $name theme',
      (tester) async {
        final semantics = tester.ensureSemantics();
        tester.view.physicalSize = const Size(1080, 6000);
        tester.view.devicePixelRatio = 2.5;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            locale: const Locale('ar'),
            supportedLocales: const [Locale('ar'), Locale('en')],
            localizationsDelegates: GlobalMaterialLocalizations.delegates,
            home: const ComponentGallery(),
          ),
        );
        // Skeletons and the busy button keep moving, so the page never settles; let it draw.
        await tester.pump(const Duration(milliseconds: 300));

        await _meetsAllGuidelines(tester);
        semantics.dispose();
      },
    );
  }
}
