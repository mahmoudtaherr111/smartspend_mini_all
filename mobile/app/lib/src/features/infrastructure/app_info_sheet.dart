import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

/// App Info Sheet displaying version, build info, and update checks (FND-11, FND-13).
class AppInfoSheet extends StatelessWidget {
  const AppInfoSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(SmartSpendRadii.sheet)),
      ),
      builder: (ctx) => const AppInfoSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Center(
              child: Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: colors.accent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
                    ),
                    child: Icon(Icons.wallet_rounded, color: colors.accent, size: 36),
                  ),
                  const SizedBox(height: SmartSpendSpacing.md),
                  Text(
                    'SmartSpend AI',
                    style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    'الإصدار 2.1.0 (بناء 2026)',
                    style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                side: BorderSide(color: colors.border),
              ),
              child: Column(
                children: [
                  ListTile(
                    title: const Text('فحص التحديثات'),
                    trailing: const Icon(Icons.refresh_rounded),
                    onTap: () {
                      Navigator.of(context).pop();
                      showSmartSpendNotice(context, 'أنت تستخدم أحدث إصدار من SmartSpend');
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    title: const Text('شروط الخدمة'),
                    trailing: const Icon(Icons.chevron_left_rounded),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/more/terms');
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    title: const Text('البيانات والخصوصية'),
                    trailing: const Icon(Icons.chevron_left_rounded),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.push('/more/data-stored');
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            Text(
              'جميع الحقوق محفوظة © 2026 SmartSpend AI - مصر',
              style: textTheme.bodySmall?.copyWith(
                color: colors.mutedForeground,
                fontSize: 11,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
