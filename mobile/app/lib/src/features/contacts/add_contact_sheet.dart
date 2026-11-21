import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'contacts_providers.dart';

/// Bottom sheet to add a new contact (`profile.addContact`).
class AddContactSheet extends ConsumerStatefulWidget {
  const AddContactSheet({super.key});

  @override
  ConsumerState<AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends ConsumerState<AddContactSheet> {
  final _nameController = TextEditingController();
  final _relationController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _relationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(
        () => _error = AppLocalizations.of(context).aiEnterThePersonSName,
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final api = ref.read(contactsApiProvider);
      await api.addContact(
        name: name,
        relation: _relationController.text.trim().isEmpty
            ? null
            : _relationController.text.trim(),
      );
      invalidateContactsAndDebts(ref);
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = AppLocalizations.of(context).aiWeCouldnTAddThem;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
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
            AppLocalizations.of(context).aiAddANewPerson,
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            AppLocalizations.of(context).aiSoYouCanRecordSpending,
            style: textTheme.bodyMedium?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          TextField(
            controller: _nameController,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).aiName,
              hintText: AppLocalizations.of(context)
                  .aiLikeMohamedIbrahimOrAhmed,
              errorText: _error,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _relationController,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).aiRelationOptional,
              hintText: AppLocalizations.of(context)
                  .aiLikeColleagueFriendBrother,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: _submitting
                ? AppLocalizations.of(context).aiSaving
                : AppLocalizations.of(context).aiSaveThePerson,
            onPressed: _submitting ? null : _submit,
          ),
        ],
      ),
    );
  }
}
