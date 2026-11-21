import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'contact_models.dart';
import 'contacts_providers.dart';

/// Confirmation dialog for deleting a contact (`profile.deleteContact`).
/// Explains that transactions remain in the ledger and only lose their link to the person.
class DeleteContactDialog extends ConsumerStatefulWidget {
  const DeleteContactDialog({required this.contact, super.key});

  final ContactDebtItem contact;

  @override
  ConsumerState<DeleteContactDialog> createState() =>
      _DeleteContactDialogState();
}

class _DeleteContactDialogState extends ConsumerState<DeleteContactDialog> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return AlertDialog(
      title: Text(AppLocalizations.of(context).aiDeleteP0(widget.contact.name)),
      content: Text(
        AppLocalizations.of(context).aiTheirRecordedTransactionsStayOnly,
        style: textTheme.bodyMedium?.copyWith(color: colors.foreground),
      ),
      actions: [
        TextButton(
          onPressed: _submitting
              ? null
              : () => Navigator.of(context).pop(false),
          child: Text(AppLocalizations.of(context).aiCancel),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: colors.danger),
          onPressed: _submitting
              ? null
              : () async {
                  final id = widget.contact.contactId;
                  if (id == null) {
                    Navigator.of(context).pop(false);
                    return;
                  }
                  final nav = Navigator.of(context);
                  setState(() => _submitting = true);
                  try {
                    await ref.read(contactsApiProvider).deleteContact(id);
                    invalidateContactsAndDebts(ref);
                    if (mounted) nav.pop(true);
                  } catch (_) {
                    if (mounted) {
                      setState(() => _submitting = false);
                      nav.pop(false);
                    }
                  }
                },
          child: Text(
            _submitting
                ? AppLocalizations.of(context).aiDeleting
                : AppLocalizations.of(context).aiDelete2,
          ),
        ),
      ],
    );
  }
}
