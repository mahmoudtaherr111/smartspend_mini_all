import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'add_contact_sheet.dart';
import 'contact_models.dart';
import 'contacts_providers.dart';
import 'delete_contact_dialog.dart';
import 'merge_contacts_sheet.dart';
import 'person_transactions_sheet.dart';

/// The People and Debts screen (`/more/contacts`, REC-19 / ACC-06).
/// Shows who owes the user and whom the user owes, allows managing contacts
/// (add, merge duplicates, delete), and inspecting each person's transactions.
class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  static const path = '/more/contacts';

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(
        () => _searchQuery = _searchController.text.trim().toLowerCase(),
      );
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _openAddSheet() {
    showSmartSpendSheet<bool>(
      context: context,
      builder: (_) => const AddContactSheet(),
    );
  }

  void _openPerson(ContactDebtItem item) {
    showSmartSpendSheet<void>(
      context: context,
      builder: (_) => PersonTransactionsSheet(
        name: item.name,
        contactId: item.contactId,
        relation: item.relation,
      ),
    );
  }

  void _openMerge(ContactDebtItem item) {
    if (item.contactId == null) return;
    showSmartSpendSheet<bool>(
      context: context,
      builder: (_) => MergeContactsSheet(currentContact: item),
    );
  }

  void _confirmDelete(ContactDebtItem item) {
    if (item.contactId == null) return;
    showDialog<bool>(
      context: context,
      builder: (_) => DeleteContactDialog(contact: item),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final dataAsync = ref.watch(peopleDebtsDataProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).aiPeopleAndDebts),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1_rounded),
            tooltip: AppLocalizations.of(context).aiAddAPerson,
            onPressed: _openAddSheet,
          ),
        ],
      ),
      body: switch (dataAsync) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () async => ref.refresh(peopleDebtsDataProvider.future),
          child: _buildContent(context, value, colors, textTheme),
        ),
        AsyncError() => Center(
          child: ErrorState(
            message: AppLocalizations.of(context).aiWeCanTLoadYour4,
            retryLabel: AppLocalizations.of(context).aiTryAgain,
            onRetry: () => ref.invalidate(peopleDebtsDataProvider),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _buildContent(
    BuildContext context,
    PeopleDebtsData data,
    SmartSpendColors colors,
    TextTheme textTheme,
  ) {
    final filterQuery = _searchQuery;
    final active = data.activeDebts.where((c) {
      if (filterQuery.isEmpty) return true;
      return c.name.toLowerCase().contains(filterQuery) ||
          (c.relation != null &&
              c.relation!.toLowerCase().contains(filterQuery));
    }).toList();

    final settled = data.settledContacts.where((c) {
      if (filterQuery.isEmpty) return true;
      return c.name.toLowerCase().contains(filterQuery) ||
          (c.relation != null &&
              c.relation!.toLowerCase().contains(filterQuery));
    }).toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        SmartSpendSpacing.md,
        SmartSpendSpacing.screen,
        SmartSpendSpacing.xxl,
      ),
      children: [
        // Hero summary card
        _HeroDebtsCard(
          totalOwedToYou: data.totalOwedToYou,
          totalYouOwe: data.totalYouOwe,
          netBalance: data.net,
        ),
        const SizedBox(height: SmartSpendSpacing.lg),

        // Search bar
        TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: AppLocalizations.of(context).aiSearchByNameOrRelation,
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded),
                    onPressed: () => _searchController.clear(),
                  )
                : null,
            filled: true,
            fillColor: colors.surfaceRaised,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.md,
              vertical: SmartSpendSpacing.sm,
            ),
          ),
        ),
        const SizedBox(height: SmartSpendSpacing.lg),

        // Active debts section
        _SectionHeader(
          title: AppLocalizations.of(context).aiOpenBalances,
          count: active.length,
          icon: Icons.sync_alt_rounded,
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        if (active.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.md),
            child: Text(
              _searchQuery.isNotEmpty
                  ? AppLocalizations.of(context).aiNoResults
                  : AppLocalizations.of(context).aiNoOpenDebtsAllSettled,
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          )
        else
          ...active.map(
            (item) => _PersonDebtCard(
              item: item,
              onTap: () => _openPerson(item),
              onMerge: item.contactId != null ? () => _openMerge(item) : null,
              onDelete: item.contactId != null
                  ? () => _confirmDelete(item)
                  : null,
            ),
          ),

        const SizedBox(height: SmartSpendSpacing.xl),

        // Settled accounts section
        _SectionHeader(
          title: AppLocalizations.of(context).aiSettled,
          count: settled.length,
          icon: Icons.check_circle_outline_rounded,
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        if (settled.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.md),
            child: Text(
              _searchQuery.isNotEmpty
                  ? AppLocalizations.of(context).aiNoResults2
                  : AppLocalizations.of(context).aiNoSettledAccountsYet,
              style: textTheme.bodyMedium?.copyWith(
                color: colors.mutedForeground,
              ),
            ),
          )
        else
          ...settled.map(
            (item) => _PersonDebtCard(
              item: item,
              onTap: () => _openPerson(item),
              onMerge: item.contactId != null ? () => _openMerge(item) : null,
              onDelete: item.contactId != null
                  ? () => _confirmDelete(item)
                  : null,
            ),
          ),
      ],
    );
  }
}

