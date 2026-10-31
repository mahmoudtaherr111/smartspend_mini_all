import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'ledger_widgets.dart';

/// Transaction search screen (REC-11): search transactions by name, category, note or merchant.
/// Supports Arabic letter normalization (ا/أ/إ, ه/ة, ي/ى), offline cache search, and detailed empty states.
class TransactionSearchScreen extends ConsumerStatefulWidget {
  const TransactionSearchScreen({super.key});

  static const path = '/search';

  @override
  ConsumerState<TransactionSearchScreen> createState() =>
      _TransactionSearchScreenState();
}

class _TransactionSearchScreenState
    extends ConsumerState<TransactionSearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  Timer? _debounceTimer;
  String _activeQuery = '';

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final text = _controller.text;
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted && _activeQuery != text) {
        setState(() => _activeQuery = text);
      }
    });
  }

  void _clear() {
    _debounceTimer?.cancel();
    _controller.clear();
    setState(() => _activeQuery = '');
    _focusNode.requestFocus();
  }

  void _delete(BuildContext context, LedgerEntry entry) {
    final l10n = AppLocalizations.of(context);
    ref.read(hiddenEntryIdsProvider.notifier).hide(entry.id);
    var undone = false;
    unawaited(SmartSpendHaptics.impact());
    showSmartSpendNotice(
      context,
      l10n.entryDeleted,
      undoLabel: l10n.undo,
      onUndo: () {
        undone = true;
        ref.read(hiddenEntryIdsProvider.notifier).restore(entry.id);
      },
    ).closed.then((_) async {
      if (undone) return;
      try {
        await ref.read(ledgerApiProvider).delete(entry.id);
        refreshLedger(ref);
      } on Object {
        ref.read(hiddenEntryIdsProvider.notifier).restore(entry.id);
        if (context.mounted) {
          unawaited(SmartSpendHaptics.error());
          showSmartSpendNotice(context, l10n.deleteFailed);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final hiddenIds = ref.watch(hiddenEntryIdsProvider);
    final trimmedQuery = _activeQuery.trim();

    final AsyncValue<SearchResult>? searchAsync = trimmedQuery.length >= 2
        ? ref.watch(transactionSearchResultsProvider(trimmedQuery))
        : null;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsetsDirectional.only(end: SmartSpendSpacing.screen),
          child: TextField(
            controller: _controller,
            focusNode: _focusNode,
            autofocus: true,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: l10n.searchHint,
              isDense: true,
              border: InputBorder.none,
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear_rounded, size: 20),
                      onPressed: _clear,
                    )
                  : null,
            ),
          ),
        ),
      ),
      body: () {
        if (trimmedQuery.length < 2) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.xl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.search_rounded,
                    size: 48,
                    color: colors.mutedForeground.withValues(alpha: 0.4),
                  ),
                  const SizedBox(height: SmartSpendSpacing.md),
                  Text(
                    trimmedQuery.isEmpty ? l10n.searchTitle : l10n.searchHint,
                    textAlign: TextAlign.center,
                    style: SmartSpendTypography.style(15, FontWeight.w500).copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return searchAsync!.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(SmartSpendSpacing.screen),
            child: LedgerSkeleton(rows: 5),
          ),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.xl),
              child: ErrorState(
                message: l10n.ledgerLoadFailed,
                retryLabel: l10n.retry,
                onRetry: () => ref.invalidate(
                  transactionSearchResultsProvider(trimmedQuery),
                ),
              ),
            ),
          ),
          data: (result) {
            final visible = result.entries
                .where((e) => !hiddenIds.contains(e.id))
                .toList();

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (result.isOffline) OfflineBanner(l10n.searchOfflineNotice),
                Expanded(
                  child: visible.isEmpty
                      ? ListView(
                          padding: const EdgeInsets.all(SmartSpendSpacing.xl),
                          children: [
                            const SizedBox(height: SmartSpendSpacing.xl),
                            EmptyState(
                              icon: Icons.search_off_rounded,
                              title: l10n.searchEmptyTitle(trimmedQuery),
                              message: l10n.searchEmptyBody,
                            ),
                          ],
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(
                            SmartSpendSpacing.screen,
                            SmartSpendSpacing.sm,
                            SmartSpendSpacing.screen,
                            SmartSpendSpacing.xl,
                          ),
                          children: [
                            LedgerDayList(
                              entries: visible,
                              onDelete: (entry) => _delete(context, entry),
                            ),
                          ],
                        ),
                ),
              ],
            );
          },
        );
      }(),
    );
  }
}
