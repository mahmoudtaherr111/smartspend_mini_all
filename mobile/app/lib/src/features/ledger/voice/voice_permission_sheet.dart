import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// Shows an explanation sheet before prompting for OS microphone permission (REC-05).
/// Clearly articulates the privacy policy (instant speech-to-text, no audio saved).
Future<bool> showVoicePermissionSheet(BuildContext context) async {
  final result = await showSmartSpendSheet<bool>(
    context: context,
    builder: (context) => const VoicePermissionSheet(),
  );
  return result ?? false;
}

class VoicePermissionSheet extends StatelessWidget {
  const VoicePermissionSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.screen,
        vertical: SmartSpendSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.mic_rounded,
                size: 28,
                color: colors.accent,
              ),
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          Text(
            'تسجيل المصاريف بالصوت',
            textAlign: TextAlign.center,
            style: SmartSpendTypography.style(
              18,
              FontWeight.w700,
            ).copyWith(color: colors.foreground),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            'عشان تسجل مصاريفك بالصوت، محتاجين إذن الميكروفون. صوتك بيتحول لنص في لحظتها عشان يسجل العملية، ومش بنحفظ أي تسجيلات صوتية.',
            textAlign: TextAlign.center,
            style: SmartSpendTypography.style(
              14,
              FontWeight.w400,
            ).copyWith(color: colors.mutedForeground, height: 1.5),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: 'السماح بالميكروفون',
            onPressed: () => Navigator.of(context).pop(true),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: 'مش دلوقتي',
            variant: ButtonVariant.quiet,
            onPressed: () => Navigator.of(context).pop(false),
          ),
        ],
      ),
    );
  }
}
