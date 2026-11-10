import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../contacts/contacts_providers.dart';
import 'add_commitment_screen.dart';
import 'commitment_api.dart';
import 'commitment_detail_screen.dart';
import 'commitment_models.dart';
import 'commitment_ui.dart';
import 'subscription_brands.dart';

/// Who finances purchases in installments in Egypt: offered as one tap, written as the commitment's provider.
const installmentProviders = [
  'valU',
  'Contact',
  'Souhoola',
  'aman',
  'halan',
  'Sympl',
  'Premium',
];

/// Egypt's largest banks, for a loan or a credit card.
const bankNames = [
  'NBE',
  'Banque Misr',
  'CIB',
  'QNB',
  'Banque du Caire',
  'HSBC',
  'ADIB',
  'AAIB',
];

/// One extra dated amount: a school installment, a flat's handover payment.
class _Item {
  _Item(this.label);

  final TextEditingController label;
  final amount = TextEditingController();
  String? day;

  void dispose() {
    label.dispose();
    amount.dispose();
  }
}

/// A choice offered as chips, with its label.
typedef _Choice<T> = (T value, String label);

/// The fields of one type, each designed for what that type really is (decision 0051): a subscription's renewal and
/// how it is charged, an installment's financing company and what is left, a flat's quarterly instalments and its
/// one-off payments, a school's dated fees, a debt's person, a gam3eya's turn. Sent as `commitments.create` takes them.
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
  final _totalCount = TextEditingController();
  final _person = TextEditingController();
  final _relation = TextEditingController();
  final _total = TextEditingController();
  final _paid = TextEditingController();
  final _turn = TextEditingController();
  final _items = <_Item>[];
  final _extras = <_Item>[];
  String? _day;
  String? _endDay;

  /// How often, in months (1, 3, 6, 12), or 0 for weekly.
  int _every = 1;
  bool _once = false;
  bool _varies = false;
  bool _university = false;
  bool _owedToMe = false;
  bool _incoming = false;
  bool _trial = false;
  bool _auto = false;
  int? _contactId;
  String? _subKind;
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
      _every = brand.cycle == 'yearly'
          ? 12
          : brand.cycle == 'quarterly'
          ? 3
          : 1;
    }
    switch (_type) {
      case CommitmentType.subscription:
        _auto = true;
      case CommitmentType.loan:
        _auto = true;
      case CommitmentType.card:
        _varies = true;
      case CommitmentType.school:
        for (var index = 0; index < 2; index++) {
          _items.add(_Item(TextEditingController()));
        }
      default:
    }
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _provider,
      _amount,
      _count,
      _totalCount,
      _person,
      _relation,
      _total,
      _paid,
      _turn,
    ]) {
      controller.dispose();
    }
    for (final item in [..._items, ..._extras]) {
      item.dispose();
    }
    super.dispose();
  }

  // ─── Reading the fields ───

  num? _money(TextEditingController controller) => parseAmount(controller.text);

  int? _int(TextEditingController controller) =>
      int.tryParse(controller.text.trim());

  String? _text(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  /// The reminder this type starts with, when the person did not choose: a day before an automatic charge, two days
  /// before a free trial ends (time to cancel), a week before a flat's or a school's large amount, on the day for
  /// income; otherwise the admin's default.
  int? get _suggestedDays => switch (_type) {
    CommitmentType.subscription => _trial ? 2 : (_auto ? 1 : null),
    CommitmentType.property || CommitmentType.school => 7,
    CommitmentType.lessons => 1,
    CommitmentType.income => 0,
    _ => null,
  };

  Map<String, Object?> get _recurrence => _every == 0
      ? {'recurrence': 'weekly'}
      : _every == 12
      ? {'recurrence': 'yearly'}
      : {'recurrence': 'monthly', 'intervalCount': _every};

  /// The fields of the type, or what is missing in the person's words.
  (List<Map<String, Object?>>?, String?) _fields(AppLocalizations l10n) {
    final amount = _money(_amount);
    final title = _text(_title);
    final days = _remindDays ?? _suggestedDays;
    final reminder = <String, Object?>{'remindDaysBefore': ?days};
    String? need(bool missing, String message) => missing ? message : null;
    switch (_type) {
      case CommitmentType.subscription:
        final problem =
            need(title == null, l10n.cmNeedTitle) ??
            need(amount == null || amount <= 0, l10n.cmNeedAmount) ??
            need(_day == null, l10n.cmNeedDay);
        if (problem != null) return (null, problem);
        return (
          [
            {
              'shape': 'recurring',
              'kind': 'subscription',
              'title': title,
              'catalogSlug': ?widget.brand?.slug,
              'amount': amount,
              ..._recurrence,
              'startDay': _day,
              'paymentMethod': _auto ? 'card' : 'cash',
              ...reminder,
            },
          ],
          null,
        );
      case CommitmentType.installment ||
          CommitmentType.loan ||
          CommitmentType.property:
        final count = _int(_count);
        final all = _int(_totalCount);
        final problem =
            need(
              _type != CommitmentType.loan && title == null,
              l10n.cmNeedTitle,
            ) ??
            need(amount == null || amount <= 0, l10n.cmNeedAmount) ??
            need(count == null || count < 1, l10n.cmNeedCount) ??
            need(
              all != null && count != null && all < count,
              l10n.cfNeedTotalCount,
            ) ??
            need(_day == null, l10n.cmNeedDay) ??
            _extrasProblem(l10n);
        if (problem != null) return (null, problem);
        final provider = _text(_provider);
        final name = title ?? l10n.cfLoanTitle(provider ?? l10n.cmKindLoan);
        return (
          [
            {
              'shape': 'fixed',
              'kind': _type.kind,
              'title': name,
              'provider': provider,
              'amount': amount,
              'recurrence': 'monthly',
              'intervalCount': _type == CommitmentType.property ? _every : 1,
              'startDay': _day,
              'remainingCount': count,
              'occurrenceCount': ?all,
              'paymentMethod': _auto ? 'auto_debit' : null,
              ...reminder,
            },
            if (_extras.isNotEmpty)
              {
                'shape': 'schedule',
                'kind': _type.kind,
                'title': l10n.cfExtrasTitle(name),
                'provider': provider,
                'items': [
                  for (final item in _extras)
                    {
                      'dueDay': item.day,
                      'amount': _money(item.amount),
                      'label': _text(item.label),
                    },
                ],
                ...reminder,
              },
          ],
          null,
        );
      case CommitmentType.school:
        final items = [
          for (final (index, item) in _items.indexed)
            if (item.day != null && (_money(item.amount) ?? 0) > 0)
              {
                'dueDay': item.day,
                'amount': _money(item.amount),
                'label': _text(item.label) ?? l10n.cfNthInstallment(index + 1),
              },
        ];
        final paid = _money(_paid);
        final sum = items.fold<num>(
          0,
          (total, item) => total + (item['amount']! as num),
        );
        final problem =
            need(title == null, l10n.cmNeedSchool) ??
            need(items.isEmpty, l10n.cmNeedItems) ??
            need(paid != null && paid > sum, l10n.cfNeedPaidBelowTotal);
        if (problem != null) return (null, problem);
        final child = _text(_person);
        return (
          [
            {
              'shape': 'schedule',
              'kind': _university ? 'university' : 'school',
              'title': child == null
                  ? title
                  : l10n.cmSchoolTitle(title!, child),
              'provider': title,
              'beneficiaryName': child,
              'beneficiaryRelation': _text(_relation),
              'items': items,
              'paidSoFar': ?(paid != null && paid > 0 ? paid : null),
              ...reminder,
            },
          ],
          null,
        );
      case CommitmentType.debt:
        final total = _money(_total);
        final paid = _money(_paid);
        final person = _text(_person);
        final problem =
            need(person == null && _contactId == null, l10n.cmNeedPerson) ??
            need(total == null || total <= 0, l10n.cmNeedAmount) ??
            need(
              paid != null && total != null && paid >= total,
              l10n.cfNeedPaidBelowTotal,
            ) ??
            need(_repayment != 'flexible' && _day == null, l10n.cmNeedDay) ??
            need(
              _repayment == 'installments' &&
                  ((amount ?? 0) <= 0 || (_int(_count) ?? 0) < 1),
              l10n.cmNeedInstallments,
            );
        if (problem != null) return (null, problem);
        return (
          [
            {
              'shape': 'balance',
              'kind': 'debt',
              'direction': _owedToMe ? 'in' : 'out',
              'title': _owedToMe
                  ? l10n.cmDebtToMeTitle(person!)
                  : l10n.cmDebtOnMeTitle(person!),
              'contactId': ?_contactId,
              'contactName': _contactId == null ? person : null,
              'contactRelation': _text(_relation),
              'totalAmount': total,
              'paidSoFar': ?(paid != null && paid > 0 ? paid : null),
              'repayment': _repayment,
              if (_repayment != 'flexible') 'startDay': _day,
              if (_repayment == 'installments') 'amount': amount,
              if (_repayment == 'installments') 'occurrenceCount': _int(_count),
              ...reminder,
            },
          ],
          null,
        );
      case CommitmentType.gam3eya:
        final months = _int(_count);
        final turn = _int(_turn);
        final problem =
            need(amount == null || amount <= 0, l10n.cmNeedAmount) ??
            need(
              months == null || months < 2 || months > 60,
              l10n.cmNeedMonths,
            ) ??
            need(turn == null || turn < 1 || turn > months!, l10n.cmNeedTurn) ??
            need(_day == null, l10n.cmNeedDay);
        if (problem != null) return (null, problem);
        return (
          [
            {
              'shape': 'gam3eya',
              'kind': 'gam3eya',
              'title': title ?? l10n.cmKindGam3eya,
              'contactName': _text(_person),
              'amount': amount,
              'occurrenceCount': months,
              'gam3eyaTurn': turn,
              'startDay': _day,
              ...reminder,
            },
          ],
          null,
        );
      default:
        final named = switch (_type) {
          CommitmentType.rent => title ?? l10n.cmKindRent,
          CommitmentType.card => title == null ? null : l10n.cmCardTitle(title),
          CommitmentType.lessons when _text(_person) != null =>
            l10n.cmLessonsTitle(title ?? l10n.cmKindLessons, _text(_person)!),
          _ => title,
        };
        final problem =
            need(
              named == null,
              _type == CommitmentType.card ? l10n.cfNeedBank : l10n.cmNeedTitle,
            ) ??
            need(
              !_varies && (amount == null || amount <= 0),
              l10n.cmNeedAmount,
            ) ??
            need(_day == null, l10n.cmNeedDay) ??
            need(
              _endDay != null && _day != null && _endDay!.compareTo(_day!) < 0,
              l10n.cfNeedEndAfterStart,
            );
        if (problem != null) return (null, problem);
        final income =
            _type == CommitmentType.income ||
            (_type == CommitmentType.other && _incoming);
        return (
          [
            {
              'shape': 'recurring',
              'kind': switch (_type) {
                CommitmentType.income =>
                  _subKind == 'freelance' ? 'freelance' : 'salary',
                _ => _type.kind,
              },
              'title': named,
              'provider': _type == CommitmentType.card ? title : null,
              'contactName': _type == CommitmentType.rent
                  ? _text(_person)
                  : null,
              'beneficiaryName': _type == CommitmentType.lessons
                  ? _text(_person)
                  : null,
              'direction': income ? 'in' : 'out',
              // An approximate amount with «بيتغير»: kept as the estimate the plans count on.
              'amount': amount != null && amount > 0 ? amount : null,
              'amountVaries': _varies,
              ...(_once ? {'recurrence': 'once'} : _recurrence),
              'startDay': _day,
              'endDay': ?_endDay,
              if (_type == CommitmentType.bill || _type == CommitmentType.card)
                'paymentMethod': _auto ? 'auto_debit' : null,
              ...reminder,
            },
          ],
          null,
        );
    }
  }

  String? _extrasProblem(AppLocalizations l10n) {
    for (final item in _extras) {
      if (item.day == null || (_money(item.amount) ?? 0) <= 0) {
        return l10n.cfNeedExtras;
      }
    }
    return null;
  }

  /// A commitment the person already has under the same service or name: asked before adding a second one.
  Commitment? _existing(Map<String, Object?> fields) {
    final items =
        ref.read(commitmentsOverviewProvider).value?.items ??
        const <Commitment>[];
    final slug = fields['catalogSlug'];
    final title = (fields['title'] as String?)?.trim();
    for (final item in items) {
      if (item.status == 'ended') continue;
      if (slug != null && item.catalog?.slug == slug) return item;
      if (title != null &&
          item.title.trim() == title &&
          item.kind == fields['kind']) {
        return item;
      }
    }
    return null;
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final (list, problem) = _fields(l10n);
    if (list == null) {
      setState(() => _error = problem);
      return;
    }
    final existing = _existing(list.first);
    if (existing != null) {
      final again = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text(l10n.cfDuplicateTitle),
          content: Text(l10n.cfDuplicateBody(existing.title)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: Text(l10n.cfOpenIt),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: Text(l10n.cfAddAnyway),
            ),
          ],
        ),
      );
      if (!mounted) return;
      if (again != true) {
        if (again == false) {
          context.pushReplacement(CommitmentDetailScreen.pathOf(existing.id));
        }
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(commitmentApiProvider);
      final id = await api.create(list.first);
      for (final more in list.skip(1)) {
        await api.create(more);
      }
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

  // ─── Building blocks ───

  Widget _gap() => const SizedBox(height: SmartSpendSpacing.md);

  Widget _field(
    TextEditingController controller,
    String label, {
    String? hint,
    bool number = false,
    bool money = false,
    String key = '',
    String? helper,
  }) => TextField(
    key: key.isEmpty ? null : ValueKey(key),
    controller: controller,
    onChanged: (_) => setState(() {}),
    keyboardType: number || money
        ? const TextInputType.numberWithOptions(decimal: true)
        : TextInputType.text,
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      helperText: helper,
      suffixText: money ? MoneyLocale.of(context).symbol : null,
    ),
  );

  Widget _dayField(
    String label, {
    String? value,
    required ValueChanged<String> onPick,
    String key = 'field-day',
    String? helper,
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
          helperText: helper,
          suffixIcon: const Icon(Icons.event_outlined),
        ),
        child: Text(
          value == null ? l10n.cmPickDay : commitmentDayLabel(context, value),
        ),
      ),
    );
  }

  Widget _chips<T>(
    String? label,
    List<_Choice<T>> choices,
    T selected,
    ValueChanged<T> onPick,
  ) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (label != null) ...[
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: SmartSpendSpacing.sm),
      ],
      Wrap(
        spacing: SmartSpendSpacing.sm,
        runSpacing: SmartSpendSpacing.sm,
        children: [
          for (final (value, text) in choices)
            ChoiceChip(
              label: Text(text),
              selected: selected == value,
              onSelected: (_) => setState(() => onPick(value)),
            ),
        ],
      ),
    ],
  );

  /// Tapping a suggestion writes it in the field, which stays editable for anything not listed.
  Widget _suggest(TextEditingController controller, List<String> names) => Wrap(
    spacing: SmartSpendSpacing.sm,
    runSpacing: SmartSpendSpacing.xs,
    children: [
      for (final name in names)
        ActionChip(
          label: Text(inlineName(name)),
          onPressed: () => setState(() => controller.text = name),
        ),
    ],
  );

  Widget _switch(
    String title,
    bool value,
    ValueChanged<bool> onChanged, {
    String? subtitle,
  }) => SwitchListTile.adaptive(
    contentPadding: EdgeInsets.zero,
    value: value,
    onChanged: (next) => setState(() => onChanged(next)),
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle),
  );

  Widget _summary(String text) => Padding(
    padding: const EdgeInsets.only(top: SmartSpendSpacing.md),
    child: InlineMessage(text, tone: MessageTone.info),
  );

  List<_Choice<int>> _everyChoices(AppLocalizations l10n, List<int> months) => [
    for (final value in months)
      (
        value,
        switch (value) {
          0 => l10n.cmWeekly,
          1 => l10n.cmMonthly,
          12 => l10n.cmYearly,
          _ => l10n.cmEveryMonths(value),
        },
      ),
  ];

  Widget _itemRows(
    List<_Item> list,
    AppLocalizations l10n,
    String keyPrefix, {
    required bool labelled,
  }) => Column(
    children: [
      for (final (index, item) in list.indexed) ...[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 5,
              child: Column(
                children: [
                  if (labelled) ...[
                    TextField(
                      key: ValueKey('$keyPrefix-label-$index'),
                      controller: item.label,
                      decoration: InputDecoration(
                        labelText: l10n.cfItemLabel,
                        hintText: keyPrefix == 'item'
                            ? l10n.cfNthInstallment(index + 1)
                            : l10n.cfExtraHint,
                      ),
                    ),
                    const SizedBox(height: SmartSpendSpacing.xs),
                  ],
                  _dayField(
                    l10n.cmItemDay(index + 1),
                    value: item.day,
                    key: '$keyPrefix-day-$index',
                    onPick: (day) => setState(() => item.day = day),
                  ),
                ],
              ),
            ),
            const SizedBox(width: SmartSpendSpacing.sm),
            Expanded(
              flex: 4,
              child: _field(
                item.amount,
                l10n.cmItemAmount,
                money: true,
                key: '$keyPrefix-amount-$index',
              ),
            ),
            IconButton(
              tooltip: l10n.cfRemove,
              icon: const Icon(Icons.close_rounded),
              onPressed: () => setState(() => list.removeAt(index).dispose()),
            ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
      ],
    ],
  );

  // ─── Each type ───

  List<Widget> _subscription(AppLocalizations l10n) {
    final brand = widget.brand;
    final amount = _money(_amount);
    final yearly = amount == null || amount <= 0
        ? null
        : amount * (_every == 12 ? 1 : 12 / _every);
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
              size: 56,
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
      ] else
        _field(
          _title,
          l10n.cmSubscriptionName,
          hint: l10n.cfSubscriptionNameHint,
          key: 'field-title',
        ),
      _gap(),
      _field(_amount, l10n.cfPrice, money: true, key: 'field-amount'),
      _gap(),
      _chips(
        l10n.cfRenews,
        _everyChoices(l10n, const [1, 3, 12]),
        _every,
        (value) => _every = value,
      ),
      _gap(),
      _switch(
        l10n.cfTrial,
        _trial,
        (value) => _trial = value,
        subtitle: _trial ? l10n.cfTrialHint : null,
      ),
      _dayField(
        _trial ? l10n.cfTrialEnds : l10n.cfNextCharge,
        value: _day,
        onPick: (day) => setState(() => _day = day),
      ),
      _gap(),
      _chips(
        l10n.cfHowPaid,
        [(true, l10n.cfPaidByCard), (false, l10n.cfPaidByHand)],
        _auto,
        (value) => _auto = value,
      ),
      if (yearly != null)
        _summary(l10n.cfYearlyCost(moneyText(context, yearly))),
    ];
  }

  List<Widget> _installment(AppLocalizations l10n) {
    final amount = _money(_amount);
    final count = _int(_count);
    final loan = _type == CommitmentType.loan;
    final property = _type == CommitmentType.property;
    return [
      if (!loan) ...[
        _field(
          _title,
          property ? l10n.cmPropertyWhat : l10n.cfBoughtWhat,
          hint: property ? l10n.cmPropertyWhatHint : l10n.cmInstallmentWhatHint,
          key: 'field-title',
        ),
        _gap(),
      ],
      _field(
        _provider,
        loan
            ? l10n.cfWhichBank
            : property
            ? l10n.cfDeveloper
            : l10n.cfFinancedBy,
        hint: property ? l10n.cfDeveloperHint : null,
        key: 'field-provider',
      ),
      if (!property) ...[
        const SizedBox(height: SmartSpendSpacing.sm),
        _suggest(
          _provider,
          loan
              ? bankNames
              : [...installmentProviders, l10n.cfTheShop, l10n.cfBankCard],
        ),
      ],
      if (loan) ...[
        _gap(),
        _field(
          _title,
          l10n.cfLoanFor,
          hint: l10n.cmLoanWhatHint,
          key: 'field-title',
        ),
      ],
      _gap(),
      _field(
        _amount,
        property ? l10n.cmInstallmentAmount : l10n.cfMonthlyInstallment,
        money: true,
        key: 'field-amount',
      ),
      if (property) ...[
        _gap(),
        _chips(
          l10n.cfPaidEvery,
          _everyChoices(l10n, const [1, 3, 6, 12]),
          _every,
          (value) => _every = value,
        ),
      ],
      _gap(),
      Row(
        children: [
          Expanded(
            child: _field(
              _count,
              l10n.cfLeftCount,
              number: true,
              key: 'field-count',
              helper: l10n.cfLeftCountHelp,
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: _field(
              _totalCount,
              l10n.cfAllCount,
              number: true,
              key: 'field-total-count',
              helper: l10n.cfOptional,
            ),
          ),
        ],
      ),
      _gap(),
      _dayField(
        l10n.cmNextDay,
        value: _day,
        onPick: (day) => setState(() => _day = day),
      ),
      if (!property)
        _switch(
          loan ? l10n.cfAutoFromAccount : l10n.cfAutoFromCard,
          _auto,
          (value) => _auto = value,
        ),
      if (property) ...[
        _gap(),
        Text(l10n.cfExtras, style: Theme.of(context).textTheme.titleSmall),
        Text(l10n.cfExtrasHint, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: SmartSpendSpacing.sm),
        _itemRows(_extras, l10n, 'extra', labelled: true),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.cfAddExtra),
            onPressed: () =>
                setState(() => _extras.add(_Item(TextEditingController()))),
          ),
        ),
      ],
      if (amount != null && amount > 0 && count != null && count > 0)
        _summary(
          l10n.cfLeftTotal(
            '$count',
            moneyText(context, amount),
            moneyText(context, amount * count),
          ),
        ),
    ];
  }

  List<Widget> _school(AppLocalizations l10n) {
    final sum = _items.fold<num>(
      0,
      (total, item) => total + (_money(item.amount) ?? 0),
    );
    final paid = _money(_paid) ?? 0;
    return [
      _chips(
        null,
        [(false, l10n.cmKindSchool), (true, l10n.cmKindUniversity)],
        _university,
        (value) => _university = value,
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
      const SizedBox(height: SmartSpendSpacing.sm),
      _suggest(_relation, [
        l10n.cfSon,
        l10n.cfDaughter,
        l10n.cfBrother,
        l10n.cfSister,
        l10n.cfMe,
      ]),
      _gap(),
      Text(
        l10n.cmFeeInstallments,
        style: Theme.of(context).textTheme.titleSmall,
      ),
      Text(l10n.cfFeeHint, style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: SmartSpendSpacing.sm),
      _itemRows(_items, l10n, 'item', labelled: true),
      if (_items.length < 8)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.cmAddItem),
            onPressed: () =>
                setState(() => _items.add(_Item(TextEditingController()))),
          ),
        ),
      _field(_paid, l10n.cfPaidSoFar, money: true, key: 'field-paid'),
      if (sum > 0)
        _summary(
          l10n.cfFeesTotal(
            moneyText(context, sum),
            moneyText(context, sum - paid),
          ),
        ),
    ];
  }

  List<Widget> _debt(AppLocalizations l10n) {
    final people = ref.watch(peopleDebtsDataProvider).value;
    final known = [
      ...?people?.activeDebts,
      ...?people?.settledContacts,
    ].where((person) => person.contactId != null).take(8).toList();
    return [
      _chips(
        null,
        [(false, l10n.cmIOwe), (true, l10n.cmOwedToMe)],
        _owedToMe,
        (value) => _owedToMe = value,
      ),
      _gap(),
      if (known.isNotEmpty) ...[
        Wrap(
          spacing: SmartSpendSpacing.sm,
          runSpacing: SmartSpendSpacing.xs,
          children: [
            for (final person in known)
              ChoiceChip(
                label: Text(person.name),
                selected: _contactId == person.contactId,
                onSelected: (_) => setState(() {
                  _contactId = person.contactId;
                  _person.text = person.name;
                  _relation.text = person.relation ?? '';
                }),
              ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
      ],
      TextField(
        key: const ValueKey('field-person'),
        controller: _person,
        onChanged: (_) => setState(() => _contactId = null),
        decoration: InputDecoration(
          labelText: l10n.cmPersonName,
          hintText: l10n.cmPersonNameHint,
        ),
      ),
      if (_contactId == null) ...[
        const SizedBox(height: SmartSpendSpacing.sm),
        _field(
          _relation,
          l10n.cmRelation,
          hint: l10n.cmRelationHint,
          key: 'field-relation',
        ),
      ],
      _gap(),
      Row(
        children: [
          Expanded(
            child: _field(
              _total,
              l10n.cmDebtTotal,
              money: true,
              key: 'field-total',
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: _field(
              _paid,
              l10n.cfRepaidSoFar,
              money: true,
              key: 'field-paid',
              helper: l10n.cfOptional,
            ),
          ),
        ],
      ),
      _gap(),
      _chips(
        l10n.cmHowRepaid,
        [
          ('flexible', l10n.cmRepayFlexible),
          ('once', l10n.cmRepayOnce),
          ('installments', l10n.cmRepayInstallments),
        ],
        _repayment,
        (value) => _repayment = value,
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
      if (_repayment == 'flexible')
        _summary(_owedToMe ? l10n.cfFlexibleToMeHint : l10n.cfFlexibleOnMeHint),
    ];
  }

  List<Widget> _gam3eya(AppLocalizations l10n) {
    final amount = _money(_amount);
    final months = _int(_count);
    final turn = _int(_turn);
    return [
      _field(
        _title,
        l10n.cmGam3eyaName,
        hint: l10n.cmGam3eyaNameHint,
        key: 'field-title',
      ),
      _gap(),
      _field(
        _person,
        l10n.cfGam3eyaHolder,
        hint: l10n.cfGam3eyaHolderHint,
        key: 'field-person',
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
            child: _field(
              _turn,
              l10n.cmMyTurn,
              number: true,
              key: 'field-turn',
            ),
          ),
        ],
      ),
      _gap(),
      _dayField(
        l10n.cmFirstPaymentDay,
        value: _day,
        onPick: (day) => setState(() => _day = day),
      ),
      if (amount != null &&
          amount > 0 &&
          months != null &&
          months > 1 &&
          turn != null &&
          turn >= 1 &&
          turn <= months)
        _summary(
          l10n.cfGam3eyaSummary(
            moneyText(context, amount * months),
            '$turn',
            '$months',
          ),
        ),
    ];
  }

  List<Widget> _recurring(AppLocalizations l10n) {
    final bill = _type == CommitmentType.bill;
    final card = _type == CommitmentType.card;
    final income = _type == CommitmentType.income;
    final other = _type == CommitmentType.other;
    final amount = _money(_amount);
    return [
      if (bill) ...[
        _chips<String?>(
          l10n.cfWhichBill,
          [
            ('electricity', l10n.cfElectricity),
            ('water', l10n.cfWater),
            ('gas', l10n.cfGas),
            ('internet', l10n.cfInternet),
            ('mobile', l10n.cfMobile),
            ('landline', l10n.cfLandline),
          ],
          _subKind,
          (value) {
            _subKind = value;
            _title.text = switch (value) {
              'electricity' => l10n.cfElectricity,
              'water' => l10n.cfWater,
              'gas' => l10n.cfGas,
              'internet' => l10n.cfInternet,
              'mobile' => l10n.cfMobile,
              _ => l10n.cfLandline,
            };
            // Electricity, water, gas and a phone bill change every month; home internet usually does not.
            _varies = value != 'internet';
          },
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        _field(
          _title,
          l10n.cmBillWhat,
          hint: l10n.cmBillWhatHint,
          key: 'field-title',
        ),
      ] else if (income) ...[
        _chips<String?>(
          null,
          [
            ('salary', l10n.cfSalary),
            ('freelance', l10n.cfFreelance),
            ('rent_in', l10n.cfRentIn),
            ('pension', l10n.cfPension),
          ],
          _subKind,
          (value) {
            _subKind = value;
            _title.text = switch (value) {
              'salary' => l10n.cfSalary,
              'freelance' => l10n.cfFreelance,
              'rent_in' => l10n.cfRentIn,
              _ => l10n.cfPension,
            };
            _varies = value == 'freelance';
          },
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        _field(
          _title,
          l10n.cmIncomeWhat,
          hint: l10n.cmIncomeWhatHint,
          key: 'field-title',
        ),
      ] else if (card) ...[
        _field(
          _title,
          l10n.cmCardBank,
          hint: l10n.cmCardBankHint,
          key: 'field-title',
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        _suggest(_title, bankNames),
      ] else if (_type == CommitmentType.rent) ...[
        _field(
          _title,
          l10n.cfRentOf,
          hint: l10n.cfRentOfHint,
          key: 'field-title',
        ),
        _gap(),
        _field(_person, l10n.cfLandlord, key: 'field-person'),
      ] else if (_type == CommitmentType.lessons) ...[
        _field(
          _title,
          l10n.cmLessonsWhat,
          hint: l10n.cmLessonsWhatHint,
          key: 'field-title',
        ),
        _gap(),
        _field(
          _person,
          l10n.cmChildName,
          hint: l10n.cmChildNameHint,
          key: 'field-person',
        ),
      ] else ...[
        _field(_title, l10n.cmOtherWhat, key: 'field-title'),
        _gap(),
        _chips(
          null,
          [(false, l10n.cfMoneyOut), (true, l10n.cfMoneyIn)],
          _incoming,
          (value) => _incoming = value,
        ),
      ],
      _gap(),
      if (bill || card || income || other)
        _switch(
          card ? l10n.cfCardVaries : l10n.cmAmountVariesSwitch,
          _varies,
          (value) => _varies = value,
        ),
      _field(
        _amount,
        _varies
            ? (card ? l10n.cfUsualCardAmount : l10n.cfAboutHowMuch)
            : income
            ? l10n.cmIncomeAmount
            : l10n.cmAmount,
        money: true,
        key: 'field-amount',
      ),
      _gap(),
      _dayField(
        income
            ? l10n.cmNextIncomeDay
            : card
            ? l10n.cfCardDueDay
            : l10n.cmNextDay,
        value: _day,
        onPick: (day) => setState(() => _day = day),
        helper: card ? l10n.cfCardDueHint : null,
      ),
      if (!card) ...[
        _gap(),
        if (other)
          _chips<int>(
            l10n.cfRepeats,
            [
              (-1, l10n.cmOnce),
              ..._everyChoices(l10n, const [1, 3, 12]),
            ],
            _once ? -1 : _every,
            (value) {
              _once = value == -1;
              if (!_once) _every = value;
            },
          )
        else
          _chips(
            income ? l10n.cfReceivedEvery : l10n.cfPaidEvery,
            _everyChoices(l10n, switch (_type) {
              CommitmentType.bill => const [1, 2, 3],
              CommitmentType.rent => const [1, 3, 12],
              _ => const [0, 1],
            }),
            _every,
            (value) => _every = value,
          ),
      ],
      if (_type == CommitmentType.rent || _type == CommitmentType.lessons) ...[
        _gap(),
        _dayField(
          _type == CommitmentType.rent
              ? l10n.cfContractEnds
              : l10n.cfLessonsEnd,
          value: _endDay,
          key: 'field-end-day',
          onPick: (day) => setState(() => _endDay = day),
        ),
      ],
      if (bill || card)
        _switch(l10n.cfAutoDebit, _auto, (value) => _auto = value),
      if (card) _summary(l10n.cfCardHint),
      if (!card &&
          !_once &&
          amount != null &&
          amount > 0 &&
          _every >= 1 &&
          !income)
        _summary(l10n.cfYearlyCost(moneyText(context, amount * (12 / _every)))),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final defaults = ref.watch(commitmentDefaultsProvider).value;
    final remind = _remindDays ?? _suggestedDays ?? defaults?.days ?? 3;
    return ListView(
      padding: const EdgeInsets.all(SmartSpendSpacing.screen),
      children: [
        ...switch (_type) {
          CommitmentType.subscription => _subscription(l10n),
          CommitmentType.installment ||
          CommitmentType.loan ||
          CommitmentType.property => _installment(l10n),
          CommitmentType.school => _school(l10n),
          CommitmentType.debt => _debt(l10n),
          CommitmentType.gam3eya => _gam3eya(l10n),
          _ => _recurring(l10n),
        },
        const SizedBox(height: SmartSpendSpacing.lg),
        DropdownButtonFormField<int>(
          key: const ValueKey('field-remind'),
          initialValue: remind,
          decoration: InputDecoration(
            labelText: _type == CommitmentType.income
                ? l10n.cfRemindIncome
                : l10n.cmRemindBefore,
          ),
          items: [
            for (final days in reminderDayChoices)
              DropdownMenuItem(
                value: days,
                child: Text(
                  days == 0 ? l10n.cmOnTheDay : l10n.cmDaysBefore(days),
                ),
              ),
          ],
          onChanged: (days) => setState(() => _remindDays = days),
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
