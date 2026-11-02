import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../infrastructure/remote_config.dart';
import '../ledger/category_style.dart';
import '../plans/plan_providers.dart';
import '../stats/stats_providers.dart';
import 'ai_models.dart';
import 'ai_providers.dart';

/// Monthly insights report view with instant cache loading, verified facts, and export (AI-06, AI-08).
class AiReportView extends ConsumerStatefulWidget {
  const AiReportView({super.key});

  @override
  ConsumerState<AiReportView> createState() => _AiReportViewState();
}

class _AiReportViewState extends ConsumerState<AiReportView> {
  bool _isRefreshing = false;
  bool _isExporting = false;

  Future<void> _handleRefresh(String month) async {
    setState(() => _isRefreshing = true);
    try {
      await ref
          .read(aiApiProvider)
          .generateMonthlyInsights(month: month, forceRefresh: true);
      ref.invalidate(monthlyReportFamily(month));
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiWeCouldnTUpdateThe,
        );
      }
    } finally {
      if (mounted) setState(() => _isRefreshing = false);
    }
  }

  Future<void> _handleExport(String month) async {
    if (!ref.read(isProUserProvider)) {
      await showUpgradePromptSheet(
        context: context,
        reason: UpgradeLimitReason.export,
      );
      return;
    }

    setState(() => _isExporting = true);
    try {
      final html = await ref.read(aiApiProvider).exportMonthlyReportHtml(month);
      if (html.isEmpty) throw StateError('empty report');
      final folder = await getTemporaryDirectory();
      final file = File('${folder.path}/smartspend-report-$month.html');
      await file.writeAsString(html);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: 'text/html')]),
      );
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiWeCouldnTExportThe,
        );
      }
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final current = ref.watch(serverMonthProvider);
    final monthsBack = ref.watch(reportMonthsBackProvider);
    final months = ref.read(reportMonthsBackProvider.notifier);

    return current.when(
      loading: () => const _ReportSkeleton(),
      error: (_, _) => Center(
        child: ErrorState(
          message: l10n.aiWeCanTLoadThe2,
          retryLabel: l10n.retry,
          onRetry: () => ref.invalidate(serverMonthProvider),
        ),
      ),
      data: (currentMonth) {
        final month = monthBefore(currentMonth, monthsBack);
        final report = ref.watch(monthlyReportFamily(month));
        return ListView(
          padding: const EdgeInsets.symmetric(
            horizontal: SmartSpendSpacing.screen,
            vertical: SmartSpendSpacing.md,
          ),
          children: [
            MonthSwitcher(
              label: DateWords.of(context).month(month),
              onPrevious: months.previous,
              onNext: monthsBack == 0 ? null : months.next,
              previousTooltip: l10n.aiPreviousMonth,
              nextTooltip: l10n.aiNextMonth,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            ...report.when(
              skipLoadingOnReload: false,
              loading: () => [const _ReportSkeleton()],
              error: (_, _) => [
                ErrorState(
                  message: l10n.aiWeCanTLoadThe2,
                  retryLabel: l10n.retry,
                  onRetry: () => ref.invalidate(monthlyReportFamily(month)),
                ),
              ],
              data: (data) => _reportContent(data, month),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _reportContent(MonthlyInsights report, String month) {
    final l10n = AppLocalizations.of(context);
    return [
      if (report.hasLowData) ...[
        InlineMessage(
          l10n.aiLimitedDataRecordMoreThis,
          tone: MessageTone.warning,
        ),
        const SizedBox(height: SmartSpendSpacing.md),
      ],
      for (final alert in report.alerts) ...[
        InlineMessage(
          alert,
          tone: alert.contains('🚨') || alert.contains('⚠️')
              ? MessageTone.warning
              : MessageTone.success,
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
      ],
      GroupedCard(
        title: l10n.aiThisMonthSAnalysis,
        child: Text(
          report.responseText,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ),
      if (report.dataTable.isNotEmpty) ...[
        const SizedBox(height: SmartSpendSpacing.md),
        GroupedSection(
          title: l10n.aiTopConfirmedSpending,
          children: [
            for (final row in report.dataTable)
              _categoryRow(
                (row['category'] as String?) ?? l10n.aiGeneral,
                (row['amount'] as num?)?.toDouble() ?? 0,
                row['percent'] == null ? null : '${row['percent']}%',
              ),
          ],
        ),
      ],
      const SizedBox(height: SmartSpendSpacing.lg),
      SmartSpendButton(
        label: l10n.aiExportTheReport,
        icon: Icons.ios_share_rounded,
        busy: _isExporting,
        onPressed: () => _handleExport(month),
      ),
      const SizedBox(height: SmartSpendSpacing.sm),
      SmartSpendButton(
        label: l10n.aiAnalyzeAgain,
        icon: Icons.refresh_rounded,
        variant: ButtonVariant.secondary,
        busy: _isRefreshing,
        onPressed: () => _handleRefresh(month),
      ),
      const SizedBox(height: SmartSpendSpacing.xl),
    ];
  }

  Widget _categoryRow(String category, double amount, String? percent) {
    return GroupedRow(
      icon: categoryIcon(category),
      tint: categoryColor(context, category),
      title: category,
      subtitle: percent,
      value: AmountText(amount),
    );
  }
}

/// The report's shape while it loads.
class _ReportSkeleton extends StatelessWidget {
  const _ReportSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Skeleton(height: 180),
        SizedBox(height: SmartSpendSpacing.md),
        Skeleton(height: 60),
        SizedBox(height: SmartSpendSpacing.sm),
        Skeleton(height: 60),
      ],
    );
  }
}
