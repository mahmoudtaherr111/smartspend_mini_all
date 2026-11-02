import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';

final myReferralCodeProvider = FutureProvider.autoDispose<String>((ref) async {
  final client = ref.watch(trpcClientProvider);
  try {
    final data = await client.query(Procedures.referral.myCode);
    if (data is Map<String, Object?> && data['code'] is String) {
      return data['code']! as String;
    }
  } catch (_) {}
  return '';
});

/// Screen displaying referral code and share sheet (PLN-05).
class InviteFriendsScreen extends ConsumerWidget {
  const InviteFriendsScreen({super.key});

  static const path = '/more/invite';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final codeAsync = ref.watch(myReferralCodeProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.inviteTitle)),
      body: codeAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text(l10n.captureStatusFailed)),
        data: (code) {
          final shareText = l10n.inviteShareText(code.isNotEmpty ? code : '...');

          return SingleChildScrollView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: colors.accent.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.card_giftcard_rounded, color: colors.accent, size: 36),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                Text(
                  'شارك SmartSpend مع أصدقائك',
                  style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                Text(
                  'ادعُ أصحابك وعائلتك لتنظيم مصاريفهم بذكاء، وكل صديق يسجل بكودك ستحصل على ميزات وتحديثات حصرية.',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                    height: 1.5,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: SmartSpendSpacing.xl),
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(color: colors.accent, width: 1.5),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(SmartSpendSpacing.lg),
                    child: Column(
                      children: [
                        Text(
                          l10n.inviteYourCode,
                          style: textTheme.labelMedium?.copyWith(color: colors.mutedForeground),
                        ),
                        const SizedBox(height: SmartSpendSpacing.sm),
                        Text(
                          code.isNotEmpty ? code : 'جاري التحميل...',
                          style: textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            letterSpacing: 4,
                            color: colors.accent,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: SmartSpendButton(
                        label: l10n.inviteCopy,
                        variant: ButtonVariant.secondary,
                        icon: Icons.copy_rounded,
                        onPressed: code.isEmpty
                            ? null
                            : () {
                                Clipboard.setData(ClipboardData(text: code));
                                showSmartSpendNotice(context, l10n.inviteCopied);
                              },
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.md),
                    Expanded(
                      child: SmartSpendButton(
                        label: l10n.inviteShare,
                        icon: Icons.share_rounded,
                        onPressed: code.isEmpty
                            ? null
                            : () {
                                Clipboard.setData(ClipboardData(text: shareText));
                                showSmartSpendNotice(context, 'تم نسخ رسالة الدعوة للمشاركة!');
                              },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
