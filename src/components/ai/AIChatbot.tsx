import { useState, useRef, useEffect, useCallback } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Table2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { useHaptics } from "@/hooks/useHaptics";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  artifacts?: StructuredArtifact[];
  actions?: StructuredAction[];
  structured?: StructuredResponse;
}

interface StructuredFact {
  source?: string;
  label?: string;
  value?: unknown;
  confidence?: number;
  evidence?: Array<{
    id?: string | number;
    label?: string;
    value?: unknown;
  }>;
}

interface StructuredDataNeed {
  kind?: string;
  priority?: string;
  reason?: string;
}

interface StructuredResponse {
  traceId?: string;
  intent?: {
    kind?: string;
    confidence?: number;
    reason?: string;
  };
  dataNeeds?: StructuredDataNeed[];
  facts?: StructuredFact[];
  artifacts?: StructuredArtifact[];
  actions?: StructuredAction[];
  model?: string;
  tokensUsed?: number;
  debug?: Record<string, unknown>;
}

interface StructuredArtifact {
  id: string;
  type:
    | "metric_card"
    | "table"
    | "chart"
    | "action_confirmation"
    | "quick_replies"
    | "text_block";
  title?: string;
  payload: Record<string, unknown>;
}

interface StructuredAction {
  id: string;
  name: string;
  status: string;
  summary: string;
  payload: Record<string, unknown>;
}

