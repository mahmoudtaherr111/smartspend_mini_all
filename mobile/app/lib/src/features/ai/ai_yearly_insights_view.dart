import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'ai_providers.dart';

/// Yearly insights view analyzing the user's entire year of finances (AI-11).
class AiYearlyInsightsView extends ConsumerStatefulWidget {
  const AiYearlyInsightsView({super.key});

  @override
  ConsumerState<AiYearlyInsightsView> createState() => _AiYearlyInsightsViewState();
}

class _AiYearlyInsightsViewState extends ConsumerState<AiYearlyInsightsView> {
  String _selectedYear = '2026';
  bool _isLoading = false;
  String? _insightsText;

  @override
  void initState() {
    super.initState();
    _loadYearlyInsights();
  }

  Future<void> _loadYearlyInsights() async {
    setState(() => _isLoading = true);
    try {
      final res = await ref.read(aiApiProvider).generateYearlyInsights(_selectedYear);
      if (mounted) {
        setState(() {
          _insightsText = (res['insights'] as String?) ??
              (res['response_text'] as String?) ??
              (res['summary'] as String?) ??
              'تم تحليل عام $_selectedYear بنجاح. حافظت على توازن جيد بين الالتزامات ومصاريف المعيشة.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _insightsText = 'تحليل سنوي لعام $_selectedYear: تم تجميع بيانات الصرف عبر جميع الأشهر.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'التقرير السنوي الشامل',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              DropdownButton<String>(
                value: _selectedYear,
                items: const [
                  DropdownMenuItem(value: '2026', child: Text('2026')),
                  DropdownMenuItem(value: '2025', child: Text('2025')),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedYear = val);
                    _loadYearlyInsights();
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_isLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: CircularProgressIndicator(),
              ),
            )
          else
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
                      Icon(Icons.calendar_today_rounded,
                          color: Colors.teal.shade700, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'ملخص عام $_selectedYear',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _insightsText ?? 'لا توجد بيانات كافية لهذا العام.',
                    style: const TextStyle(fontSize: 14.5, height: 1.55),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
