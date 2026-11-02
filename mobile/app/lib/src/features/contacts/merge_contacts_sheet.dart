import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../ledger/ledger_models.dart';
import '../ledger/ledger_providers.dart';
import 'contact_models.dart';
import 'contacts_providers.dart';

/// Bottom sheet to merge duplicate contacts (`profile.mergeContacts`).
class MergeContactsSheet extends ConsumerStatefulWidget {
  const MergeContactsSheet({required this.currentContact, super.key});

  final ContactDebtItem currentContact;

  @override
  ConsumerState<MergeContactsSheet> createState() => _MergeContactsSheetState();
}

class _MergeContactsSheetState extends ConsumerState<MergeContactsSheet> {
  int? _selectedOtherId;
  bool _keepCurrentName = true;
  bool _submitting = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final allContacts =
        ref.watch(contactsProvider).value ?? const <ContactSummary>[];
    final otherContacts = allContacts
        .where((c) => c.id != widget.currentContact.contactId)
        .toList();

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        MediaQuery.of(context).viewInsets.bottom + SmartSpendSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            AppLocalizations.of(context).aiMergeDuplicates,
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            AppLocalizations.of(context).aiChooseTheNameToKeep,
            style: textTheme.bodyMedium?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          if (otherContacts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(
                vertical: SmartSpendSpacing.lg,
              ),
              child: Text(
                AppLocalizations.of(context).aiNoOtherContactsToMerge,
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            )
          else ...[
            Text(
              AppLocalizations.of(context)
                  .aiChooseWhoToMergeWith(widget.currentContact.name),
              style: textTheme.titleSmall,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            DropdownButtonFormField<int>(
              initialValue: _selectedOtherId,
              hint: Text(AppLocalizations.of(context).aiChooseAContact),
              decoration: const InputDecoration(
                contentPadding: EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.md,
                  vertical: SmartSpendSpacing.sm,
                ),
              ),
              items: [
                for (final c in otherContacts)
                  DropdownMenuItem<int>(
                    value: c.id,
                    child: Text(
                      c.relation != null && c.relation!.isNotEmpty
                          ? '${c.name} (${c.relation})'
                          : c.name,
                    ),
                  ),
              ],
              onChanged: (val) => setState(() => _selectedOtherId = val),
            ),
            const SizedBox(height: SmartSpendSpacing.lg),
            if (_selectedOtherId != null) ...[
              Text(
                AppLocalizations.of(context).aiWhichNameStays,
                style: textTheme.titleSmall,
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              RadioGroup<bool>(
                groupValue: _keepCurrentName,
                onChanged: (val) =>
                    setState(() => _keepCurrentName = val ?? true),
                child: Column(
                  children: [
                    RadioListTile<bool>(
                      value: true,
                      title: Text(widget.currentContact.name),
                      subtitle: Text(
                        AppLocalizations.of(context).aiThisNameStaysAndAll,
                      ),
                    ),
                    RadioListTile<bool>(
                      value: false,
                      title: Text(
                        otherContacts
                            .firstWhere((c) => c.id == _selectedOtherId)
                            .name,
                      ),
                      subtitle: Text(
                        AppLocalizations.of(context).aiThisNameStaysAndAll,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(
                _error!,
                style: textTheme.bodySmall?.copyWith(color: colors.danger),
              ),
            ],
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: _submitting
                  ? AppLocalizations.of(context).aiMerging
                  : AppLocalizations.of(context).aiConfirmMerge,
              onPressed: (_selectedOtherId == null || _submitting)
                  ? null
                  : () async {
                      if (widget.currentContact.contactId == null) return;
                      final otherId = _selectedOtherId!;
                      final primaryId = _keepCurrentName
                          ? widget.currentContact.contactId!
                          : otherId;
                      final secondaryId = _keepCurrentName
                          ? otherId
                          : widget.currentContact.contactId!;

                      setState(() {
                        _submitting = true;
                        _error = null;
                      });

                      final nav = Navigator.of(context);
                      try {
                        final api = ref.read(contactsApiProvider);
                        await api.mergeContacts(
                          primaryId: primaryId,
                          secondaryId: secondaryId,
                        );
                        invalidateContactsAndDebts(ref);
                        if (mounted) {
                          nav.pop(true);
                        }
                      } catch (e) {
                        if (mounted) {
                          setState(() {
                            _submitting = false;
                            _error = AppLocalizations.of(context)
                                .aiWeCouldnTMergeThem;
                          });
                        }
                      }
                    },
            ),
          ],
        ],
      ),
    );
  }
}
