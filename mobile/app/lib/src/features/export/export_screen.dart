import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'export_api.dart';
import 'export_models.dart';

/// Screen allowing the user to export transactions and exercise their Law 151 data access right (REC-15).
class ExportScreen extends ConsumerStatefulWidget {
  const ExportScreen({super.key});

  static const path = '/more/export';

  @override
  ConsumerState<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends ConsumerState<ExportScreen> {
  ExportPeriod _period = ExportPeriod.thisMonth;
  ExportFormat _format = ExportFormat.xlsx;

  bool _loading = false;
  String? _error;
  File? _exportedFile;

  Future<void> _runExport() async {
    setState(() {
      _loading = true;
      _error = null;
      _exportedFile = null;
    });

    final now = DateTime.now();
    DateTime? startDate;
    DateTime? endDate = now;

    switch (_period) {
      case ExportPeriod.thisMonth:
        startDate = DateTime(now.year, now.month, 1);
        break;
      case ExportPeriod.lastThreeMonths:
        startDate = DateTime(now.year, now.month - 2, 1);
        break;
      case ExportPeriod.allTime:
        startDate = null;
        endDate = null;
        break;
    }

    try {
      final api = ref.read(exportApiProvider);
      final file = await api.exportExpenses(
        format: _format,
        startDate: startDate,
        endDate: endDate,
      );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _exportedFile = file;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'مقدرناش نجهز الملف دلوقتي، اتأكد من النت وجرّب تاني: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Scaffold(
      appBar: AppBar(title: const Text('تصدير البيانات')),
      body: ListView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        children: [
          Container(
            padding: const EdgeInsets.all(SmartSpendSpacing.md),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colors.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                  ),
                  child: Icon(
                    Icons.file_download_outlined,
                    color: colors.accent,
                    size: 24,
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'بياناتك ملكك دائماً',
                        style: SmartSpendTypography.style(
                          16,
                          FontWeight.w700,
                        ).copyWith(color: colors.foreground),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'حمّل كل معاملاتك المسجلة في ملف منظم تقدر تفتحه على الكمبيوتر أو الموبايل.',
                        style: SmartSpendTypography.style(
                          13,
                          FontWeight.w400,
                        ).copyWith(color: colors.mutedForeground),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          Text(
            'الفترة الزمنية',
            style: SmartSpendTypography.style(
              15,
              FontWeight.w700,
            ).copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          RadioGroup<ExportPeriod>(
            groupValue: _period,
            onChanged: (v) {
              if (_loading || v == null) return;
              setState(() => _period = v);
            },
            child: Column(
              children: [
                for (final p in ExportPeriod.values) ...[
                  Padding(
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.xs,
                    ),
                    child: Material(
                      color: _period == p
                          ? colors.accent.withValues(alpha: 0.08)
                          : colors.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                        side: BorderSide(
                          color: _period == p ? colors.accent : colors.border,
                        ),
                      ),
                      child: RadioListTile<ExportPeriod>(
                        value: p,
                        title: Text(
                          p.label,
                          style: SmartSpendTypography.style(
                            14,
                            _period == p ? FontWeight.w700 : FontWeight.w500,
                          ).copyWith(color: colors.foreground),
                        ),
                        activeColor: colors.accent,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          Text(
            'صيغة الملف',
            style: SmartSpendTypography.style(
              15,
              FontWeight.w700,
            ).copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          RadioGroup<ExportFormat>(
            groupValue: _format,
            onChanged: (v) {
              if (_loading || v == null) return;
              setState(() => _format = v);
            },
            child: Column(
              children: [
                for (final f in ExportFormat.values) ...[
                  Padding(
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.xs,
                    ),
                    child: Material(
                      color: _format == f
                          ? colors.accent.withValues(alpha: 0.08)
                          : colors.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                        side: BorderSide(
                          color: _format == f ? colors.accent : colors.border,
                        ),
                      ),
                      child: RadioListTile<ExportFormat>(
                        value: f,
                        title: Text(
                          f.label,
                          style: SmartSpendTypography.style(
                            14,
                            _format == f ? FontWeight.w700 : FontWeight.w500,
                          ).copyWith(color: colors.foreground),
                        ),
                        activeColor: colors.accent,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          // Law 151 note
          Container(
            padding: const EdgeInsets.all(SmartSpendSpacing.md),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.shield_outlined,
                  size: 20,
                  color: colors.mutedForeground,
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                Expanded(
                  child: Text(
                    'حق الوصول للبيانات بموجب قانون حماية البيانات الشخصية رقم 151 لسنة 2020: يمكنك الحصول على نسخة من بياناتك في أي وقت.',
                    style: SmartSpendTypography.style(
                      12,
                      FontWeight.w400,
                    ).copyWith(color: colors.mutedForeground),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.sm),
              decoration: BoxDecoration(
                color: colors.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.danger.withValues(alpha: 0.3)),
              ),
              child: Text(
                _error!,
                style: SmartSpendTypography.style(
                  13,
                  FontWeight.w500,
                ).copyWith(color: colors.danger),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
          ],
          if (_exportedFile != null) ...[
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.accent.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    color: colors.accent,
                    size: 24,
                  ),
                  const SizedBox(width: SmartSpendSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'تم تصدير وحفظ الملف بنجاح 🎉',
                          style: SmartSpendTypography.style(
                            14,
                            FontWeight.w700,
                          ).copyWith(color: colors.accent),
                        ),
                        Text(
                          _exportedFile!.path
                              .split(Platform.pathSeparator)
                              .last,
                          style: SmartSpendTypography.style(
                            12,
                            FontWeight.w500,
                          ).copyWith(color: colors.foreground),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
          ],
          SmartSpendButton(
            label: _loading ? 'بنجهز الملف...' : 'تصدير وتحميل الملف',
            busy: _loading,
            onPressed: _loading ? null : _runExport,
          ),
          const SizedBox(height: SmartSpendSpacing.xxl),
        ],
      ),
    );
  }
}
