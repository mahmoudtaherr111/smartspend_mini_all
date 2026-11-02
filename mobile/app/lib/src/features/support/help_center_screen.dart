import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/preferences.dart';
import '../../l10n/app_localizations.dart';
import 'support_providers.dart';

/// Help Center Screen with FAQs, support ticket submission, and draft recovery (SUP-01, SUP-02).
class HelpCenterScreen extends ConsumerStatefulWidget {
  const HelpCenterScreen({super.key});

  static const path = '/more/help';

  @override
  ConsumerState<HelpCenterScreen> createState() => _HelpCenterScreenState();
}

class _HelpCenterScreenState extends ConsumerState<HelpCenterScreen> {
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();
  bool _submitting = false;
  Timer? _draftTimer;

  List<({String q, String a})> get _faqs => [
    (
      q: AppLocalizations.of(context).appHowDoIRecordMy,
      a: AppLocalizations.of(context).appTypeASentenceRecordYour,
    ),
    (
      q: AppLocalizations.of(context).appIsMyFinancialDataSafe,
      a: AppLocalizations.of(context).appOnlyYourAccountCanReach,
    ),
    (
      q: AppLocalizations.of(context).appHowDoIChangeWhen,
      a: AppLocalizations.of(context).appFromMoreMoneyPreferencesChoose,
    ),
    (
      q: AppLocalizations.of(context).appWhenWillSupportAnswer,
      a: AppLocalizations.of(context).appOurTeamReadsEveryTicket,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _loadDraft();
    _subjectController.addListener(_onFieldChanged);
    _messageController.addListener(_onFieldChanged);
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadDraft() async {
    final prefs = await ref.read(preferencesStoreProvider).read();
    if (_subjectController.text.isEmpty && prefs.supportDraftSubject != null) {
      _subjectController.text = prefs.supportDraftSubject!;
    }
    if (_messageController.text.isEmpty && prefs.supportDraftMessage != null) {
      _messageController.text = prefs.supportDraftMessage!;
    }
  }

  void _onFieldChanged() {
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 500), _saveDraft);
  }

  Future<void> _saveDraft() async {
    final store = ref.read(preferencesStoreProvider);
    final current = await store.read();
    await store.write(
      current.copyWith(
        supportDraftSubject: _subjectController.text,
        supportDraftMessage: _messageController.text,
      ),
    );
  }

  Future<void> _clearDraft() async {
    final store = ref.read(preferencesStoreProvider);
    final current = await store.read();
    await store.write(
      current.copyWith(supportDraftSubject: '', supportDraftMessage: ''),
    );
  }

  Future<void> _submitTicket() async {
    final subject = _subjectController.text.trim();
    final message = _messageController.text.trim();
    if (subject.isEmpty || message.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(supportRepositoryProvider)
          .createTicket(subject: subject, message: message);
      await _clearDraft();
      _subjectController.clear();
      _messageController.clear();

      if (mounted) {
        ref.invalidate(mySupportTicketsProvider);
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appYourTicketWasSent,
        );
      }
    } catch (e) {
      if (mounted) {
        showSmartSpendNotice(
          context,
          e is ApiException
              ? e.message
              : AppLocalizations.of(context).appWeCouldnTSendYour,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final ticketsAsync = ref.watch(mySupportTicketsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.helpCenterTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // FAQs
            Text(l10n.helpFaqSection, style: textTheme.titleMedium),
            const SizedBox(height: SmartSpendSpacing.sm),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                side: BorderSide(color: colors.border),
              ),
              child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _faqs.length,
                separatorBuilder: (ctx, i) => const Divider(height: 1),
                itemBuilder: (ctx, i) {
                  final faq = _faqs[i];
                  return ExpansionTile(
                    title: Text(faq.q, style: textTheme.titleSmall),
                    childrenPadding: const EdgeInsets.all(SmartSpendSpacing.md),
                    children: [
                      Text(
                        faq.a,
                        style: textTheme.bodySmall?.copyWith(
                          color: colors.mutedForeground,
                          height: 1.4,
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.xl),

            // Submit Ticket
            Text(l10n.helpTicketSection, style: textTheme.titleMedium),
            const SizedBox(height: SmartSpendSpacing.sm),
            TextField(
              controller: _subjectController,
              decoration: InputDecoration(
                labelText: l10n.helpTicketSubject,
                hintText: l10n.helpTicketSubject,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _messageController,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: l10n.helpTicketMessage,
                hintText: l10n.helpTicketMessage,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            SmartSpendButton(
              label: l10n.helpTicketSubmit,
              variant: ButtonVariant.primary,
              busy: _submitting,
              onPressed: _submitting ? null : _submitTicket,
            ),
            const SizedBox(height: SmartSpendSpacing.xl),

            // Ticket History
            Text(l10n.helpMyTickets, style: textTheme.titleMedium),
            const SizedBox(height: SmartSpendSpacing.sm),
            ticketsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => ErrorState(
                message: AppLocalizations.of(context).appWeCanTLoadYour2,
                retryLabel: l10n.retry,
                onRetry: () => ref.invalidate(mySupportTicketsProvider),
              ),
              data: (List<SupportTicket> tickets) {
                if (tickets.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: SmartSpendSpacing.lg,
                    ),
                    child: Center(
                      child: Text(
                        AppLocalizations.of(context).appNoPastTickets,
                        style: textTheme.bodyMedium?.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ),
                  );
                }
                return Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(color: colors.border),
                  ),
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: tickets.length,
                    separatorBuilder: (ctx, i) => const Divider(height: 1),
                    itemBuilder: (ctx, i) {
                      final t = tickets[i];
                      return ListTile(
                        title: Text(t.subject, style: textTheme.titleSmall),
                        subtitle: Text(
                          t.status,
                          style: textTheme.bodySmall?.copyWith(
                            color: t.status == 'resolved'
                                ? colors.accent
                                : colors.warning,
                          ),
                        ),
                        trailing: Text(
                          '${t.createdAt.year}/${t.createdAt.month}/${t.createdAt.day}',
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
