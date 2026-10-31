import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

Widget buildApp({required Widget child, Locale locale = const Locale('ar')}) {
  return MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    theme: SmartSpendTheme.dark(),
    home: Scaffold(body: Center(child: child)),
  );
}

void main() {
  testWidgets('DebtBadge renders positive balance with sign and word (ليك)', (
    tester,
  ) async {
    await tester.pumpWidget(buildApp(child: const DebtBadge(balance: 500)));
    expect(find.text('+ 500 ج.م (ليك)'), findsOneWidget);
  });

  testWidgets('DebtBadge renders negative balance with sign and word (عليك)', (
    tester,
  ) async {
    await tester.pumpWidget(buildApp(child: const DebtBadge(balance: -350)));
    expect(find.text('- 350 ج.م (عليك)'), findsOneWidget);
  });

  testWidgets('DebtBadge renders zero balance as settled (متصفي)', (
    tester,
  ) async {
    await tester.pumpWidget(buildApp(child: const DebtBadge(balance: 0)));
    expect(find.text('0 ج.م (متصفي)'), findsOneWidget);
  });

  testWidgets('DebtBadge renders english locale correctly', (tester) async {
    await tester.pumpWidget(
      buildApp(
        child: const DebtBadge(balance: 500),
        locale: const Locale('en'),
      ),
    );
    expect(find.text('+ 500 EGP (owes you)'), findsOneWidget);
  });
}
