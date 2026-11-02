import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../features/account/money_preferences_screen.dart';
import '../features/account/onboarding_questions_screen.dart';
import '../features/account/profile_screen.dart';
import '../features/account/sessions_screen.dart';
import '../features/ai/ai_center_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/auth/session_controller.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/auth/starting_screen.dart';
import '../features/budgets/budgets_screen.dart';
import '../features/business/business_screen.dart';
import '../features/calendar/calendar_screen.dart';
import '../features/capture/capture_review_screen.dart';
import '../features/capture/capture_settings_screen.dart';
import '../features/contacts/contacts_screen.dart';
import '../features/export/export_screen.dart';
import '../features/goals/goals_screen.dart';
import '../features/infrastructure/app_update_screen.dart';
import '../features/infrastructure/data_stored_screen.dart';
import '../features/infrastructure/terms_screen.dart';
import '../features/installments/installments_screen.dart';
import '../features/ledger/record_screen.dart';
import '../features/ledger/transaction_detail_screen.dart';
import '../features/ledger/transaction_search_screen.dart';
import '../features/ledger/transactions_screen.dart';
import '../features/lock/security_screen.dart';
import '../features/more/more_screen.dart';
import '../features/more/settings_screen.dart';
import '../features/notifications/notification_inbox_screen.dart';
import '../features/notifications/notification_settings_screen.dart';
import '../features/plans/cancel_plan_screen.dart';
import '../features/plans/invite_friends_screen.dart';
import '../features/plans/plan_screen.dart';
import '../features/seasons/seasons_screen.dart';
import '../features/stats/category_transactions_screen.dart';
import '../features/stats/stats_screen.dart';
import '../features/support/help_center_screen.dart';
import '../features/wallets/wallet_detail_screen.dart';
import '../features/wallets/wallets_screen.dart';
import '../l10n/app_localizations.dart';
import 'app_shell.dart';

/// A tab of the bottom bar: the same five, in the same order, as the web app's `MobileBottomNav`.
final class AppTab {
  const AppTab({
    required this.path,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.screen,
    this.routes = const [],
  });

  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String Function(AppLocalizations l10n) label;
  final WidgetBuilder screen;

  /// Screens reached from the tab, which keep the tab selected and return to it on back.
  final List<RouteBase> routes;
}

final appTabs = <AppTab>[
  AppTab(
    path: '/record',
    icon: Icons.add_circle_outline,
    selectedIcon: Icons.add_circle,
    label: (l10n) => l10n.navRecord,
    screen: (context) => const RecordScreen(),
    routes: [
      GoRoute(
        path: TransactionsScreen.path.substring(RecordScreen.path.length + 1),
        builder: (context, state) => const TransactionsScreen(),
      ),
    ],
  ),
  AppTab(
    path: '/stats',
    icon: Icons.bar_chart_outlined,
    selectedIcon: Icons.bar_chart,
    label: (l10n) => l10n.navStats,
    screen: (context) => const StatsScreen(),
    routes: [
      GoRoute(
        path: CategoryTransactionsScreen.subPath,
        builder: (context, state) => CategoryTransactionsScreen(
          category: state.uri.queryParameters['name'] ?? '',
          month: state.uri.queryParameters['month'],
        ),
      ),
    ],
  ),
  AppTab(
    path: '/ai',
    icon: Icons.auto_awesome_outlined,
    selectedIcon: Icons.auto_awesome,
    label: (l10n) => l10n.navAi,
    screen: (context) => const AiCenterScreen(),
  ),
  AppTab(
    path: '/calendar',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month,
    label: (l10n) => l10n.navCalendar,
    screen: (context) => const CalendarScreen(),
  ),
  AppTab(
    path: '/more',
    icon: Icons.menu,
    selectedIcon: Icons.menu_open,
    label: (l10n) => l10n.navMore,
    screen: (context) => const MoreScreen(),
    routes: [
      GoRoute(
        path: SettingsScreen.path.substring('/more/'.length),
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: ProfileScreen.path.substring('/more/'.length),
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: MoneyPreferencesScreen.path.substring('/more/'.length),
        builder: (context, state) => const MoneyPreferencesScreen(),
      ),
      GoRoute(
        path: SessionsScreen.path.substring('/more/'.length),
        builder: (context, state) => const SessionsScreen(),
      ),
      GoRoute(
        path: OnboardingQuestionsScreen.path.substring('/more/'.length),
        builder: (context, state) => const OnboardingQuestionsScreen(),
      ),
      GoRoute(
        path: HelpCenterScreen.path.substring('/more/'.length),
        builder: (context, state) => const HelpCenterScreen(),
      ),
      GoRoute(
        path: PlanScreen.path.substring('/more/'.length),
        builder: (context, state) => const PlanScreen(),
      ),
      GoRoute(
        path: CancelPlanScreen.path.substring('/more/'.length),
        builder: (context, state) => const CancelPlanScreen(),
      ),
      GoRoute(
        path: InviteFriendsScreen.path.substring('/more/'.length),
        builder: (context, state) => const InviteFriendsScreen(),
      ),
      GoRoute(
        path: TermsScreen.path.substring('/more/'.length),
        builder: (context, state) => const TermsScreen(),
      ),
      GoRoute(
        path: DataStoredScreen.path.substring('/more/'.length),
        builder: (context, state) => const DataStoredScreen(),
      ),
      GoRoute(
        path: CaptureReviewScreen.path.substring('/more/'.length),
        builder: (context, state) => const CaptureReviewScreen(),
      ),
      GoRoute(
        path: CaptureSettingsScreen.path.substring('/more/'.length),
        builder: (context, state) => const CaptureSettingsScreen(),
      ),
      GoRoute(
        path: WalletsScreen.path.substring('/more/'.length),
        builder: (context, state) => const WalletsScreen(),
        routes: [
          GoRoute(
            path: WalletDetailScreen.path,
            builder: (context, state) => WalletDetailScreen(
              walletId: int.tryParse(state.pathParameters['walletId']!) ?? 0,
            ),
          ),
        ],
      ),
      GoRoute(
        path: ContactsScreen.path.substring('/more/'.length),
        builder: (context, state) => const ContactsScreen(),
      ),
      GoRoute(
        path: BudgetsScreen.path.substring('/more/'.length),
        builder: (context, state) => const BudgetsScreen(),
      ),
      GoRoute(
        path: GoalsScreen.path.substring('/more/'.length),
        builder: (context, state) => const GoalsScreen(),
      ),
      GoRoute(
        path: InstallmentsScreen.path.substring('/more/'.length),
        builder: (context, state) => const InstallmentsScreen(),
      ),
      GoRoute(
        path: SeasonsScreen.path.substring('/more/'.length),
        builder: (context, state) => const SeasonsScreen(),
      ),
      GoRoute(
        path: ExportScreen.path.substring('/more/'.length),
        builder: (context, state) => const ExportScreen(),
      ),
      GoRoute(
        path: BusinessScreen.path.substring('/more/'.length),
        builder: (context, state) => const BusinessScreen(),
      ),
      GoRoute(
        path: SecurityScreen.path.substring('/more/'.length),
        builder: (context, state) => const SecurityScreen(),
        routes: [
          GoRoute(
            path: PinSetupScreen.path.substring(SecurityScreen.path.length + 1),
            builder: (context, state) => const PinSetupScreen(),
          ),
        ],
      ),
    ],
  ),
];

