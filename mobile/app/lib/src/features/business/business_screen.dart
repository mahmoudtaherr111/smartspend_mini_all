import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../contacts/contacts_screen.dart';
import '../plans/plan_providers.dart';
import 'business_category_sheet.dart';
import 'business_models.dart';
import 'business_providers.dart';

/// Business mode screen (BIZ-01..04).
/// Enables separate tracking of business finances, AI category suggestion with acceptance preview,
/// supplier contacts, and safe business deletion.
class BusinessScreen extends ConsumerStatefulWidget {
  const BusinessScreen({super.key});

  static const path = '/more/business';

  @override
  ConsumerState<BusinessScreen> createState() => _BusinessScreenState();
}

class _BusinessScreenState extends ConsumerState<BusinessScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  String _selectedType = 'retail';
  List<BusinessCategory> _suggestedCategories = [];
  final Set<int> _acceptedSuggestions = {};
  bool _suggesting = false;
  bool _creating = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _fetchAiSuggestions() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showSmartSpendNotice(
        context,
        AppLocalizations.of(context).aiEnterTheBusinessNameFirst,
      );
      return;
    }

    setState(() => _suggesting = true);
    try {
      final suggestions = await ref
          .read(businessApiProvider)
          .suggestCategories(
            businessName: name,
            businessType: _selectedType,
            description: _descController.text.trim(),
          );
      if (mounted) {
        setState(() {
          _suggestedCategories = suggestions;
          _acceptedSuggestions.clear();
          for (var i = 0; i < suggestions.length; i++) {
            _acceptedSuggestions.add(i);
          }
          _suggesting = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _suggesting = false);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiWeCouldnTSuggestCategories,
        );
      }
    }
  }

  Future<void> _createBusiness() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    setState(() => _creating = true);
    try {
      final selectedCats = [
        for (final idx in _acceptedSuggestions)
          if (idx < _suggestedCategories.length) _suggestedCategories[idx],
      ];

      await ref
          .read(businessApiProvider)
          .create(
            name: name,
            type: _selectedType,
            description: _descController.text.trim(),
            categories: selectedCats,
          );

      ref.invalidate(businessDashboardProvider);
      if (mounted) {
        setState(() => _creating = false);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiYourWorkAccountIsOn,
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _creating = false);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).aiWeCouldnTCreateThe,
        );
      }
    }
  }

  Future<void> _confirmDeleteBusiness(BusinessInfo business) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(AppLocalizations.of(context).aiDeleteTheWorkAccount),
        content: Text(AppLocalizations.of(context).aiIfYouDeleteTheWork),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(AppLocalizations.of(context).aiCancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: ctx.smartSpendColors.danger,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(context).aiConfirmDelete),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await ref.read(businessApiProvider).delete();
        ref.read(isBusinessModeActiveProvider.notifier).set(false);
        ref.invalidate(businessDashboardProvider);
        if (mounted) {
          showSmartSpendNotice(
            context,
            AppLocalizations.of(context).aiWorkAccountDeletedAndIts,
          );
        }
      } catch (_) {
        if (mounted) {
          showSmartSpendNotice(
            context,
            AppLocalizations.of(context).aiWeCanTDeleteThe,
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    // Check Plan entitlements (BIZ-01)
    final planAsync = ref.watch(userPlanProvider);
    final plan = planAsync.value;
    if (plan != null && !plan.businessEnabled) {
      return Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).aiWorkAccount)),
        body: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(Icons.storefront_rounded, size: 64, color: colors.accent),
              const SizedBox(height: SmartSpendSpacing.md),
              Text(
                AppLocalizations.of(context).aiTheWorkAccountComesWith,
                style: textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.foreground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                AppLocalizations.of(context).aiKeepYourBusinessSSpending,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              FilledButton(
                onPressed: () => showSmartSpendNotice(
                  context,
                  AppLocalizations.of(context).aiUpgradingFromTheAppIs,
                ),
                child: Text(AppLocalizations.of(context).aiUpgradeToPro2),
              ),
            ],
          ),
        ),
      );
    }

    final stateAsync = ref.watch(businessDashboardProvider);
    final bState = stateAsync.value;

    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).aiWorkAccount)),
      body: stateAsync.isLoading
          ? const Center(child: CircularProgressIndicator())
          : bState != null && bState.hasBusiness
          ? _buildActiveBusinessView(context, bState)
          : _buildCreationWizard(context),
    );
  }

  Widget _buildCreationWizard(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final typesAsync = ref.watch(businessTypesProvider);
    final types =
        typesAsync.value ??
        [
          BusinessTypeOption(
            id: 'restaurant',
            label: AppLocalizations.of(context).aiRestaurantsAndFood,
            icon: '🍤',
          ),
          BusinessTypeOption(
            id: 'retail',
            label: AppLocalizations.of(context).aiTradeAndRetail,
            icon: '🛍️',
          ),
          BusinessTypeOption(
            id: 'services',
            label: AppLocalizations.of(context).aiServicesAndWorkshops,
            icon: '🔧',
          ),
          BusinessTypeOption(
            id: 'freelance',
            label: AppLocalizations.of(context).aiFreelanceAndCompanies,
            icon: '💻',
          ),
          BusinessTypeOption(
            id: 'custom',
            label: AppLocalizations.of(context).aiSomethingElse,
            icon: '✏️',
          ),
        ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GroupedCard(
            title: AppLocalizations.of(context).aiSetUpTheWorkAccount,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  AppLocalizations.of(context).aiMakeASeparateAccountFor,
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    labelText: AppLocalizations.of(context)
                        .aiBusinessOrShopName,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                Text(
                  AppLocalizations.of(context).aiField,
                  style: textTheme.labelLarge,
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Wrap(
                  spacing: SmartSpendSpacing.sm,
                  runSpacing: SmartSpendSpacing.xs,
                  children: [
                    for (final t in types)
                      ChoiceChip(
                        label: Text('${t.icon} ${t.label}'),
                        selected: _selectedType == t.id,
                        onSelected: (sel) {
                          if (sel) setState(() => _selectedType = t.id);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _descController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: AppLocalizations.of(context)
                        .aiShortDescriptionOptional,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                OutlinedButton.icon(
                  icon: _suggesting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome_rounded),
                  label: Text(AppLocalizations.of(context).aiSuggestCategories),
                  onPressed: _suggesting ? null : _fetchAiSuggestions,
                ),
              ],
            ),
          ),

          // Suggested Categories Preview & Acceptance (BIZ-02)
          if (_suggestedCategories.isNotEmpty) ...[
            const SizedBox(height: SmartSpendSpacing.md),
            GroupedCard(
              title: AppLocalizations.of(context)
                  .aiSuggestedCategoriesReviewThem,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    AppLocalizations.of(context).aiChooseTheOnesThatFit,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  for (var i = 0; i < _suggestedCategories.length; i++)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _acceptedSuggestions.contains(i),
                      onChanged: (checked) {
                        setState(() {
                          if (checked == true) {
                            _acceptedSuggestions.add(i);
                          } else {
                            _acceptedSuggestions.remove(i);
                          }
                        });
                      },
                      title: Text(
                        '${_suggestedCategories[i].icon} ${_suggestedCategories[i].nameAr}',
                        style: textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        _suggestedCategories[i].type == 'income'
                            ? AppLocalizations.of(context).aiIncomeAndSales
                            : AppLocalizations.of(context).aiExpenses,
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],

          const SizedBox(height: SmartSpendSpacing.lg),
          FilledButton(
            onPressed: _creating ? null : _createBusiness,
            child: _creating
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(AppLocalizations.of(context).aiCreateTheWorkAccount),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveBusinessView(BuildContext context, BusinessState state) {
    final business = state.business!;
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isBusinessActive = ref.watch(isBusinessModeActiveProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Business Mode Switcher Card (BIZ-01, BIZ-03)
          GroupedCard(
            title: AppLocalizations.of(context).aiCurrentWorkAccount,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          business.name,
                          style: textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: colors.foreground,
                          ),
                        ),
                        Text(
                          business.typeLabel,
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                    Switch(
                      value: isBusinessActive,
                      onChanged: (val) {
                        ref
                            .read(isBusinessModeActiveProvider.notifier)
                            .set(val);
                        showSmartSpendNotice(
                          context,
                          val
                              ? AppLocalizations.of(context)
                                    .aiSwitchedToTheWorkAccount
                              : AppLocalizations.of(context)
                                    .aiSwitchedToPersonal,
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  isBusinessActive
                      ? AppLocalizations.of(context).aiYouReInTheWork
                      : AppLocalizations.of(context).aiYouReInPersonalMode,
                  style: textTheme.bodySmall?.copyWith(
                    color: isBusinessActive
                        ? colors.accent
                        : colors.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // Business Categories Manager (BIZ-02)
          GroupedCard(
            title: AppLocalizations.of(context)
                .aiBusinessCategoriesP0('${state.categories.length}'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final cat in state.categories)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: SmartSpendSpacing.xs,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(
                              cat.icon,
                              style: const TextStyle(fontSize: 20),
                            ),
                            const SizedBox(width: SmartSpendSpacing.sm),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  cat.nameAr,
                                  style: textTheme.bodyMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: colors.foreground,
                                  ),
                                ),
                                Text(
                                  cat.type == 'income'
                                      ? AppLocalizations.of(context).aiIncome
                                      : AppLocalizations.of(context).aiExpense,
                                  style: textTheme.bodySmall?.copyWith(
                                    color: cat.type == 'income'
                                        ? colors.accent
                                        : colors.mutedForeground,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        IconButton(
                          icon: Icon(
                            Icons.delete_outline_rounded,
                            color: colors.danger,
                            size: 20,
                          ),
                          tooltip: AppLocalizations.of(context)
                              .aiDeleteTheCategory,
                          onPressed: () async {
                            final success = await ref
                                .read(businessApiProvider)
                                .removeCategory(cat.id);
                            if (success) {
                              ref.invalidate(businessDashboardProvider);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: SmartSpendSpacing.sm),
                OutlinedButton.icon(
                  icon: const Icon(Icons.add_rounded),
                  label: Text(AppLocalizations.of(context).aiAddANewCategory),
                  onPressed: () => AddBusinessCategorySheet.show(
                    context,
                    onAdd:
                        ({
                          required String name,
                          required String nameAr,
                          required String type,
                          required String icon,
                          required String color,
                        }) async {
                          await ref
                              .read(businessApiProvider)
                              .addCategory(
                                name: name,
                                nameAr: nameAr,
                                type: type,
                                icon: icon,
                                color: color,
                              );
                          ref.invalidate(businessDashboardProvider);
                        },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),

          // People of the Business (BIZ-04)
          GroupedCard(
            title: AppLocalizations.of(context).aiBusinessPeopleAndSuppliers,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  AppLocalizations.of(context)
                      .aiSuppliersAndCustomersP0('${state.contactCount}'),
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  AppLocalizations.of(context).aiLinkAnyoneToTheBusiness,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    icon: const Icon(Icons.people_outline_rounded),
                    label: Text(
                      AppLocalizations.of(context).aiManageContactsAndSuppliers,
                    ),
                    onPressed: () => context.go(ContactsScreen.path),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),

          // Delete Business Section (BIZ-01)
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: colors.danger,
              side: BorderSide(color: colors.danger.withAlpha(120)),
            ),
            icon: const Icon(Icons.delete_forever_rounded),
            label: Text(AppLocalizations.of(context).aiDeleteTheWorkAccount2),
            onPressed: () => _confirmDeleteBusiness(business),
          ),
        ],
      ),
    );
  }
}
