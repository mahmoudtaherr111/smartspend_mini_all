import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/features/ledger/category_style.dart';
import 'package:smartspend_app/src/features/ledger/ledger_models.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  LedgerEntry read(Object financial) => LedgerEntry.fromJson({
    'id': 1,
    'amount': '100.00',
    'type': 'income',
    'category': 'تحويل',
    'date': '2026-10-20T10:00:00Z',
    'parsedMetadata': {'financial': financial},
  });

  test(
    'keeps the financial meaning through offline serialization and editing',
    () {
      final own = read({
        'version': 1,
        'kind': 'own_transfer',
        'movement': 'in',
      });
      expect(own.excludedFromTotals, isTrue);
      expect(own.displayType, 'transfer');
      expect(entryKind(own), AmountKind.neutral);
      expect(LedgerEntry.fromJson(own.toJson()).displayType, 'transfer');
      final loan = read({
        'version': 1,
        'kind': 'loan',
        'movement': 'in',
        'excluded': true,
      });
      expect(loan.excludedFromTotals, isFalse);
      expect(entryKind(loan), AmountKind.income);
    },
  );

  test('does not trust unsupported or malformed financial metadata', () {
    for (final value in [
      {'version': '1', 'kind': 'own_transfer', 'movement': 'in'},
      {'version': 1, 'kind': 'own_transfer', 'movement': 'wrong'},
      {'version': 1, 'kind': 'invented', 'movement': 'in'},
    ]) {
      expect(read(value).excludedFromTotals, isFalse);
    }
  });
}
