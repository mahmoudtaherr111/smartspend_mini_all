import { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import {
  Mic,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Save,
  CheckCircle2,
  Square,
  Camera,
  X,
  Lock,
} from "lucide-react";
import {
  suggestExpenseItems,
  validateOfflineInput,
} from "@/lib/clientRulesEngine";
import { ExpenseInputLimits } from "@contracts/constants";
import { cn } from "@/lib/utils";
import {
  CATEGORY_OPTIONS,
  getSubCategoryOptions,
} from "@/lib/financial-taxonomy";
import { Badge } from "@/components/ui/badge";
import { useHaptics } from "@/hooks/useHaptics";
import { compressImageFile } from "@/lib/compress-image";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";

interface ExpenseFormProps {
  onSuccess?: () => void;
  initialText?: string;
  businessMode?: boolean;
  businessId?: number;
  draftKey?: string;
}

function readExpenseDraft(draftKey?: string): string {
  if (!draftKey || typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(draftKey) || "";
  } catch {
    return "";
  }
}

function probeAudioCodec(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const hierarchy = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  for (const mime of hierarchy) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return undefined;
}

function createOfflineItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ParserTraceRecord = Record<string, unknown>;

function asParserTrace(value: unknown): ParserTraceRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ParserTraceRecord)
    : null;
}

