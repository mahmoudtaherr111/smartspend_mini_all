import 'package:flutter/foundation.dart';

@immutable
class ExportResult {
  const ExportResult({
    required this.format,
    required this.data,
    required this.filename,
  });

  final String format;
  final dynamic data;
  final String filename;

  factory ExportResult.fromJson(Map<String, Object?> json) => ExportResult(
    format: (json['format'] as String?)?.trim() ?? 'csv',
    data: json['data'],
    filename: (json['filename'] as String?)?.trim() ?? 'expenses.csv',
  );
}

enum ExportPeriod {
  thisMonth('الشهر الحالي'),
  lastThreeMonths('آخر 3 شهور'),
  allTime('كل المعاملات من البداية');

  const ExportPeriod(this.label);
  final String label;
}

enum ExportFormat {
  csv('ملف CSV (جداول بيانات)', 'csv'),
  xlsx('ملف Excel (.xlsx)', 'xlsx'),
  json('ملف بيانات برمجي (.json)', 'json');

  const ExportFormat(this.label, this.extension);
  final String label;
  final String extension;
}
