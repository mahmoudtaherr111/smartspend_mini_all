import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../ledger/offline/outbox.dart';
import 'ai_action_card.dart';
import 'ai_models.dart';
import 'ai_providers.dart';

/// The interactive AI chatbot conversation view (AI-01, AI-02, AI-04).
class AiChatView extends ConsumerStatefulWidget {
  const AiChatView({super.key});

  @override
  ConsumerState<AiChatView> createState() => _AiChatViewState();
}

class _AiChatViewState extends ConsumerState<AiChatView> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    final savedDraft = ref.read(chatDraftProvider);
    if (savedDraft.isNotEmpty) {
      _textController.text = savedDraft;
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleSend() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    final isOnline = ref.read(connectivityProvider).asData?.value ?? true;
    if (!isOnline) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).aiWeNeedInternetToAnswer),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    _textController.clear();
    _scrollToBottom();

    final success = await ref
        .read(chatMessagesProvider.notifier)
        .sendMessage(text);
    if (success) {
      _scrollToBottom();
    } else {
      // Re-populate text from draft if failed
      final draft = ref.read(chatDraftProvider);
      if (draft.isNotEmpty && _textController.text.isEmpty) {
        _textController.text = draft;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final messagesAsync = ref.watch(chatMessagesProvider);
    final isTyping = ref.watch(isAssistantTypingProvider);
    final dailyLimitError = ref.watch(dailyLimitErrorProvider);
    final isOnline = ref.watch(connectivityProvider).asData?.value ?? true;
    final quickQuestionsAsync = ref.watch(quickQuestionsProvider);

    return Column(
      children: [
        // Offline alert banner
        if (!isOnline)
          Container(
            color: Colors.amber.shade100,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Icon(
                  Icons.wifi_off_rounded,
                  size: 18,
                  color: Colors.amber.shade900,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    AppLocalizations.of(context).aiYouReOfflineYourDraft,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.amber.shade900,
                    ),
                  ),
                ),
              ],
            ),
          ),

        // Daily limit reached banner with upgrade button
        if (dailyLimitError != null)
          Container(
            color: const Color(0xFFFEF2F2),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                const Icon(Icons.bolt_rounded, size: 20, color: Colors.red),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    dailyLimitError,
                    style: const TextStyle(fontSize: 13, color: Colors.red),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    showUpgradePromptSheet(
                      context: context,
                      reason: UpgradeLimitReason.aiTokens,
                    );
                  },
                  child: Text(AppLocalizations.of(context).aiUpgradeToPro),
                ),
              ],
            ),
          ),

        // Message List
        Expanded(
          child: messagesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => Center(
              child: Text(AppLocalizations.of(context).aiWeCanTLoadYour),
            ),
            data: (messages) {
              final showQuickQuestions = messages.isEmpty && isOnline;

              return ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                itemCount:
                    messages.length +
                    (isTyping ? 1 : 0) +
                    (showQuickQuestions ? 1 : 0),
                itemBuilder: (context, index) {
                  if (showQuickQuestions && index == 0) {
                    return _buildQuickQuestionsHeader(quickQuestionsAsync);
                  }

                  final msgIndex = showQuickQuestions ? index - 1 : index;
                  if (msgIndex < messages.length) {
                    return _buildMessageBubble(messages[msgIndex]);
                  }

                  // Typing indicator bubble
                  return _buildTypingIndicator();
                },
              );
            },
          ),
        ),

        // Composer at bottom above keyboard
        Container(
          padding: EdgeInsets.only(
            left: 12,
            right: 12,
            top: 8,
            bottom: MediaQuery.of(context).viewInsets.bottom > 0 ? 8 : 12,
          ),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 4,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _textController,
                    focusNode: _focusNode,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _handleSend(),
                    decoration: InputDecoration(
                      hintText: isOnline
                          ? AppLocalizations.of(context).aiAskAboutYourSpending
                          : AppLocalizations.of(context).aiSendingNeedsInternet,
                      hintStyle: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade400,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: const BorderSide(color: Color(0xFF0F766E)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: isTyping ? null : _handleSend,
                  style: IconButton.styleFrom(
                    backgroundColor: const Color(0xFF0F766E),
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.arrow_upward_rounded, size: 20),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQuickQuestionsHeader(AsyncValue<List<String>> questionsAsync) {
    final colors = context.smartSpendColors;
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 22, color: colors.ai),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  AppLocalizations.of(context).aiHiIMYourAssistant,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            AppLocalizations.of(context).aiAskAboutYourSpendingOr,
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: colors.mutedForeground),
          ),
          if (questionsAsync.value?.isNotEmpty ?? false) ...[
            const SizedBox(height: 16),
            Text(
              AppLocalizations.of(context).aiTryAsking,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
          ],
          questionsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (err, stack) => const SizedBox.shrink(),
            data: (questions) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final q in questions)
                  ActionChip(
                    label: Text(q),
                    labelStyle: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: colors.foreground),
                    backgroundColor: colors.surfaceRaised,
                    side: BorderSide(color: colors.border),
                    onPressed: () {
                      _textController.text = q;
                      _handleSend();
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage msg) {
    final isUser = msg.role == 'user';
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: isUser
                ? MainAxisAlignment.end
                : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!isUser) ...[
                CircleAvatar(
                  radius: 14,
                  backgroundColor: const Color(0xFFCCFBF1),
                  child: Icon(
                    Icons.auto_awesome,
                    size: 14,
                    color: Colors.teal.shade800,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: isUser
                        ? const Color(0xFF0F766E)
                        : colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadiusDirectional.only(
                      topStart: const Radius.circular(16),
                      topEnd: const Radius.circular(16),
                      bottomStart: Radius.circular(isUser ? 16 : 4),
                      bottomEnd: Radius.circular(isUser ? 4 : 16),
                    ),
                  ),
                  child: _renderFormattedText(msg.content, isUser),
                ),
              ),
            ],
          ),

          // Clarification replies (if any)
          if (msg.clarification != null &&
              msg.clarification!.replies.isNotEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 8, start: 36),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final reply in msg.clarification!.replies)
                    ActionChip(
                      label: Text(reply),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: theme.brightness == Brightness.dark
                            ? colorScheme.onSurface
                            : Colors.teal.shade900,
                      ),
                      backgroundColor: theme.brightness == Brightness.dark
                          ? colorScheme.surfaceContainerHigh
                          : Colors.teal.shade50,
                      side: BorderSide(
                        color: theme.brightness == Brightness.dark
                            ? colorScheme.outlineVariant
                            : Colors.teal.shade200,
                      ),
                      onPressed: () {
                        _textController.text = reply;
                        _handleSend();
                      },
                    ),
                ],
              ),
            ),

          // Embedded Action Card (AI-02)
          if (msg.actionDraft != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 36),
              child: AiActionCard(draft: msg.actionDraft!),
            ),
        ],
      ),
    );
  }

  /// Formats message text ensuring Latin text isolation, amount styling, lists, bolding and copying (AI-01).
  Widget _renderFormattedText(String text, bool isUser) {
    final lines = text.split('\n');
    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (int i = 0; i < lines.length; i++) ...[
            if (i > 0) const SizedBox(height: 4),
            _buildFormattedLine(lines[i], isUser),
          ],
        ],
      ),
    );
  }

  Widget _buildFormattedLine(String line, bool isUser) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) return const SizedBox(height: 6);

    // List item (bullet)
    final isBullet =
        trimmed.startsWith('* ') ||
        trimmed.startsWith('- ') ||
        trimmed.startsWith('• ');
    final content = isBullet ? trimmed.substring(2).trim() : trimmed;

    final spans = _parseSpans(content, isUser);

    if (isBullet) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          textDirection: TextDirection.rtl,
          children: [
            Text(
              '• ',
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.bold,
                color: isUser ? Colors.white70 : Colors.teal.shade700,
              ),
            ),
            Expanded(
              child: Text.rich(
                TextSpan(children: spans),
                textDirection: TextDirection.rtl,
              ),
            ),
          ],
        ),
      );
    }

    return Text.rich(
      TextSpan(children: spans),
      textDirection: TextDirection.rtl,
    );
  }

  List<InlineSpan> _parseSpans(String text, bool isUser) {
    final spans = <InlineSpan>[];
    // Split by markdown bold **...**
    final boldRegex = RegExp(r'\*\*(.+?)\*\*');
    int lastMatchEnd = 0;

    for (final match in boldRegex.allMatches(text)) {
      if (match.start > lastMatchEnd) {
        final preceding = text.substring(lastMatchEnd, match.start);
        spans.add(_buildSpan(_isolateLatin(preceding), isUser, isBold: false));
      }
      final boldContent = match.group(1) ?? '';
      spans.add(_buildSpan(_isolateLatin(boldContent), isUser, isBold: true));
      lastMatchEnd = match.end;
    }

    if (lastMatchEnd < text.length) {
      final remaining = text.substring(lastMatchEnd);
      spans.add(_buildSpan(_isolateLatin(remaining), isUser, isBold: false));
    }

    return spans;
  }

  String _isolateLatin(String text) {
    return text.replaceAllMapped(RegExp(r'[A-Za-z][A-Za-z0-9_.\-]*'), (match) {
      return inlineName(match.group(0)!);
    });
  }

  InlineSpan _buildSpan(String text, bool isUser, {required bool isBold}) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    return TextSpan(
      text: text,
      style: TextStyle(
        fontSize: 14.5,
        height: 1.45,
        fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
        color: isUser ? Colors.white : colorScheme.onSurface,
      ),
    );
  }

  Widget _buildTypingIndicator() {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: const Color(0xFFCCFBF1),
            child: Icon(
              Icons.auto_awesome,
              size: 14,
              color: Colors.teal.shade800,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.teal.shade700,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  AppLocalizations.of(context).aiThinking,
                  style: TextStyle(
                    fontSize: 13,
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
