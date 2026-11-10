import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'commitment_api.dart';
import 'commitment_form.dart';
import 'commitment_models.dart';
import 'commitment_ui.dart';
import 'subscription_brands.dart';

/// What a person can add, each with its own few fixed fields (never questions a model makes up): the type decides
/// the shape the server follows (docs/decisions/0051-commitments-ecosystem.md).
enum CommitmentType {
  subscription(
    'subscription',
    CommitmentShape.recurring,
    Icons.subscriptions_outlined,
  ),
  installment(
    'installment',
    CommitmentShape.fixed,
    Icons.shopping_bag_outlined,
  ),
  loan('loan', CommitmentShape.fixed, Icons.account_balance_outlined),
  property('property', CommitmentShape.fixed, Icons.apartment_outlined),
  school('school', CommitmentShape.schedule, Icons.school_outlined),
  lessons('lessons', CommitmentShape.recurring, Icons.menu_book_outlined),
  rent('rent', CommitmentShape.recurring, Icons.home_outlined),
  bill('bill', CommitmentShape.recurring, Icons.receipt_long_outlined),
  card('card', CommitmentShape.recurring, Icons.credit_card_outlined),
  debt('debt', CommitmentShape.balance, Icons.handshake_outlined),
  gam3eya('gam3eya', CommitmentShape.gam3eya, Icons.groups_2_outlined),
  income('salary', CommitmentShape.recurring, Icons.payments_outlined),
  other('other', CommitmentShape.recurring, Icons.event_note_outlined);

  const CommitmentType(this.kind, this.shape, this.icon);

  final String kind;
  final CommitmentShape shape;
  final IconData icon;

  String label(AppLocalizations l10n) => switch (this) {
    subscription => l10n.cmTypeSubscription,
    installment => l10n.cmTypeInstallment,
    loan => l10n.cmTypeLoan,
    property => l10n.cmTypeProperty,
    school => l10n.cmTypeSchool,
    lessons => l10n.cmTypeLessons,
    rent => l10n.cmTypeRent,
    bill => l10n.cmTypeBill,
    card => l10n.cmTypeCard,
    debt => l10n.cmTypeDebt,
    gam3eya => l10n.cmTypeGam3eya,
    income => l10n.cmTypeIncome,
    other => l10n.cmTypeOther,
  };

  String hint(AppLocalizations l10n) => switch (this) {
    subscription => l10n.cmTypeSubscriptionHint,
    installment => l10n.cmTypeInstallmentHint,
    loan => l10n.cmTypeLoanHint,
    property => l10n.cmTypePropertyHint,
    school => l10n.cmTypeSchoolHint,
    lessons => l10n.cmTypeLessonsHint,
    rent => l10n.cmTypeRentHint,
    bill => l10n.cmTypeBillHint,
    card => l10n.cmTypeCardHint,
    debt => l10n.cmTypeDebtHint,
    gam3eya => l10n.cmTypeGam3eyaHint,
    income => l10n.cmTypeIncomeHint,
    other => l10n.cmTypeOtherHint,
  };
}

/// Adding a commitment: pick what it is, then fill its few fields.
class AddCommitmentScreen extends ConsumerStatefulWidget {
  const AddCommitmentScreen({super.key, this.initialType});

  static const path = '/commitments/add';

  final CommitmentType? initialType;

  @override
  ConsumerState<AddCommitmentScreen> createState() =>
      _AddCommitmentScreenState();
}

class _AddCommitmentScreenState extends ConsumerState<AddCommitmentScreen> {
  late CommitmentType? _type = widget.initialType;
  CatalogBrand? _brand;
  bool _customSubscription = false;

  bool get _picking =>
      _type == null ||
      (_type == CommitmentType.subscription &&
          _brand == null &&
          !_customSubscription);

  void _back() {
    setState(() {
      if (_type == CommitmentType.subscription &&
          (_brand != null || _customSubscription)) {
        _brand = null;
        _customSubscription = false;
      } else {
        _type = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final type = _type;
    return PopScope(
      canPop: type == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(type == null ? l10n.cmAddTitle : type.label(l10n)),
        ),
        body: type == null
            ? _TypeGrid(onPick: (value) => setState(() => _type = value))
            : _picking
            ? _SubscriptionPicker(
                onPick: (brand) => setState(() => _brand = brand),
                onCustom: () => setState(() => _customSubscription = true),
              )
            : CommitmentForm(type: type, brand: _brand),
      ),
    );
  }
}

class _TypeGrid extends StatelessWidget {
  const _TypeGrid({required this.onPick});

