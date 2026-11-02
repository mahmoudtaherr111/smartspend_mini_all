import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// Data Stored & Privacy Disclosure Screen (ACC-12, GAP-45).
class DataStoredScreen extends StatelessWidget {
  const DataStoredScreen({super.key});

  static const path = '/more/data-stored';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.dataStoredTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(SmartSpendSpacing.md),
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                border: Border.all(color: colors.accent.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_rounded, color: colors.accent, size: 32),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Text(
                      'بياناتك مشفرة ومحمية وفقاً لقانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020.',
                      style: textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            Text(
              'ماذا يخزن تطبيق SmartSpend AI؟',
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            _Item(
              icon: Icons.receipt_long_outlined,
              title: 'سجل المعاملات والمصاريف',
              body: 'المبالغ، التواريخ، التصنيفات، وملاحظاتك الشخصية. تظل مخزنة طوال فترة نشاط حسابك.',
            ),
            _Item(
              icon: Icons.sms_outlined,
              title: 'إشعارات البنوك والمحافظ',
              body: 'تُقفل أرقام البطاقات تلقائياً وتُحذف الرسائل غير المصنفة نهائياً بعد 30 يوماً.',
            ),
            _Item(
              icon: Icons.psychology_outlined,
              title: 'تخصيص الذكاء الاصطناعي',
              body: 'التفضيلات والأشخاص الذين تسجل لهم (أصدقاء، عائلة). يمكنك مراجعتها وحذفها من مركز AI.',
            ),
            _Item(
              icon: Icons.devices_rounded,
              title: 'الجلسات والأجهزة المسجلة',
              body: 'عنوان IP واسم المتصفح أو نوع الموبايل لتأمين حسابك ضد أي وصول غير مصرح به.',
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            Text(
              'حقوقك في بياناتك:',
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Text(
              '1. حق التصدير: يمكنك تنزيل نسخة كاملة من كل معاملاتك من شاشة "تصدير البيانات".\n'
              '2. حق الحذف: يمكنك حذف حسابك وكافة سجلاتك نهائياً من شاشة "حذف الحساب".\n'
              '3. حق الوصول والمراجعة: يمكنك الاطلاع على كل بياناتك وجلساتك في أي وقت.',
              style: textTheme.bodyMedium?.copyWith(
                height: 1.7,
                color: colors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.md),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SmartSpendRadii.md),
          side: BorderSide(color: colors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: colors.accent, size: 24),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      title,
                      style: textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xs),
                    Text(
                      body,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
