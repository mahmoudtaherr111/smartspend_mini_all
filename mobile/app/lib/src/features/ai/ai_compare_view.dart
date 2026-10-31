import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'ai_models.dart';
import 'ai_providers.dart';

/// Month-over-month comparison view with validation preventing identical months (AI-07).
class AiCompareView extends ConsumerStatefulWidget {
  const AiCompareView({super.key});

  @override
  ConsumerState<AiCompareView> createState() => _AiCompareViewState();
}

class _AiCompareViewState extends ConsumerState<AiCompareView> {
  late String _firstMonth;
  late String _secondMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _firstMonth = DateFormat('yyyy-MM').format(now);
    _secondMonth = DateFormat('yyyy-MM').format(DateTime(now.year, now.month - 1, 1));
  }

  bool get _isSameMonth => _firstMonth == _secondMonth;

  List<String> _getAvailableMonths() {
    final list = <String>[];
    final now = DateTime.now();
    for (int i = 0; i < 12; i++) {
      final date = DateTime(now.year, now.month - i, 1);
      list.add(DateFormat('yyyy-MM').format(date));
    }
    return list;
  }

  String _formatMonth(String yyyyMm) {
    try {
      final date = DateFormat('yyyy-MM').parse(yyyyMm);
      return DateFormat('MMMM yyyy', 'ar').format(date);
    } catch (_) {
      return yyyyMm;
    }
  }

  @override
  Widget build(BuildContext context) {
    final availableMonths = _getAvailableMonths();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'مقارنة بين شهرين',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            'اختر شهرين مختلفين لتحليل التغيرات في المصاريف وأسبابها.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 16),

          // Selectors
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('الشهر الأول:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _firstMonth,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                      items: [
                        for (final m in availableMonths)
                          DropdownMenuItem(value: m, child: Text(_formatMonth(m), style: const TextStyle(fontSize: 13))),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _firstMonth = val);
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('الشهر الثاني:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _secondMonth,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                      items: [
                        for (final m in availableMonths)
                          DropdownMenuItem(value: m, child: Text(_formatMonth(m), style: const TextStyle(fontSize: 13))),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _secondMonth = val);
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Same month prevention alert (AI-07)
          if (_isSameMonth) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'يرجى اختيار شهرين مختلفين لإجراء المقارنة.',
                      style: TextStyle(fontSize: 13, color: Colors.red.shade900),
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            const SizedBox(height: 20),
            Consumer(
              builder: (context, ref, _) {
                final compareAsync = ref.watch(monthComparisonFamily((_firstMonth, _secondMonth)));
                return compareAsync.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: CircularProgressIndicator(),
                    ),
                  ),
                  error: (err, _) => Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Text('تعذر إجراء المقارنة: $err'),
                    ),
                  ),
                  data: (comparison) => _buildComparisonResults(comparison),
                );
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildComparisonResults(MonthComparison comparison) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.compare_arrows_rounded, color: Colors.teal.shade700, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    'نتائج المقارنة (${_formatMonth(comparison.secondMonth)} مقابل ${_formatMonth(comparison.firstMonth)})',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                comparison.responseText,
                style: const TextStyle(fontSize: 14.5, height: 1.5),
              ),
            ],
          ),
        ),

        if (comparison.changes.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text(
            'أكبر التغيرات بالفئات:',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: comparison.changes.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final change = comparison.changes[index];
                final cat = (change['category'] as String?) ?? 'فئة';
                final diff = (change['diff'] as num?)?.toDouble() ?? 0.0;
                final isIncrease = diff > 0;

                return ListTile(
                  dense: true,
                  leading: Icon(
                    isIncrease ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
                    color: isIncrease ? Colors.red : Colors.green,
                    size: 20,
                  ),
                  title: Text(cat, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: AmountText(diff.abs()),
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}
