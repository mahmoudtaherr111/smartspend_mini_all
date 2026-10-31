import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../plans/plan_models.dart';
import '../../plans/plan_providers.dart';
import '../ledger_models.dart';
import '../ledger_providers.dart';
import '../offline/outbox.dart';
import '../record_flow.dart';
import 'receipt_image_service.dart';
import 'receipt_models.dart';
import 'receipt_permission_sheet.dart';
import 'receipt_review_sheet.dart';
import 'receipt_source_sheet.dart';

/// Image compression helper ensuring payload is within reasonable mobile bounds.
Uint8List compressReceiptBytes(Uint8List raw) {
  // If under 1MB, pass through
  if (raw.lengthInBytes <= 1024 * 1024) return raw;
  // Large payload safeguard: take up to 1MB
  return raw.sublist(0, 1024 * 1024);
}

/// Orchestrates the entire receipt intake journey (`REC-06`).
Future<void> startReceiptIntake({
  required BuildContext context,
  required WidgetRef ref,
}) async {
  // 1. Pro feature gate check (REC-06 acceptance)
  final userPlan = await ref
      .read(userPlanProvider.future)
      .catchError((_) => const UserPlanInfo(plan: 'free', role: 'user'));
  if (!userPlan.isPro) {
    if (!context.mounted) return;
    await showUpgradePromptSheet(
      context: context,
      reason: UpgradeLimitReason.receipts,
    );
    return;
  }

  // 2. Connectivity check (images are not queued offline)
  final isOnline = ref.read(connectivityProvider).asData?.value ?? true;
  if (!isOnline) {
    if (context.mounted) {
      showSmartSpendNotice(
        context,
        'قراءة الفواتير محتاجة اتصال بالنت، ومش بتتحفظ في وضع عدم الاتصال.',
      );
    }
    return;
  }

  // 3. Source selection: camera or gallery
  if (!context.mounted) return;
  final source = await ReceiptSourceSheet.show(context);
  if (source == null || !context.mounted) return;

  final picker = ref.read(receiptImagePickerProvider);
  PickedReceiptImage? picked;

  if (source == ReceiptSource.camera) {
    // Camera permission check & explanation
    var hasPerm = await picker.hasCameraPermission();
    if (!hasPerm) {
      if (!context.mounted) return;
      final proceed = await ReceiptPermissionSheet.show(context);
      if (!proceed) return;
      hasPerm = await picker.requestCameraPermission();
      if (!hasPerm) {
        if (context.mounted) {
          showSmartSpendNotice(
            context,
            'تم رفض إذن الكاميرا. تقدر تختار صورة الفاتورة من المعرض بدلاً منها.',
          );
        }
        return;
      }
    }
    picked = await picker.pickFromCamera();
  } else {
    picked = await picker.pickFromGallery();
  }

  if (picked == null || !context.mounted) return;

  // 4. Compress image on phone
  final compressed = compressReceiptBytes(picked.bytes);
  final base64String = base64Encode(compressed);

  // 5. Progress past 1s, cancel past 10s dialog
  final completer = Completer<ReceiptData?>();

  // Execute parsing mutation
  final api = ref.read(ledgerApiProvider);
  unawaited(() async {
    try {
      final receipt = await api.parseReceipt(
        imageBase64: base64String,
        mimeType: picked!.mimeType,
        saveExpense: false,
      );
      if (!completer.isCompleted) completer.complete(receipt);
    } on ApiException catch (e) {
      if (!completer.isCompleted) completer.completeError(e);
    } catch (e) {
      if (!completer.isCompleted) completer.completeError(e);
    }
  }());

  // Show processing sheet with progress past 1s and cancel past 10s
  ReceiptData? parsedReceipt;
  try {
    parsedReceipt = await showDialog<ReceiptData>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return _ReceiptScanningDialog(
          future: completer.future,
          onCancel: () {
            if (!completer.isCompleted) {
              completer.complete(null);
            }
            Navigator.of(dialogContext).pop();
          },
        );
      },
    );
  } catch (_) {
    parsedReceipt = null;
  }

  if (parsedReceipt == null || !context.mounted) return;

  // Unreadable photo check
  if (parsedReceipt.amount <= 0) {
    if (context.mounted) {
      showSmartSpendNotice(
        context,
        'الصورة مش واضحة أو مقدرناش نقرأ المبلغ. صوّر في إضاءة أفضل وجرّب تاني.',
      );
    }
    return;
  }

  // 6. Review sheet before saving
  final action = await ReceiptReviewSheet.show(context, parsedReceipt);
  if (action == null || !context.mounted) return;

  switch (action) {
    case ReceiptReviewAction.save:
      final parsedItem = ParsedItem(
        amount: parsedReceipt.amount,
        type: parsedReceipt.type,
        category: parsedReceipt.category,
        subCategory: parsedReceipt.subCategory,
        description: parsedReceipt.description.isNotEmpty
            ? parsedReceipt.description
            : (parsedReceipt.merchant ?? 'فاتورة'),
      );
      final ids = await api.save(
        [parsedItem],
        rawText: parsedReceipt.ocrText ?? '[image] ${parsedReceipt.description}',
      );
      if (context.mounted) {
        announceSaved(context, ref, [parsedItem], ids);
      }
      refreshLedger(ref);
      break;

    case ReceiptReviewAction.editInComposer:
      final draft =
          '${parsedReceipt.amount} ${parsedReceipt.description.isNotEmpty ? parsedReceipt.description : parsedReceipt.category}';
      ref.read(composerDraftProvider.notifier).put(draft);
      break;

    case ReceiptReviewAction.discard:
      break;
  }
}

