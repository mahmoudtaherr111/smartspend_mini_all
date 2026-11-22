import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../calendar/calendar_providers.dart';
import '../ledger/ledger_providers.dart';
import '../stats/stats_providers.dart';
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
  final _incomeController = TextEditingController();
  final _incomeFocusNode = FocusNode();
  int _salaryDay = 1;
  String _currency = 'EGP';
  bool _saving = false;
  bool _initialized = false;

  @override
  void dispose() {
    _incomeController.dispose();
    _incomeFocusNode.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final rawIncome = _incomeController.text.trim();
    final parsedIncome = rawIncome.isEmpty ? null : parseAmount(rawIncome);
    setState(() => _saving = true);
    try {
      final repo = ref.read(accountRepositoryProvider);
      await repo.updateMoneyPreferences(
        salaryDay: _salaryDay,
        currency: _currency,
      );
      await repo.updateProfile(
        monthlyIncome: parsedIncome != null && parsedIncome > 0
            ? parsedIncome.toDouble()
            : null,
      );
      ref
        ..invalidate(userProfileProvider)
        ..invalidate(salaryDayProvider)
        ..invalidate(currentMonthProvider)
        ..invalidate(monthSummaryProvider)
        ..invalidate(monthStatsProvider)
        ..invalidate(coachOverviewProvider);
      if (mounted) {
        showSmartSpendNotice(context, l10n.moneyPrefsSaved);
      }
    } on ApiException catch (e) {
      if (mounted) {
        showSmartSpendNotice(context, e.message);
      }
    } on Object {
      if (mounted) {
        showSmartSpendNotice(context, l10n.genericActionFailed);
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
        _currency = profile.currency.isNotEmpty ? profile.currency : 'EGP';
        final income = profile.monthlyIncome;
        if (income != null && income > 0) {
          _incomeController.text = income == income.roundToDouble()
              ? '${income.round()}'
              : '$income';
        }
        _initialized = true;
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(l10n.moneyPrefsTitle)),
      body: SmartSpendKeyboardAccessory(
        focusNodes: [_incomeFocusNode],
        doneLabel: l10n.keyboardDone,
        child: SingleChildScrollView(
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
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          spacing: SmartSpendSpacing.sm,
                          children: [
                            Text(
                              AppLocalizations.of(context)
                                  .appDayP0OfTheMonth('$_salaryDay'),
                              style: textTheme.titleMedium?.copyWith(
                                color: colors.accent,
                              ),
                            ),
                            Text(
                              _salaryDay == 1
                                  ? AppLocalizations.of(context).appStartOfMonth
                                  : (_salaryDay >= 28
                                        ? AppLocalizations.of(context)
                                              .appEndOfMonth
                                        : ''),
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
                title: l10n.moneyPrefMonthlyIncomeLabel,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(SmartSpendSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _incomeController,
                          focusNode: _incomeFocusNode,
                          enabled: !_saving,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: l10n.moneyPrefMonthlyIncomeLabel,
                            helperText: l10n.moneyPrefMonthlyIncomeHint,
                            prefixIcon: const Icon(Icons.payments_outlined),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(
                                SmartSpendRadii.md,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.md),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.currency_exchange_rounded),
                          title: Text(l10n.moneyPrefCurrencyLabel),
                          trailing: Text(
                            _currency,
                            style: textTheme.titleSmall?.copyWith(
                              color: colors.accent,
                            ),
                          ),
                        ),
                      ],
                    ),
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
      ),
    );
  }
}
