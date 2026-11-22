import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  group('SmartSpendBarChart (FND-04)', () {
    final sampleBars = [
      const BarDataPoint(label: 'السبت', value: 100),
      const BarDataPoint(label: 'الأحد', value: 250),
      const BarDataPoint(label: 'الاثنين', value: 0),
      const BarDataPoint(label: 'الثلاثاء', value: 450, isHighlighted: true),
      const BarDataPoint(label: 'الأربعاء', value: 120, isToday: true),
      const BarDataPoint(label: 'الخميس', value: 300),
      const BarDataPoint(label: 'الجمعة', value: 80),
    ];

    testWidgets('displays title sentence with real numbers', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: SmartSpendBarChart(
              title: 'أكتر يوم بتصرف فيه: الثلاثاء (450 ج.م)',
              data: sampleBars,
            ),
          ),
        ),
      );

      expect(
        find.text('أكتر يوم بتصرف فيه: الثلاثاء (450 ج.م)'),
        findsOneWidget,
      );
    });

    testWidgets('exposes semantics spoken summary for screen readers', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: SmartSpendBarChart(
              title: 'مصاريف الأسبوع',
              data: sampleBars,
              spokenSummary: 'ملخص المصاريف: أعلى يوم الثلاثاء بـ 450 جنيه',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byWidgetPredicate(
          (w) =>
              w is Semantics &&
              w.properties.label ==
                  'ملخص المصاريف: أعلى يوم الثلاثاء بـ 450 جنيه',
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders in RTL without layout errors', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.light(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: SmartSpendBarChart(
                title: 'المصاريف حسب أيام الأسبوع',
                data: sampleBars,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
    });

    testWidgets('legible at text scale 2 without overflow', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2.0)),
            child: Scaffold(
              body: SmartSpendBarChart(
                title: 'أكتر يوم بتصرف فيه: الثلاثاء بـ 450 ج.م في الأسبوع ده',
                data: sampleBars,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
    });

    testWidgets('stays still under reduced motion', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: Scaffold(
              body: SmartSpendBarChart(
                title: 'المصاريف بدون حركة',
                data: sampleBars,
              ),
            ),
          ),
        ),
      );
      // Under reduced motion, no extra timer ticks are needed
      await tester.pump();
      expect(find.text('المصاريف بدون حركة'), findsOneWidget);
    });
  });

  group('SmartSpendLineChart (FND-04)', () {
    final samplePoints = [
      const LineDataPoint(label: 'يناير', value: 3000),
      const LineDataPoint(label: 'فبراير', value: 4500),
      const LineDataPoint(label: 'مارس', value: null), // gap
      const LineDataPoint(label: 'أبريل', value: 2800),
      const LineDataPoint(label: 'مايو', value: 5000),
    ];

    testWidgets('renders title and handles gaps without errors', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: SmartSpendLineChart(
              title: 'تطور المصاريف على مدار السنة',
              data: samplePoints,
              spokenSummary: 'مارس بدون بيانات مسجلة، أعلى شهر مايو 5,000 ج.م',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('تطور المصاريف على مدار السنة'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (w) =>
              w is Semantics &&
              w.properties.label ==
                  'مارس بدون بيانات مسجلة، أعلى شهر مايو 5,000 ج.م',
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'handles 12 months on narrow viewport and 2x text scale without overflow',
      (tester) async {
        final yearData = [
          for (var m = 1; m <= 12; m++)
            LineDataPoint(
              label: 'شهر $m',
              value: m == 6 ? null : m * 650,
              amountFormatted: '${m * 650} ج.م',
            ),
        ];

        await tester.pumpWidget(
          MaterialApp(
            theme: SmartSpendTheme.dark(),
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(320, 640),
                textScaler: TextScaler.linear(2.0),
              ),
              child: Scaffold(
                body: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SmartSpendLineChart(
                    title: 'المصاريف خلال 12 شهر',
                    data: yearData,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'uses custom emptyLabel and English default without hardcoded Arabic',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: SmartSpendTheme.light(),
            locale: const Locale('en'),
            home: Scaffold(
              body: SmartSpendLineChart(
                title: 'Monthly trend',
                data: const [
                  LineDataPoint(label: 'Jan', value: 1200),
                  LineDataPoint(label: 'Feb', value: null),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.byWidgetPredicate(
            (w) =>
                w is Semantics &&
                w.properties.label != null &&
                w.properties.label!.contains('Feb: no data') &&
                !w.properties.label!.contains('لا توجد بيانات'),
          ),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'shows exact formatted amount tooltip on tap and respects MoneyPrivacy',
      (tester) async {
        int? selected;
        final points = const [
          LineDataPoint(
            label: 'يناير',
            value: 1500,
            amountFormatted: '1,500 ج.م',
          ),
          LineDataPoint(
            label: 'فبراير',
            value: 3200,
            amountFormatted: '3,200 ج.م',
          ),
        ];

        await tester.pumpWidget(
          MaterialApp(
            theme: SmartSpendTheme.dark(),
            home: Scaffold(
              body: SizedBox(
                width: 360,
                child: SmartSpendLineChart(
                  title: 'اتجاه الصرف',
                  data: points,
                  onPointSelected: (i) => selected = i,
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final paintRect = tester.getRect(
          find.descendant(
            of: find.byType(SmartSpendLineChart),
            matching: find.byType(CustomPaint),
          ),
        );
        // Tap near the right side (second point in LTR)
        await tester.tapAt(Offset(paintRect.right - 20, paintRect.center.dy));
        await tester.pump();

        expect(selected, 1);
        expect(find.text('فبراير: 3,200 ج.م'), findsOneWidget);

        // Tap same point again clears selection
        await tester.tapAt(Offset(paintRect.right - 20, paintRect.center.dy));
        await tester.pump();
        expect(selected, isNull);
        expect(find.text('فبراير: 3,200 ج.م'), findsNothing);

        // Privacy mode masks tooltip amount
        await tester.pumpWidget(
          MaterialApp(
            theme: SmartSpendTheme.dark(),
            home: MoneyPrivacy(
              hidden: true,
              child: Scaffold(
                body: SizedBox(
                  width: 360,
                  child: SmartSpendLineChart(
                    title: 'اتجاه الصرف',
                    data: points,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tapAt(Offset(paintRect.right - 20, paintRect.center.dy));
        await tester.pump();

        expect(find.textContaining('3,200'), findsNothing);
        expect(find.textContaining('••••'), findsOneWidget);
      },
    );
  });

  group('SmartSpendProportionChart (FND-04)', () {
    final parts = [
      const ProportionPart(
        label: 'أكل وشرب',
        amount: 1500,
        color: Colors.orange,
      ),
      const ProportionPart(label: 'مواصلات', amount: 800, color: Colors.blue),
      const ProportionPart(label: 'فواتير', amount: 400, color: Colors.green),
    ];

    testWidgets('displays title sentence and proportion segments', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: SmartSpendTheme.dark(),
          home: Scaffold(
            body: SmartSpendProportionChart(
              title: 'أعلى تصنيف صرف: أكل وشرب (55%)',
              parts: parts,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('أعلى تصنيف صرف: أكل وشرب (55%)'), findsOneWidget);
      expect(find.text('أكل وشرب'), findsOneWidget);
      expect(find.text('مواصلات'), findsOneWidget);
    });
  });
}
