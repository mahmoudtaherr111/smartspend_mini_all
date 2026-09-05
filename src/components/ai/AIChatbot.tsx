import { useState, useRef, useEffect, useCallback } from "react";
import {
  AlertCircle,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Copy,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Table2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { AIMemoryManager } from "./AIMemoryManager";
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
  clarification?: {
    question?: string;
    replies?: string[];
    missing?: string[];
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

interface ParsedBlock {
  type:
    | "heading"
    | "list"
    | "table"
    | "code_block"
    | "blockquote"
    | "paragraph"
    | "divider";
  level?: number;
  items?: string[];
  ordered?: boolean;
  language?: string;
  code?: string;
  rows?: string[][];
  headers?: string[];
  text?: string;
}

function formatConversationMeta(
  lastMessageAt: unknown,
  messageCount: number | null | undefined,
): string {
  const count = messageCount ?? 0;
  const date = lastMessageAt
    ? new Date(lastMessageAt as string | number | Date)
    : null;
  if (!date || Number.isNaN(date.getTime())) return `${count} رسالة`;

  return `${count} رسالة - ${date.toLocaleString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatAiErrorMessage(error: any): {
  message: string;
  isRateLimit: boolean;
  isTimeout: boolean;
  isAborted: boolean;
  isQuotaExhausted: boolean;
} {
  const errStr = error?.message || (typeof error === "string" ? error : "");
  const errCode = error?.data?.code || error?.code;
  const status = error?.data?.httpStatus || error?.status;

  if (
    error?.name === "AbortError" ||
    errStr.includes("aborted") ||
    errStr.includes("AbortError")
  ) {
    return {
      message: "تم إلغاء الطلب.",
      isRateLimit: false,
      isTimeout: false,
      isAborted: true,
      isQuotaExhausted: false,
    };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      message:
        "انقطع الاتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مرة أخرى.",
      isRateLimit: false,
      isTimeout: false,
      isAborted: false,
      isQuotaExhausted: false,
    };
  }

  if (
    errStr.includes("network failure") ||
    errStr.includes("Failed to fetch") ||
    errStr.includes("تعذر الاتصال بالخادم")
  ) {
    return {
      message:
        "تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت ثم المحاولة ثانية.",
      isRateLimit: false,
      isTimeout: false,
      isAborted: false,
      isQuotaExhausted: false,
    };
  }

  if (
    status === 429 ||
    errCode === "TOO_MANY_REQUESTS" ||
    errStr.includes("429") ||
    errStr.includes("طلبات كثيرة") ||
    errStr.includes("الحد الأقصى لعدد الطلبات")
  ) {
    return {
      message:
        "وصلت للحد الأقصى لعدد طلبات الذكاء الاصطناعي حالياً (429). انتظر بضع ثوانٍ وسيعود النظام للعمل تلقائياً.",
      isRateLimit: true,
      isTimeout: false,
      isAborted: false,
      isQuotaExhausted: false,
    };
  }

  if (
    status === 403 ||
    errCode === "FORBIDDEN" ||
    errStr.includes("استهلكت رصيدك الشهري") ||
    errStr.includes("وصلت للحد الشهري")
  ) {
    return {
      message:
        errStr ||
        "استهلكت رصيدك الشهري من الذكاء الاصطناعي. يتجدد تلقائياً بداية الشهر القادم أو يمكنك ترقية خطتك.",
      isRateLimit: false,
      isTimeout: false,
      isAborted: false,
      isQuotaExhausted: true,
    };
  }

  if (
    status >= 500 ||
    errCode === "INTERNAL_SERVER_ERROR" ||
    errStr.includes("503") ||
    errStr.includes("ضغط مؤقت") ||
    errStr.includes("overloaded")
  ) {
    return {
      message:
        "مزود خدمة الذكاء الاصطناعي يواجه ضغطاً مؤقتاً. جاري التحويل أو المحاولة بعد لحظات.",
      isRateLimit: false,
      isTimeout: false,
      isAborted: false,
      isQuotaExhausted: false,
    };
  }

  return {
    message: errStr || "حصل مشكلة أثناء معالجة رسالتك. جرب تاني.",
    isRateLimit: false,
    isTimeout: false,
    isAborted: false,
    isQuotaExhausted: false,
  };
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2.5 rounded-xl border border-border/60 bg-slate-950 text-slate-100 overflow-hidden text-start font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-slate-200 transition-colors"
          title="نسخ الكود"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">تم النسخ</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>نسخ</span>
            </>
          )}
        </button>
      </div>
      <pre
        className="p-3 overflow-x-auto leading-relaxed select-text"
        dir="ltr"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\s*(?:ج\.م|EGP|LE|\$|€|%))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={index}
          dir="ltr"
          className="font-mono text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20 inline-block align-middle my-0.5"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
    ) {
      return (
        <strong key={index} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
    ) {
      return (
        <em key={index} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("~~") && part.endsWith("~~") && part.length >= 4) {
      return (
        <del key={index} className="line-through text-muted-foreground">
          {part.slice(2, -2)}
        </del>
      );
    }

    if (/^[\d,.]+\s*(?:ج\.م|EGP|LE|\$|€|%)$/.test(part.trim())) {
      return (
        <bdi
          key={index}
          className="font-semibold text-foreground px-0.5 inline-block"
        >
          {part}
        </bdi>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function parseMarkdownBlocks(rawText: string): ParsedBlock[] {
  const lines = rawText.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(?:---|___|\*\*\*)$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    // Code block ```
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i++;
      }
      blocks.push({
        type: "code_block",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    // Heading (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Table (| ... |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
        const headerRow = parseRow(tableLines[0]);
        let startIndex = 1;
        if (tableLines[1] && /^\|(?:\s*:?-+:?\s*\|)+$/.test(tableLines[1])) {
          startIndex = 2;
        }
        const dataRows = tableLines.slice(startIndex).map(parseRow);
        blocks.push({
          type: "table",
          headers: headerRow,
          rows: dataRows,
        });
        continue;
      }
    }

    // Unordered List (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        ordered: false,
        items,
      });
      continue;
    }

    // Ordered List (1., 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        ordered: true,
        items,
      });
      continue;
    }

    // Paragraph (accumulate normal lines until blank line or block start)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(?:---|___|\*\*\*)$/.test(lines[i].trim())
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: pLines.join("\n"),
      });
    }
  }

  return blocks;
}

function BidiMarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className="space-y-2 text-sm leading-relaxed selectable-text break-words"
      dir="auto"
    >
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const level = block.level || 1;
            if (level === 1) {
              return (
                <h2
                  key={index}
                  className="text-base font-bold text-foreground mt-2 mb-1 pb-1 border-b border-border/40"
                >
                  {renderInlineMarkdown(block.text || "")}
                </h2>
              );
            }
            if (level === 2) {
              return (
                <h3
                  key={index}
                  className="text-sm font-bold text-foreground mt-2 mb-1 text-indigo-600 dark:text-indigo-400"
                >
                  {renderInlineMarkdown(block.text || "")}
                </h3>
              );
            }
            return (
              <h4
                key={index}
                className="text-xs font-semibold text-foreground/90 mt-1.5 mb-0.5"
              >
                {renderInlineMarkdown(block.text || "")}
              </h4>
            );
          }
          case "paragraph":
            return (
              <p key={index} className="leading-relaxed whitespace-pre-wrap">
                {renderInlineMarkdown(block.text || "")}
              </p>
            );
          case "list":
            if (block.ordered) {
              return (
                <ol
                  key={index}
                  className="list-decimal space-y-1 pe-4 ps-5 my-1 text-xs sm:text-sm"
                >
                  {block.items?.map((item, itemIdx) => (
                    <li key={itemIdx} className="leading-relaxed">
                      {renderInlineMarkdown(item)}
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul
                key={index}
                className="space-y-1 pe-2 ps-4 my-1 text-xs sm:text-sm"
              >
                {block.items?.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    className="flex items-start gap-2 leading-relaxed"
                  >
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2" />
                    <span className="flex-1">{renderInlineMarkdown(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case "blockquote":
            return (
              <div
                key={index}
                className="rounded-r-lg border-s-4 border-indigo-500/50 bg-indigo-500/5 px-3 py-2 text-xs text-muted-foreground my-1.5"
              >
                {renderInlineMarkdown(block.text || "")}
              </div>
            );
          case "code_block":
            return (
              <CodeBlock
                key={index}
                code={block.code || ""}
                language={block.language}
              />
            );
          case "table":
            return (
              <div
                key={index}
                className="my-2 overflow-x-auto rounded-lg border border-border/60"
              >
                <table className="w-full text-xs text-start">
                  {block.headers && (
                    <thead className="bg-muted/50 border-b border-border/60">
                      <tr>
                        {block.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="px-3 py-2 font-semibold text-start"
                          >
                            {renderInlineMarkdown(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {block.rows?.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-t border-border/30 hover:bg-muted/20 transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-1.5">
                            {renderInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "divider":
            return <hr key={index} className="my-2.5 border-border/40" />;
          default:
            return null;
        }
      })}
    </div>
  );
}

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, string>>(
    {},
  );
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qaPromptSentRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { lightTap } = useHaptics();
  const utils = trpc.useUtils();

  // tRPC mutations & queries
  const sendMessage = trpc.chat.sendMessage.useMutation();
  const confirmAction = trpc.chat.confirmAction.useMutation();
  const cancelAction = trpc.chat.cancelAction.useMutation();
  const quickActions = trpc.chat.getQuickActions.useQuery(undefined, {
    staleTime: 60_000 * 10,
  });
  const quickActionItems = Array.isArray(quickActions.data)
    ? quickActions.data
    : [];
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

  // Clean unmount lifecycle: Abort any in-flight AI queries when navigating away
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort("unmount");
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Cooldown countdown for rate limits
  useEffect(() => {
    if (rateLimitCooldown <= 0) return;

    const timer = setInterval(() => {
      setRateLimitCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitCooldown]);

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
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distanceFromBottom > 100);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Listen to visualViewport changes for iOS/PWA virtual keyboard stability
  useEffect(() => {
    if (!window.visualViewport) return;
    const handleViewportResize = () => {
      scrollToBottom();
    };
    window.visualViewport.addEventListener("resize", handleViewportResize);
    return () =>
      window.visualViewport?.removeEventListener(
        "resize",
        handleViewportResize,
      );
  }, [scrollToBottom]);

  // Stop Generation handler (AbortController trigger)
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("user_stop");
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    lightTap();
    toast.info("تم إيقاف التوليد بناءً على طلبك.");
  }, [lightTap]);

  // Send message handler with AbortController lifecycle, timeout recovery & rate-limit handling
  const handleSend = useCallback(
    async (
      text?: string,
      options?: { conversationId?: number; devQaBypassDailyLimit?: boolean },
    ) => {
      const messageText = (text || input).trim();
      if (!messageText || isTyping || rateLimitCooldown > 0) return;

      // Cleanly abort previous in-flight AI request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort("new_prompt");
        abortControllerRef.current = null;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const targetConversationId =
        options &&
        Object.prototype.hasOwnProperty.call(options, "conversationId")
          ? options.conversationId
          : conversationId;

      lightTap();
      setInput("");
      setLastFailedPrompt(null);

      // Add user message immediately
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      // Client-side 45-second timeout safeguard
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current === controller) {
          controller.abort("timeout");
        }
      }, 45_000);

      try {
        const result = await sendMessage.mutateAsync({
          message: messageText,
          conversationId: targetConversationId,
          devQaBypassDailyLimit:
            options?.devQaBypassDailyLimit === true || undefined,
        });

        clearTimeout(timeoutId);

        // Set conversation ID for future messages
        if (!targetConversationId && result.conversationId) {
          setConversationId(result.conversationId);
        }
        utils.chat.getConversations.invalidate();
        if (result.conversationId) {
          utils.chat.getConversation.invalidate({
            conversationId: result.conversationId,
          });
        }

        // Add AI response
        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.response,
          createdAt: new Date(),
          artifacts: (result.structured as StructuredResponse)?.artifacts ?? [],
          actions: (result.structured as StructuredResponse)?.actions ?? [],
          structured: result.structured as StructuredResponse | undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          const reason = controller.signal.reason;
          if (reason === "user_stop") {
            // Stopped by user button
            return;
          }
          if (reason === "timeout") {
            toast.error(
              "استغرق الرد وقتاً أطول من المتوقع بسبب ضغط الشبكة. يمكنك إعادة المحاولة.",
            );
            setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
            setInput(messageText);
            setLastFailedPrompt(messageText);
            return;
          }
          if (reason === "new_prompt" || reason === "unmount") {
            // Handled silently
            return;
          }
        }

        const formatted = formatAiErrorMessage(error);
        toast.error(formatted.message);

        if (formatted.isRateLimit) {
          setRateLimitCooldown(10); // 10-second backoff cooldown
        }

        // Remove the optimistic bubble and restore the draft for easy retry
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(messageText);
        setLastFailedPrompt(messageText);
      } finally {
        clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsTyping(false);
      }
    },
    [
      conversationId,
      input,
      isTyping,
      lightTap,
      rateLimitCooldown,
      sendMessage,
      utils,
    ],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const qaPrompt = params.get("ai_qa_prompt")?.trim();
    if (!qaPrompt) return;

    const prompt = qaPrompt.slice(0, 500);
    const forceNew = params.get("ai_qa_new") === "1";
    const qaKey = `${forceNew ? "new" : "current"}:${prompt}`;
    if (qaPromptSentRef.current === qaKey || isTyping) return;

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
  }, [handleSend, isTyping]);

  const handleConfirmAction = async (actionId: number) => {
    try {
      setActionStatuses((prev) => ({
        ...prev,
        [String(actionId)]: "confirming",
      }));
      const result = await confirmAction.mutateAsync({
        actionId,
        conversationId,
      });
      setActionStatuses((prev) => ({
        ...prev,
        [String(actionId)]: result.status,
      }));
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
      setActionStatuses((prev) => ({
        ...prev,
        [String(actionId)]: "cancelling",
      }));
      const result = await cancelAction.mutateAsync({
        actionId,
        conversationId,
      });
      setActionStatuses((prev) => ({
        ...prev,
        [String(actionId)]: result.status,
      }));
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("new_conversation");
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    lightTap();
    setMessages([]);
    setConversationId(undefined);
    setActionStatuses({});
    setLastFailedPrompt(null);
  };

  const handleLoadConversation = (id: number) => {
    if (id === conversationId && messages.length > 0) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("switch_conversation");
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    lightTap();
    utils.chat.getConversation.invalidate({ conversationId: id });
    setConversationId(id);
    setMessages([]);
    setActionStatuses({});
    setInput("");
    setLastFailedPrompt(null);
  };

  // Clear conversation
  const handleClear = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("clear_conversation");
      abortControllerRef.current = null;
    }
    setIsTyping(false);

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
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
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
            className="h-8 w-8 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors"
            onClick={() => setShowMemoryManager(true)}
            title="إدارة الذاكرة الذكية"
            aria-label="إدارة الذاكرة الذكية"
          >
            <Brain className="w-4 h-4" />
          </Button>
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
                    {formatConversationMeta(
                      conversation.lastMessageAt,
                      conversation.messageCount,
                    )}
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
                <h3 className="text-base font-bold mb-1">
                  أهلاً! أنا سمارت 👋
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                  مستشارك المالي الذكي. اسألني أي حاجة عن مصاريفك وخططك!
                </p>

                {/* Quick actions */}
                {quickActionItems.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {quickActionItems.map((action, i) => (
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
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={
                  msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                }
              >
                {msg.role === "user" ? (
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap selectable-text"
                    dir="auto"
                  >
                    {msg.content}
                  </p>
                ) : (
                  <BidiMarkdownRenderer content={msg.content} />
                )}

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
                {import.meta.env.DEV &&
                  msg.role === "assistant" &&
                  msg.structured && (
                    <TraceRenderer structured={msg.structured} />
                  )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator & Live in-flight status */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="chat-bubble-ai flex items-center gap-2">
              <div className="typing-dots text-indigo-500">
                <span />
                <span />
                <span />
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                سمارت يحلل البيانات ويكتب الرد...
              </span>
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
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-background border border-border shadow-lg flex items-center justify-center"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input & Action area */}
      <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-lg px-3 py-2 pb-safe">
        {/* Rate limit backoff banner */}
        {rateLimitCooldown > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-2 font-medium"
          >
            <Clock className="w-4 h-4 animate-spin shrink-0" />
            <span>
              تم الوصول لحد الطلبات المؤقت. يرجى الانتظار {rateLimitCooldown}{" "}
              ثانية قبل المحاولة...
            </span>
          </motion.div>
        )}

        {/* Failed prompt retry hint */}
        {lastFailedPrompt && !isTyping && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border/40 mb-2">
            <div className="flex items-center gap-1.5 truncate">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">تعذر إرسال الرسالة السابقة</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSend(lastFailedPrompt)}
              className="h-6 px-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>إعادة المحاولة</span>
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setTimeout(scrollToBottom, 150)}
              placeholder="اكتب رسالتك..."
              aria-label="اكتب رسالتك إلى سمارت"
              rows={1}
              className="w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all max-h-32"
              style={{ minHeight: "44px" }}
              disabled={isTyping}
            />
          </div>

          {isTyping ? (
            <Button
              type="button"
              size="icon"
              onClick={handleStopGeneration}
              title="إيقاف التوليد"
              aria-label="إيقاف التوليد"
              className="tap-target active-press shrink-0 h-11 w-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md transition-all duration-200"
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || rateLimitCooldown > 0}
              aria-label="إرسال الرسالة"
              className={cn(
                "tap-target active-press shrink-0 h-11 w-11 rounded-xl transition-all duration-200",
                input.trim() && rateLimitCooldown === 0
                  ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md hover:shadow-lg"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Send className="w-5 h-5 rtl:rotate-180" />
            </Button>
          )}
        </div>
      </div>

      <AIMemoryManager
        isOpen={showMemoryManager}
        onClose={() => setShowMemoryManager(false)}
      />
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

function debugNumber(
  debug: Record<string, unknown>,
  key: string,
): number | undefined {
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
    const aPriority =
      TRACE_FACT_PRIORITY[a.source ?? ""]?.indexOf(a.label ?? "") ?? -1;
    const bPriority =
      TRACE_FACT_PRIORITY[b.source ?? ""]?.indexOf(b.label ?? "") ?? -1;
    const aScore = aPriority >= 0 ? aPriority : 100;
    const bScore = bPriority >= 0 ? bPriority : 100;
    return aScore - bScore;
  });
}

function TraceRenderer({ structured }: { structured: StructuredResponse }) {
  const debug = recordValue(structured.debug);
  const cacheHits = arrayValue<string>(debug.cacheHits).map((item) =>
    String(item),
  );
  const cacheRuntime = recordValue(debug.cacheRuntime);
  const retrievalPolicy = recordValue(debug.retrievalPolicy);
  const cacheBackend = textValue(cacheRuntime.backend, "unknown");
  const cacheText = [
    cacheBackend,
    cacheRuntime.redisConfigured === false ? "redis off" : "",
    numberValue(cacheRuntime.memoryEntries) !== undefined
      ? `ram ${numberValue(cacheRuntime.memoryEntries)}`
      : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const embeddingHits = cacheHits.filter((item) =>
    item.startsWith("embedding:"),
  );
  const fallbackEmbeddingCalls = cacheHits.some((item) =>
    item.startsWith("memory_cache:hit"),
  )
    ? 0
    : embeddingHits.includes("embedding:query_embedded") &&
        embeddingHits.includes("embedding:fireworks")
      ? 1
      : 0;
  const embeddingCalls =
    debugNumber(debug, "embeddingCalls") ?? fallbackEmbeddingCalls;
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
  const otherCacheHits = cacheHits
    .filter((item) => !item.startsWith("embedding:"))
    .slice(0, 4);
  const dataNeeds = arrayValue<StructuredDataNeed>(structured.dataNeeds);
  const facts = arrayValue<StructuredFact>(structured.facts);
  const topFacts = orderedTraceFacts(facts).slice(0, 5);
  const hallucinationRisk = textValue(debug.hallucinationRisk, "unknown");
  const responseSchemaVersion = textValue(debug.responseSchemaVersion, "-");
  const historicalStructuredResponse =
    debug.historicalStructuredResponse === true;
  const numericAccuracy = recordValue(debug.numericAccuracy);
  const accuracyValue = numberValue(numericAccuracy.accuracy);
  const missingNumbers = arrayValue<string>(numericAccuracy.missing)
    .map(String)
    .slice(0, 4);
  const llmCalls = debugNumber(debug, "llmCalls") ?? 0;
  const resolvedFacts = debugNumber(debug, "resolvedFacts") ?? facts.length;
  const inputTokens = debugNumber(debug, "estimatedInputTokens");
  const tokenText = [
    inputTokens !== undefined ? `in ${inputTokens}` : "",
    structured.tokensUsed ? `total ${structured.tokensUsed}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const intentKind = structured.intent?.kind ?? "unknown";
  const toolText =
    dataNeeds
      .map((need) => need.kind)
      .filter(Boolean)
      .join(", ") || "none";
  const embeddingText =
    embeddingHits.length > 0 ? embeddingHits.join(", ") : "none";

  return (
    <details
      className="mt-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[10px] text-muted-foreground"
      aria-label={`ai-trace route=${intentKind} tools=${toolText} retrieval=${retrievalEmbedding} embedding=${embeddingText} embeddingCalls=${embeddingCalls} embeddingApiStatus=${embeddingApiStatus} cache=${cacheBackend} risk=${hallucinationRisk} schema=${responseSchemaVersion}${historicalStructuredResponse ? " historical=true" : ""}`}
    >
      <summary className="cursor-pointer select-none font-medium text-foreground/80">
        Trace: {intentKind} · tools {dataNeeds.length} · LLM {llmCalls} · embed{" "}
        {embeddingCalls}
      </summary>
      <div className="mt-2 grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span>trace</span>
          <span className="truncate text-end font-mono">
            {structured.traceId ?? "-"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>route</span>
          <span className="truncate text-end">
            {intentKind} / {structured.intent?.reason ?? "-"}
          </span>
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
            {retrievalDimensions !== undefined
              ? ` / dim ${retrievalDimensions}`
              : ""}
            {retrievalReason ? ` / ${retrievalReason}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cache</span>
          <span className="truncate text-end">
            {otherCacheHits.join(", ") || "none"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cache backend</span>
          <span className="truncate text-end">{cacheText || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>cost</span>
          <span className="truncate text-end">
            facts {resolvedFacts} · tokens {tokenText || "-"}
          </span>
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
            {accuracyValue !== undefined
              ? ` / nums ${Math.round(accuracyValue * 100)}%`
              : ""}
            {missingNumbers.length
              ? ` / missing ${missingNumbers.join(", ")}`
              : ""}
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
              <div
                key={`${fact.source ?? "fact"}-${fact.label ?? index}`}
                className="grid grid-cols-[88px_1fr] gap-2"
              >
                <span className="truncate">
                  {shortText(fact.source)}.{shortText(fact.label, 32)}
                </span>
                <span className="truncate text-end">
                  {shortText(fact.value)}
                </span>
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
  if (key === "category" || key === "subCategory") return text;
  if (key === "confirmLabel" || key === "cancelLabel") return text;
  return undefined;
}

function actionFieldValue(key: string, value: unknown): string {
  const displayValue = displayActionValue(key, value);
  if (displayValue) return displayValue;
  const numeric = numberValue(value);
  if (
    numeric !== undefined &&
    /amount|limit|balance|income|expense/i.test(key)
  ) {
    return `${textValue(numeric)} جنيه`;
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([innerKey, innerValue]) =>
          `${actionFieldLabel(innerKey)}: ${textValue(innerValue, "-")}`,
      )
      .join("، ");
  }
  return textValue(value, "-");
}

function visibleActionFields(
  fields: Record<string, unknown>,
): Array<[string, unknown]> {
  const hidden = new Set(["rawText"]);
  return Object.entries(fields).filter(([key, value]) => {
    if (hidden.has(key)) return false;
    return value !== undefined && value !== null && value !== "";
  });
}

function visibleResultFields(
  fields: Record<string, unknown>,
): Array<[string, unknown]> {
  const hidden = new Set([
    "expenseId",
    "goalId",
    "walletId",
    "budgetPlanId",
    "storage",
  ]);
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
              <span className="text-muted-foreground">
                {actionFieldLabel(key)}
              </span>
              <span className="font-medium text-end">
                {actionFieldValue(key, value)}
              </span>
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
              <span className="text-muted-foreground">
                {actionFieldLabel(key)}
              </span>
              <span className="font-medium text-end">
                {actionFieldValue(key, value)}
              </span>
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
      ? (
          artifact.payload.series as Array<{
            key?: string;
            label?: string;
            color?: string;
          }>
        )
          .map((item, index) => ({
            key: textValue(item.key, `series_${index + 1}`),
            label: textValue(
              item.label,
              textValue(item.key, `Series ${index + 1}`),
            ),
            color: textValue(
              item.color,
              ["#2563eb", "#16a34a", "#dc2626", "#9333ea"][index % 4],
            ),
          }))
          .filter((item) => item.key)
      : [];
    const activeSeries =
      series.length > 0
        ? series
        : [{ key: "value", label: "المبلغ", color: "#6366f1" }];
    const points = Array.isArray(artifact.payload.points)
      ? (artifact.payload.points as Array<Record<string, unknown>>)
      : [];
    const chartData = points.slice(0, 12).map((point) => ({
      label: textValue(point.label, "-"),
      ...Object.fromEntries(
        activeSeries.map((item) => [item.key, Number(point[item.key] || 0)]),
      ),
      value: Number(point.value || 0),
      count: Number(point.count || 0),
    }));
    const labelByKey = Object.fromEntries(
      activeSeries.map((item) => [item.key, item.label]),
    );

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
                <RechartsBarChart
                  data={chartData}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.25}
                  />
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
                  {activeSeries.length > 1 && (
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  )}
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
                    {moneyText(point.value)} ج.م · {moneyText(point.count)}{" "}
                    عملية
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            لا توجد نقاط كافية للرسم.
          </p>
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
        <div className="mb-1 text-xs font-semibold">
          {artifact.title || "شرح سريع"}
        </div>
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
