import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../plans/plan_providers.dart';
import 'ai_models.dart';
import 'ai_providers.dart';

/// Monthly insights report view with instant cache loading, verified facts, and export (AI-06, AI-08).
class AiReportView extends ConsumerStatefulWidget {
  const AiReportView({super.key});

  @override
  ConsumerState<AiReportView> createState() => _AiReportViewState();
}

class _AiReportViewState extends ConsumerState<AiReportView> {
  String get _selectedMonth => ref.watch(selectedReportMonthProvider);
  bool _isRefreshing = false;

  Future<void> _handleRefresh() async {
    setState(() => _isRefreshing = true);
    try {
      await ref
          .read(aiApiProvider)
          .generateMonthlyInsights(month: _selectedMonth, forceRefresh: true);
      ref.invalidate(monthlyReportFamily(_selectedMonth));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).aiWeCouldnTUpdateThe),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  Future<void> _handleExport() async {
    final isPro = ref.read(isProUserProvider);
    if (!isPro) {
      await showUpgradePromptSheet(
        context: context,
        reason: UpgradeLimitReason.export,
      );
      return;
    }

    try {
      final html = await ref
          .read(aiApiProvider)
          .exportMonthlyReportHtml(_selectedMonth);
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Row(
              children: [
                Icon(Icons.description_outlined, color: Color(0xFF0F766E)),
                SizedBox(width: 8),
                Text(AppLocalizations.of(context).aiExportTheReport),
              ],
            ),
            content: Text(
              html.isNotEmpty
                  ? AppLocalizations.of(context)
                        .aiTheReportForP0Is(_selectedMonth)
                  : AppLocalizations.of(context).aiReportReceived2,
            ),
            actions: [
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                ),
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(AppLocalizations.of(context).aiOk),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).aiWeCouldnTExportThe),
          ),
        );
      }
    }
  }

  void _changeMonth(int delta) {
    try {
      final current = DateFormat('yyyy-MM').parse(_selectedMonth);
      final updated = DateTime(current.year, current.month + delta, 1);
      final newMonth = DateFormat('yyyy-MM').format(updated);
      ref.read(selectedReportMonthProvider.notifier).select(newMonth);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(monthlyReportFamily(_selectedMonth));

    return Column(
      children: [
        // Month Switcher Header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).cardColor,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_right_rounded),
                tooltip: AppLocalizations.of(context).aiPreviousMonth,
                onPressed: () => _changeMonth(-1),
              ),
              Row(
                children: [
                  const Icon(Icons.calendar_month_outlined, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    _formatMonthLabel(_selectedMonth),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.chevron_left_rounded),
                tooltip: AppLocalizations.of(context).aiNextMonth,
                onPressed: () => _changeMonth(1),
              ),
            ],
          ),
        ),
        const Divider(height: 1),

        // Action Toolbar (Refresh / Export)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              OutlinedButton.icon(
                onPressed: _isRefreshing ? null : _handleRefresh,
                icon: _isRefreshing
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded, size: 18),
                label: Text(AppLocalizations.of(context).aiAnalyzeAgain),
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: _handleExport,
                icon: const Icon(Icons.share_outlined, size: 18),
                label: Text(AppLocalizations.of(context).aiExportTheReport),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF0F766E),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
        ),

        Expanded(
          child: reportAsync.when(
            loading: () => Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text(
                    AppLocalizations.of(context).aiPreparingThisMonthSReport,
                  ),
                ],
              ),
            ),
            error: (err, _) => Center(
              child: Text(AppLocalizations.of(context).aiWeCanTLoadThe2),
            ),
            data: (report) => _buildReportContent(report),
          ),
        ),
      ],
    );
  }

  Widget _buildReportContent(MonthlyInsights report) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Low data warning banner (AI-06)
          if (report.hasLowData)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.shade300),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline_rounded,
                    color: Colors.amber.shade900,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      AppLocalizations.of(context).aiLimitedDataRecordMoreThis,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Colors.amber.shade900,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Alerts cards (if any)
          if (report.alerts.isNotEmpty) ...[
            for (final alert in report.alerts)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: alert.contains('🚨') || alert.contains('⚠️')
                      ? const Color(0xFFFFF7ED)
                      : const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: alert.contains('🚨') || alert.contains('⚠️')
                        ? const Color(0xFFFDBA74)
                        : const Color(0xFF86EFAC),
                  ),
                ),
                child: Text(
                  alert,
                  style: const TextStyle(fontSize: 13, height: 1.4),
                ),
              ),
            const SizedBox(height: 8),
          ],

          // Main narrative text card
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
                    Icon(
                      Icons.auto_awesome,
                      size: 20,
                      color: Colors.teal.shade700,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      AppLocalizations.of(context).aiThisMonthSAnalysis,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  report.responseText,
                  style: const TextStyle(
                    fontSize: 14.5,
                    height: 1.6,
                    color: Colors.black87,
                  ),
                ),
              ],
            ),
          ),

          // Data table (if returned)
          if (report.dataTable.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              AppLocalizations.of(context).aiTopConfirmedSpending,
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
                itemCount: report.dataTable.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final row = report.dataTable[index];
                  final cat =
                      (row['category'] as String?) ??
                      AppLocalizations.of(context).aiGeneral;
                  final amt = (row['amount'] as num?)?.toDouble() ?? 0.0;
                  final pct = row['percent'] != null
                      ? '${row['percent']}%'
                      : '';

                  return ListTile(
                    dense: true,
                    title: Text(
                      cat,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AmountText(amt),
                        if (pct.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Text(
                            pct,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  String _formatMonthLabel(String yyyyMm) {
    try {
      final date = DateFormat('yyyy-MM').parse(yyyyMm);
      return DateFormat('MMMM yyyy', 'ar').format(date);
    } catch (_) {
      return yyyyMm;
    }
  }
}
