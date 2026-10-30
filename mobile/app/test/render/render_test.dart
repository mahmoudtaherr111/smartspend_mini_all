// The local render loop (FND-01 in .agents/mobile-program): the app's screens drawn at a small and a large phone, in
// both themes, Arabic and English, and at text scale 1 and 2, with the real Cairo and Material icon fonts, saved as
// PNG files to look at before shipping. It runs only on request and writes outside the repository:
//
//   SMARTSPEND_RENDER_DIR=E:/smartspend_V1_fixed/.agents/mobile-program/renders flutter test test/render
//
// Without SMARTSPEND_RENDER_DIR every case is skipped, so CI never runs it.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/app.dart';
import 'package:smartspend_app/src/config/app_config.dart';
import 'package:smartspend_app/src/core/preferences.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/ledger/ledger_providers.dart';
import 'package:smartspend_app/src/features/ledger/offline/ledger_store.dart';
import 'package:smartspend_app/src/features/ledger/offline/outbox.dart';
import 'package:smartspend_app/src/features/lock/app_lock.dart';
import 'package:smartspend_app/src/features/lock/lock_store.dart';

import '../support/sample_month.dart';
import '../support/test_app.dart';

final _outDir = Platform.environment['SMARTSPEND_RENDER_DIR'];
final _only = Platform.environment['SMARTSPEND_RENDER_ONLY'];

/// A phone size in logical pixels: a small Android phone and a large one.
const _sizes = [('small', Size(360, 800)), ('large', Size(412, 915))];
const _themes = [('dark', Brightness.dark), ('light', Brightness.light)];
const _languages = [('ar', AppLanguage.arabic), ('en', AppLanguage.english)];
const _scales = [('x1', 1.0), ('x2', 2.0)];

/// One screen to draw: how to reach it once the app is open, signed in or not.
typedef Reach = Future<void> Function(
  WidgetTester tester,
  AppLanguage language,
);

final _screens = <(String, bool, Reach)>[
  ('sign-in', false, (tester, _) async {}),
  ('record', true, (tester, _) async {}),
  (
    'transactions',
    true,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'See all' : 'الكل'),
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'stats',
    true,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'Stats' : 'إحصائيات').last,
      );
      await tester.pumpAndSettle();
    },
  ),
  (
    'more',
    true,
    (tester, language) async {
      await tester.tap(
        find.text(language == AppLanguage.english ? 'More' : 'المزيد').last,
      );
      await tester.pumpAndSettle();
    },
  ),
];

Future<void> _loadFonts() async {
  final cairo = FontLoader('packages/smartspend_ui/Cairo')
    ..addFont(
      _bytes('../packages/smartspend_ui/assets/fonts/Cairo-Variable.ttf'),
    );
  await cairo.load();
  // The icon font of the Flutter SDK this test runs on, found by walking up from its test runner.
  var dir = File(Platform.resolvedExecutable).parent;
  const iconFont = 'cache/artifacts/material_fonts/materialicons-regular.otf';
  while (!File('${dir.path}/$iconFont').existsSync() &&
      dir.parent.path != dir.path) {
    dir = dir.parent;
  }
  final icons = FontLoader('MaterialIcons')
    ..addFont(_bytes('${dir.path}/$iconFont'));
  await icons.load();
}

Future<ByteData> _bytes(String path) async =>
    ByteData.sublistView(await File(path).readAsBytes());

final _frame = GlobalKey();

Future<void> _open(
  WidgetTester tester, {
  required bool signedIn,
  required AppLanguage language,
}) async {
  final api = FakeApi()..answer('localAuth.me', (_) => phoneUser());
  answerSampleMonth(api);
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

  for (final (screen, signedIn, reach) in _screens) {
    final only = _only;
    if (only != null && !only.split(',').contains(screen)) continue;
    testWidgets('renders $screen', skip: _outDir == null, (tester) async {
      for (final (sizeName, size) in _sizes) {
        for (final (themeName, brightness) in _themes) {
          for (final (languageName, language) in _languages) {
            for (final (scaleName, scale) in _scales) {
              tester.view
                ..physicalSize = size * 2
                ..devicePixelRatio = 2;
              tester.platformDispatcher
                ..platformBrightnessTestValue = brightness
                ..textScaleFactorTestValue = scale;
              await _open(tester, signedIn: signedIn, language: language);
              await reach(tester, language);
              await _save(
                tester,
                '$screen/$sizeName-$themeName-$languageName-$scaleName',
              );
            }
          }
        }
      }
      tester.view.reset();
      tester.platformDispatcher.clearAllTestValues();
    });
  }
}
