// Wallets and cards (MON-01..03): the list, one wallet with this month's money as the server sums it, adding,
// editing and deleting, offline cached list, and every state.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/wallets/wallet_models.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/sample_month.dart';
import 'support/test_app.dart';

Future<TestApp> _openWallets(
  WidgetTester tester,
  FakeApi api, {
  TestApp? existing,
}) async {
  api.answer('localAuth.me', (_) => phoneUser());
  final app = existing ?? TestApp(token: 'stored-token', api: api);
  await app.pump(tester);
  await tester.tap(find.text('المزيد').last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('المحافظ والكروت'));
  await tester.pumpAndSettle();
  return app;
}

Future<void> _openCib(WidgetTester tester, FakeApi api) async {
  await _openWallets(tester, api);
  await tester.tap(find.text('كارت CIB'));
  await tester.pumpAndSettle();
}

/// Taps the form's save button, scrolled into view below the kinds.
Future<void> _save(WidgetTester tester) async {
  await tester.ensureVisible(find.text('حفظ'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('حفظ'));
  await tester.pumpAndSettle();
}

String _money(String digits) => '${ltrIsolate(digits)} ج.م';

void main() {
  testWidgets('the list leads with what is in every wallet together', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    await _openWallets(tester, api);

    expect(find.byType(HeroFigure), findsOneWidget);
    // 24,350 + 1,820.50 + 6,200, in whole pounds.
    expect(find.text(_money('32,371')), findsOneWidget);
    expect(find.text('كارت CIB'), findsOneWidget);
    expect(find.text(_money('24,350')), findsOneWidget);
    expect(
      find.text('آخره ${ltrIsolate('4821')} · اتحدّث النهارده'),
      findsOneWidget,
    );
    // A Latin name is kept in one left-to-right run inside the Arabic interface.
    expect(find.text(ltrIsolate('InstaPay')), findsOneWidget);
    expect(find.text('مش معروف اتحدّث إمتى'), findsOneWidget);
  });

  testWidgets('no wallets teaches what they are for and offers to add one', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('wallet.getWallets', (_) => <Object>[]);
    await _openWallets(tester, api);

    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.byType(HeroFigure), findsNothing);
    await tester.tap(find.text('ضيف محفظة أو كارت'));
    await tester.pumpAndSettle();
    expect(find.text('محفظة أو كارت جديد'), findsOneWidget);
  });

  testWidgets('offline shows the last cached wallets with the offline banner', (
    tester,
  ) async {
    final onlineApi = FakeApi();
    answerSampleMonth(onlineApi);
    final first = await _openWallets(tester, onlineApi);
    expect(find.text('كارت CIB'), findsOneWidget);

    // Cold-starting offline with the saved ledger store shows the cached wallets and the offline banner.
    final offlineApi = FakeApi()..offline = true;
    final second = TestApp(token: 'stored-token', api: offlineApi);
    second.ledgerStore.ledger = first.ledgerStore.ledger;
    await second.pump(tester);
    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('المحافظ والكروت'));
    await tester.pumpAndSettle();

    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.text('كارت CIB'), findsOneWidget);
    expect(find.text(_money('32,371')), findsOneWidget);
  });

  testWidgets('offline without a cached list shows an error and retries', (
    tester,
  ) async {
    final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(api);
    final app = TestApp(token: 'stored-token', api: api);
    await app.pump(tester);

    api.offline = true;
    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('المحافظ والكروت'));
    await tester.pumpAndSettle();

    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.byType(ErrorState), findsOneWidget);

    api.offline = false;
    await tester.tap(find.text('جرّب تاني'));
    await tester.pumpAndSettle();
    expect(find.text('كارت CIB'), findsOneWidget);
  });

  testWidgets('cached wallets from one account never appear for another', (
    tester,
  ) async {
    final api = FakeApi()
      ..answer('localAuth.me', (_) => {...phoneUser(), 'id': 99});
    final app = TestApp(token: 'other-user-token', api: api);
    app.ledgerStore.ledger = StoredLedger(
      accountKey: 'phone:42',
      wallets: [
        Wallet.fromJson(const {
          'id': 1,
          'name': 'كارت منى الخاص',
          'provider': 'CIB',
          'balance': '9000',
        }),
      ],
    );
    await app.pump(tester);
    api.offline = true;
    await tester.tap(find.text('المزيد').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('المحافظ والكروت'));
    await tester.pumpAndSettle();

    expect(find.text('كارت منى الخاص'), findsNothing);
    expect(find.byType(ErrorState), findsOneWidget);
  });

  testWidgets('adding a wallet checks what was typed, then saves it', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('wallet.createWallet', (_) => {'success': true});
    await _openWallets(tester, api);

    await tester.tap(find.text('ضيف محفظة أو كارت'));
    await tester.pumpAndSettle();
    await _save(tester);
    expect(find.text('اكتب اسم للمحفظة.'), findsOneWidget);
    expect(api.paths, isNot(contains('wallet.createWallet')));

    await tester.tap(find.widgetWithText(ChoiceChip, 'فودافون كاش'));
    await tester.enterText(find.widgetWithText(TextField, 'الاسم'), 'محفظتي');
    await tester.enterText(
      find.widgetWithText(TextField, 'آخر 4 أرقام (لو كارت)'),
      '12',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'الرصيد دلوقتي'),
      '١٬٥٠٠',
    );
    await _save(tester);
    expect(find.text('اكتب آخر 4 أرقام بالظبط.'), findsOneWidget);
    expect(api.paths, isNot(contains('wallet.createWallet')));

    await tester.enterText(
      find.widgetWithText(TextField, 'آخر 4 أرقام (لو كارت)'),
      '',
    );
    await _save(tester);
    expect(api.lastInput('wallet.createWallet'), {
      'name': 'محفظتي',
      'provider': 'VodafoneCash',
      'balance': '1500',
    });
    expect(find.text('اتحفظ.'), findsOneWidget);
    expect(find.text('محفظة أو كارت جديد'), findsNothing);
  });

  testWidgets('a wallet shows its balance, its month and its transactions', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    await _openCib(tester, api);

    expect(find.text(_money('24,350')), findsOneWidget);
    expect(
      find.text('ده الرصيد اللي كتبته النهارده. حدّثه لما يتغيّر.'),
      findsOneWidget,
    );
    expect(find.text('دخل الشهر ده'), findsOneWidget);
    expect(find.text('خرج الشهر ده'), findsOneWidget);
    expect(find.text(_money('3,121')), findsOneWidget);
    final asked = api.lastInput('wallet.getWalletMonth')! as Map;
    expect(asked['walletId'], 1);
    expect(asked['month'], matches(RegExp(r'^\d{4}-\d{2}$')));
    expect(find.text('آخر العمليات'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('Talabat'), 200);
    expect(find.textContaining('Talabat'), findsOneWidget);
  });

  testWidgets('a balance can be edited, even to what the card owes', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('wallet.updateWallet', (_) => {'success': true});
    await _openCib(tester, api);

    await tester.tap(find.text('تعديل الرصيد والاسم'));
    await tester.pumpAndSettle();
    expect(find.text('تعديل كارت CIB'), findsOneWidget);
    // The kind is set when the wallet is added.
    expect(find.byType(ChoiceChip), findsNothing);
    await tester.enterText(
      find.widgetWithText(TextField, 'الرصيد دلوقتي'),
      '-200',
    );
    await _save(tester);
    expect(api.lastInput('wallet.updateWallet'), {
      'id': 1,
      'name': 'كارت CIB',
      'lastFourDigits': '4821',
      'balance': '-200',
    });
  });

  testWidgets('deleting asks first, and only the choice closes the sheet', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('wallet.deleteWallet', (_) => {'success': true});
    await _openCib(tester, api);

    await tester.tap(find.text('مسح المحفظة'));
    await tester.pumpAndSettle();
    expect(find.text('تمسح كارت CIB؟'), findsOneWidget);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(find.text('تمسح كارت CIB؟'), findsOneWidget);

    await tester.tap(find.text('لأ، سيبها'));
    await tester.pumpAndSettle();
    expect(api.paths, isNot(contains('wallet.deleteWallet')));

    await tester.tap(find.text('مسح المحفظة'));
    await tester.pumpAndSettle();
    api.answer('wallet.getWallets', (_) => <Object>[]);
    await tester.tap(find.text('امسحها'));
    await tester.pumpAndSettle();
    expect(api.lastInput('wallet.deleteWallet'), {'id': 1});
    expect(find.text('المحفظة اتمسحت.'), findsOneWidget);
    expect(find.text('مفيش محافظ ولا كروت لسه'), findsOneWidget);
  });

  testWidgets('a wallet deleted elsewhere says so and leads back', (
    tester,
  ) async {
    final api = FakeApi();
    answerSampleMonth(api);
    await _openCib(tester, api);

    api.answer('wallet.getWallets', (_) => <Object>[]);
    await tester.fling(find.byType(ListView).first, const Offset(0, 500), 1500);
    await tester.pumpAndSettle();
    expect(find.text('المحفظة دي مش موجودة'), findsOneWidget);
    await tester.tap(find.text('ارجع للمحافظ'));
    await tester.pumpAndSettle();
    expect(find.text('مفيش محافظ ولا كروت لسه'), findsOneWidget);
  });

  testWidgets('a failure shows the server message and tries again', (
    tester,
  ) async {
    var calls = 0;
    final api = FakeApi();
    answerSampleMonth(api);
    api.answer('wallet.getWallets', (_) {
      calls++;
      throw const TrpcFailure(
        'INTERNAL_SERVER_ERROR',
        500,
        'حصلت مشكلة عندنا. جرّب تاني.',
      );
    });
    await _openWallets(tester, api);

    expect(find.text('حصلت مشكلة عندنا. جرّب تاني.'), findsOneWidget);
    final before = calls;
    await tester.tap(find.text('جرّب تاني'));
    await tester.pumpAndSettle();
    expect(calls, greaterThan(before));
  });

  testWidgets(
    'meets the tap target, label and contrast guidelines in both themes',
    (tester) async {
      final semantics = tester.ensureSemantics();
      for (final brightness in Brightness.values) {
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        final api = FakeApi();
        answerSampleMonth(api);
        await _openWallets(tester, api);
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        await tester.tap(find.text('كارت CIB'));
        await tester.pumpAndSettle();
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
      }
      tester.platformDispatcher.clearPlatformBrightnessTestValue();
      semantics.dispose();
    },
  );

  testWidgets(
    'a server error on pull-to-refresh keeps cached wallets and shows a notice',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openWallets(tester, api);
      expect(find.text('كارت CIB'), findsOneWidget);

      api.answer(
        'wallet.getWallets',
        (_) => throw const ApiException(
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          message: 'Internal error',
        ),
      );
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 500),
        1500,
      );
      await tester.pumpAndSettle();

      expect(find.text('كارت CIB'), findsOneWidget);
      expect(find.byType(ErrorState), findsNothing);
      expect(
        find.text(
          'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'a server error on wallet detail refresh keeps detail and shows a notice',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openCib(tester, api);
      expect(find.text('كارت CIB'), findsOneWidget);

      api.answer(
        'wallet.getWalletMonth',
        (_) => throw const ApiException(
          code: 'INTERNAL_SERVER_ERROR',
          httpStatus: 500,
          message: 'Internal error',
        ),
      );
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 500),
        1500,
      );
      await tester.pumpAndSettle();

      expect(find.text('كارت CIB'), findsOneWidget);
      expect(find.byType(ErrorState), findsNothing);
      expect(
        find.text(
          'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'wallet detail offline with cached balance shows partial state naming missing items',
    (tester) async {
      final onlineApi = FakeApi();
      answerSampleMonth(onlineApi);
      final first = await _openWallets(tester, onlineApi);
      expect(find.text('كارت CIB'), findsOneWidget);

      final offlineApi = FakeApi()..offline = true;
      final second = TestApp(token: 'stored-token', api: offlineApi);
      second.ledgerStore.ledger = first.ledgerStore.ledger;
      await second.pump(tester);
      await tester.tap(find.text('المزيد').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('المحافظ والكروت'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('كارت CIB'));
      await tester.pumpAndSettle();

      expect(find.byType(ErrorState), findsNothing);
      expect(find.text('كارت CIB'), findsOneWidget);
      expect(find.text(_money('24,350')), findsOneWidget);
      expect(
        find.text('المعاملات وملخص الشهر مش متوفرين أوفلاين.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'dirty wallet form asks for confirmation before discarding changes',
    (tester) async {
      final api = FakeApi();
      answerSampleMonth(api);
      await _openWallets(tester, api);

      await tester.tap(find.text('ضيف محفظة أو كارت'));
      await tester.pumpAndSettle();
      expect(find.text('محفظة أو كارت جديد'), findsOneWidget);

      // Enter a name to make the form dirty
      await tester.enterText(
        find.widgetWithText(TextField, 'الاسم'),
        'كارت جديد',
      );
      await tester.pumpAndSettle();

      // Attempt to dismiss by popping
      final nav = Navigator.of(tester.element(find.text('محفظة أو كارت جديد')));
      nav.maybePop();
      await tester.pumpAndSettle();

      // Discard dialog is shown
      expect(find.text('تجاهل التعديلات؟'), findsOneWidget);
      expect(
        find.text('لو رجعت دلوقتي، التعديلات اللي كتبتها مش هتتحفظ.'),
        findsOneWidget,
      );

      // Cancel discard
      await tester.tap(find.text('كمّل تعديل'));
      await tester.pumpAndSettle();
      expect(find.text('تجاهل التعديلات؟'), findsNothing);
      expect(find.text('محفظة أو كارت جديد'), findsOneWidget);

      // Pop again and confirm discard
      final nav2 = Navigator.of(tester.element(find.text('محفظة أو كارت جديد')));
      nav2.maybePop();
      await tester.pumpAndSettle();
      expect(find.text('تجاهل التعديلات؟'), findsOneWidget);

      await tester.tap(find.text('تجاهل'));
      await tester.pumpAndSettle();

      // Form is dismissed
      expect(find.text('محفظة أو كارت جديد'), findsNothing);
    },
  );

  test('reads and round-trips server rows, tolerating what is missing', () {
    final wallet = Wallet.fromJson(const {
      'id': 4,
      'name': 'Old card',
      'provider': 'SomethingNew',
      'balance': '-150.25',
      'lastFourDigits': '',
      'balanceObservedAt': '2026-10-30T10:15:00.000Z',
    });
    expect(wallet.kind, WalletKind.card);
    expect(wallet.balance, -150.25);
    expect(wallet.lastFour, isNull);
    expect(wallet.balanceObservedAt, isNotNull);
    expect(WalletKind.of('VodafoneCash'), WalletKind.vodafoneCash);

    final stored = StoredLedger.fromJson(
      StoredLedger(accountKey: 'phone:42', wallets: [wallet]).toJson(),
    );
    expect(stored.wallets, hasLength(1));
    expect(stored.wallets!.single.id, 4);
    expect(stored.wallets!.single.toJson()['provider'], 'SomethingNew');
    expect(stored.wallets!.single.balance, -150.25);

    final month = WalletMonth.fromJson(const {'moneyIn': '12.50'});
    expect(month.moneyIn, 12.5);
    expect(month.moneyOut, 0);
    expect(month.count, 0);
  });
}
