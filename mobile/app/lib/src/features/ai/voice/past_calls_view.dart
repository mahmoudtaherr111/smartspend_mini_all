import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../../l10n/app_localizations.dart';

import '../ai_providers.dart';

/// Screen view displaying past voice calls history (AI-10).
///
/// NOTE on Privacy:
/// In accordance with privacy rules, voice recordings and text transcripts are never
/// stored in the database. Only metadata (timestamp, call duration, status) is retained.
class PastCallsView extends ConsumerWidget {
  final VoidCallback onStartNewCall;

  const PastCallsView({super.key, required this.onStartNewCall});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final callsAsync = ref.watch(pastVoiceCallsProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pastVoiceCallsProvider);
        },
        child: callsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.xl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: Colors.redAccent,
                  ),
                  const SizedBox(height: SmartSpendSpacing.md),
                  Text(
                    AppLocalizations.of(context).aiWeCanTLoadYour3,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: SmartSpendSpacing.lg),
                  ElevatedButton(
                    onPressed: () => ref.invalidate(pastVoiceCallsProvider),
                    child: Text(AppLocalizations.of(context).aiTryAgain),
                  ),
                ],
              ),
            ),
          ),
          data: (calls) {
            if (calls.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 80),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: SmartSpendSpacing.xxl,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(SmartSpendSpacing.xl),
                          decoration: BoxDecoration(
                            color: Theme.of(context)
                                .colorScheme
                                .primaryContainer
                                .withValues(alpha: 0.4),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.phone_in_talk,
                            size: 64,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.xl),
                        Text(
                          AppLocalizations.of(context).aiNoPastCalls,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: SmartSpendSpacing.md),
                        Text(
                          AppLocalizations.of(context).aiTalkToTheAssistantIn,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.xl),
                        FilledButton.icon(
                          onPressed: onStartNewCall,
                          icon: const Icon(Icons.call),
                          label: Text(
                            AppLocalizations.of(context).aiStartANewCall,
                          ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.xxl),
                        _buildPrivacyCard(context),
                      ],
                    ),
                  ),
                ],
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(SmartSpendSpacing.lg),
              itemCount: calls.length + 1,
              separatorBuilder: (context, index) =>
                  const SizedBox(height: SmartSpendSpacing.sm),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.md,
                    ),
                    child: _buildPrivacyCard(context),
                  );
                }
                final call = calls[index - 1];
                final durationMin = call.durationSeconds ~/ 60;
                final durationSec = call.durationSeconds % 60;
                final durationText = durationMin > 0
                    ? AppLocalizations.of(context)
                          .aiP0MinP1Sec('$durationMin', '$durationSec')
                    : AppLocalizations.of(context).aiP0Sec('$durationSec');

                return Card(
                  elevation: 0,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest
                      .withValues(alpha: 0.4),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    side: BorderSide(
                      color: Theme.of(context).colorScheme.outlineVariant
                          .withValues(alpha: 0.4),
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: SmartSpendSpacing.lg,
                      vertical: SmartSpendSpacing.sm,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: Theme.of(context)
                          .colorScheme
                          .primaryContainer,
                      child: Icon(
                        Icons.phone,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    title: Text(
                      AppLocalizations.of(context).aiVoiceCall,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: SmartSpendSpacing.xs),
                        Text(
                          DateFormat('yyyy-MM-dd HH:mm').format(call.startedAt),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                        const SizedBox(height: SmartSpendSpacing.xs / 2),
                        Row(
                          children: [
                            Icon(
                              Icons.timer_outlined,
                              size: 14,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                            const SizedBox(width: SmartSpendSpacing.xs),
                            Text(
                              AppLocalizations.of(context)
                                  .aiDurationP0(durationText),
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    trailing: call.status == 'completed'
                        ? const Icon(
                            Icons.check_circle_outline,
                            color: Colors.green,
                            size: 20,
                          )
                        : const Icon(
                            Icons.call_missed,
                            color: Colors.orange,
                            size: 20,
                          ),
                  ),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: onStartNewCall,
        icon: const Icon(Icons.call),
        label: Text(AppLocalizations.of(context).aiNewCall),
      ),
    );
  }

  Widget _buildPrivacyCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(SmartSpendSpacing.md),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest
            .withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(SmartSpendRadii.md),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant
              .withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.privacy_tip_outlined,
            size: 20,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Expanded(
            child: Text(
              AppLocalizations.of(context).aiYourPrivacyNeitherTheAudio,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
