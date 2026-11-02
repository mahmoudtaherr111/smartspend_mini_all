import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

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
      showSmartSpendNotice(context, 'اكتب اسم المشروع أولاً');
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
        showSmartSpendNotice(context, 'تعذر اقتراح الفئات، جرب مرة أخرى');
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
        showSmartSpendNotice(context, 'تم تفعيل حساب الشغل بنجاح');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _creating = false);
        showSmartSpendNotice(context, 'حدث خطأ أثناء إنشاء المشروع');
      }
    }
  }

  Future<void> _confirmDeleteBusiness(BusinessInfo business) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف حساب الشغل؟'),
        content: const Text(
          'عند حذف حساب الشغل:\n'
          '• كل المعاملات اللي سجلتها هتفضل محفوظة بس هتتحول لمعاملات شخصية عادية.\n'
          '• فئات الشغل وقواعد الذكاء الاصطناعي الخاصة بيه هتتحذف.\n\n'
          'هل تريد الاستمرار؟',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: ctx.smartSpendColors.danger,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('تأكيد الحذف'),
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
            'تم حذف حساب الشغل وتحويل المعاملات للحساب الشخصي',
          );
        }
      } catch (_) {
        if (mounted) {
          showSmartSpendNotice(context, 'تعذر حذف المشروع حالياً');
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
        appBar: AppBar(title: const Text('حساب الشغل / البيزنس')),
        body: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(Icons.storefront_rounded, size: 64, color: colors.accent),
              const SizedBox(height: SmartSpendSpacing.md),
              Text(
                'حساب الشغل متاح في باقة برو',
                style: textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: colors.foreground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                'افصل مصاريف وإيرادات مشروعك عن مصاريف بيتك الشخصية، وخصص فئات تجارية ذكية تناسب مجالك مع تقارير وإقرارات ضريبية مبسطة.',
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              FilledButton(
                onPressed: () => showSmartSpendNotice(
                  context,
                  'الترقية متاحة قريباً عبر متجر التطبيقات',
                ),
                child: const Text('ترقية إلى برو'),
              ),
            ],
          ),
        ),
      );
    }

    final stateAsync = ref.watch(businessDashboardProvider);
    final bState = stateAsync.value;

    return Scaffold(
      appBar: AppBar(title: const Text('حساب الشغل / البيزنس')),
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
        const [
          BusinessTypeOption(
            id: 'restaurant',
            label: 'مطاعم ومأكولات',
            icon: '🍤',
          ),
          BusinessTypeOption(id: 'retail', label: 'تجارة وتجزئة', icon: '🛍️'),
          BusinessTypeOption(id: 'services', label: 'خدمات وورش', icon: '🔧'),
          BusinessTypeOption(
            id: 'freelance',
            label: 'عمل حر وشركات',
            icon: '💻',
          ),
          BusinessTypeOption(id: 'custom', label: 'نوع آخر', icon: '✏️'),
        ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GroupedCard(
            title: 'إعداد حساب الشغل',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'أنشئ حساباً منفصلاً لعملك أو متجرك لفصل الحسابات الشخصية عن العمل.',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'اسم المشروع أو المتجر',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                Text('مجال المشروع', style: textTheme.labelLarge),
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
                  decoration: const InputDecoration(
                    labelText: 'وصف مختصر (اختياري - بيساعد الذكاء الاصطناعي)',
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
                  label: const Text('اقتراح فئات بالذكاء الاصطناعي'),
                  onPressed: _suggesting ? null : _fetchAiSuggestions,
                ),
              ],
            ),
          ),

          // Suggested Categories Preview & Acceptance (BIZ-02)
          if (_suggestedCategories.isNotEmpty) ...[
            const SizedBox(height: SmartSpendSpacing.md),
            GroupedCard(
              title: 'الفئات المقترحة للمشروع (راجع ووافق عليها)',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'اختر الفئات اللي تناسب نشاطك ليتم إضافتها لحسابك:',
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
                            ? 'إيراد ومبيعات'
                            : 'مصروفات',
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
                : const Text('إنشاء حساب الشغل'),
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
            title: 'حساب الشغل الحالي',
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
                              ? 'تم التحويل لوضع حساب الشغل'
                              : 'تم التحويل للوضع الشخصي',
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  isBusinessActive
                      ? 'أنت تعمل حالياً في وضع حساب الشغل. كل المعاملات الجديدة ستُنسب لهذا المشروع.'
                      : 'أنت في الوضع الشخصي. فعّل المفتاح لتسجيل مصاريف وإيرادات الشغل.',
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
            title: 'فئات المشروع (${state.categories.length})',
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
                                  cat.type == 'income' ? 'إيراد' : 'مصروف',
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
                          tooltip: 'حذف الفئة',
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
                  label: const Text('إضافة فئة جديدة'),
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
            title: 'أشخاص وموردي المشروع',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'عدد الموردين والعملاء المسجلين: ${state.contactCount}',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xs),
                Text(
                  'تقدر تربط أي شخص أو مورد بالمشروع لمتابعة المستحقات والفواتير.',
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.sm),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    icon: const Icon(Icons.people_outline_rounded),
                    label: const Text('إدارة جهات الاتصال والموردين'),
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
            label: const Text('حذف حساب الشغل'),
            onPressed: () => _confirmDeleteBusiness(business),
          ),
        ],
      ),
    );
  }
}