function traceString(
  trace: ParserTraceRecord,
  key: string,
  fallback = "-",
): string {
  const value = trace[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function traceNumber(trace: ParserTraceRecord, key: string): number {
  const value = Number(trace[key]);
  return Number.isFinite(value) ? value : 0;
}

function traceTools(trace: ParserTraceRecord): string {
  const tools = trace.tools;
  return Array.isArray(tools) ? tools.map(String).join(", ") : "-";
}

function traceStringList(trace: ParserTraceRecord, key: string): string {
  const values = trace[key];
  return Array.isArray(values) ? values.map(String).join(", ") : "-";
}

function ParserTracePanel({ trace }: { trace: ParserTraceRecord | null }) {
  if (!trace) return null;

  const route = traceString(trace, "route");
  const parsedBy = traceString(trace, "parsedBy");
  const decision = traceString(trace, "decision");
  const provider = traceString(trace, "provider");
  const risk = traceString(trace, "hallucinationRisk");
  const financeContext = traceString(trace, "financeContextSource");
  const engine = traceString(trace, "engine");
  const boundary = traceString(trace, "agentBoundary");
  const dataNeeds = traceStringList(trace, "dataNeeds");
  const llmCalls = traceNumber(trace, "llmCalls");
  const embeddingCalls = traceNumber(trace, "embeddingCalls");
  const totalTokens = traceNumber(trace, "totalTokens");
  const inputTokens = traceNumber(trace, "inputTokens");
  const confidence = traceNumber(trace, "confidence");
  const tools = traceTools(trace);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
      aria-label={`parser-trace route=${route} engine=${engine} boundary=${boundary} tools=${tools} parsedBy=${parsedBy} decision=${decision} llm=${llmCalls} embedding=${embeddingCalls} tokens=${totalTokens} context=${financeContext} dataNeeds=${dataNeeds} risk=${risk}`}
      dir="ltr"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
          parser trace
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-900">
          {route}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono sm:grid-cols-4">
        <span>tools {tools}</span>
        <span>engine {engine}</span>
        <span>by {parsedBy}</span>
        <span>decision {decision}</span>
        <span>confidence {Math.round(confidence)}%</span>
        <span>boundary {boundary}</span>
        <span>provider {provider}</span>
        <span>LLM {llmCalls}</span>
        <span>embed {embeddingCalls}</span>
        <span>tokens {totalTokens}</span>
        <span>input {inputTokens}</span>
        <span>context {financeContext}</span>
        <span>needs {dataNeeds}</span>
        <span>risk {risk}</span>
      </div>
    </div>
  );
}

export function ExpenseForm({
  onSuccess,
  initialText,
  businessMode,
  businessId,
  draftKey,
}: ExpenseFormProps) {
  const [text, setText] = useState(
    () => initialText || readExpenseDraft(draftKey),
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [parsedItems, setParsedItems] = useState<any[] | null>(null);
  const [decision, setDecision] = useState<
    "auto_save" | "review" | "clarify" | null
  >(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<
    string | null
  >(null);
  const [clarificationId, setClarificationId] = useState<number | null>(null);
  const [classificationLogId, setClassificationLogId] = useState<number | null>(
    null,
  );
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [flowStage, setFlowStage] = useState<
    | "idle"
    | "acquiring"
    | "recording"
    | "processing"
    | "parsed"
    | "clarify"
    | "review"
    | "error"
  >("idle");
  const [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("المعالجة الذكية...");
  const [localSuggestion, setLocalSuggestion] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncRemaining, setSyncRemaining] = useState(0);
  const [pendingOfflineTextId, setPendingOfflineTextId] = useState<
    string | null
  >(null);
  const [latestParserTrace, setLatestParserTrace] =
    useState<ParserTraceRecord | null>(null);
  const syncInProgressRef = useRef(false);
  const lastAutoSaveSucceededRef = useRef(true);
  const activeOutboxRequestIdRef = useRef<string | null>(null);
  const expenseQaTextSentRef = useRef<string | null>(null);

  const removeQueuedText = (id: string | null) => {
    if (!id) return;
    try {
      const offlineTexts = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      localStorage.setItem(
        "smartspend_offline_texts",
        JSON.stringify(
          offlineTexts.filter((item: { id?: string }) => item.id !== id),
        ),
      );
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
    } catch {
      // Keep the queue intact if storage is unavailable; the idempotency key
      // still prevents a retry from duplicating an expense on the server.
    }
    setPendingOfflineTextId(null);
  };

  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      if (text.trim()) window.sessionStorage.setItem(draftKey, text);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      // Draft persistence is a convenience; storage denial must not block input.
    }
  }, [draftKey, text]);

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOnlineStatus);
    return () => {
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
    };
  }, []);

  const { data: userLimits } = trpc.ai.getUserLimits.useQuery();
  const {
    success: hapticSuccess,
    error: hapticError,
    mediumTap,
  } = useHaptics();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);
  const activeAudioSessionIdRef = useRef<number>(0);
  const lastAudioToggleRef = useRef<number>(0);
  const isSubmittingMutationRef = useRef<boolean>(false);

  const utilsTrpc = trpc.useUtils();
  const learnMutation = trpc.ai.learnWord.useMutation();

  const showNewContactToast = (
    c?: { name?: string; totalContacts?: number } | null,
  ) => {
    if (!c || !c.name) return;
    toast.success(
      <div className="flex flex-col gap-1 text-right">
        <span className="font-bold text-sm text-emerald-400">
          ✨ تم التعرف على شخص جديد!
        </span>
        <span className="text-xs text-white/90">
          تم حفظ "{c.name}" في قائمة الأشخاص والعلاقات عشان ما نسألكش عليه تاني.
        </span>
      </div>,
      { duration: 6000 },
    );
  };

  const answerClarificationMutation =
    trpc.expense.answerClarification.useMutation({
      onSuccess: (data) => {
        setIsSkipping(false);
        hapticSuccess();
        utilsTrpc.expense.getPendingClarifications.invalidate();

        if (data.needsClarification) {
          const clarified = data as {
            clarificationQuestion?: string;
            clarificationId?: number;
            enrichedText?: string;
          };
          setClarificationQuestion(
            clarified.clarificationQuestion || "ممكن توضح أكتر؟",
          );
          setClarificationId(clarified.clarificationId ?? null);
          if (clarified.enrichedText) {
            setText(clarified.enrichedText);
          }
          setFlowStage("clarify");
          setDecision("clarify" as any);
          toast.info("تم حفظ التوضيح، يرجى إدخال التوضيح التالي.");
        } else {
          utilsTrpc.expense.list.invalidate();
          utilsTrpc.expense.getMonthlyStats.invalidate();
          utilsTrpc.expense.getMonthSummary.invalidate();
          setParsedItems(null);
          setDecision(null);
          setClarificationQuestion(null);
          setClarificationId(null);
          setText("");
          setInputSource("text");
          setFlowStage("idle");
          setShowSuccessAnim(true);
          setTimeout(() => setShowSuccessAnim(false), 2000);
          removeQueuedText(pendingOfflineTextId);
          if ((data as any).newlyAddedContact) {
            showNewContactToast((data as any).newlyAddedContact);
          } else {
            toast.success("تم حفظ التوضيح وتسجيل العملية.");
          }
          if (onSuccess) onSuccess();
        }
      },
      onError: (err) => {
        setIsSkipping(false);
        hapticError();
        toast.error(err.message || "تعذر حفظ التوضيح.");
        setFlowStage("clarify");
      },
    });

  // Camera & Image processing states
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showCameraTip, setShowCameraTip] = useState(false);
  const [dontShowTipAgain, setDontShowTipAgain] = useState(false);
  const [showProUpgrade, setShowProUpgrade] = useState(false);

  const planQuery = trpc.pro.myPlan.useQuery();
  const isPro =
    planQuery.data?.plan === "pro" ||
    planQuery.data?.plan === "ultra" ||
    planQuery.data?.role === "admin";

  const parseReceiptMutation = trpc.image.parseReceipt.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حفظ ${data.amount} ج.م — ${data.category}`);
      utilsTrpc.expense.getMonthSummary.invalidate();
      utilsTrpc.expense.getMonthlyStats.invalidate();
      if (onSuccess) onSuccess();
    },
    onError: (e) => {
      hapticError();
      toast.error(e.message || "فشل تحليل إيصال الفاتورة.");
    },
  });

  const handleCameraClick = () => {
    if (!isOnline) {
      toast.error("مسح الإيصال يتطلب اتصالاً بالإنترنت.");
      return;
    }
    if (!isPro) {
      setShowProUpgrade(true);
      return;
    }
    const hideTip =
      localStorage.getItem("smartspend_hide_camera_tip") === "true";
    if (hideTip) {
      cameraInputRef.current?.click();
    } else {
      setShowCameraTip(true);
    }
  };

  const startCameraCapture = () => {
    setShowCameraTip(false);
    if (dontShowTipAgain) {
      localStorage.setItem("smartspend_hide_camera_tip", "true");
    }
    setTimeout(() => {
      cameraInputRef.current?.click();
    }, 300);
  };

  const handleCameraFile = async (file: File | undefined) => {
    if (!file) return;
    setIsCompressing(true);
    try {
      const { base64 } = await compressImageFile(file, {
        maxEdge: 1280,
        quality: 0.82,
      });
      toast.info("جاري تحليل الإيصال ذكياً...", { duration: 4000 });
      parseReceiptMutation.mutate({
        imageBase64: base64,
        mimeType: "image/jpeg",
        saveExpense: true,
      });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء معالجة وتصغير الصورة");
    } finally {
      setIsCompressing(false);
    }
  };

  // ─── Voice Parsing (Combined STT + Parse) ───
  const parseVoiceMutation = trpc.ai.parseVoiceExpense.useMutation({
    onSuccess: (data) => {
      const traceLogId =
        (data as { classificationLogId?: number }).classificationLogId ?? null;
      setClassificationLogId(traceLogId);
      setLatestParserTrace(asParserTrace((data as { trace?: unknown }).trace));
      setIsProcessingVoice(false);
      setDecision(data.decision as any);
      setClarificationQuestion(null);
      setClarificationId(null);
      setText(data.text);
      setInputSource("voice");
      setFlowStage("parsed");
      toast.success("تم فهم التسجيل!");

      if (
        data.decision === "auto_save" &&
        data.items &&
        data.items.length > 0
      ) {
        saveItems(data.items, true, data.text, traceLogId);
      } else if (data.decision === "review") {
        hapticSuccess();
        setFlowStage("review");
        setParsedItems(data.items || []);
      } else if (data.decision === "clarify") {
        mediumTap();
        setClarificationQuestion(
          data.clarificationQuestion || "ممكن توضح أكتر؟",
        );
        setClarificationId(data.clarificationId ?? null);
        setFlowStage("clarify");
        setParsedItems(data.items && data.items.length > 0 ? data.items : null);
      }

      setIsSkipping(false);

      if ((data as any).newlyAddedContact) {
        showNewContactToast((data as any).newlyAddedContact);
      }
      if (data.alertMessage) {
        toast.info("💡 تنبيه مالي", {
          description: data.alertMessage,
          duration: 6000,
        });
      }
    },
    onError: (err) => {
      setLatestParserTrace(null);
      hapticError();
      toast.error(err.message || "فشل تحليل الصوت.");
      setIsProcessingVoice(false);
      setFlowStage("idle");
    },
  });

  // ─── Parsing Mutation ───
  const parseMutation = trpc.ai.parseExpense.useMutation({
    onSuccess: async (data) => {
      const traceLogId =
        (data as { classificationLogId?: number }).classificationLogId ?? null;
      setClassificationLogId(traceLogId);
      setLatestParserTrace(asParserTrace((data as { trace?: unknown }).trace));
      setIsProcessingVoice(false);
      setDecision(data.decision as any);
      setClarificationQuestion(null);
      setClarificationId(null);

      if (
        data.decision === "auto_save" &&
        data.items &&
        data.items.length > 0
      ) {
        lastAutoSaveSucceededRef.current = await saveItems(
          data.items,
          true,
          data.text,
          traceLogId,
          activeOutboxRequestIdRef.current,
        );
        if (!lastAutoSaveSucceededRef.current) {
          setParsedItems(data.items);
          setDecision("review");
          setFlowStage("review");
        }
      } else if (data.decision === "review") {
        hapticSuccess();
        setFlowStage("review");
        setParsedItems(data.items || []);
      } else if (data.decision === "clarify") {
        mediumTap();
        setClarificationQuestion(
          data.clarificationQuestion || "ممكن توضح أكتر؟",
        );
        setClarificationId(data.clarificationId ?? null);
        setFlowStage("clarify");
        setParsedItems(data.items && data.items.length > 0 ? data.items : null);
      }

      setIsSkipping(false);

      if ((data as any).newlyAddedContact) {
        showNewContactToast((data as any).newlyAddedContact);
      }
      if (data.alertMessage) {
        toast.info("💡 تنبيه مالي", {
          description: data.alertMessage,
          duration: 6000,
        });
      }
    },
    onError: (err) => {
      setLatestParserTrace(null);
      hapticError();
      toast.error(err.message || "حدث خطأ أثناء تحليل النص.");
      setIsProcessingVoice(false);
      setIsSkipping(false);
      setFlowStage("idle");
    },
  });

  // ─── Dynamic Loading Messages ───
  useEffect(() => {
    let interval: any;
    if (
      isProcessingVoice ||
      parseVoiceMutation.isPending ||
      parseMutation.isPending
    ) {
      const messages = [
        "جاري استيعاب التفاصيل...",
        "بنستخرج الأرقام والمصروفات...",
        "بنظبط تصنيف الميزانية...",
        "لحظات وبتكون جاهزة...",
      ];
      let i = 0;
      setLoadingMessage(messages[0]);
      interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMessage(messages[i]);
      }, 400); // Faster perceived speed
    } else {
      setLoadingMessage("المعالجة الذكية...");
    }
    return () => clearInterval(interval);
  }, [
    isProcessingVoice,
    parseVoiceMutation.isPending,
    parseMutation.isPending,
  ]);

  // ─── Voice Limit Effect ───
  useEffect(() => {
    if (isRecording && userLimits && userLimits.voice.remaining !== -1) {
      if (recordingDuration >= userLimits.voice.remaining) {
        stopRecording();
        hapticError();
        toast.error(
          "انتهت مدة التسجيل المسموحة لك هذا الشهر. قم بالترقية للحصول على مدة أطول!",
          {
            duration: 8000,
            action: {
              label: "ترقية",
              onClick: () => (window.location.href = "/pro"),
            },
          },
        );
      }
    }
  }, [recordingDuration, isRecording, userLimits]);

  const createMutation = trpc.expense.create.useMutation({
    onMutate: async (newExpense) => {
      await utilsTrpc.expense.list.cancel();
      const previousExpenses = utilsTrpc.expense.list.getData({
        limit: 10,
        offset: 0,
      });

      utilsTrpc.expense.list.setData({ limit: 10, offset: 0 }, (old) => {
        if (!old) return old;
        const tempId = Date.now();
        const newItem = {
          id: tempId,
          userId: 0,
          userType: "oauth",
          amount: String(newExpense.amount),
          type: newExpense.type || "expense",
          category: newExpense.category,
          subCategory: newExpense.subCategory || "عام",
          description: newExpense.description || "",
          rawText: newExpense.rawText,
          source: newExpense.source || "manual",
          date: newExpense.date || new Date().toISOString(),
        } as any;
        return {
          ...old,
          items: [newItem, ...old.items].slice(0, 10),
          total:
            typeof old.total === "number"
              ? old.total + 1
              : Number(old.total || 0) + 1,
        };
      });

      return { previousExpenses };
    },
    onError: (err, newExpense, context) => {
      hapticError();
      if (context?.previousExpenses) {
        utilsTrpc.expense.list.setData(
          { limit: 10, offset: 0 },
          context.previousExpenses,
        );
      }
      toast.error(
        err.message || "تعذر حفظ العملية. راجع البيانات وحاول مرة أخرى.",
      );
    },
    onSettled: () => {
      utilsTrpc.expense.list.invalidate();
      utilsTrpc.expense.getMonthlyStats.invalidate();
      utilsTrpc.expense.getMonthSummary.invalidate();
    },
    onSuccess: (data: any) => {
      hapticSuccess();
      if (data?.newlyAddedContact) {
        showNewContactToast(data.newlyAddedContact);
      }
      if (onSuccess) onSuccess();
    },
  });

  const batchCreateMutation = trpc.expense.batchCreate.useMutation({
    onMutate: async () => {
      await utilsTrpc.expense.list.cancel();
      const previousExpenses = utilsTrpc.expense.list.getData({
        limit: 10,
        offset: 0,
      });
      return { previousExpenses };
    },
    onError: (err, newExpenses, context) => {
      hapticError();
      if (context?.previousExpenses) {
        utilsTrpc.expense.list.setData(
          { limit: 10, offset: 0 },
          context.previousExpenses,
        );
      }
      toast.error(
        err.message || "تعذر حفظ العمليات. راجع البيانات وحاول مرة أخرى.",
      );
    },
    onSettled: () => {
      utilsTrpc.expense.list.invalidate();
      utilsTrpc.expense.getMonthlyStats.invalidate();
      utilsTrpc.expense.getMonthSummary.invalidate();
    },
    onSuccess: (data: any) => {
      hapticSuccess();
      if (data?.newlyAddedContact) {
        showNewContactToast(data.newlyAddedContact);
      }
      if (onSuccess) onSuccess();
    },
  });

  // ─── Recording Logic & Audio State-Machine ───
  const isDebounced = (cooldownMs = 400): boolean => {
    const now = Date.now();
    if (now - lastAudioToggleRef.current < cooldownMs) {
      return true;
    }
    lastAudioToggleRef.current = now;
    return false;
  };

  const cancelRecording = () => {
    // Cancel is an immediate abort safety valve — NEVER debounce cancel
    isCancelledRef.current = true;
    activeAudioSessionIdRef.current += 1;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
    durationRef.current = 0;
    setRecordingDuration(0);
    setIsRecording(false);
    setIsProcessingVoice(false);
    setFlowStage("idle");
    toast.info("تم إلغاء التسجيل الصوتي.");
  };

  const startRecording = async () => {
    if (isDebounced()) return;
    if (!isOnline) {
      toast.error("التسجيل الصوتي يتطلب اتصالاً بالإنترنت.");
      return;
    }
    if (userLimits && userLimits.voice.remaining === 0) {
      toast.error("لقد استنفدت رصيد التسجيل الصوتي المتاح لك.");
      return;
    }

    // Check for Secure Context (HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error(
        "متصفحك يمنع الوصول للميكروفون! يجب استخدام اتصال آمن (HTTPS) أو (Localhost).",
        {
          duration: 8000,
        },
      );
      return;
    }

    isCancelledRef.current = false;
    const currentSessionId = ++activeAudioSessionIdRef.current;
    setFlowStage("acquiring");

    try {
      setLatestParserTrace(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Check if user cancelled while permission prompt was pending
      if (
        isCancelledRef.current ||
        currentSessionId !== activeAudioSessionIdRef.current
      ) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        setFlowStage("idle");
        return;
      }

      mediaStreamRef.current = stream;

      // Hardware lifecycle guard: handle unexpected track ended (e.g. headset unplugged, OS permission revoked)
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.addEventListener("ended", () => {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            try {
              mediaRecorderRef.current.stop();
            } catch {}
          }
        });
      }

      const mimeType = probeAudioCodec();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      const actualMimeType = mediaRecorder.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const streamToStop = mediaStreamRef.current || stream;
        streamToStop.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        mediaStreamRef.current = null;

        if (
          isCancelledRef.current ||
          currentSessionId !== activeAudioSessionIdRef.current
        ) {
          setIsRecording(false);
          setIsProcessingVoice(false);
          setFlowStage("idle");
          audioChunksRef.current = [];
          return;
        }

        const totalBytes = audioChunksRef.current.reduce(
          (acc, c) => acc + c.size,
          0,
        );
        if (
          audioChunksRef.current.length === 0 ||
          totalBytes === 0 ||
          durationRef.current === 0
        ) {
          setIsRecording(false);
          setIsProcessingVoice(false);
          setFlowStage("idle");
          audioChunksRef.current = [];
          toast.info("التسجيل الصوتي قصير جداً أو لم يتم التقاط صوت.");
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: actualMimeType,
        });
        if (audioBlob.size === 0) {
          setIsRecording(false);
          setIsProcessingVoice(false);
          setFlowStage("idle");
          audioChunksRef.current = [];
          toast.info("لم يتم تسجيل أي بيانات صوتية صالحة.");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const result = reader.result;
            if (typeof result !== "string" || !result.includes(",")) {
              throw new Error("Invalid audio data format");
            }
            const base64Audio = result.split(",")[1];
            if (!base64Audio || base64Audio.trim().length === 0) {
              throw new Error("Empty audio base64 payload");
            }
            setIsProcessingVoice(true);
            setFlowStage("processing");
            setLatestParserTrace(null);
            parseVoiceMutation.mutate({
              audioBase64: base64Audio,
              mimeType: actualMimeType,
              durationSeconds: Math.max(1, durationRef.current),
            });
          } catch (readErr) {
            console.error("Audio FileReader error:", readErr);
            setIsProcessingVoice(false);
            setFlowStage("idle");
            toast.error("فشل قراءة الملف الصوتي المسجل.");
          }
        };
        reader.onerror = () => {
          setIsProcessingVoice(false);
          setFlowStage("idle");
          toast.error("فشل تحويل البيانات الصوتية.");
        };
        reader.onabort = () => {
          setIsProcessingVoice(false);
          setFlowStage("idle");
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setFlowStage("recording");
      durationRef.current = 0;
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setRecordingDuration(durationRef.current);
        const maxPerReq = userLimits?.voice?.maxPerRequest || 60;
        if (durationRef.current >= maxPerReq) {
          toast.info(
            `تم الوصول للحد الأقصى للتسجيل (${maxPerReq} ثانية). جاري المعالجة...`,
          );
          stopRecording();
        }
      }, 1000);
    } catch (err: unknown) {
      if (
        isCancelledRef.current ||
        currentSessionId !== activeAudioSessionIdRef.current
      ) {
        return;
      }
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        msg.toLowerCase().includes("permission") ||
        msg.toLowerCase().includes("not allowed")
      ) {
        toast.error(
          "تم رفض إذن الميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح للتسجيل الصوتي.",
          { duration: 6000 },
        );
      } else if (
        name === "NotFoundError" ||
        msg.toLowerCase().includes("not found")
      ) {
        toast.error("لم يتم العثور على ميكروفون متصل بالجهاز.");
      } else if (
        name === "NotReadableError" ||
        msg.toLowerCase().includes("in use")
      ) {
        toast.error("الميكروفون قيد الاستخدام في تطبيق آخر.");
      } else {
        toast.error(
          "مقدرناش نسجّل الصوت، جرّب تاني أو تحقق من إعدادات الميكروفون.",
        );
      }
      setIsRecording(false);
      setIsProcessingVoice(false);
      setFlowStage("error");
      setTimeout(() => setFlowStage("idle"), 100);
    }
  };

  const stopRecording = () => {
    // Decoupled from debounce lockout: stopping an active recording must never be blocked
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  };

  // Safely stop recording on visibility change / tab switch
  useEffect(() => {
    if (!isRecording) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        toast.info("تم إيقاف التسجيل الصوتي لمغادرة الصفحة.");
        stopRecording();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        mediaStreamRef.current = null;
      }
    };
  }, []);

  // ─── Save Logic ───
  const normalizeType = (type: unknown) => {
    const value = String(type || "expense");
    return ["income", "expense", "transfer", "investment"].includes(value)
      ? value
      : "expense";
  };

  const saveItems = async (
    items: any[],
    isAuto: boolean = false,
    overrideText?: string,
    traceLogId: number | null = classificationLogId,
    clientRequestId: string | null = null,
  ): Promise<boolean> => {
    if (isSubmittingMutationRef.current) return false;
    const effectiveClientRequestId = clientRequestId || pendingOfflineTextId;
    const normalizedItems = items
      .map((item) => ({
        ...item,
        amount: Number(item.amount),
        type: normalizeType(item.type),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.amount) &&
          !isNaN(item.amount) &&
          item.amount > 0 &&
          item.amount <= ExpenseInputLimits.amountMax &&
          item.category &&
          String(item.category).trim().length > 0,
      );

    if (normalizedItems.length === 0) {
      toast.error(
        `لا توجد عملية صالحة للحفظ (المبلغ يجب أن يكون رقماً موجباً أكبر من 0 ولا يتجاوز ${ExpenseInputLimits.amountMax.toLocaleString()} ج.م).`,
      );
      return false;
    }

    isSubmittingMutationRef.current = true;
    try {
      if (normalizedItems.length > 1) {
        const payload = normalizedItems.map((item, index) => ({
          amount: item.amount,
          type: item.type,
          category: item.category,
          subCategory: item.subCategory,
          description: item.description,
          rawText: overrideText || text || "إدخال صوتي",
          source: (inputSource === "voice" ? "voice" : "ai_parsed") as any,
          date: item.date,
          classificationLogId: traceLogId || undefined,
          businessId,
          clientRequestId: effectiveClientRequestId
            ? `${effectiveClientRequestId}:${index}`
            : undefined,
        }));
        await batchCreateMutation.mutateAsync(payload);
      } else {
        const item = normalizedItems[0];
        await createMutation.mutateAsync({
          amount: item.amount,
          type: item.type,
          category: item.category,
          subCategory: item.subCategory,
          description: item.description,
          rawText: overrideText || text || "إدخال صوتي",
          source: inputSource === "voice" ? "voice" : "ai_parsed",
          date: item.date,
          classificationLogId: traceLogId || undefined,
          businessId,
          clientRequestId: effectiveClientRequestId || undefined,
        });
      }
      setParsedItems(null);
      setDecision(null);
      setClarificationQuestion(null);
      setClarificationId(null);
      setClassificationLogId(null);
      setText("");
      setInputSource("text");
      setFlowStage("idle");
      setShowSuccessAnim(true);
      setTimeout(() => setShowSuccessAnim(false), 2000);
      toast.success(
        isAuto
          ? `تم الحفظ تلقائياً (${normalizedItems.length} عملية)`
          : "تم الحفظ بنجاح.",
      );
      removeQueuedText(pendingOfflineTextId);
      return true;
    } catch {
      setFlowStage("review");
      toast.error("تعذر حفظ العملية. راجعها ثم أعد المحاولة.");
      return false;
    } finally {
      isSubmittingMutationRef.current = false;
    }
  };

  const handleUpdateParsedItem = (index: number, updates: any) => {
    if (!parsedItems) return;
    const newItems = [...parsedItems];
    newItems[index] = { ...newItems[index], ...updates };
    setParsedItems(newItems);
  };

  // Remove one transaction from the review without discarding the rest.
  //
  // The only way out of a wrong extraction used to be "تعديل النص" — retype the whole
  // sentence. On a minute-long narrative holding a dozen transactions, one invented or
  // double-counted row meant redoing all twelve, so the realistic choice was to save the
  // wrong one and fix it later. That is how bad rows reach the wallet.
  const handleRemoveParsedItem = (index: number) => {
    if (!parsedItems) return;
    const remaining = parsedItems.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      setParsedItems(null);
      setDecision(null);
      return;
    }
    setParsedItems(remaining);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (text.length > ExpenseInputLimits.rawTextMax) {
      toast.error(
        `النص طويل أوي — الحد الأقصى ${ExpenseInputLimits.rawTextMax} حرف.`,
      );
      return;
    }

    // Offline Fallback for text
    if (!isOnline) {
      const validation = validateOfflineInput(text);
      if (!validation.isValid) {
        toast.error(validation.errorReason || "النص غير صالح للتسجيل أوفلاين.");
        return;
      }

      const offline = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );

      const currentLimit = userLimits?.offline?.limit || 3;
      if (offline.length >= currentLimit) {
        toast.warning(
          `عفواً، لقد وصلت للحد الأقصى للمصاريف المحفوظة أوفلاين (${currentLimit} عمليات) لباقة ${
            planQuery.data?.plan === "pro" || planQuery.data?.plan === "ultra"
              ? "PRO"
              : "FREE"
          } الحالية.`,
        );
        return;
      }

      toast.info(
        "تم حفظ العملية محلياً (أوفلاين) بأمان. سيتم تحليلها وتصنيفها تلقائياً فور عودة الإنترنت.",
      );
      offline.push({
        id: createOfflineItemId(),
        text,
        timestamp: Date.now(),
        status: "pending",
      });
      localStorage.setItem("smartspend_offline_texts", JSON.stringify(offline));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      setText("");
      return;
    }

    setIsProcessingVoice(true);
    setFlowStage("processing");
    setInputSource("text");
    setLatestParserTrace(null);
    parseMutation.mutate({
      text,
      inputChannel: "text",
      businessMode: businessMode || false,
    });
  };

  // Sync offline data when coming back online or on mount
  useEffect(() => {
    const syncOfflineData = async () => {
      if (syncInProgressRef.current) return;

      const offlineTexts = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      const offlineManual = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );

      const totalToSync = offlineTexts.length + offlineManual.length;
      if (totalToSync === 0) return;

      // Wait 5 seconds connection cooldown for network stability
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check connection state again
      if (!navigator.onLine) return;

      syncInProgressRef.current = true;
      setIsSyncing(true);
      setSyncRemaining(totalToSync);

      // 1. Sync Text (AI) Transactions
      while (offlineTexts.length > 0) {
        const item = offlineTexts[0];
        try {
          toast.loading(
            `جاري تحليل عملية أوفلاين: "${item.text.slice(0, 20)}..."`,
            { id: "sync-toast" },
          );

          lastAutoSaveSucceededRef.current = true;
          activeOutboxRequestIdRef.current = item.id || createOfflineItemId();
          item.id = activeOutboxRequestIdRef.current;
          let parseResult;
          try {
            parseResult = await parseMutation.mutateAsync({
              text: item.text,
              inputChannel: "text",
              businessMode: businessMode || false,
            });
          } finally {
            activeOutboxRequestIdRef.current = null;
          }

          if (
            parseResult.decision !== "auto_save" ||
            !lastAutoSaveSucceededRef.current
          ) {
            item.id ||= createOfflineItemId();
            item.status =
              parseResult.decision === "clarify"
                ? "needs_clarification"
                : "needs_review";
            localStorage.setItem(
              "smartspend_offline_texts",
              JSON.stringify(offlineTexts),
            );
            setPendingOfflineTextId(item.id);
            window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
            toast.info(
              "هذه العملية تحتاج مراجعتك قبل الحفظ، لذلك لم نحذفها من صندوق الأوفلاين.",
              { id: "sync-toast" },
            );
            syncInProgressRef.current = false;
            setIsSyncing(false);
            return;
          }

          // Success: pop from queue and update storage
          offlineTexts.shift();
          localStorage.setItem(
            "smartspend_offline_texts",
            JSON.stringify(offlineTexts),
          );
          window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
          setSyncRemaining(offlineTexts.length + offlineManual.length);

          // Wait 1.5 seconds throttle delay
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (err) {
          toast.error("فشلت مزامنة العمليات المعلقة. سنحاول مجدداً لاحقاً.", {
            id: "sync-toast",
          });
          syncInProgressRef.current = false;
          setIsSyncing(false);
          return; // Halt queue processing
        }
      }

      // 2. Sync Manual Transactions
      while (offlineManual.length > 0) {
        const item = offlineManual[0];
        try {
          toast.loading(
            `جاري حفظ المعاملة اليدوية: "${item.amount} ج.م - ${item.category}"`,
            { id: "sync-toast" },
          );

          await createMutation.mutateAsync(item);

          // Success: pop from queue and update storage
          offlineManual.shift();
          localStorage.setItem(
            "smartspend_offline_manual",
            JSON.stringify(offlineManual),
          );
          window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
          setSyncRemaining(offlineManual.length);

          // Wait 1.5 seconds throttle delay
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } catch (err) {
          toast.error("فشلت مزامنة العمليات المعلقة. سنحاول مجدداً لاحقاً.", {
            id: "sync-toast",
          });
          syncInProgressRef.current = false;
          setIsSyncing(false);
          return; // Halt queue processing
        }
      }

      toast.success("✅ تم مزامنة كافة المعاملات بنجاح!", { id: "sync-toast" });
      syncInProgressRef.current = false;
      setIsSyncing(false);

      // Invalidate queries to refresh lists
      utilsTrpc.expense.list.invalidate();
      utilsTrpc.expense.getMonthlyStats.invalidate();
      utilsTrpc.expense.getMonthSummary.invalidate();
    };

    const handleOnline = () => {
      syncOfflineData();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("smartspend-offline-sync", handleOnline);
    if (navigator.onLine) {
      syncOfflineData();
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("smartspend-offline-sync", handleOnline);
    };
  }, [isOnline]);

  useEffect(() => {
    if (text && text.trim().length > 0) {
      const suggestion = suggestExpenseItems(text);
      setLocalSuggestion(suggestion);
    } else {
      setLocalSuggestion(null);
    }
  }, [text]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const qaText = params.get("expense_qa_text")?.trim();
    if (!qaText) return;

    const prompt = qaText.slice(0, ExpenseInputLimits.rawTextMax);
    const skipClarification =
      params.get("expense_qa_skip_clarification") === "1";
    const qaKey = `${skipClarification ? "skip" : "normal"}:${prompt}`;
    if (
      expenseQaTextSentRef.current === qaKey ||
      parseMutation.isPending ||
      createMutation.isPending
    )
      return;

    expenseQaTextSentRef.current = qaKey;
    setText(prompt);
    setIsProcessingVoice(true);
    setFlowStage("processing");
    setInputSource("text");
    setDecision(null);
    setParsedItems(null);
    setClarificationQuestion(null);
    setClarificationId(null);
    setLocalSuggestion(null);
    setLatestParserTrace(null);
    parseMutation.mutate({
      text: prompt,
      inputChannel: "text",
      skipClarification,
      businessMode: businessMode || false,
    });
  }, [createMutation.isPending, parseMutation]);

  const handleSkip = () => {
    setIsSkipping(true);
    submitClarificationAnswer("تخطي");
  };

  const submitClarificationAnswer = (answer: string) => {
    const trimmed = answer.trim();
    if (!trimmed) return;

    setFlowStage("processing");
    if (clarificationId) {
      answerClarificationMutation.mutate({
        clarificationId,
        answer: trimmed,
      });
      return;
    }

    const nameMatch = clarificationQuestion?.match(/مين\s+(.*?)\؟/);
    const personName = nameMatch ? nameMatch[1].trim() : "شخص";
    const newText = `${text} (${personName} ${trimmed})`;
    setText(newText);
    setDecision(null);
    setLatestParserTrace(null);
    parseMutation.mutate({
      text: newText,
      inputChannel: inputSource,
      businessMode: businessMode || false,
    });
  };

  const clarificationPeople = useMemo(() => {
    const question = clarificationQuestion || "";
    const multi = question.match(/مين الناس دول:\s*(.*?)\؟/);
    if (multi?.[1]) {
      return multi[1]
        .split(/[،,]/)
        .map((name) => name.trim())
        .filter(Boolean);
    }

    const names = Array.from(question.matchAll(/مين\s+(.+?)\؟/g))
      .map((match) => match[1]?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(names));
  }, [clarificationQuestion]);

  const isMultiPersonClarification = clarificationPeople.length > 1;

  const isSubmitting =
    parseMutation.isPending ||
    parseVoiceMutation.isPending ||
    createMutation.isPending ||
    answerClarificationMutation.isPending ||
    isProcessingVoice;

  const categories = CATEGORY_OPTIONS;

  const getTypeColor = (type: string) => {
    if (type === "income")
      return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800";
    if (type === "transfer")
      return "text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800";
    if (type === "investment")
      return "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
    return "text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800";
  };

  return (
    <Card
      className="border-0 shadow-xl relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm"
      data-testid="smart-capture-surface"
    >
      <div className="absolute top-0 end-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />

      {/* ─── AI Header Badge (Static, Minimal, Non-Clickable) ─── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <div className="flex items-center justify-between pb-1 select-none">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs"
            data-testid="smart-capture-badge"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>تسجيل ذكي</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            صوت أو نص أو صورة
          </span>
        </div>
      </div>

      <CardContent className="space-y-4 sm:space-y-5 p-4 sm:p-6 pt-2 sm:pt-3">
        {isSyncing && (
          <div
            className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs flex items-center justify-between gap-3 animate-pulse"
            dir="rtl"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
              جاري تحليل ومزامنة المعاملات أوفلاين... (المتبقي: {syncRemaining})
            </span>
          </div>
        )}

        {/* ─── Main Input Area (Thumb-Zone Optimized UI) ─── */}
        <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
          <div className="relative group">
            <Label htmlFor="expense-input" className="sr-only">
              سجل مصاريفك أو دخلك
            </Label>
            <textarea
              id="expense-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ExpenseInputLimits.rawTextMax}
              placeholder={
                isRecording
                  ? "جاري الاستماع لصوتك.. اتكلم براحتك"
                  : "سجل مصاريفك بصوتك أو اكتب هنا.. (مثال: غدا 120 جنيه كاش، أو بنزين 300 فودافون كاش)"
              }
              aria-label="إدخال نص المصروف أو الدخل"
              className={cn(
                "w-full min-h-[96px] sm:min-h-[120px] p-3.5 sm:p-5 text-base sm:text-lg rounded-xl border transition-all resize-none shadow-xs focus:outline-none focus:ring-1",
                isRecording
                  ? "border-primary/50 bg-primary/5 text-primary placeholder:text-primary/70 ring-1 ring-primary/30"
                  : "border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0c0e12] focus:border-slate-400 focus:ring-slate-400",
              )}
              dir="rtl"
              disabled={isRecording || showSuccessAnim}
            />
            {showSuccessAnim && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-[#0c0e12]/80 backdrop-blur-sm rounded-xl animate-in fade-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mb-3 shadow-sm border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold text-lg drop-shadow-sm">
                  تم الحفظ بنجاح
                </span>
              </div>
            )}

            {localSuggestion && (
              <div
                className="mt-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3 animate-in fade-in duration-300"
                dir="rtl"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 animate-pulse" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold truncate">
                    💡 تسجيل سريع:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {localSuggestion.amount} ج.م
                    </strong>{" "}
                    كـ{" "}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {localSuggestion.category}
                    </strong>
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    mediumTap();
                    if (!text.trim()) return;
                    if (!isOnline) {
                      toast.info(
                        "احفظها من زر الإضافة العادي عشان تدخل في Queue الأوفلاين بأمان.",
                      );
                      return;
                    }
                    setIsProcessingVoice(true);
                    setFlowStage("processing");
                    setInputSource("text");
                    setLocalSuggestion(null);
                    setLatestParserTrace(null);
                    parseMutation.mutate({
                      text,
                      inputChannel: "text",
                      skipClarification: true,
                      businessMode: businessMode || false,
                    });
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3.5 h-8 rounded-xl shrink-0"
                >
                  حفظ سريع
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-row items-center gap-2 sm:gap-3">
            {/* Input helpers (Hidden file input for camera/gallery) */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleCameraFile(e.target.files?.[0])}
            />

            {/* The Voice Recording & Camera Buttons Container */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Mic Button - Sleek & Premium */}
              <div className="relative flex items-center justify-center">
                {isRecording && (
                  <>
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/20 voice-glow-wave-1 z-0 pointer-events-none" />
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/20 voice-glow-wave-2 z-0 pointer-events-none" />
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/20 voice-glow-wave-3 z-0 pointer-events-none" />
                  </>
                )}
                <Button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  variant="outline"
                  aria-label={
                    isRecording ? "إيقاف التسجيل الصوتي" : "بدء التسجيل الصوتي"
                  }
                  className={cn(
                    "relative z-10 h-12 w-12 sm:h-14 sm:w-14 rounded-xl transition-all duration-300 flex items-center justify-center border-2 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95",
                    isRecording
                      ? "border-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50"
                      : !isOnline
                        ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 opacity-50 cursor-not-allowed"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700",
                  )}
                  disabled={showSuccessAnim || !isOnline}
                >
                  {isRecording ? (
                    <Square
                      className="w-4 h-4 text-rose-600 dark:text-rose-400 fill-rose-600 dark:fill-rose-400"
                      aria-hidden="true"
                    />
                  ) : !isOnline ? (
                    <Lock
                      className="w-4 h-4 text-slate-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Mic
                      className="w-4 h-4 text-slate-700 dark:text-slate-300"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </div>

              {/* Cancel Recording Button when active */}
              {isRecording && (
                <Button
                  type="button"
                  onClick={cancelRecording}
                  variant="outline"
                  aria-label="إلغاء التسجيل الصوتي"
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl transition-all duration-300 flex items-center justify-center border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 active:scale-95"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}

              {/* Camera Button - Sleek & Premium */}
              <Button
                type="button"
                onClick={handleCameraClick}
                variant="outline"
                aria-label="مسح إيصال أو فاتورة بالكاميرا"
                disabled={
                  isRecording ||
                  isCompressing ||
                  parseReceiptMutation.isPending ||
                  showSuccessAnim ||
                  !isOnline
                }
                className={cn(
                  "h-12 w-12 sm:h-14 sm:w-14 rounded-xl transition-all duration-300 flex items-center justify-center border-2 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95",
                  !isOnline
                    ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 opacity-50 cursor-not-allowed"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700",
                )}
              >
                {isCompressing || parseReceiptMutation.isPending ? (
                  <Loader2
                    className="w-4 h-4 animate-spin text-slate-500"
                    aria-hidden="true"
                  />
                ) : !isOnline ? (
                  <Lock className="w-4 h-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <Camera
                    className="w-4 h-4 text-slate-700 dark:text-slate-300"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </div>

            {/* Submit Text / Recording Button - Unified Single State */}
            <HapticButton
              type={isRecording ? "button" : "submit"}
              onClick={(e) => {
                if (isRecording) {
                  e.preventDefault();
                  stopRecording();
                }
              }}
              disabled={isSubmitting || (!text.trim() && !isRecording)}
              className={cn(
                "flex-1 w-full h-12 sm:h-14 text-sm sm:text-base rounded-xl transition-all shadow-none gap-2 sm:gap-3 font-medium",
                isRecording
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-2 border-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer active:scale-98"
                  : "bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200",
              )}
            >
              {isRecording ? (
                <div className="flex items-center justify-center w-full gap-2">
                  <span className="flex h-2.5 w-2.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                  </span>
                  <span className="font-mono font-bold tracking-wider">
                    {Math.floor(recordingDuration / 60)}:
                    {String(recordingDuration % 60).padStart(2, "0")}
                  </span>
                  <span className="font-bold">إنهاء التسجيل</span>
                </div>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />{" "}
                  <span className="truncate">{loadingMessage}</span>
                </>
              ) : !isOnline ? (
                <>
                  حفظ محلي (أوفلاين){" "}
                  <Save className="w-4 h-4 ms-1 opacity-70" />
                </>
              ) : (
                <>
                  سجل وحلل <Sparkles className="w-4 h-4 ms-1 opacity-70" />
                </>
              )}
            </HapticButton>
          </div>
        </form>

        <ParserTracePanel trace={latestParserTrace} />

        {/* ─── Processing View (Skeleton Loader) ─── */}
        {flowStage === "processing" && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0c0e12] border border-slate-200 dark:border-slate-800 space-y-4 animate-pulse relative overflow-hidden">
            <div className="absolute top-0 end-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -me-10 -mt-10 pointer-events-none"></div>
            <div className="flex justify-between items-center mb-2">
              <div className="h-6 w-1/3 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
              <div className="space-y-2 flex-1">
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded"></div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className="h-12 w-12 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
              <div className="space-y-2 flex-1">
                <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-3 w-1/3 bg-slate-200 dark:bg-slate-800 rounded"></div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Clarification View ─── */}
        {decision === "clarify" && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-indigo-900 shadow-xl shadow-indigo-100/50 dark:shadow-none space-y-5 animate-in fade-in slide-in-from-top-2 relative overflow-hidden">
            <div className="absolute top-0 end-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -me-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                <HelpCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="space-y-1.5 pt-1">
                <p className="font-bold text-lg text-slate-800 dark:text-slate-200">
                  سؤال سريع:
                </p>
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  {clarificationQuestion}
                </p>
              </div>
            </div>

            {clarificationQuestion?.startsWith("هل تقصد") ? (
              <div className="flex gap-3 pt-2 relative z-10">
                <Button
                  type="button"
                  className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-base font-bold gap-2"
                  onClick={() => {
                    if (parsedItems && parsedItems.length > 0) {
                      const item = parsedItems[0];
                      const updatedItem = { ...item, confidence: 100 };
                      setParsedItems([updatedItem]);
                      setDecision(null);
                      setFlowStage("idle");
                      saveItems([updatedItem], true);
                    }
                  }}
                >
                  <CheckCircle2 className="w-5 h-5" /> أوافق، احفظ العملية
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all text-base font-bold gap-2"
                  onClick={() => {
                    setDecision("review");
                    setFlowStage("review");
                  }}
                >
                  <X className="w-5 h-5" /> لا، تعديل
                </Button>
              </div>
            ) : (
              <div className="space-y-3 relative z-10">
                {isMultiPersonClarification && (
                  <div className="flex flex-wrap gap-2">
                    {clarificationPeople.map((name) => (
                      <Badge
                        key={name}
                        variant="secondary"
                        className="rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                      >
                        {name}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder={
                      isMultiPersonClarification
                        ? "مثال: مروان أخويا وعلاء صاحبي..."
                        : "اكتب التوضيح هنا ودوس Enter..."
                    }
                    className="bg-slate-50 dark:bg-slate-950 border-indigo-100 dark:border-indigo-900 focus-visible:ring-indigo-500 h-12 rounded-xl text-base"
                    autoFocus
                    disabled={answerClarificationMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const ans = (e.target as HTMLInputElement).value.trim();
                        submitClarificationAnswer(ans);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all h-12 rounded-xl px-6 font-bold"
                    onClick={handleSkip}
                    disabled={
                      isSkipping || answerClarificationMutation.isPending
                    }
                  >
                    {isSkipping || answerClarificationMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "تخطي"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {clarificationQuestion?.includes("مين") &&
              !clarificationQuestion?.startsWith("هل تقصد") &&
              !isMultiPersonClarification && (
                <div className="flex flex-wrap gap-2 mt-2 relative z-10">
                  {["أبويا", "أمي", "أخويا", "أختي", "صاحبي", "موظف عندي"].map(
                    (rel) => (
                      <Button
                        key={rel}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border-0 h-8 rounded-lg"
                        disabled={answerClarificationMutation.isPending}
                        onClick={() => submitClarificationAnswer(rel)}
                      >
                        {rel}
                      </Button>
                    ),
                  )}
                </div>
              )}
          </div>
        )}

        {/* ─── Review View ─── */}
        {decision === "review" && parsedItems && (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                راجع العمليات للتأكد:
              </h3>
              <Badge variant="outline" className="text-[10px]">
                دقة {Math.round(parseMutation.data?.overallConfidence || 0)}%
              </Badge>
            </div>

            {/*
              The arithmetic, visible.

              The user just said a set of numbers out loud. Until now the only way to
              check the system heard them all was to add up the cards by eye — so the
              realistic behaviour was to trust it, which is exactly what a review screen
              exists to prevent. Totals are split by direction because a mixed narrative
              ("قبضت ٥٠٠٠ وصرفت ٣٠٠") has no single meaningful sum.
            */}
            {(() => {
              const totals = parsedItems.reduce(
                (acc, it) => {
                  const amount = Number(it.amount) || 0;
                  if (it.type === "income") acc.income += amount;
                  else if (it.type === "expense") acc.expense += amount;
                  else acc.other += amount;
                  return acc;
                },
                { income: 0, expense: 0, other: 0 },
              );
              const fmt = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });

              return (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-medium opacity-70">
                    {parsedItems.length} عملية
                  </span>
                  {totals.expense > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      مصروف {fmt(totals.expense)}
                    </span>
                  )}
                  {totals.income > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      دخل {fmt(totals.income)}
                    </span>
                  )}
                  {totals.other > 0 && (
                    <span className="text-sky-600 dark:text-sky-400">
                      تحويل/استثمار {fmt(totals.other)}
                    </span>
                  )}
                </div>
              );
            })()}

            <div className="space-y-3">
              {parsedItems.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all space-y-3",
                    getTypeColor(item.type),
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={item.amount}
                        onChange={(e) =>
                          handleUpdateParsedItem(idx, {
                            amount: parseFloat(e.target.value),
                          })
                        }
                        className="w-24 h-8 text-lg font-bold bg-white/50 dark:bg-black/20 border-0"
                      />
                      <span className="text-sm font-medium">جنيه</span>
                      {/*
                        `confidence` is now a calibrated probability rather than a rank,
                        so it finally means something specific to show: below 70 this
                        row is wrong roughly one time in three. Showing it on every card
                        would be noise; showing it only where it matters directs the
                        user's attention to the row most likely to need them.
                      */}
                      {Number(item.confidence) > 0 && Number(item.confidence) < 70 && (
                        <Badge
                          variant="outline"
                          className="h-5 border-amber-500/50 px-1.5 text-[9px] text-amber-600 dark:text-amber-400"
                        >
                          راجعها كويس
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                    <Badge
                      className={cn(
                        "capitalize",
                        item.type === "income"
                          ? "bg-emerald-500"
                          : item.type === "transfer"
                            ? "bg-sky-500"
                            : item.type === "investment"
                              ? "bg-amber-500"
                              : "bg-rose-500",
                      )}
                    >
                      {item.type === "income"
                        ? "دخل"
                        : item.type === "transfer"
                          ? "تحويل"
                          : item.type === "investment"
                            ? "استثمار"
                            : "مصروف"}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => handleRemoveParsedItem(idx)}
                      aria-label="استبعاد العملية دي"
                      className="rounded-full p-1 opacity-50 transition hover:bg-rose-500/10 hover:text-rose-600 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] opacity-70">
                        الفئة الرئيسة
                      </Label>
                      <select
                        value={item.category}
                        onChange={(e) => {
                          const category = e.target.value;
                          const subCategory =
                            getSubCategoryOptions(category)[0] || "عام";
                          handleUpdateParsedItem(idx, {
                            category,
                            subCategory,
                          });
                        }}
                        className="w-full text-xs h-9 rounded-lg border bg-white/50 dark:bg-black/20 px-2 outline-none focus:ring-1 ring-emerald-500"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] opacity-70">
                        الفئة الفرعية
                      </Label>
                      <select
                        value={item.subCategory || ""}
                        onChange={(e) =>
                          handleUpdateParsedItem(idx, {
                            subCategory: e.target.value,
                          })
                        }
                        className="w-full h-9 text-xs rounded-lg bg-white/50 dark:bg-black/20 border-0 px-2 outline-none focus:ring-1 ring-emerald-500"
                      >
                        {getSubCategoryOptions(item.category).map(
                          (sub: string) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="relative">
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        handleUpdateParsedItem(idx, {
                          description: e.target.value,
                        })
                      }
                      className="h-9 text-xs bg-white/50 dark:bg-black/20 border-0 italic"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveItems(parsedItems)}
                disabled={createMutation.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 rounded-xl shadow-lg gap-2"
              >
                <Save className="w-4 h-4" /> تأكيد وحفظ
              </Button>
              <Button
                onClick={() => setDecision(null)}
                variant="outline"
                className="rounded-xl h-11"
              >
                تعديل النص
              </Button>
            </div>
          </div>
        )}

        {/* ─── Manual Toggle ─── */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            onClick={() => setShowManual(!showManual)}
          >
            {showManual ? "إخفاء الإدخال اليدوي" : "إدخال يدوي تقليدي"}
            {showManual ? (
              <ChevronUp className="w-3 h-3 ms-1" />
            ) : (
              <ChevronDown className="w-3 h-3 ms-1" />
            )}
          </Button>
        </div>

        {showManual && (
          <ManualForm
            onSuccess={onSuccess}
            categories={categories}
            createMutation={createMutation}
            isOnline={isOnline}
            userLimits={userLimits}
            plan={planQuery.data?.plan}
            businessId={businessId}
          />
        )}
      </CardContent>

      {/* ─── Camera First-Time Tip Dialog ─── */}
      <AdaptiveDialog open={showCameraTip} onOpenChange={setShowCameraTip}>
        <AdaptiveDialogContent
          className="sm:max-w-md bg-white dark:bg-slate-900 border rounded-2xl shadow-2xl p-6"
          dir="rtl"
        >
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-2 text-foreground">
              <Camera className="w-5 h-5 text-indigo-500 animate-pulse" />
              نصائح للتصوير الذكي 📸
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="space-y-4 py-3 text-sm leading-relaxed text-end text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              للحصول على تصنيف دقيق وقراءة صحيحة للفاتورة بالذكاء الاصطناعي،
              يرجى اتباع الآتي:
            </p>
            <ul className="list-disc list-inside space-y-2 pe-2 text-xs">
              <li>التقط الصورة في مكان **إضاءته جيدة** وواضحة.</li>
              <li>
                اجعل الكاميرا **مستقيمة وموجهة مباشرة** نحو الفاتورة لمنع أي
                ميلان.
              </li>
              <li>
                تأكد من وضوح **الأرقام (المجموع الكلي)** وأسماء المنتجات أو
                التاجر.
              </li>
              <li>
                في حال تصوير سكرين شوت (البنك أو انستاباي)، يرجى التأكد من أن
                **تفاصيل العملية كاملة ومقروءة**.
              </li>
            </ul>

            <div className="flex items-center gap-2 pt-2 border-t mt-4 select-none">
              <input
                type="checkbox"
                id="dontShowTipCheckbox"
                checked={dontShowTipAgain}
                onChange={(e) => setDontShowTipAgain(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
              />
              <label
                htmlFor="dontShowTipCheckbox"
                className="text-xs text-muted-foreground cursor-pointer font-medium"
              >
                لا تظهر هذه النصيحة مجدداً
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              onClick={startCameraCapture}
              className="flex-1 bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 h-11 rounded-xl"
            >
              ابدأ التصوير الآن 🚀
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCameraTip(false)}
              className="rounded-xl h-11"
            >
              إلغاء
            </Button>
          </div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      {/* ─── Pro Upgrade Recommendation Dialog ─── */}
      <AdaptiveDialog open={showProUpgrade} onOpenChange={setShowProUpgrade}>
        <AdaptiveDialogContent
          className="sm:max-w-md bg-white dark:bg-slate-900 border rounded-2xl shadow-2xl p-6"
          dir="rtl"
        >
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-2 text-foreground">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              ميزة ذكية للمشتركين المميزين 💎
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="space-y-4 py-3 text-sm leading-relaxed text-end text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              خاصية قراءة الفواتير وتصوير الإيصالات متاحة حصرياً لمشتركي باقة
              Pro و Ultra.
            </p>
            <p className="text-xs text-muted-foreground">
              باستخدام هذه الميزة، يمكنك تصوير أي إيصال ورقي أو لقطة شاشة
              (Screenshot) لعملية الدفع بنكي أو انستاباي، وسيتكفل الذكاء
              الاصطناعي باستخراج القيمة والتاجر والتصنيف وحفظها فوراً بالمليم!
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4">
            <Button
              onClick={() => {
                setShowProUpgrade(false);
                window.location.href = "/pro";
              }}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold h-11 rounded-xl shadow-lg border-0"
            >
              اشترك في الباقة المميزة الآن ✨
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowProUpgrade(false)}
              className="rounded-xl h-11 sm:w-24"
            >
              إلغاء
            </Button>
          </div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </Card>
  );
}

function ManualForm({
  onSuccess,
  categories,
  createMutation,
  isOnline,
  userLimits,
  plan,
  businessId,
}: any) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("عام");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("expense");
  const submissionRef = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const isSubmittingManualRef = useRef(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingManualRef.current || createMutation.isPending) return;

    const trimmedAmount = amount.trim();
    if (!trimmedAmount) {
      toast.error("يرجى إدخال المبلغ.");
      return;
    }

    const parsedAmount = parseFloat(trimmedAmount);
    if (
      isNaN(parsedAmount) ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > ExpenseInputLimits.amountMax
    ) {
      toast.error(
        `المبلغ غير صالح — يجب أن يكون رقماً أكبر من 0 ولا يتجاوز ${ExpenseInputLimits.amountMax.toLocaleString()} ج.م.`,
      );
      return;
    }

    if (!category || !category.trim()) {
      toast.error("يرجى اختيار الفئة الرئيسية.");
      return;
    }

    if (description && description.length > ExpenseInputLimits.descriptionMax) {
      toast.error(
        `الوصف طويل جداً — الحد الأقصى ${ExpenseInputLimits.descriptionMax} حرف.`,
      );
      return;
    }

    isSubmittingManualRef.current = true;
    const fingerprint = [
      parsedAmount,
      type,
      category,
      subCategory,
      description,
      businessId ?? "",
    ].join("|");
    const clientRequestId =
      submissionRef.current?.fingerprint === fingerprint
        ? submissionRef.current.id
        : createOfflineItemId();
    submissionRef.current = { fingerprint, id: clientRequestId };
    const payload = {
      amount: parsedAmount,
      type,
      category,
      subCategory: subCategory || "عام",
      description: description || undefined,
      rawText: `${parsedAmount} جنيه - ${category}`,
      source: "manual",
      businessId,
      clientRequestId,
    };

    if (!isOnline) {
      const offlineManual = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );

      const currentLimit = userLimits?.offline?.limit || 3;
      if (offlineManual.length >= currentLimit) {
        toast.warning(
          `عفواً، لقد وصلت للحد الأقصى للمصاريف المحفوظة أوفلاين (${currentLimit} عمليات) لباقة ${
            plan === "pro" || plan === "ultra" ? "PRO" : "FREE"
          } الحالية.`,
        );
        isSubmittingManualRef.current = false;
        return;
      }

      toast.info(
        "تم حفظ العملية محلياً (أوفلاين) بأمان. سيتم مزامنتها لاحقاً.",
      );
      offlineManual.push({
        ...payload,
        id: clientRequestId,
        timestamp: Date.now(),
      });
      localStorage.setItem(
        "smartspend_offline_manual",
        JSON.stringify(offlineManual),
      );
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      setAmount("");
      setCategory("");
      setSubCategory("عام");
      setDescription("");
      submissionRef.current = null;
      isSubmittingManualRef.current = false;
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: (data: any) => {
        submissionRef.current = null;
        isSubmittingManualRef.current = false;
        setAmount("");
        setCategory("");
        setSubCategory("عام");
        setDescription("");
        if (!data?.newlyAddedContact) {
          toast.success("تم التسجيل يدوياً!");
        }
      },
      onError: () => {
        isSubmittingManualRef.current = false;
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-4 animate-in slide-in-from-top-4"
    >
      <div className="flex gap-2 p-1 bg-white dark:bg-slate-900 rounded-xl border">
        {["expense", "income", "transfer"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "flex-1 min-h-[44px] flex items-center justify-center text-xs font-bold rounded-lg transition-all active:scale-[0.97]",
              type === t
                ? t === "income"
                  ? "bg-emerald-500 text-white"
                  : t === "transfer"
                    ? "bg-sky-500 text-white"
                    : "bg-rose-500 text-white"
                : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            {t === "income" ? "دخل" : t === "transfer" ? "تحويل" : "مصروف"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">المبلغ *</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">الفئة *</Label>
          <select
            value={category}
            onChange={(e) => {
              const nextCategory = e.target.value;
              setCategory(nextCategory);
              setSubCategory(getSubCategoryOptions(nextCategory)[0] || "عام");
            }}
            className="w-full h-11 rounded-md border text-sm px-2 bg-white dark:bg-slate-900"
          >
            <option value="">اختر...</option>
            {categories.map((c: string) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">الفئة الفرعية</Label>
        <select
          value={subCategory}
          onChange={(e) => setSubCategory(e.target.value)}
          className="w-full h-11 rounded-md border text-sm px-2 bg-white dark:bg-slate-900"
          disabled={!category}
        >
          {getSubCategoryOptions(category).map((sub: string) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">الوصف</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="تفاصيل إضافية..."
          className="h-11 text-base"
        />
      </div>
      <Button
        type="submit"
        disabled={createMutation.isPending}
        className="w-full h-11 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-xl font-bold"
      >
        {createMutation.isPending ? "جاري الحفظ..." : "حفظ العملية"}
      </Button>
    </form>
  );
}
