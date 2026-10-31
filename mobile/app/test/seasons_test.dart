import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/seasons/season_models.dart';
import 'package:smartspend_app/src/features/seasons/seasons_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';

import 'support/test_app.dart';

void main() {
  group('Season spending (REC-20)', () {
    test(
      'SeasonSpending parses json and computes percentageChange accurately',
      () {
        final season = SeasonSpending.fromJson({
          'season': 'ramadan',
          'label': 'رمضان',
          'startDay': '2026-02-18',
          'endDay': '2026-03-19',
          'total': 15000.0,
          'count': 45,
          'byCategory': [
            {'category': 'أكل وشرب', 'amount': 9500.0, 'count': 30},
            {'category': 'عزومات وهدايا', 'amount': 5500.0, 'count': 15},
          ],
          'previous': {
            'startDay': '2025-03-01',
            'endDay': '2025-03-30',
            'total': 12000.0,
          },
        });

        expect(season.season, 'ramadan');
        expect(season.label, 'رمضان');
        expect(season.total, 15000.0);
        expect(season.byCategory.length, 2);
        expect(season.previous?.total, 12000.0);
        // (15000 - 12000) / 12000 = 25%
        expect(season.percentageChange, 25);
      },
    );

    testWidgets(
      'SeasonsScreen shows empty explanation when no spending in season',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'expense.getSeasonSpending',
          (_) => {
            'season': 'ramadan',
            'label': 'رمضان',
            'startDay': '2026-02-18',
            'endDay': '2026-03-19',
            'total': 0.0,
            'count': 0,
            'byCategory': <Map<String, Object?>>[],
            'previous': null,
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(SeasonsScreen.path);
        await tester.pumpAndSettle();

        expect(find.text('مواسم المصاريف'), findsOneWidget);
        expect(find.text('مافيش مصاريف في رمضان'), findsOneWidget);
        expect(
          find.textContaining('المواسم بتتحسب تلقائياً من تواريخ مصاريفك'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'SeasonsScreen displays total, comparison to last year and categories',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());
        api.answer(
          'expense.getSeasonSpending',
          (_) => {
            'season': 'ramadan',
            'label': 'رمضان',
            'startDay': '2026-02-18',
            'endDay': '2026-03-19',
            'total': 14000.0,
            'count': 22,
            'byCategory': [
              {'category': 'أكل وشرب', 'amount': 10000.0, 'count': 18},
              {'category': 'ترفيه', 'amount': 4000.0, 'count': 4},
            ],
            'previous': {
              'startDay': '2025-03-01',
              'endDay': '2025-03-30',
              'total': 10000.0,
            },
          },
        );

        final app = TestApp(token: 'test-token', api: api);
        await app.pump(tester);

        app.container.read(routerProvider).go(SeasonsScreen.path);
        await tester.pumpAndSettle();

        expect(find.text('رمضان كلفك كام'), findsOneWidget);
        expect(
          find.textContaining('أكتر من السنة اللي فاتت بـ 40%'),
          findsOneWidget,
        );
        expect(find.text('أكل وشرب'), findsOneWidget);
        expect(find.text('ترفيه'), findsOneWidget);
      },
    );
  });
}
