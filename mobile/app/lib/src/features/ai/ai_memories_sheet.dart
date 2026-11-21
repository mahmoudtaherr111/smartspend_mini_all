import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'ai_models.dart';
import 'ai_providers.dart';

/// Modal bottom sheet for viewing and managing memories remembered by the assistant (AI-05).
class AiMemoriesSheet extends ConsumerWidget {
  const AiMemoriesSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => const AiMemoriesSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final memoriesAsync = ref.watch(aiMemoriesProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            SheetHeader(
              title: l10n.aiWhatTheAssistantRemembers2,
              trailing: memoriesAsync.value?.isNotEmpty ?? false
                  ? TextButton(
                      onPressed: () => _confirmClearAll(context, ref),
                      style: TextButton.styleFrom(
                        foregroundColor: colors.danger,
                      ),
                      child: Text(l10n.aiClearAll),
                    )
                  : null,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SmartSpendSpacing.screen,
              ),
              child: InlineMessage(
                l10n.aiTheAssistantKeepsAFew,
                tone: MessageTone.info,
                icon: Icons.shield_outlined,
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            Expanded(
              child: memoriesAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => Center(
                  child: ErrorState(
                    message: l10n.aiWeCanTLoadThe,
                    retryLabel: l10n.retry,
                    onRetry: () => ref.invalidate(aiMemoriesProvider),
                  ),
                ),
                data: (memories) {
                  if (memories.isEmpty) {
                    return SingleChildScrollView(
                      controller: scrollController,
                      child: EmptyState(
                        icon: Icons.psychology_outlined,
                        title: l10n.aiTheAssistantDoesnTKnow,
                        message: l10n.aiTheMoreYouTalkThe,
                      ),
                    );
                  }

                  return ListView.separated(
                    controller: scrollController,
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.lg,
                    ),
                    itemCount: memories.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final memory = memories[index];
                      return GroupedRow(
                        icon: Icons.lightbulb_outline_rounded,
                        tint: colors.ai,
                        title: memory.text,
                        trailing: IconButton(
                          icon: const Icon(Icons.close_rounded),
                          color: colors.mutedForeground,
                          tooltip: l10n.aiForgetThis,
                          onPressed: () => _forgetMemory(context, ref, memory),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _forgetMemory(
    BuildContext context,
    WidgetRef ref,
    AiMemory memory,
  ) async {
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(aiApiProvider).forgetMemory(memory.id);
      ref.invalidate(aiMemoriesProvider);
      if (context.mounted) {
        showSmartSpendNotice(context, l10n.aiRemovedFromTheAssistantS);
      }
    } on Object {
      if (context.mounted) {
        showSmartSpendNotice(context, l10n.aiItDidnTGoThrough);
      }
    }
  }

  Future<void> _confirmClearAll(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await confirmInSheet(
      context: context,
      title: l10n.aiClearAllMemories,
      message: l10n.aiDeleteEverythingSavedTheAssistant,
      confirmLabel: l10n.aiClearAll,
      cancelLabel: l10n.aiCancel,
    );
    if (!confirmed) return;

    try {
      await ref.read(aiApiProvider).clearAllMemories();
      ref.invalidate(aiMemoriesProvider);
    } on Object {
      if (context.mounted) {
        showSmartSpendNotice(context, l10n.aiItDidnTGoThrough);
      }
    }
  }
}
