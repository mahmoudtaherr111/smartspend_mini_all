import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_app/src/features/commitments/commitment_detail_screen.dart';
import 'package:smartspend_app/src/features/commitments/commitment_models.dart';
import 'package:smartspend_app/src/features/commitments/commitments_screen.dart';
import 'package:smartspend_app/src/features/commitments/due_prompt.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_commitments.dart';
import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<FakeApi> _open(
  WidgetTester tester, {
  String path = '/commitments',
  bool withQuestions = false,
}) async {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = const Size(800, 1600);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(api);
  answerSampleCommitments(api, withQuestions: withQuestions);
  await TestApp(token: 'stored-token', api: api).pump(tester);
  if (withQuestions) return api;
  unawaited(GoRouter.of(tester.element(find.byType(NavigationBar))).push(path));
  await tester.pumpAndSettle();
  return api;
}

void main() {
  test('the overview reads every shape the server sends', () {
    final overview = CommitmentsOverview.fromJson(sampleCommitmentsOverview());
    expect(overview.today, '2026-11-09');
    expect(overview.items, hasLength(8));
    final flat = overview.items.first;
    expect(flat.shape, CommitmentShape.fixed);
    expect(flat.group, CommitmentGroup.installments);
    expect(flat.progress.fraction, closeTo(0.2, 0.001));
    expect(flat.progress.next!.status, 'overdue');
    final netflix = overview.items.firstWhere(
      (item) => item.kind == 'subscription',
    );
    expect(netflix.catalog!.slug, 'netflix');
    final farida = overview.items.firstWhere((item) => item.kind == 'debt');
    expect(farida.progress.next!.undated, isTrue);
    expect(farida.progress.next!.remaining, 2000);
    final gam3eya = overview.items.firstWhere((item) => item.kind == 'gam3eya');
    expect(gam3eya.payoutDay, '2027-02-05');
    expect(gam3eya.payoutAmount, 10000);
    expect(overview.summary.leftThisMonth, 40840);

    final detail = CommitmentDetail.fromJson(sampleFridgeDetail());
    expect(detail.filingCategory, 'أقساط وفوايد');
    expect(detail.dates.first.settlements.single.matchedBy, 'auto');
    expect(detail.dates.first.settlements.single.expenseSource, 'voice');
  });

  testWidgets(
    'the hub shows what is left this month, what needs the person, and every commitment',
    (tester) async {
      await _open(tester);

      expect(find.byType(CommitmentsScreen), findsOneWidget);
      expect(find.text('فاضل عليك الشهر ده'), findsOneWidget);
      expect(find.text('محتاجة رد منك'), findsOneWidget);
      // The flat's overdue installment needs the person; Netflix is coming up with its logo.
      expect(find.text('قسط الشقة'), findsWidgets);
      expect(
        find.byWidgetPredicate(
          (widget) => widget is LogoBadge && widget.label == 'Netflix',
        ),
        findsWidgets,
      );
      expect(find.text('دفعت 4 من 12'), findsOneWidget);

      // The filter keeps one group.
      await tester.tap(find.widgetWithText(ChoiceChip, 'تعليم'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('commitment-3')), findsOneWidget);
      expect(find.byKey(const ValueKey('commitment-1')), findsNothing);
    },
  );

  testWidgets('«دفعته» records what is owed on that date and links it', (
    tester,
  ) async {
    final api = await _open(tester);

    final row = find.byKey(const ValueKey('upcoming-2-2026-11-12'));
    await tester.ensureVisible(row);
    await tester.tap(find.descendant(of: row, matching: find.text('دفعته')));
    await tester.pumpAndSettle();

    expect(find.text('دفعت Netflix'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const ValueKey('pay-amount')))
          .controller!
          .text,
      '240',
    );
    await tester.tap(find.widgetWithText(SmartSpendButton, 'دفعته'));
    await tester.pumpAndSettle();

    expect(api.lastInput('commitments.pay'), {
      'cashflowId': 2,
      'dueDay': '2026-11-12',
      'amount': 240,
      'record': true,
    });
  });

  testWidgets(
    'a commitment page says what to say, where it is filed, and what paid each date',
    (tester) async {
      final api = await _open(tester, path: CommitmentDetailScreen.pathOf(1));

      expect(api.lastInput('commitments.detail'), {'id': 1});
      expect(find.text('لما تدفع قول: «دفعت قسط التلاجة»'), findsOneWidget);
      expect(find.text('أقساط وفوايد › أقساط'), findsOneWidget);
      expect(find.textContaining('اتحسب لوحده'), findsOneWidget);
      expect(find.text('قبلها بـ 3 أيام'), findsOneWidget);

      // One date skipped this time.
      await tester.tap(find.byKey(const ValueKey('date-2026-12-15')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('اتخطاه المرة دي'));
      await tester.pumpAndSettle();
      expect(api.lastInput('commitments.setOverride'), {
        'id': 1,
        'dueDay': '2026-12-15',
        'action': 'skip',
      });
    },
  );

  testWidgets('the reminder can come ten days before', (tester) async {
    final api = await _open(tester, path: CommitmentDetailScreen.pathOf(1));

    await tester.tap(find.text('التذكير'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'قبلها بـ 10 أيام'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SmartSpendButton, 'احفظ'));
    await tester.pumpAndSettle();

    expect(api.lastInput('commitments.update'), {
      'id': 1,
      'remindersEnabled': true,
      'remindDaysBefore': 10,
      'remindHour': null,
    });
  });

  testWidgets(
    'a subscription is picked from the catalog with its logo, then its day and price',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');

      await tester.tap(find.byKey(const ValueKey('type-subscription')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('brand-shahid')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('brand-netflix')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const ValueKey('field-amount')), '240');
      await tester.tap(find.byKey(const ValueKey('field-day')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('12'));
      await tester.tap(
        find.text(
          MaterialLocalizations.of(
            tester.element(find.byType(DatePickerDialog)),
          ).okButtonLabel,
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('commitment-save')));
      await tester.tap(find.byKey(const ValueKey('commitment-save')));
      await tester.pumpAndSettle();
      // The sample account already has it: asked before a second one is added.
      expect(find.text('متسجل قبل كده'), findsOneWidget);
      await tester.tap(find.text('ضيفه تاني'));
      await tester.pumpAndSettle();

      final input =
          api.lastInput('commitments.create')! as Map<String, Object?>;
      expect(input['shape'], 'recurring');
      expect(input['kind'], 'subscription');
      expect(input['catalogSlug'], 'netflix');
      expect(input['title'], 'Netflix');
      expect(input['amount'], 240);
      expect(input['recurrence'], 'monthly');
      expect((input['startDay']! as String).endsWith('-12'), isTrue);
      // Saved, it opens on its own page.
      expect(find.byType(CommitmentDetailScreen), findsOneWidget);
    },
  );

  testWidgets(
    'an installment asks for its few fields and says what is missing',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');

      await tester.tap(find.byKey(const ValueKey('type-installment')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('commitment-save')));
      await tester.pumpAndSettle();
      expect(find.text('اكتب اسمه.'), findsOneWidget);
      expect(api.paths, isNot(contains('commitments.create')));

      await tester.enterText(
        find.byKey(const ValueKey('field-title')),
        'التلاجة',
      );
      await tester.enterText(
        find.byKey(const ValueKey('field-provider')),
        'B.TECH',
      );
      await tester.enterText(
        find.byKey(const ValueKey('field-amount')),
        '2000',
      );
      await tester.enterText(find.byKey(const ValueKey('field-count')), '8');
      await tester.tap(find.byKey(const ValueKey('field-day')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('15'));
      await tester.tap(
        find.text(
          MaterialLocalizations.of(
            tester.element(find.byType(DatePickerDialog)),
          ).okButtonLabel,
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('field-remind')));
      await tester.tap(find.byKey(const ValueKey('field-remind')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('قبلها بيوم').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('commitment-save')));
      await tester.tap(find.byKey(const ValueKey('commitment-save')));
      await tester.pumpAndSettle();
      // The sample account already has it: asked before a second one is added.
      expect(find.text('متسجل قبل كده'), findsOneWidget);
      await tester.tap(find.text('ضيفه تاني'));
      await tester.pumpAndSettle();

      final input =
          api.lastInput('commitments.create')! as Map<String, Object?>;
      expect(input, containsPair('shape', 'fixed'));
      expect(input, containsPair('kind', 'installment'));
      expect(input, containsPair('title', 'التلاجة'));
      expect(input, containsPair('provider', 'B.TECH'));
      expect(input, containsPair('amount', 2000));
      expect(input, containsPair('remainingCount', 8));
      expect(input, containsPair('remindDaysBefore', 1));
    },
  );

  /// Scrolls the screen's own list (not a grid inside it) until [finder] is on screen.
  Future<void> reveal(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(
      finder,
      200,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }

  Future<void> pickDay(WidgetTester tester, String key, String day) async {
    await reveal(tester, find.byKey(ValueKey(key)));
    await tester.tap(find.byKey(ValueKey(key)));
    await tester.pumpAndSettle();
    expect(
      find.byType(DatePickerDialog),
      findsOneWidget,
      reason: 'the date picker of $key opens',
    );
    await tester.tap(
      find.descendant(
        of: find.byType(DatePickerDialog),
        matching: find.text(day),
      ),
    );
    await tester.tap(
      find.text(
        MaterialLocalizations.of(tester.element(find.byType(DatePickerDialog)))
            .okButtonLabel,
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> save(WidgetTester tester) async {
    await reveal(tester, find.byKey(const ValueKey('commitment-save')));
    await tester.tap(find.byKey(const ValueKey('commitment-save')));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'a flat paid every three months, with its handover payment, is two commitments',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');
      await tester.tap(find.byKey(const ValueKey('type-property')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('field-title')),
        'شقة التجمع',
      );
      await tester.enterText(
        find.byKey(const ValueKey('field-amount')),
        '45000',
      );
      await reveal(tester, find.widgetWithText(ChoiceChip, 'كل 3 شهور'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'كل 3 شهور'));
      await tester.enterText(find.byKey(const ValueKey('field-count')), '20');
      await pickDay(tester, 'field-day', '20');
      await reveal(tester, find.text('ضيف دفعة'));
      await tester.tap(find.text('ضيف دفعة'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('extra-label-0')),
        'دفعة الاستلام',
      );
      await tester.enterText(
        find.byKey(const ValueKey('extra-amount-0')),
        '300000',
      );
      await pickDay(tester, 'extra-day-0', '25');
      expect(find.textContaining('فاضل 20 ×'), findsOneWidget);
      await save(tester);

      final creates = [
        for (final call in api.calls)
          if (call.path == 'commitments.create')
            call.input! as Map<String, Object?>,
      ];
      expect(creates, hasLength(2));
      expect(creates.first, containsPair('shape', 'fixed'));
      expect(creates.first, containsPair('kind', 'property'));
      expect(creates.first, containsPair('intervalCount', 3));
      expect(creates.first, containsPair('remindDaysBefore', 7));
      expect(creates.last, containsPair('shape', 'schedule'));
      expect(creates.last['title'], 'شقة التجمع · دفعات تانية');
      expect(
        (creates.last['items']! as List).single,
        containsPair('label', 'دفعة الاستلام'),
      );
    },
  );

  testWidgets('an electricity bill changes every month and keeps an estimate', (
    tester,
  ) async {
    final api = await _open(tester, path: '/commitments/add');
    final tile = find.byKey(const ValueKey('type-bill'));
    await tester.ensureVisible(tile);
    await tester.tap(tile);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ChoiceChip, 'الكهربا'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('field-amount')), '900');
    await pickDay(tester, 'field-day', '18');
    await save(tester);

    final input = api.lastInput('commitments.create')! as Map<String, Object?>;
    expect(input, containsPair('kind', 'bill'));
    expect(input, containsPair('title', 'الكهربا'));
    expect(input, containsPair('amountVaries', true));
    expect(input, containsPair('amount', 900));
  });

  testWidgets(
    'a subscription on a free trial reminds two days before it is charged',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');
      await tester.tap(find.byKey(const ValueKey('type-subscription')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('brand-shahid')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const ValueKey('field-amount')), '100');
      await tester.tap(find.text('لسه في فترة تجربة مجانية'));
      await tester.pumpAndSettle();
      expect(find.text('التجربة بتخلص يوم'), findsOneWidget);
      expect(find.text('يعني حوالي 1,200 ج.م في السنة.'), findsOneWidget);
      await pickDay(tester, 'field-day', '15');
      await save(tester);
      await tester.tap(find.text('ضيفه تاني'));
      await tester.pumpAndSettle();

      final input =
          api.lastInput('commitments.create')! as Map<String, Object?>;
      expect(input, containsPair('catalogSlug', 'shahid'));
      expect(input, containsPair('paymentMethod', 'card'));
      expect(input, containsPair('remindDaysBefore', 2));
    },
  );

  testWidgets(
    'a gam3eya says how much the turn pays, and a turn past the months is refused',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');
      final tile = find.byKey(const ValueKey('type-gam3eya'));
      await reveal(tester, tile);
      await tester.tap(tile);
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('field-amount')),
        '1000',
      );
      await tester.enterText(find.byKey(const ValueKey('field-count')), '10');
      await tester.enterText(find.byKey(const ValueKey('field-turn')), '12');
      await pickDay(tester, 'field-day', '5');
      await save(tester);
      expect(find.text('اكتب دورك، رقم من الشهور.'), findsOneWidget);
      expect(api.paths, isNot(contains('commitments.create')));

      await tester.enterText(find.byKey(const ValueKey('field-turn')), '6');
      await tester.pumpAndSettle();
      expect(find.textContaining('هتقبض 10,000 ج.م في دورك'), findsOneWidget);
    },
  );

  testWidgets(
    'two shares of a gam3eya: one share\'s amount, a turn for each, and what each turn pays',
    (tester) async {
      final api = await _open(tester, path: '/commitments/add');
      final tile = find.byKey(const ValueKey('type-gam3eya'));
      await reveal(tester, tile);
      await tester.tap(tile);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(ChoiceChip, 'سهمين'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('field-amount')),
        '1000',
      );
      await tester.enterText(find.byKey(const ValueKey('field-count')), '10');
      await tester.enterText(find.byKey(const ValueKey('field-turn')), '7');
      await tester.enterText(find.byKey(const ValueKey('field-turn-2')), '3');
      await pickDay(tester, 'field-day', '5');
      expect(
        find.textContaining(
          'هتدفع 2,000 ج.م كل شهر، وتقبض 10,000 ج.م في كل دور: الشهر 3 و7',
        ),
        findsOneWidget,
      );
      await save(tester);

      final input =
          api.lastInput('commitments.create')! as Map<String, Object?>;
      expect(input, containsPair('amount', 1000));
      expect(input, containsPair('gam3eyaTurns', [7, 3]));
    },
  );

  testWidgets(
    'a date that passed is asked about when the app opens; «تخطي» leaves it unpaid',
    (tester) async {
      final api = await _open(tester, withQuestions: true);

      expect(find.byType(DueChecksSheet), findsOneWidget);
      expect(find.text('المواعيد دي عدّت، اتدفعت؟'), findsOneWidget);
      expect(find.text('قسط الشقة'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('due-checks-skip')));
      await tester.pumpAndSettle();

      expect(find.byType(DueChecksSheet), findsNothing);
      expect(api.lastInput('commitments.answer'), {
        'key': 'due:6:2026-11-01',
        'answer': 'not_yet',
      });
    },
  );

  testWidgets('«دفعته» on the question records and links that date', (
    tester,
  ) async {
    final api = await _open(tester, withQuestions: true);

    await tester.tap(
      find.descendant(
        of: find.byType(DueChecksSheet),
        matching: find.text('دفعته'),
      ),
    );
    await tester.pumpAndSettle();

    expect(api.lastInput('commitments.answer'), {
      'key': 'due:6:2026-11-01',
      'answer': 'paid',
    });
    expect(find.byType(DueChecksSheet), findsNothing);
  });

  testWidgets(
    'without the commitments in the plan the app opens with nothing asked',
    (tester) async {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = const Size(800, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
      answerSampleMonth(api);
      api.answer(
        'commitments.questions',
        (_) => throw const TrpcFailure('FORBIDDEN', 403, 'مش في باقتك'),
      );
      await TestApp(token: 'stored-token', api: api).pump(tester);

      expect(find.byType(DueChecksSheet), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
