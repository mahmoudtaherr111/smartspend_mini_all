import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import 'ai_models.dart';
import 'ai_providers.dart';

/// Modal bottom sheet for browsing, selecting, and clearing conversations (AI-03).
class AiConversationsSheet extends ConsumerWidget {
  const AiConversationsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showSmartSpendSheet<void>(
      context: context,
      builder: (context) => const AiConversationsSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final conversationsAsync = ref.watch(chatConversationsProvider);
    final activeId = ref.watch(activeConversationIdProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            SheetHeader(
              title: l10n.aiPastConversations,
              trailing: TextButton.icon(
                onPressed: () {
                  ref.read(activeConversationIdProvider.notifier).select(null);
                  ref.read(chatMessagesProvider.notifier).clearLocal();
                  Navigator.of(context).pop();
                },
                icon: const Icon(Icons.add_rounded),
                label: Text(l10n.aiNewChat),
              ),
            ),
            Expanded(
              child: conversationsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => Center(
                  child: ErrorState(
                    message: l10n.aiWeCanTLoadYour2,
                    retryLabel: l10n.retry,
                    onRetry: () => ref.invalidate(chatConversationsProvider),
                  ),
                ),
                data: (conversations) {
                  if (conversations.isEmpty) {
                    return SingleChildScrollView(
                      controller: scrollController,
                      child: EmptyState(
                        icon: Icons.chat_bubble_outline_rounded,
                        title: l10n.aiNoPastConversations,
                        message: l10n.aiStartANewChatWith,
                      ),
                    );
                  }

                  return ListView.separated(
                    controller: scrollController,
                    padding: const EdgeInsets.only(
                      bottom: SmartSpendSpacing.lg,
                    ),
                    itemCount: conversations.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final conv = conversations[index];
                      final date = conv.lastMessageAt == null
                          ? ''
                          : DateWords.of(context)
                                .day(conv.lastMessageAt!, now: DateTime.now());

                      return GroupedRow(
                        icon: Icons.chat_outlined,
                        tint: conv.id == activeId
                            ? colors.ai
                            : colors.mutedForeground,
                        title: conv.title.isNotEmpty
                            ? conv.title
                            : l10n.aiConversation,
                        subtitle: l10n.aiP0P1Messages(
                          date,
                          '${conv.messageCount}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline_rounded),
                          color: colors.mutedForeground,
                          tooltip: l10n.aiDelete,
                          onPressed: () =>
                              _confirmClearConversation(context, ref, conv),
                        ),
                        onTap: () {
                          ref
                              .read(activeConversationIdProvider.notifier)
                              .select(conv.id);
                          Navigator.of(context).pop();
                        },
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

  Future<void> _confirmClearConversation(
    BuildContext context,
    WidgetRef ref,
    ChatConversation conv,
  ) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await confirmInSheet(
      context: context,
      title: l10n.aiDeleteTheConversation,
      message: l10n.aiDeleteTheConversationP0(conv.title),
      confirmLabel: l10n.aiDelete,
      cancelLabel: l10n.aiCancel,
    );
    if (!confirmed) return;

    try {
      await ref.read(aiApiProvider).clearConversation(conv.id);
      ref.invalidate(chatConversationsProvider);
      if (ref.read(activeConversationIdProvider) == conv.id) {
        ref.read(activeConversationIdProvider.notifier).select(null);
        ref.read(chatMessagesProvider.notifier).clearLocal();
      }
    } on Object {
      if (context.mounted) {
        showSmartSpendNotice(context, l10n.aiItDidnTGoThrough);
      }
    }
  }
}
