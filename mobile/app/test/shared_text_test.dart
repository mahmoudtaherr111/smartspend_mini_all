import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/capture/shared_text_receiver.dart';

import 'support/test_app.dart';

void main() {
  group('Shared text into app (CAP-05)', () {
    testWidgets('enqueues shared text into outbox when present', (tester) async {
      String? returnedText = 'دفعت 150 جنيه بنزين كاش';

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.smartspend.app/share'),
        (call) async {
          if (call.method == 'getSharedText') {
            final t = returnedText;
            returnedText = null;
            return t;
          }
          return null;
        },
      );

      final api = FakeApi();
      api.answer('localAuth.me', (_) => phoneUser());
      api.answer('ai.parseExpense', (input) => {
        'decision': 'recorded',
        'items': [
          {
            'amount': 150,
            'type': 'expense',
            'category': 'سيارات',
            'subCategory': 'بنزين',
            'description': 'بنزين كاش',
          }
        ],
        'classificationLogId': 789,
      });

      final app = TestApp(token: 'session-token', api: api);
      await app.pump(tester);

      final receiver = app.container.read(sharedTextReceiverProvider);
      final handled = await receiver.checkAndSubmitSharedText();

      expect(handled, 'دفعت 150 جنيه بنزين كاش');
      expect(api.lastInput('ai.parseExpense'), isNotNull);

      // Second check returns null
      final second = await receiver.checkAndSubmitSharedText();
      expect(second, isNull);
    });
  });
}
