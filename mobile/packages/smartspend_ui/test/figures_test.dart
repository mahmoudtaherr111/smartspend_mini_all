// The hero figure, stat tiles, the proportion bar, grouped rows, category tiles, signature motion and the month
// switcher (design brief §6, §7 and §9).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

Widget _app(Widget child, {double textScale = 1}) => MaterialApp(
  theme: SmartSpendTheme.dark(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar'), Locale('en')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
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
  setUp(StaggeredReveal.resetSession);

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
            refundLabel: 'مرتجع',
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
              ProportionPart(label: 'تسوق', amount: -150, color: Colors.pink),
              ProportionPart(label: 'صفر', amount: 0, color: Colors.grey),
            ],
          ),
        ),
      );
      final labels = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .toList();
      expect(
        labels
            .where(['أكل', 'فواتير', 'حاجات تانية', 'تسوق'].contains)
            .toList(),
        ['أكل', 'فواتير', 'حاجات تانية', 'تسوق'],
      );
      expect(find.text('60%'), findsOneWidget);
      expect(find.text('20%'), findsNWidgets(2));
      expect(find.text('مرتجع'), findsOneWidget);
      expect(find.text('${ltrIsolate('+150')} ج.م'), findsOneWidget);
      expect(find.text('صفر'), findsNothing);
      final orange = find.byWidgetPredicate(
        (w) => w is ColoredBox && w.color == Colors.orange,
      );
      expect(tester.getSize(orange).height, 14);
      await tester.tap(find.text('أكل'));
      expect(tapped?.label, 'أكل');
      // The synthetic remainder row does not pretend to be a single category.
      await tester.tap(find.text('حاجات تانية'));
      expect(tapped?.label, 'أكل');
      // A refund-netted negative category still opens its transactions.
      await tester.tap(find.text('تسوق'));
      expect(tapped?.label, 'تسوق');
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

  testWidgets(
    'the value of a row sits before the chevron, and under the title at twice the text size',
    (tester) async {
      Widget row() => GroupedSection(
        children: [
          GroupedRow(
            icon: Icons.credit_card_rounded,
            title: 'كارت البنك التجاري الدولي',
            subtitle: 'آخره 4821 · اتحدّث النهارده',
            value: const AmountText(1250000),
            onTap: () {},
          ),
        ],
      );
      final title = find.text('كارت البنك التجاري الدولي');
      final value = find.byType(AmountText);

      await tester.pumpWidget(_app(row()));
      expect(
        tester.getCenter(value).dy,
        moreOrLessEquals(
          tester.getCenter(find.byType(GroupedRow)).dy,
          epsilon: 1,
        ),
      );

      await tester.pumpWidget(_app(row(), textScale: 2));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        tester.getTopLeft(value).dy,
        greaterThan(tester.getBottomLeft(title).dy),
      );
      // The title keeps most of the row instead of a narrow column beside the value.
      expect(
        tester.getSize(title).width,
        greaterThan(tester.getSize(find.byType(GroupedRow)).width * 0.6),
      );
      expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
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
    'every server category maps to its rounded icon, and unknown categories get the neutral icon',
    (tester) async {
      const canonical = [
        'أكل وشرب',
        'مواصلات',
        'فواتير',
        'سكن',
        'تسوق',
        'عناية شخصية',
        'صحة',
        'أطفال',
        'تعليم',
        'ترفيه',
        'اشتراكات',
        'تدخين',
        'هدايا وصدقات',
        'أقساط وفوايد',
        'خدمات حكومية',
        'عمل',
        'حيوانات أليفة',
        'العائلة',
        'أصدقاء',
        'موظفين',
        'متنوعات',
        'مرتب',
        'عمل حر',
        'عوائد استثمار',
        'هدايا وعيديات',
        'دخل آخر',
        'تحويل',
        'استثمار',
      ];
      for (final name in canonical) {
        expect(
          categoryStyleIcon(name),
          isNot(neutralCategoryIcon),
          reason: name,
        );
      }
      expect(categoryStyleIcon('تصنيف مخصص'), neutralCategoryIcon);

      await tester.pumpWidget(
        _app(const CategoryTile(category: 'أكل وشرب', showLabel: true)),
      );
      expect(find.text('أكل وشرب'), findsOneWidget);
      expect(find.byIcon(Icons.restaurant_rounded), findsOneWidget);
    },
  );

  testWidgets(
    'the staggered reveal leads with the hero, finishes within 300 ms, and never repeats in the same session',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: StaggeredReveal(
            key: UniqueKey(),
            sessionKey: 'stats',
            children: const [Text('أ'), Text('ب'), Text('ج'), Text('د')],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 80));
      final midOpacities = tester
          .widgetList<Opacity>(find.byType(Opacity))
          .map((o) => o.opacity)
          .toList();
      // The hero leads the cards.
      expect(midOpacities.first, greaterThan(midOpacities.last));

      // Everything settles by the 300 ms ceiling.
      await tester.pump(const Duration(milliseconds: 220));
      final endOpacities = tester
          .widgetList<Opacity>(find.byType(Opacity))
          .map((o) => o.opacity);
      expect(endOpacities, everyElement(1.0));

      // Leaving and returning to the same tab in the session does not replay the animation.
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pumpWidget(
        MaterialApp(
          home: StaggeredReveal(
            key: UniqueKey(),
            sessionKey: 'stats',
            children: const [Text('أ'), Text('ب')],
          ),
        ),
      );
      final revisitOpacities = tester
          .widgetList<Opacity>(find.byType(Opacity))
          .map((o) => o.opacity);
      expect(revisitOpacities, everyElement(1.0));
    },
  );

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

  testWidgets(
    'a transaction row carries its icon and amount via Hero, and creates no Hero under reduced motion',
    (tester) async {
      await tester.pumpWidget(
        _app(
          const TransactionRow(
            icon: Icons.restaurant_rounded,
            title: 'Talabat',
            subtitle: 'أكل وشرب · 9:41 م',
            amount: 185,
            heroTag: 'txn-9',
          ),
        ),
      );
      expect(find.byType(Hero), findsNWidgets(2));

      await tester.pumpWidget(
        _app(
          const MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: TransactionRow(
              icon: Icons.restaurant_rounded,
              title: 'Talabat',
              subtitle: 'أكل وشرب · 9:41 م',
              amount: 185,
              heroTag: 'txn-9',
            ),
          ),
        ),
      );
      expect(find.byType(Hero), findsNothing);
    },
  );
}
