import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  Save,
  CheckCircle2,
  RefreshCw,
  Square,
  Camera,
  X,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExpenseFormProps {
  onSuccess?: () => void;
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [text, setText] = useState("");
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
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [flowStage, setFlowStage] = useState<
    "idle" | "recording" | "processing" | "parsed" | "clarify" | "review"
  >("idle");
  const [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("المعالجة الذكية...");

  const { data: userLimits } = trpc.ai.getUserLimits.useQuery();
  const {
    success: hapticSuccess,
    error: hapticError,
    mediumTap,
  } = useHaptics();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef<number>(0);

  const utilsTrpc = trpc.useUtils();
  const learnMutation = trpc.ai.learnWord.useMutation();
  const answerClarificationMutation = trpc.expense.answerClarification.useMutation({
    onSuccess: () => {
      hapticSuccess();
      utilsTrpc.expense.list.invalidate();
      utilsTrpc.expense.getMonthlyStats.invalidate();
      utilsTrpc.expense.getMonthSummary.invalidate();
      utilsTrpc.expense.getPendingClarifications.invalidate();
      setParsedItems(null);
      setDecision(null);
      setClarificationQuestion(null);
      setClarificationId(null);
      setText("");
      setInputSource("text");
      setFlowStage("idle");
      setShowSuccessAnim(true);
      setTimeout(() => setShowSuccessAnim(false), 2000);
      toast.success("تم حفظ التوضيح وتسجيل العملية.");
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
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
      setIsProcessingVoice(false);
      setDecision(data.decision as any);
      setClarificationQuestion(null);
      setClarificationId(null);
      setText(data.text);
      setInputSource("voice");
      setFlowStage("parsed");
      toast.success("تم فهم التسجيل!");

      if (data.decision === "auto_save" && data.items && data.items.length > 0) {
        saveItems(data.items, true, data.text);
      } else if (data.decision === "review") {
        hapticSuccess();
        setFlowStage("review");
        setParsedItems(data.items || []);
      } else if (data.decision === "clarify") {
        mediumTap();
        setClarificationQuestion(data.clarificationQuestion || "ممكن توضح أكتر؟");
        setClarificationId(data.clarificationId ?? null);
        setFlowStage("clarify");
        setParsedItems(data.items && data.items.length > 0 ? data.items : null);
      }

      setIsSkipping(false);

      if (data.alertMessage) {
        toast.info("💡 تنبيه مالي", {
          description: data.alertMessage,
          duration: 6000,
        });
      }
    },
    onError: (err) => {
      hapticError();
      toast.error(err.message || "فشل تحليل الصوت.");
      setIsProcessingVoice(false);
      setFlowStage("idle");
    },
  });

  // ─── Parsing Mutation ───
  const parseMutation = trpc.ai.parseExpense.useMutation({
    onSuccess: (data) => {
      setIsProcessingVoice(false);
      setDecision(data.decision as any);
      setClarificationQuestion(null);
      setClarificationId(null);

      if (
        data.decision === "auto_save" &&
        data.items &&
        data.items.length > 0
      ) {
        saveItems(data.items, true, data.text);
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

      if (data.alertMessage) {
        toast.info("💡 تنبيه مالي", {
          description: data.alertMessage,
          duration: 6000,
        });
      }
    },
    onError: (err) => {
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
    if (isProcessingVoice || parseVoiceMutation.isPending || parseMutation.isPending) {
      const messages = [
        "جاري استيعاب التفاصيل...",
        "بنستخرج الأرقام والمصروفات...",
        "بنظبط تصنيف الميزانية...",
        "لحظات وبتكون جاهزة..."
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
  }, [isProcessingVoice, parseVoiceMutation.isPending, parseMutation.isPending]);

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
    onSuccess: () => {
      hapticSuccess();
      if (onSuccess) onSuccess();
    },
  });

  // ─── Recording Logic ───
  const startRecording = async () => {
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/mp4";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = (reader.result as string).split(",")[1];
          setIsProcessingVoice(true);
          setFlowStage("processing");
          parseVoiceMutation.mutate({
            audioBase64: base64Audio,
            mimeType: mimeType,
            durationSeconds: durationRef.current,
          });
        };
        stream.getTracks().forEach((track) => track.stop());
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
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error(
          "لقد قمت برفض صلاحية الميكروفون. يرجى تفعيلها من إعدادات المتصفح.",
        );
      } else {
        toast.error(
          "مقدرناش نسجّل الصوت، جرّب تاني أو تحقق من إعدادات الميكروفون.",
        );
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
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

  const saveItems = async (items: any[], isAuto: boolean = false, overrideText?: string) => {
    const normalizedItems = items
      .map((item) => ({
        ...item,
        amount: Number(item.amount),
        type: normalizeType(item.type),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.amount) && item.amount > 0 && item.category,
      );

    if (normalizedItems.length === 0) {
      toast.error("لا توجد عملية صالحة للحفظ.");
      return;
    }

    try {
      await Promise.all(
        normalizedItems.map((item) =>
          createMutation.mutateAsync({
            amount: item.amount,
            type: item.type,
            category: item.category,
            subCategory: item.subCategory,
            description: item.description,
            rawText: overrideText || text || "إدخال صوتي",
            source: inputSource === "voice" ? "voice" : "ai_parsed",
            date: item.date,
          }),
        ),
      );
      setParsedItems(null);
      setDecision(null);
      setClarificationQuestion(null);
      setClarificationId(null);
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
    } catch {
      setFlowStage("review");
    }
  };

  const handleUpdateParsedItem = (index: number, updates: any) => {
    if (!parsedItems) return;
    const newItems = [...parsedItems];
    newItems[index] = { ...newItems[index], ...updates };
    setParsedItems(newItems);
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
    if (!navigator.onLine) {
      toast.info(
        "أنت غير متصل بالإنترنت. تم حفظ العملية مؤقتاً وسيتم تحليلها عند الاتصال.",
      );
      const offline = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      offline.push({ text, timestamp: Date.now() });
      localStorage.setItem("smartspend_offline_texts", JSON.stringify(offline));
      setText("");
      return;
    }

    setIsProcessingVoice(true);
    setFlowStage("processing");
    setInputSource("text");
    parseMutation.mutate({ text, inputChannel: "text" });
  };

  // Sync offline texts when coming back online
  useEffect(() => {
    const handleOnline = () => {
      const offline = JSON.parse(
        localStorage.getItem("smartspend_offline_texts") || "[]",
      );
      if (offline.length > 0) {
        toast.info(
          `جاري معالجة ${offline.length} عملية تم تسجيلها أثناء انقطاع الإنترنت...`,
        );
        // Just process the first one for now to avoid rate limits
        const first = offline.shift();
        localStorage.setItem(
          "smartspend_offline_texts",
          JSON.stringify(offline),
        );
        setText(first.text);
        setIsProcessingVoice(true);
        setFlowStage("processing");
        parseMutation.mutate({ text: first.text, inputChannel: "text" });
      }
    };

    window.addEventListener("online", handleOnline);
    // Also check on mount
    if (navigator.onLine) {
      handleOnline();
    }
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const handleSkip = () => {
    setIsSkipping(true);
    setFlowStage("processing");
    setClarificationId(null);
    parseMutation.mutate({
      text,
      skipClarification: true,
      inputChannel: inputSource,
    });
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
    parseMutation.mutate({
      text: newText,
      inputChannel: inputSource,
    });
  };

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
    <Card className="border-0 shadow-xl relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />

      <CardHeader className="pb-4">
        <CardTitle className="text-xl flex items-center justify-center gap-2 text-center">
          <Sparkles className="w-5 h-5 text-emerald-500 animate-pulse" />
          سجل بحرية.. والذكاء الاصطناعي هيفهمك
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="text-xs text-muted-foreground text-center">
          الحالة:{" "}
          {flowStage === "idle"
            ? "جاهز"
            : flowStage === "recording"
              ? "تسجيل"
              : flowStage === "processing"
                ? "معالجة"
                : flowStage === "parsed"
                  ? "تم استخراج النص"
                  : flowStage === "clarify"
                    ? "توضيح"
                    : "مراجعة"}
        </div>
        {/* ─── Main Input Area (Professional UI) ─── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <Label htmlFor="expense-input" className="sr-only">سجل مصاريفك أو دخلك</Label>
            <textarea
              id="expense-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ExpenseInputLimits.rawTextMax}
              placeholder={
                isRecording
                  ? "جاري الاستماع... يمكنك التحدث الآن"
                  : "سجل مصاريفك أو دخلك هنا... (مثال: صرفت 150 جنيه مطعم)"
              }
              aria-label="إدخال نص المصروف أو الدخل"
              className={cn(
                "w-full min-h-[140px] p-5 text-lg rounded-xl border transition-all resize-none shadow-sm focus:outline-none focus:ring-1",
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
            {isRecording && (
              <div
                className="flex items-end justify-center gap-1 h-8 mt-2"
                aria-hidden
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-primary recording-pulse"
                    style={{
                      height: `${12 + (i % 3) * 8}px`,
                      animationDelay: `${i * 0.12}s`,
                    }}
                  />
                ))}
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
                  aria-label={isRecording ? "إيقاف التسجيل الصوتي" : "بدء التسجيل الصوتي"}
                  className={cn(
                    "relative z-10 h-14 w-14 rounded-xl transition-all duration-300 flex items-center justify-center border-2 focus-visible:ring-2 focus-visible:ring-offset-2",
                    isRecording
                      ? "border-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700",
                  )}
                  disabled={showSuccessAnim}
                >
                  {isRecording ? (
                    <Square className="w-4 h-4 text-rose-600 dark:text-rose-400 fill-rose-600 dark:fill-rose-400" aria-hidden="true" />
                  ) : (
                    <Mic className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  )}
                </Button>
              </div>

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
                  showSuccessAnim
                }
                className={cn(
                  "h-14 w-14 rounded-xl transition-all duration-300 flex items-center justify-center border-2 focus-visible:ring-2 focus-visible:ring-offset-2",
                  "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700",
                )}
              >
                {isCompressing || parseReceiptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-hidden="true" />
                ) : (
                  <Camera className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                )}
              </Button>
            </div>

            {/* Submit Text Button - Professional Dark */}
            <Button
              type="submit"
              disabled={isSubmitting || (!text.trim() && !isRecording)}
              className={cn(
                "flex-1 w-full h-14 text-base rounded-xl transition-all shadow-none gap-3 font-medium",
                isRecording
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-900/50 dark:text-slate-500 cursor-not-allowed"
                  : "bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200",
              )}
            >
              {isRecording ? (
                <div className="flex items-center justify-center w-full">
                  <span className="flex h-2 w-2 relative mr-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                  </span>
                  <span>
                    جاري الاستماع... ({Math.floor(recordingDuration / 60)}:
                    {String(recordingDuration % 60).padStart(2, "0")})
                  </span>
                </div>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> {loadingMessage}
                </>
              ) : (
                <>
                  سجل وحلل <Sparkles className="w-4 h-4 ml-1 opacity-70" />
                </>
              )}
            </Button>
          </div>
        </form>

        {/* ─── Processing View (Skeleton Loader) ─── */}
        {flowStage === "processing" && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0c0e12] border border-slate-200 dark:border-slate-800 space-y-4 animate-pulse relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
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
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
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
                  variant="outline"
                  className="flex-1 h-12 border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all text-base font-bold gap-2"
                  onClick={() => {
                     // Reject, fallback to review mode or just cancel?
                     // If rejected, maybe let them edit it manually
                     setDecision("review");
                     setFlowStage("review");
                  }}
                >
                  <X className="w-5 h-5" /> لا، تعديل
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 relative z-10">
                <Input
                  placeholder="اكتب التوضيح هنا ودوس Enter..."
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
                  variant="outline"
                  className="border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all h-12 rounded-xl px-6 font-bold"
                  onClick={handleSkip}
                  disabled={isSkipping || answerClarificationMutation.isPending}
                >
                  {isSkipping || answerClarificationMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "تخطي"
                  )}
                </Button>
              </div>
            )}

            {clarificationQuestion?.includes("مين") && !clarificationQuestion?.startsWith("هل تقصد") && (
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
                    </div>
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
                        {getSubCategoryOptions(item.category).map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
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
              <ChevronUp className="w-3 h-3 ml-1" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-1" />
            )}
          </Button>
        </div>

        {showManual && (
          <ManualForm
            onSuccess={onSuccess}
            categories={categories}
            createMutation={createMutation}
          />
        )}
      </CardContent>

      {/* ─── Camera First-Time Tip Dialog ─── */}
      <Dialog open={showCameraTip} onOpenChange={setShowCameraTip}>
        <DialogContent
          className="sm:max-w-md bg-white dark:bg-slate-900 border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-2 text-foreground">
              <Camera className="w-5 h-5 text-indigo-500 animate-pulse" />
              نصائح للتصوير الذكي 📸
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 text-sm leading-relaxed text-right text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              للحصول على تصنيف دقيق وقراءة صحيحة للفاتورة بالذكاء الاصطناعي،
              يرجى اتباع الآتي:
            </p>
            <ul className="list-disc list-inside space-y-2 pr-2 text-xs">
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
        </DialogContent>
      </Dialog>

      {/* ─── Pro Upgrade Recommendation Dialog ─── */}
      <Dialog open={showProUpgrade} onOpenChange={setShowProUpgrade}>
        <DialogContent
          className="sm:max-w-md bg-white dark:bg-slate-900 border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 border-b pb-2 text-foreground">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              ميزة ذكية للمشتركين المميزين 💎
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 text-sm leading-relaxed text-right text-slate-600 dark:text-slate-300">
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
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ManualForm({ onSuccess, categories, createMutation }: any) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("عام");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("expense");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;

    const payload = {
      amount: parseFloat(amount),
      type,
      category,
      subCategory: subCategory || "عام",
      description,
      rawText: `${amount} جنيه - ${category}`,
      source: "manual",
    };

    if (!navigator.onLine) {
      toast.info("تم حفظ العملية محلياً (أوفلاين). سيتم مزامنتها لاحقاً.");
      const offlineManual = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );
      offlineManual.push({ ...payload, timestamp: Date.now() });
      localStorage.setItem(
        "smartspend_offline_manual",
        JSON.stringify(offlineManual),
      );
      setAmount("");
      setCategory("");
      setSubCategory("عام");
      setDescription("");
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        setAmount("");
        setCategory("");
        setSubCategory("عام");
        setDescription("");
        toast.success("تم التسجيل يدوياً!");
      },
    });
  };

  useEffect(() => {
    const handleOnline = () => {
      const offlineManual = JSON.parse(
        localStorage.getItem("smartspend_offline_manual") || "[]",
      );
      if (offlineManual.length > 0) {
        toast.info(
          `جاري مزامنة ${offlineManual.length} عمليات يدوية مسجلة أوفلاين...`,
        );
        Promise.all(
          offlineManual.map((item: any) => createMutation.mutateAsync(item)),
        )
          .then(() => {
            localStorage.removeItem("smartspend_offline_manual");
            toast.success("تم مزامنة كل العمليات بنجاح!");
          })
          .catch(() => {
            toast.error("حدث خطأ أثناء مزامنة بعض العمليات.");
          });
      }
    };
    window.addEventListener("online", handleOnline);
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, []);

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
              "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
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
            className="h-9"
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
            className="w-full h-9 rounded-md border text-xs px-2 bg-white dark:bg-slate-900"
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
          className="w-full h-9 rounded-md border text-xs px-2 bg-white dark:bg-slate-900"
          disabled={!category}
        >
          {getSubCategoryOptions(category).map((sub) => (
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
          className="h-9"
        />
      </div>
      <Button
        type="submit"
        disabled={createMutation.isPending}
        className="w-full h-10 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-xl"
      >
        حفظ العملية
      </Button>
    </form>
  );
}
