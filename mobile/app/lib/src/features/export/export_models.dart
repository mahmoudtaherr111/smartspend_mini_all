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

enum ExportPeriod { thisMonth, lastThreeMonths, allTime }

enum ExportFormat {
  csv('csv'),
  xlsx('xlsx'),
  json('json');

  const ExportFormat(this.extension);
  final String extension;
}