/// Where the session sends a [location], or null to let it open.
///
/// Signed out, only the sign-in screens open; signed in, they lead to the first tab; while the stored token is
/// being read, the starting screen shows. Every tab sits behind this guard.
String? sessionRedirect(SessionState session, String location) {
  final onSignIn =
      location == SignInScreen.path ||
      location.startsWith('${SignInScreen.path}/');
  return switch (session) {
    SessionRestoring() =>
      location == StartingScreen.path ? null : StartingScreen.path,
    SignedOut() => onSignIn ? null : SignInScreen.path,
    SignedIn() =>
      onSignIn || location == StartingScreen.path ? appTabs.first.path : null,
  };
}

/// The app's routes: the sign-in screens, one branch per tab (each keeping its own back stack while the user moves
/// between tabs), and shared detail routes reachable from any tab. The router follows the session: signing in, out,
/// or a session the server ended moves the user at once.
final routerProvider = Provider<GoRouter>((ref) {
  final session = ValueNotifier<SessionState>(ref.read(sessionProvider));
  ref.listen(sessionProvider, (_, next) => session.value = next);
  final router = GoRouter(
    initialLocation: appTabs.first.path,
    refreshListenable: session,
    redirect: (context, state) =>
        sessionRedirect(session.value, state.uri.path),
    errorBuilder: (context, state) => const NotFoundScreen(),
    routes: [
      GoRoute(
        path: StartingScreen.path,
        builder: (context, state) => const StartingScreen(),
      ),
      GoRoute(
        path: SignInScreen.path,
        builder: (context, state) => const SignInScreen(),
        routes: [
          GoRoute(
            path: RegisterScreen.path.substring(SignInScreen.path.length + 1),
            builder: (context, state) => const RegisterScreen(),
          ),
        ],
      ),
      GoRoute(
        path: TransactionSearchScreen.path,
        builder: (context, state) => const TransactionSearchScreen(),
      ),
      GoRoute(
        path: TransactionDetailScreen.path,
        builder: (context, state) {
          final id = int.tryParse(state.pathParameters['entryId'] ?? '') ?? 0;
          final launch = state.extra is TransactionDetailLaunch
              ? state.extra! as TransactionDetailLaunch
              : null;
          return TransactionDetailScreen(
            entryId: id,
            initialEntry: launch?.entry,
            heroTag: launch?.heroTag,
          );
        },
      ),
      GoRoute(
        path: NotificationInboxScreen.path,
        builder: (context, state) => const NotificationInboxScreen(),
      ),
      GoRoute(
        path: NotificationSettingsScreen.path,
        builder: (context, state) => const NotificationSettingsScreen(),
      ),
      GoRoute(
        path: AppUpdateScreen.path,
        builder: (context, state) => const AppUpdateScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          for (final tab in appTabs)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: tab.path,
                  builder: (context, state) => tab.screen(context),
                  routes: tab.routes,
                ),
              ],
            ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    session.dispose();
  });
  return router;
});

/// A dedicated 404 screen shown when an invalid or unknown route is accessed.
class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  static const path = '/404';

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).appPageNotFound)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.search_off_rounded,
                size: 64,
                color: colors.mutedForeground,
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              Text(
                AppLocalizations.of(context).appThisPageIsnTHere,
                style: textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.foreground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                AppLocalizations.of(context).appTheLinkMayHaveChanged,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              SmartSpendButton(
                label: AppLocalizations.of(context).appBackToHome,
                onPressed: () => context.go(appTabs.first.path),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
