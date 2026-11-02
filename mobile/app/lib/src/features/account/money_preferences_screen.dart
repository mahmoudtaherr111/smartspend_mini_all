import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_providers.dart';
import 'account_providers.dart';

/// Screen for configuring payday (financial month start), currency, and decimal places (ACC-02).
class MoneyPreferencesScreen extends ConsumerStatefulWidget {
  const MoneyPreferencesScreen({super.key});

  static const path = '/more/money-prefs';

  @override
  ConsumerState<MoneyPreferencesScreen> createState() =>
      _MoneyPreferencesScreenState();
}

class _MoneyPreferencesScreenState
    extends ConsumerState<MoneyPreferencesScreen> {
  int _salaryDay = 1;
  String _currency = 'EGP';
  int _decimalPlaces = 2;
  bool _saving = false;
  bool _initialized = false;

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _saving = true);
    try {
      await ref
          .read(accountRepositoryProvider)
          .updateMoneyPreferences(
            salaryDay: _salaryDay,
            currency: _currency,
            decimalPlaces: _decimalPlaces,
          );
      ref.invalidate(userProfileProvider);
      ref.invalidate(salaryDayProvider);
      if (mounted) {
        showSmartSpendNotice(context, l10n.moneyPrefsSaved);
      }
    } on ApiException catch (e) {
      if (mounted) {
        showSmartSpendNotice(context, e.message);
      }
    } on Object {
      if (mounted) {
        showSmartSpendNotice(context, l10n.captureStatusFailed);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
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
        _salaryDay = profile.salaryDay;
        _currency = profile.currency;
        _decimalPlaces = profile.decimalPlaces;
        _initialized = true;
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(l10n.moneyPrefsTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GroupedSection(
              title: l10n.moneyPrefsSalaryDay,
              children: [
                Padding(
                  padding: const EdgeInsets.all(SmartSpendSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        l10n.moneyPrefsSalaryDayBody,
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: SmartSpendSpacing.lg),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'يوم $_salaryDay في الشهر',
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: colors.accent,
                            ),
                          ),
                          Text(
                            _salaryDay == 1
                                ? 'أول الشهر'
                                : (_salaryDay >= 28 ? 'آخر الشهر' : ''),
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                      Slider(
                        value: _salaryDay.toDouble(),
                        min: 1,
                        max: 31,
                        divisions: 30,
                        label: '$_salaryDay',
                        onChanged: (val) =>
                            setState(() => _salaryDay = val.round()),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            GroupedSection(
              title: 'العملة وتنسيق الأرقام',
              children: [
                GroupedRow(
                  icon: Icons.attach_money_rounded,
                  title: l10n.moneyPrefsCurrency,
                  subtitle: _currency,
                  onTap: () {},
                ),
                SwitchListTile(
                  title: Text(l10n.moneyPrefsDecimalPlaces),
                  subtitle: Text(
                    _decimalPlaces == 2
                        ? 'إظهار القروش (مثال: 50.00 ج.م)'
                        : 'أرقام صحيحة بدون قروش',
                  ),
                  value: _decimalPlaces == 2,
                  onChanged: (val) =>
                      setState(() => _decimalPlaces = val ? 2 : 0),
                ),
              ],
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: l10n.profileSave,
              busy: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
