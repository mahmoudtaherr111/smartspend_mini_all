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
