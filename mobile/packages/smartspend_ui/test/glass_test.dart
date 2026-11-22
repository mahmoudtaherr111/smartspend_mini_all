import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
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
  SmartSpendDestination(
    icon: Icons.auto_awesome_outlined,
    selectedIcon: Icons.auto_awesome,
    label: 'الذكاء',
  ),
  SmartSpendDestination(
    icon: Icons.menu,
    selectedIcon: Icons.menu_open,
    label: 'المزيد',
  ),
];

Widget _framed({
  required Widget child,
  TargetPlatform platform = TargetPlatform.iOS,
  Brightness brightness = Brightness.dark,
  bool highContrast = false,
  TextDirection direction = TextDirection.rtl,
  EdgeInsets viewPadding = EdgeInsets.zero,
  EdgeInsets viewInsets = EdgeInsets.zero,
}) {
  final baseTheme = brightness == Brightness.dark
      ? SmartSpendTheme.dark()
      : SmartSpendTheme.light();
  return MaterialApp(
    theme: baseTheme.copyWith(platform: platform),
    locale: direction == TextDirection.rtl
        ? const Locale('ar')
        : const Locale('en'),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    builder: (context, inner) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        highContrast: highContrast,
        viewPadding: viewPadding,
        padding: EdgeInsets.only(
          top: viewPadding.top,
          bottom: (viewPadding.bottom - viewInsets.bottom).clamp(
            0.0,
            double.infinity,
          ),
        ),
        viewInsets: viewInsets,
      ),
      child: Directionality(textDirection: direction, child: inner!),
    ),
    home: child,
  );
}

