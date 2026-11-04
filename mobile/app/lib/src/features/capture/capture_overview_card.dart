import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../ledger/ledger_models.dart' show ContactSummary;
import '../ledger/ledger_providers.dart';
import 'capture_activity_api.dart';
import 'capture_activity_providers.dart';
import 'capture_controller.dart';

/// Already-saved movements and an optional classification question. Never asks permission to record a payment.
class CaptureOverviewCard extends ConsumerStatefulWidget {
  const CaptureOverviewCard({super.key});
  @override
  ConsumerState<CaptureOverviewCard> createState() =>
      _CaptureOverviewCardState();
}

class _CaptureOverviewCardState extends ConsumerState<CaptureOverviewCard> {
  late final AppLifecycleListener _lifecycle;
  bool _undoing = false;
  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () {
        if (!mounted) return;
        ref.invalidate(captureActivityProvider);
        ref.invalidate(captureServerStatusProvider);
        ref.invalidate(capturePurposeQuestionProvider);
        refreshLedger(ref);
      },
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _undo(int eventId) async {
    setState(() => _undoing = true);
    try {
      await ref.read(captureActivityApiProvider).undo(eventId);
      if (!mounted) return;
      refreshLedger(ref);
      ref.invalidate(captureActivityProvider);
      ref.invalidate(capturePurposeQuestionProvider);
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).captureChangeFailed,
        );
      }
    } finally {
      if (mounted) setState(() => _undoing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final server = ref.watch(captureServerStatusProvider).value;
    if (server == null ||
        !server.automatic ||
        !server.enabled ||
        !server.consented) {
      return const SizedBox.shrink();
    }
    final activity = ref.watch(captureActivityProvider);
    final question = ref.watch(capturePurposeQuestionProvider);
    ref.listen(captureActivityProvider, (before, after) {
      String recorded(List<CaptureActivityItem>? items) =>
          (items ?? const <CaptureActivityItem>[])
              .where((item) => item.state == 'recorded')
              .map((item) => item.key)
              .join('|');
      if (after.hasValue && recorded(before?.value) != recorded(after.value)) {
        refreshLedger(ref);
        ref.invalidate(capturePurposeQuestionProvider);
      }
    });
    final l10n = AppLocalizations.of(context);
    final online = ref.watch(networkStatusProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SmartSpendSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.captureAutomaticTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: SmartSpendSpacing.xs),
            Text(
              server.aiReading
                  ? l10n.captureAutomaticBody
                  : l10n.captureAutomaticStopped,
            ),
            if (question.value case final CapturePurposeQuestion value) ...[
              const SizedBox(height: SmartSpendSpacing.md),
              _PurposeForm(
                key: ValueKey(value.id),
                question: value,
                disabled: !online || question.isLoading,
              ),
            ],
            if (question.hasError)
              SmartSpendButton(
                label: l10n.retry,
                variant: ButtonVariant.quiet,
                onPressed: () => ref.invalidate(capturePurposeQuestionProvider),
              ),
            for (final item
                in activity.value ?? const <CaptureActivityItem>[]) ...[
              const SizedBox(height: SmartSpendSpacing.sm),
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: SmartSpendSpacing.sm,
                children: [
                  Text(switch (item.state) {
                    'recorded' => l10n.captureStateRecorded,
                    'held' => l10n.captureStateHeld,
                    'removed' => l10n.captureStateRemoved,
                    'processing' => l10n.captureStateProcessing,
                    _ => l10n.captureStateWaiting,
                  }),
                  if (item.amount case final num amount) AmountText(amount),
                  if (item.canUndo && item.eventId != null)
                    SmartSpendButton(
                      label: l10n.undo,
                      variant: ButtonVariant.quiet,
                      expand: false,
                      onPressed: online && !_undoing
                          ? () => _undo(item.eventId!)
                          : null,
                    ),
                ],
              ),
            ],
            if (activity.hasError)
              SmartSpendButton(
                label: l10n.retry,
                variant: ButtonVariant.quiet,
                onPressed: () => ref.invalidate(captureActivityProvider),
              ),
          ],
        ),
      ),
    );
  }
}

class _PurposeForm extends ConsumerStatefulWidget {
  const _PurposeForm({
    super.key,
    required this.question,
    required this.disabled,
  });
  final CapturePurposeQuestion question;
  final bool disabled;
  @override
  ConsumerState<_PurposeForm> createState() => _PurposeFormState();
}

