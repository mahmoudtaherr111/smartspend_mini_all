import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

import '../account/account_providers.dart';
import '../account/onboarding_questions_screen.dart';
import '../infrastructure/remote_config.dart';
import '../ledger/ledger_providers.dart';
import '../ledger/offline/outbox.dart';
import '../stats/stats_providers.dart';
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
      showSmartSpendNotice(
        context,
        AppLocalizations.of(context).aiWeNeedInternetToAnswer,
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
        if (!isOnline)
          OfflineBanner(AppLocalizations.of(context).aiYouReOfflineYourDraft),

        // Daily limit reached, with the way past it
        if (dailyLimitError != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              SmartSpendSpacing.screen,
              SmartSpendSpacing.sm,
              SmartSpendSpacing.screen,
              0,
            ),
            child: InlineMessage(
              dailyLimitError,
              tone: MessageTone.warning,
              icon: Icons.bolt_rounded,
              action: TextButton(
                onPressed: () => showUpgradePromptSheet(
                  context: context,
                  reason: UpgradeLimitReason.aiTokens,
                ),
                child: Text(AppLocalizations.of(context).aiUpgradeToPro),
              ),
            ),
          ),

        if (ref.watch(remoteConfigProvider).value?.aiOff.contains('chat') ??
            false)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              SmartSpendSpacing.screen,
              SmartSpendSpacing.sm,
              SmartSpendSpacing.screen,
              0,
            ),
            child: InlineMessage(
              AppLocalizations.of(context).aiChatStopped,
              tone: MessageTone.warning,
            ),
          ),

        // Message List
        Expanded(
          child: messagesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => Center(
              child: ErrorState(
                message: AppLocalizations.of(context).aiWeCanTLoadYour,
                retryLabel: AppLocalizations.of(context).retry,
                onRetry: () {
                  final id = ref.read(activeConversationIdProvider);
                  if (id != null) {
                    ref
                        .read(chatMessagesProvider.notifier)
                        .loadConversation(id);
                  }
                },
              ),
            ),
            data: (messages) {
              final showQuickQuestions = messages.isEmpty && isOnline;

              return ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.screen,
                  vertical: SmartSpendSpacing.md,
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
        ColoredBox(
          color: context.smartSpendColors.surface,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(SmartSpendSpacing.sm),
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
                            ? AppLocalizations.of(context)
                                  .aiAskAboutYourSpending
                            : AppLocalizations.of(context)
                                  .aiSendingNeedsInternet,
                      ),
                    ),
                  ),
                  const SizedBox(width: SmartSpendSpacing.sm),
                  IconButton.filled(
                    tooltip: AppLocalizations.of(context).aiSend,
                    constraints: const BoxConstraints.tightFor(
                      width: 48,
                      height: 48,
                    ),
                    onPressed: isTyping ? null : _handleSend,
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// The chat opens on the person's own month and the question it raises, read from the statistics the app already
  /// has, so it costs no model call. Null until something was recorded this month.
  ({String text, String question})? _opening() {
    final month = ref.watch(currentMonthProvider).value;
    final stats = month == null
        ? null
        : ref.watch(monthStatsByMonthProvider(month)).value;
    if (stats == null || stats.expense <= 0 || stats.categories.isEmpty) {
      return null;
    }
    final top = stats.categories.reduce((a, b) => a.amount >= b.amount ? a : b);
    final l10n = AppLocalizations.of(context);
    return (
      text: l10n.aiOpeningMonth(moneyText(context, stats.expense), top.name),
      question: l10n.aiOpeningQuestion(top.name),
    );
  }

  Widget _buildQuickQuestionsHeader(AsyncValue<List<String>> questionsAsync) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final opening = _opening();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const _AssistantMark(),
              const SizedBox(width: SmartSpendSpacing.sm),
              Expanded(
                child: Text(
                  AppLocalizations.of(context).aiHiIMYourAssistant,
                  style: textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            opening?.text ??
                AppLocalizations.of(context).aiAskAboutYourSpendingOr,
            style: opening == null
                ? textTheme.bodyMedium?.copyWith(color: colors.mutedForeground)
                : textTheme.bodyLarge,
          ),
          if (questionsAsync.value?.isNotEmpty ?? false) ...[
            const SizedBox(height: SmartSpendSpacing.lg),
            Text(
              AppLocalizations.of(context).aiTryAsking,
              style: textTheme.labelLarge,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
          ],
          // A question that makes the answers better is asked here, where its use is plain.
          if (ref.watch(nextPersonalQuestionProvider).value != null) ...[
            const SizedBox(height: SmartSpendSpacing.md),
            GroupedSection(
              children: [
                GroupedRow(
                  icon: Icons.psychology_outlined,
                  tint: colors.ai,
                  title: AppLocalizations.of(context).aiOneQuestion,
                  subtitle: AppLocalizations.of(context).aiOneQuestionBody,
                  onTap: () => context.push(OnboardingQuestionsScreen.path),
                ),
              ],
            ),
          ],
          questionsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (err, stack) => const SizedBox.shrink(),
            data: (questions) => Wrap(
              spacing: SmartSpendSpacing.sm,
              runSpacing: SmartSpendSpacing.sm,
              children: [
                for (final q in [?opening?.question, ...questions])
                  ActionChip(
                    label: Text(q),
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
    final colors = context.smartSpendColors;
    const tail = Radius.circular(SmartSpendSpacing.xs);
    const corner = Radius.circular(SmartSpendRadii.md);
    // The mark's width and the gap after it, so what belongs to a message lines up under its text.
    const indent = _AssistantMark.size + SmartSpendSpacing.sm;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.xs),
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
                const _AssistantMark(),
                const SizedBox(width: SmartSpendSpacing.sm),
              ],
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: SmartSpendSpacing.md,
                    vertical: SmartSpendSpacing.sm,
                  ),
                  decoration: BoxDecoration(
                    color: isUser ? colors.accent : colors.surface,
                    borderRadius: BorderRadiusDirectional.only(
                      topStart: corner,
                      topEnd: corner,
                      bottomStart: isUser ? corner : tail,
                      bottomEnd: isUser ? tail : corner,
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
              padding: const EdgeInsetsDirectional.only(
                top: SmartSpendSpacing.sm,
                start: indent,
              ),
              child: Wrap(
                spacing: SmartSpendSpacing.sm,
                runSpacing: SmartSpendSpacing.sm,
                children: [
                  for (final reply in msg.clarification!.replies)
                    ActionChip(
                      label: Text(reply),
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
              padding: const EdgeInsetsDirectional.only(start: indent),
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
            if (i > 0) const SizedBox(height: SmartSpendSpacing.xs),
            _buildFormattedLine(lines[i], isUser),
          ],
        ],
      ),
    );
  }

  Widget _buildFormattedLine(String line, bool isUser) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) return const SizedBox(height: SmartSpendSpacing.sm);

    // List item (bullet)
    final isBullet =
        trimmed.startsWith('* ') ||
        trimmed.startsWith('- ') ||
        trimmed.startsWith('• ');
    final content = isBullet ? trimmed.substring(2).trim() : trimmed;

    final spans = _parseSpans(content, isUser);

    if (isBullet) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.xs / 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          textDirection: TextDirection.rtl,
          children: [
            Text(
              '• ',
              style: Theme.of(context).textTheme.titleSmall
                  ?.copyWith(color: _textColor(isUser)),
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

  Color _textColor(bool isUser) {
    final colors = context.smartSpendColors;
    return isUser ? colors.onAccent : colors.foreground;
  }

  InlineSpan _buildSpan(String text, bool isUser, {required bool isBold}) {
    final theme = Theme.of(context).textTheme;
    return TextSpan(
      text: text,
      style: (isBold ? theme.titleSmall : theme.bodyMedium)?.copyWith(
        color: _textColor(isUser),
      ),
    );
  }

  Widget _buildTypingIndicator() {
    final colors = context.smartSpendColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SmartSpendSpacing.xs),
      child: Row(
        children: [
          const _AssistantMark(),
          const SizedBox(width: SmartSpendSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: SmartSpendSpacing.md,
              vertical: SmartSpendSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(SmartSpendRadii.md),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox.square(
                  dimension: SmartSpendSpacing.md,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.ai,
                  ),
                ),
                const SizedBox(width: SmartSpendSpacing.sm),
                Text(
                  AppLocalizations.of(context).aiThinking,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The assistant's mark beside what it says, in the AI Center's colour.
class _AssistantMark extends StatelessWidget {
  const _AssistantMark();

  static const double size = 28;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colors.ai.withValues(alpha: 0.14),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.auto_awesome, size: 16, color: colors.ai),
      ),
    );
  }
}
