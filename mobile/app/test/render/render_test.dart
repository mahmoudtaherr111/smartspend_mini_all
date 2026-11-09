// The local render loop (FND-01 in .agents/mobile-program): the app's screens drawn at a small and a large phone, in
// both themes, Arabic and English, and at text scale 1 and 2, with the real Cairo and Material icon fonts, saved as
// PNG files to look at before shipping. It runs only on request and writes outside the repository:
//
//   SMARTSPEND_RENDER_DIR=E:/smartspend_V1_fixed/.agents/mobile-program/renders flutter test test/render
//
// Without SMARTSPEND_RENDER_DIR every case is skipped, so CI never runs it.
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/preferences.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/ledger/offline/outbox.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/lock/lock_store.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../support/sample_calendar.dart';
import '../support/sample_commitments.dart';
import '../support/sample_money.dart';
import '../support/sample_month.dart';
import '../support/test_app.dart';

final _outDir = Platform.environment['SMARTSPEND_RENDER_DIR'];
final _only = Platform.environment['SMARTSPEND_RENDER_ONLY'];

/// A phone size in logical pixels: a small Android phone and a large one.
const _sizes = [('small', Size(360, 800)), ('large', Size(412, 915))];
const _themes = [('dark', Brightness.dark), ('light', Brightness.light)];
const _languages = [('ar', AppLanguage.arabic), ('en', AppLanguage.english)];
const _scales = [('x1', 1.0), ('x2', 2.0)];

/// With SMARTSPEND_RENDER_QUICK set, three pictures of a screen instead of sixteen: each theme, and English at
/// twice the text size.
final _quick = Platform.environment['SMARTSPEND_RENDER_QUICK'] != null;
const _quickCases = {
  'small-dark-ar-x1',
  'small-light-ar-x1',
  'small-dark-en-x2',
};

/// One screen to draw: how to reach it once the app is open, signed in or not.
typedef Reach = Future<void> Function(
  WidgetTester tester,
  AppLanguage language,
);

typedef PrepareApi = void Function(FakeApi api);

