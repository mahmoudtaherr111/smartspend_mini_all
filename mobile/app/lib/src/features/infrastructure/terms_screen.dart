import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// Terms of Service Viewer (ACC-11, GAP-45).
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  static const path = '/more/terms';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.termsTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'شروط وأحكام استخدام SmartSpend AI',
              style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              'آخر تحديث: نوفمبر 2026',
              style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            _Section(
              title: '1. قبول الشروط',
              content:
                  'باستخدامك لتطبيق SmartSpend AI، فإنك توافق على الالتزام بهذه الشروط والأحكام وسياسة الخصوصية المعمول بها في جمهورية مصر العربية وفقاً للقانون رقم 151 لسنة 2020 بشأن حماية البيانات الشخصية.',
            ),
            _Section(
              title: '2. طبيعة الخدمة والذكاء الاصطناعي',
              content:
                  'يوفر التطبيق أدوات لمساعدتك في تتبع مصاريفك الشخصية وإدارة ميزانيتك المالية. تحليلات الذكاء الاصطناعي هي أدوات مساعدة وليست نصائح استثمارية أو مصرفية معتمدة.',
            ),
            _Section(
              title: '3. حماية البيانات البنكية والرسائل',
              content:
                  'التطبيق لا يطلب ولا يخزن كلمات المرور البنكية أو أرقام البطاقات السرية (CVV/PIN). قراءة رسائل المعاملات تتم بناءً على موافقتك الصريحة، ويتم حجب الأرقام والبيانات الحساسة تلقائياً.',
            ),
            _Section(
              title: '4. الاشتراكات والدفع والفوترة',
              content:
                  'تتم عمليات الشراء والاشتراكات في خطة Pro عبر متاجر التطبيقات المعتمدة (Google Play و Apple App Store) وتخضع لسياسات المتاجر الرسمية. يمكنك إلغاء التجديد التلقائي في أي وقت وتظل ميزات باقتك نشطة حتى نهاية الفترة المدفوعة.',
            ),
            _Section(
              title: '5. حذف الحساب والبيانات',
              content:
                  'يحق للمستخدم حذف حسابه وبياناته نهائياً في أي وقت من خلال خيار "حذف الحساب" بالتطبيق، ويتم مسح كافة البيانات الشخصية فوراً باستثناء السجلات المحتفظ بها للامتثال القانوني والضريبي.',
            ),
            _Section(
              title: '6. القانون الحاكم والنزاعات',
              content:
                  'تخضع هذه الشروط وتفسر وفقاً لقوانين جمهورية مصر العربية، وتختص المحاكم المصرية بالفصل في أي نزاع ينشأ عن استخدام الخدمة.',
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.content});

  final String title;
  final String content;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: colors.accent,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            content,
            style: textTheme.bodyMedium?.copyWith(
              height: 1.6,
              color: colors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}