class _HeroDebtsCard extends StatelessWidget {
  const _HeroDebtsCard({
    required this.totalOwedToYou,
    required this.totalYouOwe,
    required this.netBalance,
  });

  final num totalOwedToYou;
  final num totalYouOwe;
  final num netBalance;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(SmartSpendRadii.lg),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            AppLocalizations.of(context).aiNetMoneyOut,
            style: textTheme.bodySmall?.copyWith(
              color: colors.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  formatMoney(netBalance),
                  style: textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              DebtBadge(balance: netBalance),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          const Divider(height: 1),
          const SizedBox(height: SmartSpendSpacing.md),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppLocalizations.of(context).aiOwedToYou,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '+ ${formatMoney(totalOwedToYou)}',
                      style: textTheme.titleMedium?.copyWith(
                        color: colors.accent,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Container(height: 36, width: 1, color: colors.border),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppLocalizations.of(context).aiYouOwe,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '- ${formatMoney(totalYouOwe)}',
                      style: textTheme.titleMedium?.copyWith(
                        color: colors.danger,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.count,
    required this.icon,
  });

  final String title;
  final int count;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Row(
      children: [
        Icon(icon, size: 20, color: colors.mutedForeground),
        const SizedBox(width: SmartSpendSpacing.xs + 2),
        Text(
          title,
          style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(width: SmartSpendSpacing.xs),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '$count',
            style: textTheme.bodySmall?.copyWith(
              color: colors.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _PersonDebtCard extends StatelessWidget {
  const _PersonDebtCard({
    required this.item,
    required this.onTap,
    this.onMerge,
    this.onDelete,
  });

  final ContactDebtItem item;
  final VoidCallback onTap;
  final VoidCallback? onMerge;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: SmartSpendSpacing.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: SmartSpendSpacing.md,
            vertical: SmartSpendSpacing.sm + 2,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(SmartSpendRadii.md),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: colors.surfaceRaised,
                child: Text(
                  item.name.trim().isNotEmpty
                      ? item.name.trim().characters.first
                      : '؟',
                  style: textTheme.titleMedium?.copyWith(
                    color: colors.foreground,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      style: textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (item.relation case final String rel
                        when rel.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        rel,
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: SmartSpendSpacing.sm),
              DebtBadge(balance: item.balance, compact: true),
              if (onMerge != null || onDelete != null) ...[
                PopupMenuButton<String>(
                  icon: Icon(
                    Icons.more_vert_rounded,
                    size: 20,
                    color: colors.mutedForeground,
                  ),
                  onSelected: (action) {
                    if (action == 'merge') onMerge?.call();
                    if (action == 'delete') onDelete?.call();
                  },
                  itemBuilder: (context) => [
                    if (onMerge != null)
                      PopupMenuItem(
                        value: 'merge',
                        child: Row(
                          children: [
                            Icon(Icons.call_merge_rounded, size: 18),
                            SizedBox(width: SmartSpendSpacing.xs),
                            Text(
                              AppLocalizations.of(context)
                                  .aiMergeWithADuplicate,
                            ),
                          ],
                        ),
                      ),
                    if (onDelete != null)
                      PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            Icon(
                              Icons.delete_outline_rounded,
                              size: 18,
                              color: colors.danger,
                            ),
                            const SizedBox(width: SmartSpendSpacing.xs),
                            Text(
                              AppLocalizations.of(context).aiDeleteThePerson,
                              style: TextStyle(color: colors.danger),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
