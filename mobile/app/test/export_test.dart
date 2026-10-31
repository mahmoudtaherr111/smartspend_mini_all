import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/core/providers.dart';
import 'package:smartspend_app/src/features/export/export_api.dart';
import 'package:smartspend_app/src/features/export/export_models.dart';
import 'package:smartspend_app/src/features/export/export_screen.dart';
import 'package:smartspend_app/src/routing/app_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/test_app.dart';

void main() {
  group('Export transactions & Law 151 (REC-15)', () {
    test('ExportResult parses json correctly', () {
      final res = ExportResult.fromJson({
        'format': 'csv',
        'data': 'التاريخ,النوع,المبلغ\n2026-10-31,مصروف,150',
        'filename': 'expenses_12.csv',
      });

      expect(res.format, 'csv');
      expect(res.filename, 'expenses_12.csv');
      expect(res.data, isA<String>());
    });

    testWidgets(
      'ExportScreen presents period options, Law 151 notice, and exports',
      (tester) async {
        final api = FakeApi();
        api.answer('localAuth.me', (_) => phoneUser());

        Map<String, Object?>? exportArgs;
        api.answer('export.myExpenses', (input) {
          exportArgs = input as Map<String, Object?>?;
          return {
            'format': 'xlsx',
            'data': 'UEsDBBQAAAAIAAA=', // Mock base64 xlsx
            'filename': 'expenses_user.xlsx',
          };
        });

        final tempDir = Directory.systemTemp.createTempSync('export_test_');
        addTearDown(() {
          try {
            tempDir.deleteSync(recursive: true);
          } catch (_) {}
        });

        final app = TestApp(
          token: 'test-token',
          api: api,
          overrides: [
            exportApiProvider.overrideWith(
              (ref) => ExportApi(
                ref.watch(trpcClientProvider),
                documentsDirectoryResolver: () async => tempDir,
              ),
            ),
          ],
        );
        await app.pump(tester);

        app.container.read(routerProvider).go(ExportScreen.path);
        await tester.pumpAndSettle();

        expect(find.text('تصدير البيانات'), findsOneWidget);
        expect(find.text('الشهر الحالي'), findsOneWidget);
        expect(find.text('آخر 3 شهور'), findsOneWidget);
        expect(find.text('كل المعاملات من البداية'), findsOneWidget);

        await tester.scrollUntilVisible(
          find.textContaining('151 لسنة 2020'),
          100,
        );
        await tester.pumpAndSettle();
        expect(find.textContaining('151 لسنة 2020'), findsOneWidget);

        await tester.scrollUntilVisible(
          find.widgetWithText(SmartSpendButton, 'تصدير وتحميل الملف'),
          100,
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(SmartSpendButton, 'تصدير وتحميل الملف'),
        );
        await tester.pumpAndSettle();

        expect(exportArgs, isNotNull);
        expect(exportArgs!['format'], 'xlsx');
        expect(
          find.textContaining('تم تصدير وحفظ الملف بنجاح'),
          findsOneWidget,
        );
      },
    );
  });
}
