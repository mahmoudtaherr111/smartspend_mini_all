import 'package:flutter/foundation.dart';

/// Data extracted from a scanned receipt (`image.parseReceipt`).
@immutable
final class ReceiptData {
  const ReceiptData({
    required this.amount,
    required this.description,
    required this.category,
    this.subCategory,
    this.type = 'expense',
    this.merchant,
    this.confidence = 1.0,
    this.ocrText,
    this.expenseId,
  });

  final num amount;
  final String description;
  final String category;
  final String? subCategory;
  final String type;
  final String? merchant;
  final num confidence;
  final String? ocrText;
  final int? expenseId;

  factory ReceiptData.fromJson(Map<String, dynamic> json) {
    return ReceiptData(
      amount: json['amount'] as num? ?? 0,
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? 'عام',
      subCategory: json['subCategory'] as String?,
      type: json['type'] as String? ?? 'expense',
      merchant: json['merchant'] as String?,
      confidence: json['confidence'] as num? ?? 1.0,
      ocrText: json['ocrText'] as String?,
      expenseId: json['expenseId'] as int?,
    );
  }
}
