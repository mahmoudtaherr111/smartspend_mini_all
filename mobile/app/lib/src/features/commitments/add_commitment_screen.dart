import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'commitment_api.dart';
import 'commitment_detail_screen.dart';
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
            return GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: SmartSpendSpacing.sm,
              crossAxisSpacing: SmartSpendSpacing.sm,
              childAspectRatio: MediaQuery.textScalerOf(context).scale(10) > 15
                  ? 0.7
                  : 0.95,
              children: [
                for (final brand in shown)
                  InkWell(
                    key: ValueKey('brand-${brand.slug}'),
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    onTap: () => widget.onPick(brand),
                    child: Padding(
                      padding: const EdgeInsets.all(SmartSpendSpacing.xs),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          LogoBadge(
                            label: brand.name,
                            color: brandColorOf(
                              brand.slug,
                              brand.brandColor,
                              colors.accent,
                            ),
                            imageUrl: resolveLogoUrl(ref, brand.logoUrl),
                            size: 48,
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

/// One installment of a school's fees: its date and amount.
class _ItemFields {
  _ItemFields();

  final amount = TextEditingController();
  String? day;

  void dispose() => amount.dispose();
}

/// The fixed fields of one type, and the reminder; sends them as `commitments.create` takes them.
class CommitmentForm extends ConsumerStatefulWidget {
  const CommitmentForm({super.key, required this.type, this.brand});

  final CommitmentType type;
  final CatalogBrand? brand;

  @override
  ConsumerState<CommitmentForm> createState() => _CommitmentFormState();
}

class _CommitmentFormState extends ConsumerState<CommitmentForm> {
  final _title = TextEditingController();
  final _provider = TextEditingController();
  final _amount = TextEditingController();
  final _count = TextEditingController();
  final _person = TextEditingController();
  final _relation = TextEditingController();
  final _total = TextEditingController();
  final _turn = TextEditingController();
  final _items = <_ItemFields>[_ItemFields()];
  String? _day;
  String _recurrence = 'monthly';
  bool _varies = false;
  bool _university = false;
  bool _owedToMe = false;
  String _repayment = 'flexible';
  int? _remindDays;
  bool _busy = false;
  String? _error;

  CommitmentType get _type => widget.type;

  @override
  void initState() {
    super.initState();
    final brand = widget.brand;
    if (brand != null) {
      _title.text = brand.name;
      _recurrence = brand.cycle == 'yearly' ? 'yearly' : 'monthly';
    }
    _varies = _type == CommitmentType.card;
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _provider,
      _amount,
      _count,
      _person,
      _relation,
      _total,
      _turn,
    ]) {
      controller.dispose();
    }
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  int? _int(TextEditingController controller) =>
      int.tryParse(controller.text.trim());

  String? _text(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  /// The fields of the type, or a message saying what is missing.
  (Map<String, Object?>?, String?) _fields(AppLocalizations l10n) {
    final amount = parseAmount(_amount.text);
    final title = _text(_title);
    final reminder = <String, Object?>{'remindDaysBefore': ?_remindDays};
    switch (_type) {
      case CommitmentType.installment ||
          CommitmentType.loan ||
          CommitmentType.property:
        final count = _int(_count);
        if (title == null) return (null, l10n.cmNeedTitle);
        if (amount == null || amount <= 0) return (null, l10n.cmNeedAmount);
        if (_day == null) return (null, l10n.cmNeedDay);
        if (count == null || count < 1) return (null, l10n.cmNeedCount);
        return (
          {
            'shape': 'fixed',
            'kind': _type.kind,
            'title': title,
            'provider': _text(_provider),
            'amount': amount,
            'startDay': _day,
            'remainingCount': count,
            'recurrence': 'monthly',
            ...reminder,
          },
          null,
        );
      case CommitmentType.school:
        final items = [
          for (final item in _items)
            if (item.day != null && (parseAmount(item.amount.text) ?? 0) > 0)
              {'dueDay': item.day, 'amount': parseAmount(item.amount.text)},
        ];
        if (title == null) return (null, l10n.cmNeedSchool);
        if (items.isEmpty) return (null, l10n.cmNeedItems);
        final child = _text(_person);
        return (
          {
            'shape': 'schedule',
            'kind': _university ? 'university' : 'school',
            'title': child == null ? title : l10n.cmSchoolTitle(title, child),
            'provider': title,
            'beneficiaryName': child,
            'beneficiaryRelation': _text(_relation),
            'items': items,
            ...reminder,
          },
          null,
        );
      case CommitmentType.debt:
        final total = parseAmount(_total.text);
        final person = _text(_person);
        if (person == null) return (null, l10n.cmNeedPerson);
        if (total == null || total <= 0) return (null, l10n.cmNeedAmount);
        if (_repayment != 'flexible' && _day == null) {
          return (null, l10n.cmNeedDay);
        }
        if (_repayment == 'installments' &&
            ((amount ?? 0) <= 0 || (_int(_count) ?? 0) < 1)) {
          return (null, l10n.cmNeedInstallments);
        }
        return (
          {
            'shape': 'balance',
            'kind': 'debt',
            'direction': _owedToMe ? 'in' : 'out',
            'title': _owedToMe
                ? l10n.cmDebtToMeTitle(person)
                : l10n.cmDebtOnMeTitle(person),
            'contactName': person,
            'contactRelation': _text(_relation),
            'totalAmount': total,
            'repayment': _repayment,
            if (_repayment != 'flexible') 'startDay': _day,
            if (_repayment == 'installments') 'amount': amount,
            if (_repayment == 'installments') 'occurrenceCount': _int(_count),
            ...reminder,
          },
          null,
        );
      case CommitmentType.gam3eya:
        final months = _int(_count);
        final turn = _int(_turn);
        if (amount == null || amount <= 0) return (null, l10n.cmNeedAmount);
        if (months == null || months < 2) return (null, l10n.cmNeedMonths);
        if (turn == null || turn < 1 || turn > months) {
          return (null, l10n.cmNeedTurn);
        }
        if (_day == null) return (null, l10n.cmNeedDay);
        return (
          {
            'shape': 'gam3eya',
            'kind': 'gam3eya',
            'title': title ?? l10n.cmKindGam3eya,
            'amount': amount,
            'occurrenceCount': months,
            'gam3eyaTurn': turn,
            'startDay': _day,
            ...reminder,
          },
          null,
        );
      default:
        if (_type == CommitmentType.other && title == null) {
          return (null, l10n.cmNeedTitle);
        }
        if (!_varies && (amount == null || amount <= 0)) {
          return (null, l10n.cmNeedAmount);
        }
        if (_day == null) return (null, l10n.cmNeedDay);
        final kind = _type == CommitmentType.income ? 'salary' : _type.kind;
        return (
          {
            'shape': 'recurring',
            'kind': kind,
            'title': switch (_type) {
              CommitmentType.card =>
                title == null ? null : l10n.cmCardTitle(title),
              CommitmentType.lessons when _text(_person) != null =>
                l10n.cmLessonsTitle(
                  title ?? l10n.cmKindLessons,
                  _text(_person)!,
                ),
              _ => title,
            },
            'catalogSlug': ?widget.brand?.slug,
            'provider': _type == CommitmentType.card ? title : null,
            'beneficiaryName': _type == CommitmentType.lessons
                ? _text(_person)
                : null,
            'direction': _type == CommitmentType.income ? 'in' : 'out',
            'amount': _varies ? null : amount,
            'amountVaries': _varies,
            'recurrence': _recurrence,
            'startDay': _day,
            ...reminder,
          },
          null,
        );
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final (fields, problem) = _fields(l10n);
    if (fields == null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final id = await ref.read(commitmentApiProvider).create(fields);
      refreshCommitments(ref);
      if (!mounted) return;
      showSmartSpendNotice(context, l10n.cmAdded);
      context.pushReplacement(CommitmentDetailScreen.pathOf(id));
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.code == 'FORBIDDEN'
            ? l10n.cmNotInPlan
            : error.code == 'BAD_REQUEST'
            ? error.message
            : l10n.cmSaveFailed;
      });
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = l10n.cmSaveFailed;
        });
      }
    }
  }

  Widget _gap() => const SizedBox(height: SmartSpendSpacing.md);

  Widget _field(
    TextEditingController controller,
    String label, {
    String? hint,
    bool number = false,
    bool money = false,
    String key = '',
  }) => TextField(
    key: key.isEmpty ? null : ValueKey(key),
    controller: controller,
    keyboardType: number || money
        ? const TextInputType.numberWithOptions(decimal: true)
        : TextInputType.text,
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      suffixText: money ? MoneyLocale.of(context).symbol : null,
    ),
  );

  Widget _dayField(
    String label, {
    String? value,
    required ValueChanged<String> onPick,
    String key = 'field-day',
  }) {
    final l10n = AppLocalizations.of(context);
    final today = ref.watch(commitmentsOverviewProvider).value?.today;
    return InkWell(
      key: ValueKey(key),
      borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
      onTap: () async {
        final day = await pickCommitmentDay(
          context,
          initial: value,
          today: today,
        );
        if (day != null) onPick(day);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.event_outlined),
        ),
        child: Text(
          value == null ? l10n.cmPickDay : commitmentDayLabel(context, value),
        ),
      ),
    );
  }

  List<Widget> _fixedFields(AppLocalizations l10n) => [
    _field(
      _title,
      switch (_type) {
        CommitmentType.loan => l10n.cmLoanWhat,
        CommitmentType.property => l10n.cmPropertyWhat,
        _ => l10n.cmInstallmentWhat,
      },
      hint: switch (_type) {
        CommitmentType.loan => l10n.cmLoanWhatHint,
        CommitmentType.property => l10n.cmPropertyWhatHint,
        _ => l10n.cmInstallmentWhatHint,
      },
      key: 'field-title',
    ),
    _gap(),
    _field(
      _provider,
      l10n.cmWithWhom,
      hint: l10n.cmWithWhomHint,
      key: 'field-provider',
    ),
    _gap(),
    _field(_amount, l10n.cmInstallmentAmount, money: true, key: 'field-amount'),
    _gap(),
    _dayField(
      l10n.cmNextDay,
      value: _day,
      onPick: (day) => setState(() => _day = day),
    ),
    _gap(),
    _field(_count, l10n.cmRemainingCount, number: true, key: 'field-count'),
  ];

  List<Widget> _schoolFields(AppLocalizations l10n) => [
    SegmentedButton<bool>(
      segments: [
        ButtonSegment(value: false, label: Text(l10n.cmKindSchool)),
        ButtonSegment(value: true, label: Text(l10n.cmKindUniversity)),
      ],
      selected: {_university},
      onSelectionChanged: (value) => setState(() => _university = value.first),
    ),
    _gap(),
    _field(
      _title,
      _university ? l10n.cmUniversityName : l10n.cmSchoolName,
      key: 'field-title',
    ),
    _gap(),
    _field(
      _person,
      l10n.cmChildName,
      hint: l10n.cmChildNameHint,
      key: 'field-person',
    ),
    _gap(),
    Text(l10n.cmFeeInstallments, style: Theme.of(context).textTheme.titleSmall),
    const SizedBox(height: SmartSpendSpacing.sm),
    for (final (index, item) in _items.indexed) ...[
      Row(
        children: [
          Expanded(
            child: _dayField(
              l10n.cmItemDay(index + 1),
              value: item.day,
              key: 'item-day-$index',
              onPick: (day) => setState(() => item.day = day),
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: _field(
              item.amount,
              l10n.cmItemAmount,
              money: true,
              key: 'item-amount-$index',
            ),
          ),
        ],
      ),
      const SizedBox(height: SmartSpendSpacing.sm),
    ],
    if (_items.length < 6)
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: TextButton.icon(
          icon: const Icon(Icons.add_rounded),
          label: Text(l10n.cmAddItem),
          onPressed: () => setState(() => _items.add(_ItemFields())),
        ),
      ),
  ];

  List<Widget> _debtFields(AppLocalizations l10n) => [
    SegmentedButton<bool>(
      segments: [
        ButtonSegment(value: false, label: Text(l10n.cmIOwe)),
        ButtonSegment(value: true, label: Text(l10n.cmOwedToMe)),
      ],
      selected: {_owedToMe},
      onSelectionChanged: (value) => setState(() => _owedToMe = value.first),
    ),
    _gap(),
    _field(
      _person,
      l10n.cmPersonName,
      hint: l10n.cmPersonNameHint,
      key: 'field-person',
    ),
    _gap(),
    _field(
      _relation,
      l10n.cmRelation,
      hint: l10n.cmRelationHint,
      key: 'field-relation',
    ),
    _gap(),
    _field(_total, l10n.cmDebtTotal, money: true, key: 'field-total'),
    _gap(),
    Text(l10n.cmHowRepaid, style: Theme.of(context).textTheme.titleSmall),
    const SizedBox(height: SmartSpendSpacing.sm),
    Wrap(
      spacing: SmartSpendSpacing.sm,
      children: [
        for (final (value, label) in [
          ('flexible', l10n.cmRepayFlexible),
          ('once', l10n.cmRepayOnce),
          ('installments', l10n.cmRepayInstallments),
        ])
          ChoiceChip(
            label: Text(label),
            selected: _repayment == value,
            onSelected: (_) => setState(() => _repayment = value),
          ),
      ],
    ),
    if (_repayment != 'flexible') ...[
      _gap(),
      _dayField(
        _repayment == 'once' ? l10n.cmRepayDay : l10n.cmFirstInstallmentDay,
        value: _day,
        onPick: (day) => setState(() => _day = day),
      ),
    ],
    if (_repayment == 'installments') ...[
      _gap(),
      Row(
        children: [
          Expanded(
            child: _field(
              _amount,
              l10n.cmInstallmentAmount,
              money: true,
              key: 'field-amount',
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: _field(
              _count,
              l10n.cmHowManyTimes,
              number: true,
              key: 'field-count',
            ),
          ),
        ],
      ),
    ],
  ];

  List<Widget> _gam3eyaFields(AppLocalizations l10n) => [
    _field(
      _title,
      l10n.cmGam3eyaName,
      hint: l10n.cmGam3eyaNameHint,
      key: 'field-title',
    ),
    _gap(),
    _field(_amount, l10n.cmMonthlyShare, money: true, key: 'field-amount'),
    _gap(),
    Row(
      children: [
        Expanded(
          child: _field(
            _count,
            l10n.cmMonthsCount,
            number: true,
            key: 'field-count',
          ),
        ),
        const SizedBox(width: SmartSpendSpacing.sm),
        Expanded(
          child: _field(_turn, l10n.cmMyTurn, number: true, key: 'field-turn'),
        ),
      ],
    ),
    _gap(),
    _dayField(
      l10n.cmFirstPaymentDay,
      value: _day,
      onPick: (day) => setState(() => _day = day),
    ),
  ];

  List<Widget> _recurringFields(AppLocalizations l10n) {
    final brand = widget.brand;
    return [
      if (brand != null) ...[
        Row(
          children: [
            LogoBadge(
              label: brand.name,
              color: brandColorOf(
                brand.slug,
                brand.brandColor,
                context.smartSpendColors.accent,
              ),
              imageUrl: resolveLogoUrl(ref, brand.logoUrl),
              size: 48,
            ),
            const SizedBox(width: SmartSpendSpacing.md),
            Expanded(
              child: Text(
                inlineName(brand.name),
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
          ],
        ),
        _gap(),
      ] else if (_type != CommitmentType.rent) ...[
        _field(
          _title,
          switch (_type) {
            CommitmentType.subscription => l10n.cmSubscriptionName,
            CommitmentType.bill => l10n.cmBillWhat,
            CommitmentType.card => l10n.cmCardBank,
            CommitmentType.lessons => l10n.cmLessonsWhat,
            CommitmentType.income => l10n.cmIncomeWhat,
            _ => l10n.cmOtherWhat,
          },
          hint: switch (_type) {
            CommitmentType.bill => l10n.cmBillWhatHint,
            CommitmentType.card => l10n.cmCardBankHint,
            CommitmentType.lessons => l10n.cmLessonsWhatHint,
            CommitmentType.income => l10n.cmIncomeWhatHint,
            _ => null,
          },
          key: 'field-title',
        ),
        _gap(),
      ],
      if (_type == CommitmentType.lessons) ...[
        _field(
          _person,
          l10n.cmChildName,
          hint: l10n.cmChildNameHint,
          key: 'field-person',
        ),
        _gap(),
      ],
      if (_type == CommitmentType.bill || _type == CommitmentType.card)
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _varies,
          onChanged: (value) => setState(() => _varies = value),
          title: Text(l10n.cmAmountVariesSwitch),
        ),
      if (!_varies) ...[
        _field(
          _amount,
          _type == CommitmentType.income ? l10n.cmIncomeAmount : l10n.cmAmount,
          money: true,
          key: 'field-amount',
        ),
        _gap(),
      ],
      _dayField(
        _type == CommitmentType.income ? l10n.cmNextIncomeDay : l10n.cmNextDay,
        value: _day,
        onPick: (day) => setState(() => _day = day),
      ),
      if (_type == CommitmentType.subscription ||
          _type == CommitmentType.other) ...[
        _gap(),
        Wrap(
          spacing: SmartSpendSpacing.sm,
          children: [
            for (final (value, label) in [
              if (_type == CommitmentType.other) ('once', l10n.cmOnce),
              ('monthly', l10n.cmMonthly),
              ('yearly', l10n.cmYearly),
            ])
              ChoiceChip(
                label: Text(label),
                selected: _recurrence == value,
                onSelected: (_) => setState(() => _recurrence = value),
              ),
          ],
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final defaults = ref.watch(commitmentDefaultsProvider).value;
    final remind = _remindDays ?? defaults?.days ?? 3;
    return ListView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      children: [
        ...switch (_type) {
          CommitmentType.installment ||
          CommitmentType.loan ||
          CommitmentType.property => _fixedFields(l10n),
          CommitmentType.school => _schoolFields(l10n),
          CommitmentType.debt => _debtFields(l10n),
          CommitmentType.gam3eya => _gam3eyaFields(l10n),
          _ => _recurringFields(l10n),
        },
        const SizedBox(height: SmartSpendSpacing.lg),
        Text(l10n.cmRemindBefore, style: textTheme.titleSmall),
        const SizedBox(height: SmartSpendSpacing.sm),
        Wrap(
          spacing: SmartSpendSpacing.sm,
          runSpacing: SmartSpendSpacing.sm,
          children: [
            for (final days in reminderDayChoices)
              ChoiceChip(
                label: Text(
                  days == 0 ? l10n.cmOnTheDay : l10n.cmDaysBefore(days),
                ),
                selected: remind == days,
                onSelected: (_) => setState(() => _remindDays = days),
              ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.lg),
        if (_error != null) ...[
          InlineMessage(_error!, tone: MessageTone.warning),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
        SmartSpendButton(
          key: const ValueKey('commitment-save'),
          label: l10n.cmSave,
          busy: _busy,
          onPressed: _busy ? null : _save,
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        Text(l10n.cmAfterSaveHint, style: textTheme.bodySmall),
      ],
    );
  }
}