final _screens = <(String, bool, PrepareApi?, Reach)>[
  ('sign-in', false, null, (tester, _) async {}),
  ('record', true, null, (tester, _) async {}),
  (
    'pending-questions',
    true,
    (api) {
      api.answer(
        'expense.getPendingClarifications',
        (_) => [
          {
            'id': 51,
            'originalText': 'دفعت 400 جنيه لمحمد امبارح',
            'question': 'الـ 400 جنيه لمحمد كانت سلفة ولا مصروف على إيه؟',
          },
        ],
      );
    },
    (tester, _) async {},
  ),
  (
    'transactions',
    true,
    null,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'See all' : 'الكل'),
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'transaction',
    true,
    null,
    (tester, _) async {
      final row = find.text(inlineName('Talabat')).first;
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();
    },
  ),
  (
    'edit-transaction',
    true,
    null,
    (tester, language) async {
      final row = find.text(inlineName('Talabat')).first;
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();
      final editRow = find.text(
        language == AppLanguage.english ? 'Edit transaction' : 'تعديل العملية',
      );
      await tester.ensureVisible(editRow);
      await tester.pumpAndSettle();
      await tester.tap(editRow);
      await tester.pumpAndSettle();
    },
  ),
  (
    'stats',
    true,
    null,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Stats' : 'إحصائيات').last,
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'category',
    true,
    null,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Stats' : 'إحصائيات').last,
      );
      await tester.pumpAndSettle();
      final row = find.text('أكل وشرب');
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pumpAndSettle();
    },
  ),
  (
    'more',
    true,
    null,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'More' : 'المزيد').last,
      );
      await tester.pumpAndSettle();
    },
  ),
  ('wallets', true, null, _openWallets),
  (
    'wallet',
    true,
    null,
    (tester, language) async {
      await _openWallets(tester, language);
      await tester.tap(find.text('كارت CIB'));
      await tester.pumpAndSettle();
    },
  ),
  (
    'manual-record',
    true,
    null,
    (tester, _) async {
      final btn = find.byIcon(Icons.add_rounded);
      await tester.tap(btn);
      await tester.pumpAndSettle();
    },
  ),
  (
    'calendar',
    true,
    answerSampleCalendar,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Calendar' : 'تقويم').last,
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'calendar-commitments',
    true,
    (api) {
      answerSampleCalendar(api);
      answerSampleCommitments(api);
    },
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Calendar' : 'تقويم').last,
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView).first, const Offset(0, -560));
      await tester.pumpAndSettle();
    },
  ),
  (
    'calendar-day-due',
    true,
    (api) {
      answerSampleCalendar(api);
      answerSampleCommitments(api);
    },
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Calendar' : 'تقويم').last,
      );
      await tester.pumpAndSettle();
      final day = find.text('12');
      await _reveal(tester, day);
      await tester.tap(day.first);
      await tester.pumpAndSettle();
    },
  ),
  ('commitments', true, _commitmentsApi, _push('/commitments')),
  (
    'commitments-scrolled',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments')(tester, language);
      await tester.drag(find.byType(ListView).last, const Offset(0, -700));
      await tester.pumpAndSettle();
    },
  ),
  ('commitment-fridge', true, _commitmentsApi, _push('/commitments/1')),
  ('commitment-add', true, _commitmentsApi, _push('/commitments/add')),
  (
    'commitment-subscriptions',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments/add')(tester, language);
      await tester.tap(find.byKey(const ValueKey('type-subscription')));
      await tester.pumpAndSettle();
    },
  ),
  (
    'commitment-netflix-form',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments/add')(tester, language);
      await tester.tap(find.byKey(const ValueKey('type-subscription')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('brand-netflix')));
      await tester.pumpAndSettle();
    },
  ),
  (
    'commitment-installment-form',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments/add')(tester, language);
      await tester.tap(find.byKey(const ValueKey('type-installment')));
      await tester.pumpAndSettle();
    },
  ),
  (
    'commitment-gam3eya-form',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments/add')(tester, language);
      final tile = find.byKey(const ValueKey('type-gam3eya'));
      await _reveal(tester, tile);
      await tester.tap(tile);
      await tester.pumpAndSettle();
    },
  ),
  (
    'commitment-pay',
    true,
    _commitmentsApi,
    (tester, language) async {
      await _push('/commitments')(tester, language);
      final row = find.byKey(const ValueKey('upcoming-2-2026-11-12'));
      await _reveal(tester, row);
      await tester.tap(
        find.descendant(of: row, matching: find.byType(TextButton)),
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'commitments-prompt',
    true,
    (api) {
      answerSampleMoney(api);
      answerSampleCommitments(api, withQuestions: true);
    },
    (tester, _) async {},
  ),
  ('ai', true, answerSampleMoney, _openAi),
  ('ai-report', true, answerSampleMoney, _aiTab(1)),
  ('ai-compare', true, answerSampleMoney, _aiTab(2)),
  ('ai-yearly', true, answerSampleMoney, _aiTab(3)),
  for (final path in const [
    '/more/settings',
    '/more/profile',
    '/more/money-prefs',
    '/more/sessions',
    '/more/onboarding',
    '/more/help',
    '/more/plan',
    '/more/cancel-plan',
    '/more/terms',
    '/more/data-stored',
    '/more/capture',
    '/more/capture-settings',
    '/more/contacts',
    '/more/budgets',
    '/more/goals',
    '/more/seasons',
    '/more/export',
    '/more/business',
    '/more/security',
    '/more/security/pin',
    '/notifications',
    '/search',
    '/settings/notifications',
  ])
    (
      path.substring(1).replaceAll('/', '-'),
      true,
      answerSampleMoney,
      _push(path),
    ),
];

/// Scrolls the screen's list until [finder] is built and on screen: a long list builds only what it shows.
Future<void> _reveal(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      finder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

void _commitmentsApi(FakeApi api) {
  answerSampleMoney(api);
  answerSampleCommitments(api);
}

Reach _push(String path) => (tester, _) async {
  unawaited(GoRouter.of(tester.element(find.byType(NavigationBar))).push(path));
  await tester.pumpAndSettle();
};

Future<void> _openAi(WidgetTester tester, AppLanguage language) async {
  await tester.tap(
    find.text(language == AppLanguage.english ? 'AI Center' : 'مركز AI').last,
  );
  await tester.pumpAndSettle();
}

Reach _aiTab(int index) => (tester, language) async {
  await _openAi(tester, language);
  final tab = find.byType(Tab).at(index);
  await tester.ensureVisible(tab);
  await tester.pumpAndSettle();
  await tester.tap(tab);
  await tester.pumpAndSettle();
};

Future<void> _openWallets(WidgetTester tester, AppLanguage language) async {
  final english = language == AppLanguage.english;
  await tester.tap(find.text(english ? 'More' : 'المزيد').last);
  await tester.pumpAndSettle();
  final entry = find.text(english ? 'Wallets and cards' : 'المحافظ والكروت');
  await tester.ensureVisible(entry);
  await tester.pumpAndSettle();
  await tester.tap(entry);
  await tester.pumpAndSettle();
}

Future<void> _loadFonts() async {
  final cairo = FontLoader('packages/smartspend_ui/Cairo')
    ..addFont(
      _bytes('../packages/smartspend_ui/assets/fonts/Cairo-Variable.ttf'),
    );
  await cairo.load();
  // The icon font of the Flutter SDK this test runs on, found by walking up from its test runner. Its name has
  // capitals on disk; Windows matches it either way, Linux and macOS only as written.
  var dir = File(Platform.resolvedExecutable).parent;
  const iconFonts = [
    'cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    'cache/artifacts/material_fonts/materialicons-regular.otf',
  ];
  String? found() => iconFonts
      .map((name) => '${dir.path}/$name')
      .where((path) => File(path).existsSync())
      .firstOrNull;
  while (found() == null && dir.parent.path != dir.path) {
    dir = dir.parent;
  }
  final icons = FontLoader('MaterialIcons')..addFont(_bytes(found()!));
  await icons.load();
}

Future<ByteData> _bytes(String path) async =>
    ByteData.sublistView(await File(path).readAsBytes());

final _frame = GlobalKey();

Future<void> _open(
  WidgetTester tester, {
  required bool signedIn,
  required AppLanguage language,
  PrepareApi? prepareApi,
}) async {
  StaggeredReveal.resetSession();
  final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(api);
  prepareApi?.call(api);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _frame,
      child: ProviderScope(
        key: UniqueKey(),
        overrides: [
          appConfigProvider.overrideWithValue(
            AppConfig(
              environment: 'development',
              apiBaseUri: Uri.parse('http://localhost:3000'),
              userAgent: 'SmartSpend-Mobile (render)',
            ),
          ),
          sessionStoreProvider.overrideWithValue(
            MemorySessionStore(signedIn ? 'render-session' : null),
          ),
          httpClientProvider.overrideWithValue(api.client),
          ledgerStoreProvider.overrideWithValue(MemoryLedgerStore()),
          outboxRetryDelaysProvider.overrideWithValue(const []),
          lockStoreProvider.overrideWithValue(MemoryLockStore()),
          deviceLockProvider.overrideWithValue(FakeDeviceLock()),
          bankCaptureProvider.overrideWithValue(FakeBankCapture()),
          preferencesStoreProvider.overrideWithValue(MemoryPreferencesStore()),
          initialPreferencesProvider.overrideWithValue(
            DevicePreferences(language: language),
          ),
        ],
        child: const SmartSpendApp(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _save(WidgetTester tester, String name) async {
  await tester.runAsync(() async {
    final boundary =
        _frame.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('$_outDir/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(png!.buffer.asUint8List());
  });
}

void main() {
  setUpAll(() async {
    if (_outDir != null) await _loadFonts();
  });

  for (final (screen, signedIn, prepareApi, reach) in _screens) {
    final only = _only;
    if (only != null && !only.split(',').contains(screen)) continue;
    testWidgets('renders $screen', skip: _outDir == null, (tester) async {
      for (final (sizeName, size) in _sizes) {
        for (final (themeName, brightness) in _themes) {
          for (final (languageName, language) in _languages) {
            for (final (scaleName, scale) in _scales) {
              final name = '$sizeName-$themeName-$languageName-$scaleName';
              if (_quick && !_quickCases.contains(name)) continue;
              tester.view
                ..physicalSize = size * 2
                ..devicePixelRatio = 2;
              tester.platformDispatcher
                ..platformBrightnessTestValue = brightness
                ..textScaleFactorTestValue = scale;
              await _open(
                tester,
                signedIn: signedIn,
                language: language,
                prepareApi: prepareApi,
              );
              await reach(tester, language);
              await _save(tester, '$screen/$name');
            }
          }
        }
      }
      tester.view.reset();
      tester.platformDispatcher.clearAllTestValues();
    });
  }
}