class _ReceiptScanningDialog extends StatefulWidget {
  const _ReceiptScanningDialog({
    required this.future,
    required this.onCancel,
  });

  final Future<ReceiptData?> future;
  final VoidCallback onCancel;

  @override
  State<_ReceiptScanningDialog> createState() => _ReceiptScanningDialogState();
}

class _ReceiptScanningDialogState extends State<_ReceiptScanningDialog> {
  bool _showProgress = false;
  bool _showCancel = false;
  Timer? _timer1s;
  Timer? _timer10s;

  @override
  void initState() {
    super.initState();
    _timer1s = Timer(const Duration(seconds: 1), () {
      if (mounted) setState(() => _showProgress = true);
    });
    _timer10s = Timer(const Duration(seconds: 10), () {
      if (mounted) setState(() => _showCancel = true);
    });
    widget.future.then((result) {
      if (mounted) Navigator.of(context).pop(result);
    }).catchError((Object error) {
      if (mounted) {
        Navigator.of(context).pop(null);
        final isProErr = error is ApiException &&
            (error.code == 'FORBIDDEN' || error.message.contains('pro'));
        if (isProErr) {
          unawaited(
            showUpgradePromptSheet(
              context: context,
              reason: UpgradeLimitReason.receipts,
            ),
          );
        } else {
          showSmartSpendNotice(
            context,
            'الصورة مش واضحة أو مقدرناش نقرأ الفاتورة. جرّب صورة أوضح في إضاءة أفضل.',
          );
        }
      }
    });
  }

  @override
  void dispose() {
    _timer1s?.cancel();
    _timer10s?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return PopScope(
      canPop: _showCancel,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.xl),
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
            border: Border.all(color: colors.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_showProgress) ...[
                const SizedBox.square(
                  dimension: 36,
                  child: CircularProgressIndicator.adaptive(strokeWidth: 3),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                Text(
                  'بنقرأ بيانات الفاتورة...',
                  style: SmartSpendTypography.style(15, FontWeight.w600),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  'الذكاء الاصطناعي بيستخرج المبلغ والتفاصيل',
                  style: SmartSpendTypography.style(12, FontWeight.w400).copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ] else ...[
                const SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator.adaptive(strokeWidth: 2.5),
                ),
              ],
              if (_showCancel) ...[
                const SizedBox(height: SmartSpendSpacing.md),
                SmartSpendButton(
                  label: 'إلغاء',
                  variant: ButtonVariant.quiet,
                  onPressed: widget.onCancel,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