class _PurposeFormState extends ConsumerState<_PurposeForm> {
  final _purpose = TextEditingController();
  String? _category;
  String? _subCategory;
  int? _contactId;
  bool _busy = false;
  @override
  void dispose() {
    _purpose.dispose();
    super.dispose();
  }

  Future<void> _answer(String action, {String? movementKind}) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(captureActivityApiProvider)
          .answer(
            widget.question.id,
            action: action,
            categoryId: movementKind == null ? _category : null,
            subCategoryId: movementKind == null ? _subCategory : null,
            purpose: movementKind != null || _purpose.text.trim().isEmpty
                ? null
                : _purpose.text.trim(),
            movementKind: movementKind,
            contactId:
                movementKind == null &&
                    _category == 'transfer' &&
                    _subCategory == 'debt'
                ? _contactId
                : null,
          );
      if (!mounted) return;
      refreshLedger(ref);
      ref.invalidate(capturePurposeQuestionProvider);
      ref.invalidate(captureActivityProvider);
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).captureChangeFailed,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final disabled = _busy || widget.disabled;
    final categories = widget.question.categories;
    PurposeCategory? category;
    for (final item in categories) {
      if (item.id == _category) category = item;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.capturePurposeQuestion,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        AmountText(
          widget.question.amount +
              (widget.question.incoming ? 0 : widget.question.fee),
        ),
        Text(inlineName(widget.question.title)),
        Text(l10n.capturePurposeOptional),
        const SizedBox(height: SmartSpendSpacing.sm),
        DropdownButtonFormField<String>(
          initialValue: _category,
          isExpanded: true,
          decoration: InputDecoration(labelText: l10n.capturePurposeCategory),
          items: [
            for (final item in categories)
              DropdownMenuItem(value: item.id, child: Text(item.name)),
          ],
          onChanged: disabled
              ? null
              : (value) => setState(() {
                  _category = value;
                  _subCategory = null;
                }),
        ),
        if (category != null)
          DropdownButtonFormField<String>(
            key: ValueKey(_category),
            initialValue: _subCategory,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: l10n.capturePurposeSubcategory,
            ),
            items: [
              for (final sub in category.subcategories)
                DropdownMenuItem(value: sub.id, child: Text(sub.name)),
            ],
            onChanged: disabled
                ? null
                : (value) => setState(() => _subCategory = value),
          ),
        if (_category == 'transfer' && _subCategory == 'debt')
          DropdownButtonFormField<int>(
            initialValue: _contactId,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.capturePurposePerson),
            items: [
              for (final contact
                  in ref.watch(contactsProvider).value ??
                      const <ContactSummary>[])
                DropdownMenuItem<int>(
                  value: contact.id,
                  child: Text(inlineName(contact.name)),
                ),
            ],
            onChanged: disabled
                ? null
                : (value) => setState(() => _contactId = value),
          ),
        const SizedBox(height: SmartSpendSpacing.sm),
        TextField(
          controller: _purpose,
          enabled: !disabled,
          maxLength: 200,
          decoration: InputDecoration(labelText: l10n.capturePurposeLabel),
          onChanged: (_) => setState(() {}),
        ),
        Wrap(
          spacing: SmartSpendSpacing.sm,
          runSpacing: SmartSpendSpacing.xs,
          children: [
            SmartSpendButton(
              label: l10n.capturePurposeSave,
              expand: false,
              onPressed:
                  !disabled &&
                      (_category != null || _purpose.text.trim().isNotEmpty)
                  ? () => _answer('set')
                  : null,
            ),
            SmartSpendButton(
              label: l10n.capturePurposeOwn,
              variant: ButtonVariant.secondary,
              expand: false,
              onPressed: disabled
                  ? null
                  : () => _answer('set', movementKind: 'own_transfer'),
            ),
            SmartSpendButton(
              label: l10n.capturePurposeCardPayment,
              variant: ButtonVariant.secondary,
              expand: false,
              onPressed: disabled
                  ? null
                  : () => _answer('set', movementKind: 'card_payment'),
            ),
            SmartSpendButton(
              label: l10n.capturePurposeKeep,
              variant: ButtonVariant.quiet,
              expand: false,
              onPressed: disabled ? null : () => _answer('keep'),
            ),
            SmartSpendButton(
              label: l10n.capturePurposeSkip,
              variant: ButtonVariant.quiet,
              expand: false,
              onPressed: disabled ? null : () => _answer('skip'),
            ),
          ],
        ),
      ],
    );
  }
}
