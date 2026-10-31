import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'limits_api.dart';

/// Card showing remaining AI messages, voice seconds and offline limits (REC-16).
class LimitsCard extends ConsumerWidget {
  const LimitsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.smartSpendColors;
    final limitsAsync = ref.watch(userLimitsProvider);

    return limitsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (limits) {
        final anyLow = limits.ai.isLow || limits.voice.isLow;
        final anyExhausted = limits.ai.isExhausted || limits.voice.isExhausted;

        return Container(
          margin: const EdgeInsets.only(top: SmartSpendSpacing.md),
          padding: const EdgeInsets.all(SmartSpendSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
            border: Border.all(
              color: anyExhausted
                  ? colors.danger
                  : anyLow
                      ? colors.warning
                      : colors.border,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Icon(
                          Icons.speed_rounded,
                          size: 20,
                          color: anyLow ? colors.warning : colors.accent,
                        ),
                        const SizedBox(width: SmartSpendSpacing.sm),
                        Flexible(
                          child: Text(
                            'استهلاك باقتك الشهرية',
                            style: SmartSpendTypography.style(14, FontWeight.w700).copyWith(color: colors.foreground),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (anyLow || anyExhausted) ...[
                    const SizedBox(width: SmartSpendSpacing.xs),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: (anyExhausted ? colors.danger : colors.warning).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
                      ),
                      child: Text(
                        anyExhausted ? 'وصلت للحد' : 'قربت تخلّص',
                        style: SmartSpendTypography.style(11, FontWeight.w700).copyWith(
                          color: anyExhausted ? colors.danger : colors.warning,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              // Voice Quota
              _QuotaRow(
                icon: Icons.mic_none_rounded,
                label: 'التسجيل الصوتي',
                detail: limits.voice.isUnlimited
                    ? 'غير محدود'
                    : 'باقي ${limits.voice.remaining} ثانية من أصل ${limits.voice.limit}',
                fraction: limits.voice.fraction,
                isLow: limits.voice.isLow,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              // AI Messages Quota
              _QuotaRow(
                icon: Icons.auto_awesome_outlined,
                label: 'الذكاء الاصطناعي اليومي',
                detail: limits.ai.isUnlimited
                    ? 'غير محدود'
                    : 'باقي ${limits.ai.remaining} عملية من أصل ${limits.ai.limit}',
                fraction: limits.ai.fraction,
                isLow: limits.ai.isLow,
              ),
              if (anyLow || anyExhausted) ...[
                const SizedBox(height: SmartSpendSpacing.md),
                SmartSpendButton(
                  label: 'ترقية باقتك إلى Pro',
                  variant: ButtonVariant.secondary,
                  onPressed: () => showUpgradePromptSheet(
                    context: context,
                    reason: UpgradeLimitReason.aiTokens,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _QuotaRow extends StatelessWidget {
  const _QuotaRow({
    required this.icon,
    required this.label,
    required this.detail,
    required this.fraction,
    required this.isLow,
  });

  final IconData icon;
  final String label;
  final String detail;
  final double fraction;
  final bool isLow;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Row(
                children: [
                  Icon(icon, size: 16, color: colors.mutedForeground),
                  const SizedBox(width: SmartSpendSpacing.xs),
                  Flexible(
                    child: Text(
                      label,
                      style: SmartSpendTypography.style(13, FontWeight.w600).copyWith(color: colors.foreground),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: SmartSpendSpacing.xs),
            Text(
              detail,
              style: SmartSpendTypography.style(12, FontWeight.w500).copyWith(
                color: isLow ? colors.warning : colors.mutedForeground,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: fraction,
            backgroundColor: colors.surfaceRaised,
            valueColor: AlwaysStoppedAnimation<Color>(
              isLow ? colors.warning : colors.accent,
            ),
            minHeight: 6,
          ),
        ),
      ],
    );
  }
}
