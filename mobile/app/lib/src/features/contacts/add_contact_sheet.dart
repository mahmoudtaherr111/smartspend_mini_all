import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'contact_models.dart';
import 'contacts_providers.dart';

/// Bottom sheet to add a new contact (`profile.addContact`) or edit an existing one (`profile.updateContact`).
class AddContactSheet extends ConsumerStatefulWidget {
  const AddContactSheet({super.key, this.existing});

  final ContactDebtItem? existing;

  @override
  ConsumerState<AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends ConsumerState<AddContactSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _relationController;
  final _nameFocusNode = FocusNode();
  final _relationFocusNode = FocusNode();
  late final String _initialName;
  late final String _initialRelation;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _initialName = (existing?.name ?? '').trim();
    _initialRelation = (existing?.relation ?? '').trim();
    _nameController = TextEditingController(text: _initialName)
      ..addListener(_onChanged);
    _relationController = TextEditingController(text: _initialRelation)
      ..addListener(_onChanged);
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  bool get _isDirty =>
      _nameController.text.trim() != _initialName ||
      _relationController.text.trim() != _initialRelation;

  Future<bool> _confirmDiscard(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text(l10n.discardChangesTitle),
        content: Text(l10n.discardChangesBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: Text(l10n.discardChangesCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: Text(l10n.discardChangesConfirm),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  @override
  void dispose() {
    _nameController
      ..removeListener(_onChanged)
      ..dispose();
    _relationController
      ..removeListener(_onChanged)
      ..dispose();
    _nameFocusNode.dispose();
    _relationFocusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = l10n.aiEnterThePersonSName);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final api = ref.read(contactsApiProvider);
      final existing = widget.existing;
      final relation = _relationController.text.trim();
      if (existing != null && existing.contactId != null) {
        await api.updateContact(
          id: existing.contactId!,
          name: name,
          relation: relation,
        );
      } else {
        await api.addContact(
          name: name,
          relation: relation.isEmpty ? null : relation,
        );
      }
      invalidateContactsAndDebts(ref);
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = widget.existing != null
              ? l10n.saveChangesFailed
              : l10n.aiWeCouldnTAddThem;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final isEditing =
        widget.existing != null && widget.existing!.contactId != null;

    return PopScope(
      canPop: !_isDirty || _submitting,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final discard = await _confirmDiscard(context);
        if (discard && context.mounted) {
          Navigator.of(context).pop(false);
        }
      },
      child: SmartSpendKeyboardAccessory(
        focusNodes: [_nameFocusNode, _relationFocusNode],
        doneLabel: l10n.keyboardDone,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            SmartSpendSpacing.screen,
            0,
            SmartSpendSpacing.screen,
            SmartSpendSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                isEditing ? l10n.contactEditTitle : l10n.aiAddANewPerson,
                style: textTheme.titleLarge,
              ),
              const SizedBox(height: SmartSpendSpacing.xs),
              Text(
                l10n.aiSoYouCanRecordSpending,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              TextField(
                controller: _nameController,
                focusNode: _nameFocusNode,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(
                  labelText: l10n.aiName,
                  hintText: l10n.aiLikeMohamedIbrahimOrAhmed,
                  errorText: _error,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              TextField(
                controller: _relationController,
                focusNode: _relationFocusNode,
                decoration: InputDecoration(
                  labelText: l10n.aiRelationOptional,
                  hintText: l10n.aiLikeColleagueFriendBrother,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.xl),
              SmartSpendButton(
                label: _submitting
                    ? l10n.aiSaving
                    : (isEditing ? l10n.monSaveChanges : l10n.aiSaveThePerson),
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