  final ValueChanged<CommitmentType> onPick;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    // From about 1.5 times the text size, one type per row, so nothing is cut.
    final large = MediaQuery.textScalerOf(context).scale(10) > 15;
    return ListView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      children: [
        Text(l10n.cmWhatIsIt, style: textTheme.titleMedium),
        const SizedBox(height: SmartSpendSpacing.md),
        if (large)
          for (final type in CommitmentType.values)
            Card(
              key: ValueKey('type-${type.name}'),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                leading: Icon(type.icon, color: colors.accent),
                title: Text(type.label(l10n)),
                subtitle: Text(type.hint(l10n)),
                onTap: () => onPick(type),
              ),
            )
        else
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: SmartSpendSpacing.sm,
            crossAxisSpacing: SmartSpendSpacing.sm,
            childAspectRatio: 1.35,
            children: [
              for (final type in CommitmentType.values)
                Card(
                  key: ValueKey('type-${type.name}'),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => onPick(type),
                    child: Padding(
                      padding: const EdgeInsets.all(SmartSpendSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Icon(type.icon, color: colors.accent),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                type.label(l10n),
                                style: textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                type.hint(l10n),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: textTheme.labelSmall?.copyWith(
                                  color: colors.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// The known subscriptions with their logos (the admin keeps the list), searched by either name.
class _SubscriptionPicker extends ConsumerStatefulWidget {
  const _SubscriptionPicker({required this.onPick, required this.onCustom});

  final ValueChanged<CatalogBrand> onPick;
  final VoidCallback onCustom;

  @override
  ConsumerState<_SubscriptionPicker> createState() =>
      _SubscriptionPickerState();
}

class _SubscriptionPickerState extends ConsumerState<_SubscriptionPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final choices = ref.watch(subscriptionChoicesProvider);
    final query = _query.trim().toLowerCase();
    return ListView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      children: [
        TextField(
          key: const ValueKey('subscription-search'),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search_rounded),
            hintText: l10n.cmSearchSubscriptions,
          ),
          onChanged: (value) => setState(() => _query = value),
        ),
        const SizedBox(height: SmartSpendSpacing.md),
        choices.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(SmartSpendSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => InlineMessage(
            l10n.cmSubscriptionsFailed,
            tone: MessageTone.warning,
          ),
          data: (brands) {
            final shown = brands
                .where(
                  (brand) =>
                      query.isEmpty ||
                      brand.name.toLowerCase().contains(query) ||
                      brand.nameAr.contains(query),
                )
                .toList();
            // Services already paid for carry a tick, so the same one is not added twice by mistake.
            final mine = {
              for (final item
                  in ref.watch(commitmentsOverviewProvider).value?.items ??
                      const <Commitment>[])
                if (item.status != 'ended' && item.catalog != null)
                  item.catalog!.slug,
            };
            Widget grid(List<CatalogBrand> list) => GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: SmartSpendSpacing.sm,
              crossAxisSpacing: SmartSpendSpacing.sm,
              childAspectRatio: MediaQuery.textScalerOf(context).scale(10) > 15
                  ? 0.7
                  : 0.95,
              children: [
                for (final brand in list)
                  InkWell(
                    key: ValueKey('brand-${brand.slug}'),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    onTap: () => widget.onPick(brand),
                    child: Padding(
                      padding: const EdgeInsets.all(SmartSpendSpacing.xs),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Badge(
                            isLabelVisible: mine.contains(brand.slug),
                            backgroundColor: colors.accent,
                            label: const Icon(Icons.check_rounded, size: 10),
                            child: LogoBadge(
                              label: brand.name,
                              color: brandColorOf(
                                brand.slug,
                                brand.brandColor,
                                colors.accent,
                              ),
                              imageUrl: resolveLogoUrl(ref, brand.logoUrl),
                              size: 52,
                            ),
                          ),
                          const SizedBox(height: SmartSpendSpacing.xs),
                          Text(
                            inlineName(brand.name),
                            maxLines: 2,
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.labelMedium,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
            if (query.isNotEmpty) {
              return shown.isEmpty
                  ? Text(l10n.cfNoSuchSubscription, style: textTheme.bodyMedium)
                  : grid(shown);
            }
            const order = [
              'streaming',
              'music',
              'ai_tools',
              'software',
              'general_subscriptions',
            ];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final group in order)
                  if (shown.any((brand) => brand.group == group)) ...[
                    SectionHeader(_groupLabel(l10n, group)),
                    grid([
                      for (final brand in shown)
                        if (brand.group == group) brand,
                    ]),
                  ],
                if (shown.any((brand) => !order.contains(brand.group))) ...[
                  SectionHeader(_groupLabel(l10n, 'general_subscriptions')),
                  grid([
                    for (final brand in shown)
                      if (!order.contains(brand.group)) brand,
                  ]),
                ],
              ],
            );
          },
        ),
        const SizedBox(height: SmartSpendSpacing.md),
        SmartSpendButton(
          label: l10n.cmNotInList,
          variant: ButtonVariant.secondary,
          icon: Icons.edit_outlined,
          onPressed: widget.onCustom,
        ),
      ],
    );
  }
}

String _groupLabel(AppLocalizations l10n, String group) => switch (group) {
  'streaming' => l10n.cfGroupStreaming,
  'music' => l10n.cfGroupMusic,
  'ai_tools' => l10n.cfGroupAi,
  'software' => l10n.cfGroupSoftware,
  _ => l10n.cfGroupOther,
};
