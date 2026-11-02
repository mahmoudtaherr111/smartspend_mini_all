import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/receipts/receipt_image_service.dart';
import 'package:smartspend_app/src/features/ledger/receipts/receipt_review_sheet.dart';
import 'package:smartspend_app/src/features/ledger/record_composer.dart';
import 'package:smartspend_app/src/features/plans/plan_models.dart';
import 'package:smartspend_app/src/features/plans/plan_providers.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'support/device_fakes.dart';
import 'support/sample_month.dart';
import 'support/test_app.dart';

final class _RefusedCamera implements ReceiptImagePickerService {
  @override
  Future<PickedReceiptImage?> pickFromCamera() =>
      throw PlatformException(code: 'camera_access_denied');

  @override
  Future<PickedReceiptImage?> pickFromGallery() async => null;
}

void main() {
  testWidgets('shows camera button in composer', (tester) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    final app = TestApp(token: 'stored-token', api: fakeApi);
    await app.pump(tester);

    expect(find.byType(RecordComposer), findsOneWidget);
    expect(find.byTooltip('تصوير فاتورة'), findsOneWidget);
    expect(find.byIcon(Icons.camera_alt_outlined), findsOneWidget);
  });

  testWidgets(
    'free plan tapping camera displays UpgradePromptSheet for receipts',
    (tester) async {
      final fakeApi = FakeApi();
      fakeApi.answer('localAuth.me', (_) => phoneUser());
      answerSampleMonth(fakeApi);
      fakeApi.answer('pro.myPlan', (_) => {'plan': 'free', 'role': 'user'});
      final app = TestApp(
        token: 'stored-token',
        api: fakeApi,
        overrides: [
          userPlanProvider.overrideWith(
            (ref) async => const UserPlanInfo(plan: 'free', role: 'user'),
          ),
        ],
      );
      await app.pump(tester);

      await tester.tap(find.byTooltip('تصوير فاتورة'));
      await tester.pumpAndSettle();

      expect(find.byType(UpgradePromptSheet), findsOneWidget);
      expect(find.text('تصوير الفواتير بالذكاء الاصطناعي'), findsOneWidget);
      expect(find.text('اشترك الآن في برو'), findsOneWidget);
    },
  );

  testWidgets('a refused camera explains the way forward and sends nothing', (
    tester,
  ) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);

    final app = TestApp(
      token: 'stored-token',
      api: fakeApi,
      overrides: [
        userPlanProvider.overrideWith(
          (ref) async => const UserPlanInfo(plan: 'pro', role: 'user'),
        ),
        receiptImagePickerProvider.overrideWithValue(_RefusedCamera()),
      ],
    );
    await app.pump(tester);

    await tester.tap(find.byTooltip('تصوير فاتورة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الكاميرا'));
    await tester.pumpAndSettle();

    expect(find.textContaining('مش قادرين نفتح الكاميرا'), findsOneWidget);
    expect(fakeApi.paths, isNot(contains('image.parseReceipt')));
  });

  testWidgets('pro user captures receipt, reviews and saves', (tester) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    fakeApi.answer(
      'image.parseReceipt',
      (_) => {
        'amount': 350.0,
        'description': 'مشتريات بقالة',
        'category': 'أكل وشرب',
        'subCategory': 'سوبرماركت',
        'type': 'expense',
        'merchant': 'سوبرماركت زهران',
        'confidence': 0.95,
        'ocrText': 'زهران ماركت الإجمالي 350 ج',
        'tokensUsed': 450,
        'parsedBy': 'gemini',
        'expenseId': null,
        'saved': false,
      },
    );
    fakeApi.answer('expense.create', (_) => {'id': 991});

    final fakePicker = FakeReceiptImagePickerService(
      mockImage: PickedReceiptImage(
        bytes: Uint8List.fromList(List.filled(200, 42)),
        mimeType: 'image/jpeg',
      ),
    );

    final app = TestApp(
      token: 'stored-token',
      api: fakeApi,
      overrides: [
        userPlanProvider.overrideWith(
          (ref) async => const UserPlanInfo(plan: 'pro', role: 'user'),
        ),
        receiptImagePickerProvider.overrideWithValue(fakePicker),
      ],
    );
    await app.pump(tester);

    await tester.tap(find.byTooltip('تصوير فاتورة'));
    await tester.pumpAndSettle();

    // Pick camera
    await tester.tap(find.text('الكاميرا'));
    await tester.pumpAndSettle();

    // Review sheet appears
    expect(find.byType(ReceiptReviewSheet), findsOneWidget);
    expect(find.text('مراجعة الفاتورة'), findsOneWidget);
    expect(find.text('سوبرماركت زهران'), findsOneWidget);
    expect(find.text('حفظ في السجل'), findsOneWidget);

    // Tap save
    await tester.tap(find.text('حفظ في السجل'));
    await tester.pumpAndSettle();

    // Sheet dismissed and saved notification shown
    expect(find.byType(ReceiptReviewSheet), findsNothing);
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('unreadable receipt image shows notice offering retake', (
    tester,
  ) async {
    final fakeApi = FakeApi();
    fakeApi.answer('localAuth.me', (_) => phoneUser());
    answerSampleMonth(fakeApi);
    fakeApi.answer(
      'image.parseReceipt',
      (_) => {
        'amount': 0.0,
        'description': '',
        'category': 'عام',
        'subCategory': null,
        'type': 'expense',
        'merchant': null,
        'confidence': 0.1,
        'ocrText': null,
        'tokensUsed': 100,
        'parsedBy': 'gemini',
        'expenseId': null,
        'saved': false,
      },
    );

    final fakePicker = FakeReceiptImagePickerService(
      mockImage: PickedReceiptImage(
        bytes: Uint8List.fromList(List.filled(150, 99)),
        mimeType: 'image/jpeg',
      ),
    );

    final app = TestApp(
      token: 'stored-token',
      api: fakeApi,
      overrides: [
        userPlanProvider.overrideWith(
          (ref) async => const UserPlanInfo(plan: 'pro', role: 'user'),
        ),
        receiptImagePickerProvider.overrideWithValue(fakePicker),
      ],
    );
    await app.pump(tester);

    await tester.tap(find.byTooltip('تصوير فاتورة'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('الكاميرا'));
    await tester.pumpAndSettle();

    // Review sheet should NOT appear, instead notice offering retake
    expect(find.byType(ReceiptReviewSheet), findsNothing);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(
      find.text(
        'الصورة مش واضحة أو مقدرناش نقرأ المبلغ. صوّر في إضاءة أفضل وجرّب تاني.',
      ),
      findsOneWidget,
    );
  });
}
