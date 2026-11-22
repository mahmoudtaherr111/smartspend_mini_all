import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import '../account/account_providers.dart';
import 'push_notification_service.dart';

/// Screen for managing push and in-app notification preferences (NOT-03, GAP-35).
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  static const path = '/settings/notifications';

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  bool _masterEnabled = true;
  bool _budgetEnabled = true;
  bool _dailyEnabled = true;
  bool _streakEnabled = true;
  bool _monthlyEnabled = true;
  bool _saving = false;
  bool _initialized = false;

  Future<void> _save({VoidCallback? onRollback}) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _saving = true);
    try {
      final client = ref.read(trpcClientProvider);
      await client.mutate(
        Procedures.profile.updateSmartProfile,
        input: {
          'preferences': {
            'notifications': {
              'master': _masterEnabled,
              'budget': _budgetEnabled,
              'daily': _dailyEnabled,
              'streak': _streakEnabled,
              'monthly': _monthlyEnabled,
            },
          },
        },
      );
      ref.invalidate(userProfileProvider);
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appNotificationSettingsSaved,
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        if (onRollback != null) setState(onRollback);
        showSmartSpendNotice(context, e.message);
      }
    } on Object {
      if (mounted) {
        if (onRollback != null) setState(onRollback);
        showSmartSpendNotice(context, l10n.genericActionFailed);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _onMasterChanged(bool val) async {
    if (val) {
      final granted = await ref
          .read(pushNotificationServiceProvider)
          .requestPermission();
      if (!granted || !mounted) return;
      final prev = _masterEnabled;
      setState(() => _masterEnabled = true);
      await _save(onRollback: () => _masterEnabled = prev);
    } else {
      final prev = _masterEnabled;
      setState(() => _masterEnabled = false);
      await _save(onRollback: () => _masterEnabled = prev);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    final profileAsync = ref.watch(userProfileProvider);

    profileAsync.whenData((profile) {
      if (!_initialized) {
        final notifs =
            profile.rawPreferences['notifications'] is Map<String, Object?>
            ? profile.rawPreferences['notifications']! as Map<String, Object?>
            : const <String, Object?>{};

        _masterEnabled = notifs['master'] as bool? ?? true;
        _budgetEnabled = notifs['budget'] as bool? ?? true;
        _dailyEnabled = notifs['daily'] as bool? ?? true;
        _streakEnabled = notifs['streak'] as bool? ?? true;
        _monthlyEnabled = notifs['monthly'] as bool? ?? true;
        _initialized = true;
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(l10n.notificationSettingsTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                side: BorderSide(color: colors.border),
              ),
              child: SwitchListTile(
                title: Text(
                  l10n.notificationSettingsMaster,
                  style: textTheme.titleMedium,
                ),
                subtitle: Text(
                  AppLocalizations.of(context).appAllowNotificationsFromTheApp,
                ),
                value: _masterEnabled,
                onChanged: _saving ? null : _onMasterChanged,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            if (_masterEnabled) ...[
              GroupedSection(
                title: AppLocalizations.of(context).appChooseYourNotifications,
                children: [
                  SwitchListTile(
                    secondary: const Icon(Icons.savings_outlined),
                    title: Text(l10n.notificationSettingsBudget),
                    subtitle: Text(
                      AppLocalizations.of(context).appWhenSpendingNearsABudget,
                    ),
                    value: _budgetEnabled,
                    onChanged: _saving
                        ? null
                        : (val) {
                            final prev = _budgetEnabled;
                            setState(() => _budgetEnabled = val);
                            _save(onRollback: () => _budgetEnabled = prev);
                          },
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.alarm_rounded),
                    title: Text(l10n.notificationSettingsDaily),
                    subtitle: Text(
                      AppLocalizations.of(context).appAQuietEveningReminderTo,
                    ),
                    value: _dailyEnabled,
                    onChanged: _saving
                        ? null
                        : (val) {
                            final prev = _dailyEnabled;
                            setState(() => _dailyEnabled = val);
                            _save(onRollback: () => _dailyEnabled = prev);
                          },
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.local_fire_department_outlined),
                    title: Text(l10n.notificationSettingsStreak),
                    subtitle: Text(
                      AppLocalizations.of(context).appBeforeTheDayEndsTo,
                    ),
                    value: _streakEnabled,
                    onChanged: _saving
                        ? null
                        : (val) {
                            final prev = _streakEnabled;
                            setState(() => _streakEnabled = val);
                            _save(onRollback: () => _streakEnabled = prev);
                          },
                  ),
                  SwitchListTile(
                    secondary: const Icon(Icons.assessment_outlined),
                    title: Text(l10n.notificationSettingsMonthly),
                    subtitle: Text(
                      AppLocalizations.of(context).appWhenYourMonthlyReportIs,
                    ),
                    value: _monthlyEnabled,
                    onChanged: _saving
                        ? null
                        : (val) {
                            final prev = _monthlyEnabled;
                            setState(() => _monthlyEnabled = val);
                            _save(onRollback: () => _monthlyEnabled = prev);
                          },
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
