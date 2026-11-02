import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../account/delete_account_sheet.dart';
import '../account/money_preferences_screen.dart';
import '../account/onboarding_questions_screen.dart';
import '../account/profile_screen.dart';
import '../account/sessions_screen.dart';
import '../budgets/budgets_screen.dart';
import '../business/business_screen.dart';
import '../contacts/contacts_screen.dart';
import '../export/export_screen.dart';
import '../goals/goals_screen.dart';
import '../infrastructure/app_info_sheet.dart';
import '../infrastructure/appearance_sheet.dart';
import '../infrastructure/data_stored_screen.dart';
import '../infrastructure/terms_screen.dart';
import '../installments/installments_screen.dart';
import '../limits/limits_card.dart';
import '../lock/security_screen.dart';
import '../notifications/notification_inbox_screen.dart';
import '../notifications/notification_providers.dart';
import '../notifications/notification_settings_screen.dart';
import '../plans/invite_friends_screen.dart';
import '../plans/plan_screen.dart';
import '../seasons/seasons_screen.dart';
import '../support/help_center_screen.dart';
import '../wallets/wallets_screen.dart';
import 'account_card.dart';
import 'bank_capture_card.dart';
import 'language_card.dart';

/// The More tab (MORE-01): 6 grouped sections gathering account, money tools, plan,
/// app settings, security, and help in clean two-tap architecture.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  static const path = '/more';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final unreadCount = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navMore),
        actions: [
          IconButton(
            tooltip: l10n.notificationsTitle,
            icon: Badge(
              isLabelVisible: unreadCount > 0,
              label: Text('$unreadCount'),
              child: const Icon(Icons.notifications_outlined),
            ),
            onPressed: () => context.push(NotificationInboxScreen.path),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AccountCard(),
            const SizedBox(height: SmartSpendSpacing.md),

            // 1. Money Tools (GroupedSection: moreMoneySection)
            GroupedSection(
              title: l10n.moreMoneySection,
              children: [
                GroupedRow(
                  icon: Icons.account_balance_wallet_rounded,
                  title: l10n.walletsTitle,
                  subtitle: l10n.walletsEntry,
                  onTap: () => context.go(WalletsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.storefront_outlined,
                  title: 'حساب الشغل / البيزنس',
                  subtitle: 'فصل مصاريف الشغل عن المصاريف الشخصية',
                  onTap: () => context.go(BusinessScreen.path),
                ),
                GroupedRow(
                  icon: Icons.people_outline_rounded,
                  title: 'الناس والديون',
                  subtitle: 'مين ليك عنده ومين عليك ليه',
                  onTap: () => context.go(ContactsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.savings_outlined,
                  title: 'الميزانيات الشهرية',
                  subtitle: 'حدد سقف لمصاريفك وتابع اللي باقي لك أول بأول',
                  onTap: () => context.go(BudgetsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.flag_outlined,
                  title: 'أهداف التوفير',
                  subtitle: 'خطط لمستقبلك وتابع وصولك لأهدافك بالذكاء الاصطناعي',
                  onTap: () => context.go(GoalsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.calendar_month_outlined,
                  title: 'الأقساط',
                  subtitle: 'متابعة الأقساط الشهرية والباقي منها',
                  onTap: () => context.go(InstallmentsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.wb_sunny_outlined,
                  title: 'مواسم المصاريف',
                  subtitle: 'رمضان، الأعياد، المدارس ومصاريف الصيف',
                  onTap: () => context.go(SeasonsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.file_download_outlined,
                  title: 'تصدير البيانات',
                  subtitle: 'نزّل نسخة من كل معاملاتك المالية',
                  onTap: () => context.go(ExportScreen.path),
                ),
              ],
            ),

            // 2. Account & Profile
            GroupedSection(
              title: 'إعدادات الحساب',
              children: [
                GroupedRow(
                  icon: Icons.person_outline_rounded,
                  title: 'الملف الشخصي',
                  subtitle: 'تعديل الاسم والصورة ورقم التليفون',
                  onTap: () => context.go(ProfileScreen.path),
                ),
                GroupedRow(
                  icon: Icons.tune_rounded,
                  title: 'تفضيلات الفلوس',
                  subtitle: 'بداية الشهر المالي والعملة والكسور',
                  onTap: () => context.go(MoneyPreferencesScreen.path),
                ),
                GroupedRow(
                  icon: Icons.devices_rounded,
                  title: 'الأجهزة والجلسات النشطة',
                  subtitle: 'إدارة الأجهزة المسجل منها الدخول',
                  onTap: () => context.go(SessionsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.psychology_outlined,
                  title: 'أسئلة التخصيص الذكية',
                  subtitle: 'إجابة الأسئلة لمساعدة الذكاء الاصطناعي',
                  onTap: () => context.go(OnboardingQuestionsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.person_remove_outlined,
                  title: 'حذف الحساب نهائياً',
                  subtitle: 'حذف كافة البيانات المالية وفقاً للقانون 151',
                  onTap: () => DeleteAccountSheet.show(context),
                ),
              ],
            ),

            // 3. Plans & Rewards
            GroupedSection(
              title: 'الاشتراكات والمكافآت',
              children: [
                GroupedRow(
                  icon: Icons.star_outline_rounded,
                  title: 'الخطة والترقية',
                  subtitle: 'مقارنة مميزات باقة Pro وإدارة اشتراكك',
                  onTap: () => context.go(PlanScreen.path),
                ),
                GroupedRow(
                  icon: Icons.card_giftcard_rounded,
                  title: 'دعوة الأصدقاء',
                  subtitle: 'شارك كود الدعوة الخاص بك واحصل على اشتراك Pro هدية',
                  onTap: () => context.go(InviteFriendsScreen.path),
                ),
              ],
            ),

            // 4. Security & Privacy (GroupedSection: moreAppSection)
            GroupedSection(
              title: l10n.moreAppSection,
              children: [
                GroupedRow(
                  icon: Icons.shield_outlined,
                  title: l10n.securityTitle,
                  subtitle: l10n.securityEntryBody,
                  onTap: () => context.go(SecurityScreen.path),
                ),
                GroupedRow(
                  icon: Icons.folder_shared_outlined,
                  title: 'ما يخزنه التطبيق عني',
                  subtitle: 'بياناتك المحفوظة وحقوقك وفقاً لقانون حماية البيانات 151',
                  onTap: () => context.go(DataStoredScreen.path),
                ),
                GroupedRow(
                  icon: Icons.description_outlined,
                  title: 'الشروط والأحكام والخصوصية',
                  subtitle: 'بنود الاستخدام وسياسة الخصوصية المعتمدة',
                  onTap: () => context.go(TermsScreen.path),
                ),
                const LanguageRow(),
              ],
            ),

            // 5. Notifications & Preferences
            GroupedSection(
              title: 'الإشعارات وتخصيص المظهر',
              children: [
                GroupedRow(
                  icon: Icons.notifications_outlined,
                  title: 'صندوق الإشعارات',
                  subtitle: 'تنبيهات وتحديثات المعاملات والميزانيات',
                  trailing: unreadCount > 0
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: colors.accent,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$unreadCount',
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        )
                      : null,
                  onTap: () => context.push(NotificationInboxScreen.path),
                ),
                GroupedRow(
                  icon: Icons.notifications_active_outlined,
                  title: 'إعدادات الإشعارات',
                  subtitle: 'التحكم في التنبيهات ورسائل التقارير الشهرية',
                  onTap: () => context.push(NotificationSettingsScreen.path),
                ),
                GroupedRow(
                  icon: Icons.palette_outlined,
                  title: 'المظهر',
                  subtitle: 'فاتح، داكن، أو متوافق مع إعدادات جهازك',
                  onTap: () => AppearanceSheet.show(context),
                ),
              ],
            ),

            // 6. Help & About
            GroupedSection(
              title: 'المساعدة والمعلومات',
              children: [
                GroupedRow(
                  icon: Icons.help_outline_rounded,
                  title: 'مركز المساعدة والدعم',
                  subtitle: 'الأسئلة الشائعة وتذاكر الدعم مع فريق سمارت سبيند',
                  onTap: () => context.go(HelpCenterScreen.path),
                ),
                GroupedRow(
                  icon: Icons.info_outline_rounded,
                  title: 'عن سمارت سبيند',
                  subtitle: 'معلومات الإصدار، الرخص، وفريق العمل',
                  onTap: () => AppInfoSheet.show(context),
                ),
              ],
            ),

            const SizedBox(height: SmartSpendSpacing.md),
            const LimitsCard(),
            const SizedBox(height: SmartSpendSpacing.md),
            const BankCaptureCard(),
          ],
        ),
      ),
    );
  }
}
