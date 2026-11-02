import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../l10n/app_localizations.dart';

import 'ai_models.dart';
import 'ai_providers.dart';

/// Modal bottom sheet for browsing, selecting, and clearing conversations (AI-03).
class AiConversationsSheet extends ConsumerWidget {
  const AiConversationsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => const AiConversationsSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
            Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text(
                    AppLocalizations.of(context).aiPastConversations,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  FilledButton.icon(
                    onPressed: () {
                      ref
                          .read(activeConversationIdProvider.notifier)
                          .select(null);
                      ref.read(chatMessagesProvider.notifier).clearLocal();
                      Navigator.of(context).pop();
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: Text(AppLocalizations.of(context).aiNewChat),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF0F766E),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(),
            Expanded(
              child: conversationsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => Center(
                  child: Text(AppLocalizations.of(context).aiWeCanTLoadYour2),
                ),
                data: (conversations) {
                  if (conversations.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.chat_bubble_outline_rounded,
                            size: 48,
                            color: Colors.grey.shade400,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            AppLocalizations.of(context).aiNoPastConversations,
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            AppLocalizations.of(context).aiStartANewChatWith,
                            style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView.separated(
                    controller: scrollController,
                    itemCount: conversations.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final conv = conversations[index];
                      final isSelected = conv.id == activeId;
                      final dateStr = conv.lastMessageAt != null
                          ? DateFormat(
                              'd MMMM yyyy',
                              'ar',
                            ).format(conv.lastMessageAt!)
                          : '';

                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isSelected
                              ? const Color(0xFFCCFBF1)
                              : Colors.grey.shade100,
                          child: Icon(
                            Icons.chat_outlined,
                            color: isSelected
                                ? const Color(0xFF0F766E)
                                : Colors.grey.shade600,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          conv.title.isNotEmpty
                              ? conv.title
                              : AppLocalizations.of(context).aiConversation,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: isSelected
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                        ),
                        subtitle: Text(
                          AppLocalizations.of(context)
                              .aiP0P1Messages(dateStr, '${conv.messageCount}'),
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline, size: 20),
                          color: Colors.grey.shade500,
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(AppLocalizations.of(context).aiDeleteTheConversation),
        content: Text(
          AppLocalizations.of(context).aiDeleteTheConversationP0(conv.title),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(AppLocalizations.of(context).aiCancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(context).aiDelete),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(aiApiProvider).clearConversation(conv.id);
      ref.invalidate(chatConversationsProvider);
      if (ref.read(activeConversationIdProvider) == conv.id) {
        ref.read(activeConversationIdProvider.notifier).select(null);
        ref.read(chatMessagesProvider.notifier).clearLocal();
      }
    }
  }
}