function formatConversationMeta(lastMessageAt: unknown, messageCount: number | null | undefined): string {
  const count = messageCount ?? 0;
  const date = lastMessageAt ? new Date(lastMessageAt as string | number | Date) : null;
  if (!date || Number.isNaN(date.getTime())) return `${count} رسالة`;

  return `${count} رسالة - ${date.toLocaleString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qaPromptSentRef = useRef<string | null>(null);
  const { lightTap } = useHaptics();
  const utils = trpc.useUtils();

  // tRPC mutations & queries
  const sendMessage = trpc.chat.sendMessage.useMutation();
  const confirmAction = trpc.chat.confirmAction.useMutation();
  const cancelAction = trpc.chat.cancelAction.useMutation();
  const quickActions = trpc.chat.getQuickActions.useQuery(undefined, {
    staleTime: 60_000 * 10,
  });
  const conversations = trpc.chat.getConversations.useQuery(undefined, {
    staleTime: 30_000,
  });
  const conversationDetails = trpc.chat.getConversation.useQuery(
    { conversationId: conversationId ?? 0 },
    {
      enabled: Boolean(conversationId) && messages.length === 0,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    },
  );
  const clearConversation = trpc.chat.clearConversation.useMutation();

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    const composer = inputRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 128)}px`;
  }, [input]);

  useEffect(() => {
    const data = conversationDetails.data;
    if (!data || messages.length > 0) return;

    setMessages(
      data.messages.map((message) => {
        const structured = message.structured as StructuredResponse | undefined;
        return {
          id: String(message.id),
          role: message.role as "user" | "assistant",
          content: message.content,
          createdAt: new Date(message.createdAt ?? Date.now()),
          artifacts: structured?.artifacts ?? [],
          actions: structured?.actions ?? [],
          structured,
        };
      }),
    );
  }, [conversationDetails.data, messages.length]);

  // Detect scroll position for "scroll to bottom" button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distanceFromBottom > 100);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Send message handler
  const handleSend = useCallback(async (
    text?: string,
    options?: { conversationId?: number; devQaBypassDailyLimit?: boolean },
  ) => {
    const messageText = (text || input).trim();
    if (!messageText || sendMessage.isPending) return;
    const targetConversationId =
      options && Object.prototype.hasOwnProperty.call(options, "conversationId")
        ? options.conversationId
        : conversationId;

    lightTap();
    setInput("");

    // Add user message immediately
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const result = await sendMessage.mutateAsync({
        message: messageText,
        conversationId: targetConversationId,
        devQaBypassDailyLimit: options?.devQaBypassDailyLimit === true || undefined,
      });

      // Set conversation ID for future messages
      if (!targetConversationId && result.conversationId) {
        setConversationId(result.conversationId);
      }
      utils.chat.getConversations.invalidate();
      if (result.conversationId) {
        utils.chat.getConversation.invalidate({ conversationId: result.conversationId });
      }

      // Add AI response
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: result.response,
        createdAt: new Date(),
        artifacts: result.structured?.artifacts ?? [],
        actions: result.structured?.actions ?? [],
        structured: result.structured as StructuredResponse | undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      const errMsg = error?.message || "حصل مشكلة. جرب تاني.";
      toast.error(errMsg);
      // Remove the optimistic bubble but keep the draft ready for a retry.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(messageText);
    } finally {
      setIsTyping(false);
    }
  }, [conversationId, input, lightTap, sendMessage, utils]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const qaPrompt = params.get("ai_qa_prompt")?.trim();
    if (!qaPrompt) return;

    const prompt = qaPrompt.slice(0, 500);
    const forceNew = params.get("ai_qa_new") === "1";
    const qaKey = `${forceNew ? "new" : "current"}:${prompt}`;
    if (qaPromptSentRef.current === qaKey || sendMessage.isPending) return;

    qaPromptSentRef.current = qaKey;
    if (forceNew) {
      setMessages([]);
      setConversationId(undefined);
      setActionStatuses({});
    }
    void handleSend(prompt, {
      ...(forceNew ? { conversationId: undefined } : {}),
      devQaBypassDailyLimit: true,
    });
  }, [handleSend, sendMessage.isPending]);

  const handleConfirmAction = async (actionId: number) => {
    try {
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: "confirming" }));
      const result = await confirmAction.mutateAsync({ actionId, conversationId });
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: result.status }));
      toast.success(result.message);

      const aiMsg: Message = {
        id: `ai-action-${Date.now()}`,
        role: "assistant",
        content: result.message,
        createdAt: new Date(),
        artifacts: (result.artifacts?.length
          ? result.artifacts
          : result.artifact
            ? [result.artifact]
            : []) as StructuredArtifact[],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: "failed" }));
      toast.error(error?.message || "تعذر تنفيذ العملية");
    }
  };

  const handleCancelAction = async (actionId: number) => {
    try {
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: "cancelling" }));
      const result = await cancelAction.mutateAsync({ actionId, conversationId });
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: result.status }));
      toast.success(result.message);
    } catch (error: any) {
      setActionStatuses((prev) => ({ ...prev, [String(actionId)]: "failed" }));
      toast.error(error?.message || "تعذر إلغاء العملية");
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // New conversation
  const handleNewConversation = () => {
    lightTap();
    setMessages([]);
    setConversationId(undefined);
    setActionStatuses({});
  };

  const handleLoadConversation = (id: number) => {
    if (id === conversationId && messages.length > 0) return;
    lightTap();
    utils.chat.getConversation.invalidate({ conversationId: id });
    setConversationId(id);
    setMessages([]);
    setActionStatuses({});
    setInput("");
  };

  // Clear conversation
  const handleClear = async () => {
    if (!conversationId) {
      handleNewConversation();
      return;
    }
    try {
      await clearConversation.mutateAsync({ conversationId });
      utils.chat.getConversations.invalidate();
      handleNewConversation();
      toast.success("تم مسح المحادثة");
    } catch {
      toast.error("فشل مسح المحادثة");
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Chat header bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">سمارت</p>
            <p className="text-[10px] text-emerald-500 font-medium">● متصل</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={handleNewConversation}
            title="محادثة جديدة"
            aria-label="محادثة جديدة"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={handleClear}
            title="مسح المحادثة"
            aria-label="مسح المحادثة"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {(conversations.data?.length ?? 0) > 0 && (
        <div className="shrink-0 border-b border-border/40 px-3 py-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              <span>المحادثات</span>
            </div>
            {conversations.data?.slice(0, 12).map((conversation) => {
              const isActive = conversation.id === conversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleLoadConversation(conversation.id)}
                  className={cn(
                    "shrink-0 max-w-[180px] rounded-md border px-2.5 py-1.5 text-start text-[11px] transition-colors",
                    isActive
                      ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                  title={conversation.title || "محادثة"}
                >
                  <span className="block truncate font-medium">
                    {conversation.title || "محادثة"}
                  </span>
                  <span className="block text-[10px] opacity-70">
                    {formatConversationMeta(conversation.lastMessageAt, conversation.messageCount)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto chat-scroll px-4 py-3 space-y-3"
      >
        {/* Empty state */}
        {isEmpty && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {conversationDetails.isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جاري تحميل المحادثة...</span>
              </div>
            ) : (
              <>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>
            <h3 className="text-base font-bold mb-1">أهلاً! أنا سمارت 👋</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              مستشارك المالي الذكي. اسألني أي حاجة عن مصاريفك!
            </p>

            {/* Quick actions */}
            {quickActions.data && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {quickActions.data.map((action, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    type="button"
                    onClick={() => handleSend(action.prompt)}
                    className="tap-target active-press text-start p-3 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors text-xs font-medium"
                  >
                    {action.label}
                  </motion.button>
                ))}
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* Messages */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-start" : "justify-end",
              )}
            >
              <div
                className={
                  msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                }
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap selectable-text">
                  {msg.content}
                </p>
                {msg.artifacts && msg.artifacts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.artifacts.map((artifact) => (
                      <StructuredArtifactRenderer
                        key={artifact.id}
                        artifact={artifact}
                        status={
                          artifact.type === "action_confirmation"
                            ? actionStatuses[String(artifact.payload.actionId)]
                            : undefined
                        }
                        onConfirm={handleConfirmAction}
                        onCancel={handleCancelAction}
                      />
                    ))}
                  </div>
                )}
                {import.meta.env.DEV && msg.role === "assistant" && msg.structured && (
                  <TraceRenderer structured={msg.structured} />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="chat-bubble-ai">
              <div className="typing-dots text-indigo-500">
                <span />
                <span />
                <span />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-background border border-border shadow-lg flex items-center justify-center"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-lg px-3 py-2 pb-safe">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب رسالتك..."
              aria-label="اكتب رسالتك إلى سمارت"
              rows={1}
              className="w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all max-h-32"
              style={{ minHeight: "44px" }}
              disabled={sendMessage.isPending}
            />
          </div>
          <Button
            type="button"
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || sendMessage.isPending}
            aria-label="إرسال الرسالة"
            className={cn(
              "tap-target active-press shrink-0 h-11 w-11 rounded-xl transition-all duration-200",
              input.trim()
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md hover:shadow-lg"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sendMessage.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 rtl:rotate-180" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function textValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return value.toLocaleString("ar-EG", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
  }
  return fallback;
}

function moneyText(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("ar-EG", {
    maximumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
  });
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function shortText(value: unknown, maxLength = 90): string {
  const text = textValue(value, "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function debugNumber(debug: Record<string, unknown>, key: string): number | undefined {
  return numberValue(debug[key]);
}

const TRACE_FACT_PRIORITY: Record<string, string[]> = {
  "finance.summary": [
    "period",
    "total_income",
    "total_expense",
    "net_flow",
    "expense_count",
    "transaction_count",
    "income_count",
  ],
  "finance.category_total": [
    "period",
    "category",
    "category_total_expense",
    "transaction_count",
  ],
  "finance.person_total": [
    "person_name",
    "person_relation",
    "period",
    "person_total_expense",
    "transaction_count",
  ],
  "finance.classification_trace": [
    "expense_id",
    "description",
    "stored_category",
    "date",
    "trace_available",
    "parsed_by",
    "decision",
    "confidence",
  ],
};

function orderedTraceFacts(facts: StructuredFact[]): StructuredFact[] {
  return [...facts].sort((a, b) => {
    const aPriority = TRACE_FACT_PRIORITY[a.source ?? ""]?.indexOf(a.label ?? "") ?? -1;
    const bPriority = TRACE_FACT_PRIORITY[b.source ?? ""]?.indexOf(b.label ?? "") ?? -1;
    const aScore = aPriority >= 0 ? aPriority : 100;
    const bScore = bPriority >= 0 ? bPriority : 100;
    return aScore - bScore;
  });
}

function TraceRenderer({ structured }: { structured: StructuredResponse }) {
  const debug = recordValue(structured.debug);
  const cacheHits = arrayValue<string>(debug.cacheHits).map((item) => String(item));
  const cacheRuntime = recordValue(debug.cacheRuntime);
  const retrievalPolicy = recordValue(debug.retrievalPolicy);
  const cacheBackend = textValue(cacheRuntime.backend, "unknown");
  const cacheText = [
    cacheBackend,
    cacheRuntime.redisConfigured === false ? "redis off" : "",
    numberValue(cacheRuntime.memoryEntries) !== undefined ? `ram ${numberValue(cacheRuntime.memoryEntries)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const embeddingHits = cacheHits.filter((item) => item.startsWith("embedding:"));
  const fallbackEmbeddingCalls = cacheHits.some((item) => item.startsWith("memory_cache:hit"))
    ? 0
    : embeddingHits.includes("embedding:query_embedded") && embeddingHits.includes("embedding:fireworks")
      ? 1
      : 0;
  const embeddingCalls = debugNumber(debug, "embeddingCalls") ?? fallbackEmbeddingCalls;
  const embeddingApiStatus = textValue(
    debug.embeddingApiStatus,
    cacheHits.some((item) => item.startsWith("memory_cache:hit"))
      ? "semantic_result_cache_hit"
      : embeddingCalls > 0
        ? "fireworks_live_call"
        : "skipped",
  );
  const retrievalEmbedding = textValue(
    retrievalPolicy.embedding,
    embeddingHits.length > 0 ? "fireworks_qwen" : "skipped",
  );
  const retrievalReason = textValue(retrievalPolicy.reason, "");
  const retrievalRows = numberValue(retrievalPolicy.vectorRows);
  const retrievalDimensions = numberValue(retrievalPolicy.dimensions);
  const otherCacheHits = cacheHits.filter((item) => !item.startsWith("embedding:")).slice(0, 4);
  const dataNeeds = arrayValue<StructuredDataNeed>(structured.dataNeeds);
  const facts = arrayValue<StructuredFact>(structured.facts);
  const topFacts = orderedTraceFacts(facts).slice(0, 5);
  const hallucinationRisk = textValue(debug.hallucinationRisk, "unknown");
  const responseSchemaVersion = textValue(debug.responseSchemaVersion, "-");
  const historicalStructuredResponse = debug.historicalStructuredResponse === true;
  const numericAccuracy = recordValue(debug.numericAccuracy);
  const accuracyValue = numberValue(numericAccuracy.accuracy);
  const missingNumbers = arrayValue<string>(numericAccuracy.missing).map(String).slice(0, 4);
  const llmCalls = debugNumber(debug, "llmCalls") ?? 0;
  const resolvedFacts = debugNumber(debug, "resolvedFacts") ?? facts.length;
  const inputTokens = debugNumber(debug, "estimatedInputTokens");
  const tokenText = [inputTokens !== undefined ? `in ${inputTokens}` : "", structured.tokensUsed ? `total ${structured.tokensUsed}` : ""]
    .filter(Boolean)
    .join(" / ");
  const intentKind = structured.intent?.kind ?? "unknown";
  const toolText = dataNeeds.map((need) => need.kind).filter(Boolean).join(", ") || "none";
  const embeddingText = embeddingHits.length > 0 ? embeddingHits.join(", ") : "none";

  return (
    <details
      className="mt-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[10px] text-muted-foreground"
      aria-label={`ai-trace route=${intentKind} tools=${toolText} retrieval=${retrievalEmbedding} embedding=${embeddingText} embeddingCalls=${embeddingCalls} embeddingApiStatus=${embeddingApiStatus} cache=${cacheBackend} risk=${hallucinationRisk} schema=${responseSchemaVersion}${historicalStructuredResponse ? " historical=true" : ""}`}
    >
      <summary className="cursor-pointer select-none font-medium text-foreground/80">
        Trace: {intentKind} · tools {dataNeeds.length} · LLM {llmCalls} · embed {embeddingCalls}
      </summary>
      <div className="mt-2 grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span>trace</span>
          <span className="truncate text-end font-mono">{structured.traceId ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>route</span>
          <span className="truncate text-end">{intentKind} / {structured.intent?.reason ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>tools</span>
          <span className="truncate text-end">{toolText}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>embedding</span>
          <span className="truncate text-end">{embeddingText}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>embedding calls</span>
          <span className="truncate text-end">{embeddingCalls}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>embedding API</span>
          <span className="truncate text-end">{embeddingApiStatus}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>retrieval policy</span>
          <span className="truncate text-end">
            {retrievalEmbedding}
            {retrievalRows !== undefined ? ` / rows ${retrievalRows}` : ""}
            {retrievalDimensions !== undefined ? ` / dim ${retrievalDimensions}` : ""}
            {retrievalReason ? ` / ${retrievalReason}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cache</span>
          <span className="truncate text-end">{otherCacheHits.join(", ") || "none"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cache backend</span>
          <span className="truncate text-end">{cacheText || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cost</span>
          <span className="truncate text-end">facts {resolvedFacts} · tokens {tokenText || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>schema</span>
          <span className="truncate text-end">
            v{responseSchemaVersion}
            {historicalStructuredResponse ? " / historical" : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>risk</span>
          <span className="truncate text-end">
            {hallucinationRisk}
            {accuracyValue !== undefined ? ` / nums ${Math.round(accuracyValue * 100)}%` : ""}
            {missingNumbers.length ? ` / missing ${missingNumbers.join(", ")}` : ""}
          </span>
        </div>
        {structured.model && (
          <div className="flex items-center justify-between gap-3">
            <span>model</span>
            <span className="truncate text-end">{structured.model}</span>
          </div>
        )}
        {topFacts.length > 0 && (
          <div className="mt-1 space-y-1 border-t border-border/40 pt-1.5">
            {topFacts.map((fact, index) => (
              <div key={`${fact.source ?? "fact"}-${fact.label ?? index}`} className="grid grid-cols-[88px_1fr] gap-2">
                <span className="truncate">{shortText(fact.source)}.{shortText(fact.label, 32)}</span>
                <span className="truncate text-end">{shortText(fact.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function actionFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    title: "العنوان",
    description: "الوصف",
    targetAmount: "المبلغ المستهدف",
    targetDate: "تاريخ الهدف",
    category: "الفئة",
    monthlyLimit: "الحد الشهري",
    linkedGoalId: "الهدف المرتبط",
    amount: "المبلغ",
    date: "التاريخ",
    placeHint: "المكان",
    paymentMethod: "طريقة الدفع",
    walletId: "المحفظة",
    expenseId: "رقم المصروف",
    goalId: "رقم الهدف",
    budgetPlanId: "رقم الميزانية",
    type: "النوع",
    subCategory: "التصنيف الفرعي",
    name: "الاسم",
    provider: "المزود",
    section: "القسم",
    patch: "التعديلات",
    confirmLabel: "الإجراء",
    cancelLabel: "الإجراء",
    risk: "المخاطرة",
    summary: "الملخص",
  };
  return labels[key] ?? key;
}

function displayActionValue(key: string, value: unknown): string | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  if (key === "type") {
    const types: Record<string, string> = {
      expense: "مصروف",
      income: "دخل",
      transfer: "تحويل",
      investment: "استثمار",
    };
    return types[text] ?? text;
  }
  // Server now sends Arabic display names; use directly
  if (key === "category" || key === "subCategory") return text;
  if (key === "confirmLabel" || key === "cancelLabel") return text;
  return undefined;
}

function actionFieldValue(key: string, value: unknown): string {
  const displayValue = displayActionValue(key, value);
  if (displayValue) return displayValue;
  const numeric = numberValue(value);
  if (numeric !== undefined && /amount|limit|balance|income|expense/i.test(key)) {
    return `${textValue(numeric)} جنيه`;
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([innerKey, innerValue]) => `${actionFieldLabel(innerKey)}: ${textValue(innerValue, "-")}`)
      .join("، ");
  }
  return textValue(value, "-");
}

function visibleActionFields(fields: Record<string, unknown>): Array<[string, unknown]> {
  const hidden = new Set(["rawText"]);
  return Object.entries(fields).filter(([key, value]) => {
    if (hidden.has(key)) return false;
    return value !== undefined && value !== null && value !== "";
  });
}

function visibleResultFields(fields: Record<string, unknown>): Array<[string, unknown]> {
  const hidden = new Set(["expenseId", "goalId", "walletId", "budgetPlanId", "storage"]);
  return Object.entries(fields).filter(([key, value]) => {
    if (hidden.has(key)) return false;
    return value !== undefined && value !== null && value !== "";
  });
}

function StructuredArtifactRenderer({
  artifact,
  status,
  onConfirm,
  onCancel,
}: {
  artifact: StructuredArtifact;
  status?: string;
  onConfirm: (actionId: number) => void;
  onCancel: (actionId: number) => void;
}) {
  if (artifact.type === "action_confirmation") {
    const actionId = numberValue(artifact.payload.actionId);
    const disabled =
      !actionId ||
      status === "confirming" ||
      status === "cancelling" ||
      status === "executed" ||
      status === "cancelled";
    const fields = (artifact.payload.fields ?? {}) as Record<string, unknown>;

    return (
      <div className="rounded-md border border-indigo-500/20 bg-indigo-500/5 p-3 text-start">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-indigo-500" />
          <span>{textValue(artifact.title, "تأكيد العملية")}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {textValue(artifact.payload.summary)}
        </p>
        <div className="mt-2 grid gap-1 text-xs">
          {visibleActionFields(fields).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{actionFieldLabel(key)}</span>
              <span className="font-medium text-end">{actionFieldValue(key, value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => actionId && onConfirm(actionId)}
          >
            {status === "confirming" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>{status === "executed" ? "تم التنفيذ" : "تأكيد"}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={disabled}
            onClick={() => actionId && onCancel(actionId)}
          >
            <X className="h-4 w-4" />
            <span>{status === "cancelled" ? "تم الإلغاء" : "إلغاء"}</span>
          </Button>
        </div>
      </div>
    );
  }

  if (artifact.type === "metric_card") {
    return (
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-start">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-emerald-500" />
          <span>{artifact.title || "نتيجة"}</span>
        </div>
        <div className="mt-2 grid gap-1 text-xs">
          {visibleResultFields(artifact.payload).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{actionFieldLabel(key)}</span>
              <span className="font-medium text-end">{actionFieldValue(key, value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.type === "table") {
    const rows = Array.isArray(artifact.payload.rows)
      ? (artifact.payload.rows as Array<Record<string, unknown>>)
      : [];
    const keys = rows[0] ? Object.keys(rows[0]).slice(0, 4) : [];

    return (
      <div className="rounded-md border border-border/60 p-2 text-start">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Table2 className="h-4 w-4" />
          <span>{artifact.title || "جدول"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {rows.slice(0, 5).map((row, index) => (
                <tr key={index} className="border-t border-border/40">
                  {keys.map((key) => (
                    <td key={key} className="py-1 pe-2">
                      {textValue(row[key], "-")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (artifact.type === "chart") {
    const series = Array.isArray(artifact.payload.series)
      ? (artifact.payload.series as Array<{ key?: string; label?: string; color?: string }>)
          .map((item, index) => ({
            key: textValue(item.key, `series_${index + 1}`),
            label: textValue(item.label, textValue(item.key, `Series ${index + 1}`)),
            color: textValue(item.color, ["#2563eb", "#16a34a", "#dc2626", "#9333ea"][index % 4]),
          }))
          .filter((item) => item.key)
      : [];
    const activeSeries = series.length > 0 ? series : [{ key: "value", label: "المبلغ", color: "#6366f1" }];
    const points = Array.isArray(artifact.payload.points)
      ? (artifact.payload.points as Array<Record<string, unknown>>)
      : [];
    const chartData = points.slice(0, 12).map((point) => ({
      label: textValue(point.label, "-"),
      ...Object.fromEntries(activeSeries.map((item) => [item.key, Number(point[item.key] || 0)])),
      value: Number(point.value || 0),
      count: Number(point.count || 0),
    }));
    const labelByKey = Object.fromEntries(activeSeries.map((item) => [item.key, item.label]));

    return (
      <div className="rounded-md border border-border/60 p-3 text-start">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <BarChart3 className="h-4 w-4" />
          <span>{artifact.title || "رسم بياني"}</span>
        </div>
        {chartData.length > 0 ? (
          <>
          <div
            className="h-52 w-full min-w-0"
            aria-label={`chart-data ${chartData
              .map((point) => `${point.label}:${moneyText(point.value)}`)
              .join(" | ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => String(value).slice(0, 8)}
                />
                <YAxis hide width={0} />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  formatter={(value, name) => [
                    `${moneyText(value)} ج.م`,
                    labelByKey[String(name)] ?? String(name),
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    fontSize: 12,
                  }}
                />
                {activeSeries.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {activeSeries.map((item) => (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    fill={item.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={34}
                  />
                ))}
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-3">
            {chartData.slice(0, 12).map((point) => (
              <div
                key={point.label}
                className="rounded border border-border/50 bg-muted/20 px-2 py-1"
                aria-label={`chart-point ${point.label} ${moneyText(point.value)} جنيه ${moneyText(point.count)} عملية`}
              >
                <span className="block font-semibold">{point.label}</span>
                <span className="block text-muted-foreground">
                  {moneyText(point.value)} ج.م · {moneyText(point.count)} عملية
                </span>
              </div>
            ))}
          </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد نقاط كافية للرسم.</p>
        )}
      </div>
    );
  }

  if (artifact.type === "quick_replies") {
    const replies = Array.isArray(artifact.payload.replies)
      ? (artifact.payload.replies as string[])
      : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {replies.map((reply) => (
          <span key={reply} className="rounded-md bg-muted px-2 py-1 text-xs">
            {reply}
          </span>
        ))}
      </div>
    );
  }

  if (artifact.type === "text_block") {
    const steps = Array.isArray(artifact.payload.steps)
      ? (artifact.payload.steps as string[])
      : [];
    return (
      <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-start">
        <div className="mb-1 text-xs font-semibold">{artifact.title || "شرح سريع"}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {textValue(artifact.payload.content)}
        </p>
        {steps.length > 0 && (
          <ol className="mt-2 list-decimal space-y-1 pe-4 text-xs">
            {steps.slice(0, 5).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return null;
}
