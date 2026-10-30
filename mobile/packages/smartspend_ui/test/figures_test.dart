// The hero figure, stat tiles, the proportion bar, grouped rows and the month switcher (design brief §9).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

Widget _app(Widget child, {double textScale = 1}) => MaterialApp(
  theme: SmartSpendTheme.dark(),
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: TextScaler.linear(textScale)),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: ListView(padding: const EdgeInsets.all(20), children: [child]),
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets('the hero reads its amount as words and tells its story', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        const HeroFigure(
          label: 'صرفت في أكتوبر',
          amount: 4251,
          story: 'أقل بـ 12%.',
        ),
      ),
    );
    expect(find.text('أقل بـ 12%.'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('4251')), findsOneWidget);
  });

  testWidgets(
    'a seven-digit hero stays within the screen at twice the text size',
    (tester) async {
      tester.view
        ..physicalSize = const Size(360, 800)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _app(const HeroFigure(label: 'الرصيد', amount: 1234567), textScale: 2),
      );
      expect(tester.takeException(), isNull);
      expect(
        tester.getRect(find.byType(FittedBox)).width,
        lessThanOrEqualTo(320),
      );
    },
  );

  testWidgets('stat tiles sit side by side, and stack at twice the text size', (
    tester,
  ) async {
    const row = StatTileRow(
      children: [
        StatTile(label: 'متوسط يومي', amount: 152),
        StatTile(label: 'دخل', amount: 15000),
      ],
    );
    await tester.pumpWidget(_app(row));
    expect(
      tester.getTopLeft(find.byType(StatTile).first).dy,
      tester.getTopLeft(find.byType(StatTile).last).dy,
    );

    await tester.pumpWidget(_app(row, textScale: 2));
    expect(
      tester.getTopLeft(find.byType(StatTile).last).dy,
      greaterThan(tester.getTopLeft(find.byType(StatTile).first).dy),
    );
  });

  testWidgets(
    'the proportion bar ranks the parts, gives shares, sums the tail and draws its segments',
    (tester) async {
      ProportionPart? tapped;
      await tester.pumpWidget(
        _app(
          ProportionBar(
            maxRows: 3,
            otherLabel: 'حاجات تانية',
            onPartTap: (part) => tapped = part,
            parts: const [
              ProportionPart(label: 'مواصلات', amount: 100, color: Colors.blue),
              ProportionPart(label: 'أكل', amount: 600, color: Colors.orange),
              ProportionPart(
                label: 'فواتير',
                amount: 200,
                color: Colors.yellow,
              ),
              ProportionPart(label: 'ترفيه', amount: 100, color: Colors.purple),
              ProportionPart(label: 'صفر', amount: 0, color: Colors.grey),
            ],
          ),
        ),
      );
      final labels = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .toList();
      expect(labels.where(['أكل', 'فواتير', 'حاجات تانية'].contains).toList(), [
        'أكل',
        'فواتير',
        'حاجات تانية',
      ]);
      expect(find.text('60%'), findsOneWidget);
      expect(find.text('20%'), findsNWidgets(2));
      expect(find.text('صفر'), findsNothing);
      final orange = find.byWidgetPredicate(
        (w) => w is ColoredBox && w.color == Colors.orange,
      );
      expect(tester.getSize(orange).height, 14);
      await tester.tap(find.text('أكل'));
      expect(tapped?.label, 'أكل');
    },
  );

  testWidgets(
    'a grouped row is one labelled target, and a destructive row has no chevron',
    (tester) async {
      var opened = 0;
      await tester.pumpWidget(
        _app(
          GroupedSection(
            title: 'الحساب',
            children: [
              GroupedRow(
                icon: Icons.shield_outlined,
                title: 'الأمان',
                onTap: () => opened++,
              ),
              GroupedRow(
                icon: Icons.logout_rounded,
                title: 'تسجيل الخروج',
                destructive: true,
                onTap: () {},
              ),
            ],
          ),
        ),
      );
      expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
      await tester.tap(find.text('الأمان'));
      expect(opened, 1);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    },
  );

  testWidgets('the month switcher cannot go past the current month', (
    tester,
  ) async {
    var back = 0;
    await tester.pumpWidget(
      _app(
        MonthSwitcher(
          label: 'أكتوبر 2026',
          previousTooltip: 'الشهر اللي قبله',
          nextTooltip: 'الشهر اللي بعده',
          onPrevious: () => back++,
          onNext: null,
        ),
      ),
    );
    await tester.tap(find.byTooltip('الشهر اللي قبله'));
    expect(back, 1);
    final next = find.ancestor(
      of: find.byTooltip('الشهر اللي بعده'),
      matching: find.byType(IconButton),
    );
    expect(tester.widget<IconButton>(next).onPressed, isNull);
  });

  testWidgets(
    'the staggered reveal shows everything at once under reduced motion',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: StaggeredReveal(children: [Text('أ'), Text('ب')]),
          ),
        ),
      );
      final opacities = tester
          .widgetList<Opacity>(find.byType(Opacity))
          .map((o) => o.opacity);
      expect(opacities, everyElement(1.0));
    },
  );
}