void main() {
  group('SmartSpendGlassSurface', () {
    testWidgets('uses BackdropFilter on iOS standard contrast', (tester) async {
      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.iOS,
          child: const Scaffold(
            body: Center(
              child: SmartSpendGlassSurface(
                padding: EdgeInsets.all(SmartSpendSpacing.lg),
                child: Text('Glass'),
              ),
            ),
          ),
        ),
      );

      expect(find.byType(BackdropFilter), findsOneWidget);
      expect(find.text('Glass'), findsOneWidget);
    });

    testWidgets('falls back to solid surface under iOS highContrast', (
      tester,
    ) async {
      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.iOS,
          highContrast: true,
          child: const Scaffold(
            body: Center(
              child: SmartSpendGlassSurface(
                padding: EdgeInsets.all(SmartSpendSpacing.lg),
                child: Text('High Contrast'),
              ),
            ),
          ),
        ),
      );

      expect(find.byType(BackdropFilter), findsNothing);
      expect(find.text('High Contrast'), findsOneWidget);
    });

    testWidgets(
      'renders fast solid surface without BackdropFilter on Android',
      (tester) async {
        await tester.pumpWidget(
          _framed(
            platform: TargetPlatform.android,
            child: const Scaffold(
              body: Center(
                child: SmartSpendGlassSurface(
                  padding: EdgeInsets.all(SmartSpendSpacing.lg),
                  child: Text('Android Solid'),
                ),
              ),
            ),
          ),
        );

        expect(find.byType(BackdropFilter), findsNothing);
        expect(find.text('Android Solid'), findsOneWidget);
      },
    );
  });

  group('SmartSpendGlassAppBar & SmartSpendGlassDock', () {
    testWidgets('AppBar and Dock blur on iOS and stay solid on Android', (
      tester,
    ) async {
      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.iOS,
          child: const Scaffold(
            appBar: SmartSpendGlassAppBar(title: Text('الرئيسية')),
            body: SizedBox.expand(),
            bottomNavigationBar: SmartSpendGlassDock(child: Text('اكتب مصروف')),
          ),
        ),
      );

      expect(find.byType(BackdropFilter), findsNWidgets(2));
      expect(find.text('الرئيسية'), findsOneWidget);
      expect(find.text('اكتب مصروف'), findsOneWidget);

      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.android,
          child: const Scaffold(
            appBar: SmartSpendGlassAppBar(title: Text('الرئيسية')),
            body: SizedBox.expand(),
            bottomNavigationBar: SmartSpendGlassDock(child: Text('اكتب مصروف')),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(BackdropFilter), findsNothing);
      expect(find.text('الرئيسية'), findsOneWidget);
      expect(find.text('اكتب مصروف'), findsOneWidget);
    });
  });

  group('SmartSpendKeyboardAccessory', () {
    testWidgets(
      'shows Done bar on iOS when tracked FocusNode focuses and unfocuses on tap',
      (tester) async {
        final focusNode = FocusNode();
        addTearDown(focusNode.dispose);
        var doneCount = 0;

        await tester.pumpWidget(
          _framed(
            platform: TargetPlatform.iOS,
            viewInsets: const EdgeInsets.only(bottom: 280),
            child: Scaffold(
              body: SmartSpendKeyboardAccessory(
                focusNodes: [focusNode],
                doneLabel: 'تم',
                onDone: () => doneCount++,
                child: Padding(
                  padding: const EdgeInsets.all(SmartSpendSpacing.lg),
                  child: TextField(
                    focusNode: focusNode,
                    keyboardType: TextInputType.number,
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('تم'), findsNothing);

        focusNode.requestFocus();
        await tester.pumpAndSettle();

        expect(find.text('تم'), findsOneWidget);
        expect(focusNode.hasFocus, isTrue);

        await tester.tap(find.text('تم'));
        await tester.pumpAndSettle();

        expect(doneCount, 1);
        expect(focusNode.hasFocus, isFalse);
        expect(find.text('تم'), findsNothing);
      },
    );

    testWidgets('is a no-op on Android', (tester) async {
      final focusNode = FocusNode();
      addTearDown(focusNode.dispose);

      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.android,
          child: Scaffold(
            body: SmartSpendKeyboardAccessory(
              focusNodes: [focusNode],
              doneLabel: 'تم',
              child: TextField(
                focusNode: focusNode,
                keyboardType: TextInputType.number,
              ),
            ),
          ),
        ),
      );

      focusNode.requestFocus();
      await tester.pumpAndSettle();

      expect(find.text('تم'), findsNothing);
    });
  });

  group('SmartSpendNavigationBar (iOS Liquid Glass & Native Slot)', () {
    for (final brightness in [Brightness.dark, Brightness.light]) {
      testWidgets(
        'iOS Liquid Glass pill bar passes all accessibility guidelines in ${brightness.name} mode',
        (tester) async {
          final semantics = tester.ensureSemantics();
          var index = 0;
          await tester.pumpWidget(
            _framed(
              platform: TargetPlatform.iOS,
              brightness: brightness,
              viewPadding: const EdgeInsets.only(bottom: 34),
              child: StatefulBuilder(
                builder: (context, setState) => Scaffold(
                  bottomNavigationBar: SmartSpendNavigationBar(
                    destinations: _destinations,
                    selectedIndex: index,
                    onSelected: (next) => setState(() => index = next),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.byType(SmartSpendIosGlassNavigationBar), findsOneWidget);
          expect(find.byType(BackdropFilter), findsOneWidget);

          await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
          await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
          await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
          await expectLater(tester, meetsGuideline(textContrastGuideline));

          await tester.tap(find.text('إحصائيات'));
          await tester.pumpAndSettle();
          expect(index, 1);
          semantics.dispose();
        },
      );
    }

    testWidgets('delegates to iosNativeBarBuilder on iOS with glass fallback', (
      tester,
    ) async {
      Widget? receivedFallback;
      await tester.pumpWidget(
        _framed(
          platform: TargetPlatform.iOS,
          child: Scaffold(
            bottomNavigationBar: SmartSpendNavigationBar(
              destinations: _destinations,
              selectedIndex: 0,
              onSelected: (_) {},
              iosNativeBarBuilder:
                  (context, destinations, selectedIndex, onSelected, fallback) {
                    receivedFallback = fallback;
                    return const SizedBox(
                      height: 64,
                      child: Center(child: Text('Native iOS 26 Bar')),
                    );
                  },
            ),
          ),
        ),
      );

      expect(find.text('Native iOS 26 Bar'), findsOneWidget);
      expect(receivedFallback, isA<SmartSpendIosGlassNavigationBar>());
    });
  });

  group('showSmartSpendSheet (SafeArea, Scrollable, iOS Liquid Glass)', () {
    testWidgets(
      'centrally protects sheet content with bottom SafeArea and supports scrollable tall content',
      (tester) async {
        await tester.pumpWidget(
          _framed(
            platform: TargetPlatform.android,
            viewPadding: const EdgeInsets.only(bottom: 48),
            child: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showSmartSpendSheet<void>(
                      context: context,
                      scrollable: true,
                      maxHeightFactor: 0.75,
                      builder: (_) => Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (var i = 0; i < 20; i++)
                            ListTile(title: Text('بند $i')),
                        ],
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

        expect(tester.takeException(), isNull);
        expect(find.byType(SingleChildScrollView), findsOneWidget);
        expect(find.text('بند 0'), findsOneWidget);
        // Bottom SafeArea ensures scroll container stays above the 48px nav bar inset.
        final sheetScrollBottom = tester
            .getBottomLeft(find.byType(SingleChildScrollView))
            .dy;
        final screenHeight = tester.getSize(find.byType(MaterialApp)).height;
        expect(sheetScrollBottom, lessThanOrEqualTo(screenHeight - 48));
      },
    );

    for (final brightness in [Brightness.dark, Brightness.light]) {
      testWidgets(
        'renders Liquid Glass sheet on iOS and meets accessibility guidelines (${brightness.name})',
        (tester) async {
          final semantics = tester.ensureSemantics();
          await tester.pumpWidget(
            _framed(
              platform: TargetPlatform.iOS,
              brightness: brightness,
              viewPadding: const EdgeInsets.only(bottom: 34),
              child: Builder(
                builder: (context) => Scaffold(
                  body: Center(
                    child: FilledButton(
                      onPressed: () => showSmartSpendSheet<void>(
                        context: context,
                        scrollable: true,
                        builder: (_) => Padding(
                          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text('عنوان الشيت'),
                              const SizedBox(height: SmartSpendSpacing.md),
                              FilledButton(
                                onPressed: () {},
                                child: const Text('حفظ'),
                              ),
                            ],
                          ),
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

          expect(find.byType(SmartSpendGlassSurface), findsOneWidget);
          expect(find.byType(BackdropFilter), findsOneWidget);
          expect(find.text('عنوان الشيت'), findsOneWidget);

          await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
          await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
          await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
          await expectLater(tester, meetsGuideline(textContrastGuideline));
          semantics.dispose();
        },
      );
    }
  });
}
