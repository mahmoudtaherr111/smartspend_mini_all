import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Mic, MicOff, Plus, Loader2, Sparkles, ChevronDown, ChevronUp, AlertCircle, HelpCircle, Save, CheckCircle2, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpenseFormProps {
  onSuccess?: () => void;
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [parsedItems, setParsedItems] = useState<any[] | null>(null);
  const [decision, setDecision] = useState<"auto_save" | "review" | "clarify" | null>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const { data: userLimits } = trpc.ai.getUserLimits.useQuery();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const utilsTrpc = trpc.useUtils();
  const learnMutation = trpc.ai.learnWord.useMutation();

  // ─── STT Mutation ───
  const sttMutation = trpc.ai.speechToText.useMutation({
    onSuccess: (data) => {
      setText(data.text);
      toast.success("تم فهم التسجيل!");
      // Automatically trigger parsing after STT
      parseMutation.mutate({ text: data.text });
    },
    onError: (err) => {
      toast.error(err.message || "فشل تحويل الصوت لنص.");
      setIsProcessingVoice(false);
    }
  });

  // ─── Parsing Mutation ───
  const parseMutation = trpc.ai.parseExpense.useMutation({
    onSuccess: (data) => {
      setIsProcessingVoice(false);
      setDecision(data.decision as any);

      if (data.decision === "auto_save" && data.items && data.items.length > 0) {
        saveItems(data.items, true);
      } else if (data.decision === "review") {
        setParsedItems(data.items || []);
      } else if (data.decision === "clarify") {
        setClarificationQuestion(data.clarificationQuestion || "ممكن توضح أكتر؟");
        setParsedItems(null);
      }

      setIsSkipping(false);

      if (data.alertMessage) {
        toast.info("💡 تنبيه مالي", { description: data.alertMessage, duration: 6000 });
      }
    },
    onError: () => {
      toast.error("حدث خطأ أثناء تحليل النص.");
      setIsProcessingVoice(false);
      setIsSkipping(false);
    }
  });

  // ─── Voice Limit Effect ───
  useEffect(() => {
    if (isRecording && userLimits && userLimits.voice.remaining !== -1) {
      if (recordingDuration >= userLimits.voice.remaining) {
        stopRecording();
        toast.error("انتهت مدة التسجيل المسموحة لك هذا الشهر. قم بالترقية للحصول على مدة أطول!", {
          duration: 8000,
          action: { label: "ترقية", onClick: () => window.location.href = "/pro" }
        });
      }
    }
  }, [recordingDuration, isRecording, userLimits]);

  const createMutation = trpc.expense.create.useMutation({
    onSuccess: () => {
      utilsTrpc.expense.invalidate();
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
      toast.error("متصفحك يمنع الوصول للميكروفون! يجب استخدام اتصال آمن (HTTPS) أو (Localhost).", {
        duration: 8000
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/mp4';
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
          sttMutation.mutate({
            audioBase64: base64Audio,
            mimeType: mimeType,
            durationSeconds: recordingDuration,
          });
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDur = prev + 1;
          const maxPerReq = userLimits?.voice?.maxPerRequest || 60;
          // Auto-stop if exceeding the max per request limit
          if (newDur >= maxPerReq) {
            toast.info(`تم الوصول للحد الأقصى للتسجيل (${maxPerReq} ثانية). جاري المعالجة...`);
            stopRecording();
            return prev;
          }
          return newDur;
        });
      }, 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error("لقد قمت برفض صلاحية الميكروفون. يرجى تفعيلها من إعدادات المتصفح.");
      } else {
        toast.error(`خطأ في الوصول للميكروفون: ${err.message}`);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // ─── Save Logic ───
  const saveItems = (items: any[], isAuto: boolean = false) => {
    items.forEach((item) => {
      createMutation.mutate({
        amount: item.amount,
        type: item.type,
        category: item.category,
        subCategory: item.subCategory,
        description: item.description,
        rawText: text || "إدخال صوتي",
        source: isAuto ? "ai_parsed" : "manual",
      });
    });
    setParsedItems(null);
    setDecision(null);
    setText("");
    toast.success(isAuto ? `تم الحفظ تلقائياً (${items.length} عملية) ✨` : "تم الحفظ بنجاح!");
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
    setIsProcessingVoice(true);
    parseMutation.mutate({ text });
  };

  const handleSkip = () => {
    setIsSkipping(true);
    parseMutation.mutate({ text, skipClarification: true });
  };

  const isSubmitting = parseMutation.isPending || createMutation.isPending || isProcessingVoice;

  const categories = [
    "أكل وشرب", "مواصلات", "تسوق", "سكن وفواتير", "صحة", "ترفيه", "تعليم",
    "ملابس", "سيارات", "تكنولوجيا", "أهل وبيت", "هدايا", "صيانة", "اشتراكات", "عمل", "استثمار", "أخرى"
  ];

  const getTypeColor = (type: string) => {
    if (type === "income") return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800";
    if (type === "transfer") return "text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800";
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
        {/* ─── Main Input Area (Professional UI) ─── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isRecording ? "جاري الاستماع... يمكنك التحدث الآن" : "سجل مصاريفك أو دخلك هنا... (مثال: صرفت 150 جنيه مطعم)"}
              className={cn(
                "w-full min-h-[140px] p-5 text-lg rounded-xl border transition-all resize-none shadow-sm focus:outline-none focus:ring-1",
                isRecording
                  ? "border-primary/50 bg-primary/5 text-primary placeholder:text-primary/70 ring-1 ring-primary/30"
                  : "border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0c0e12] focus:border-slate-400 focus:ring-slate-400"
              )}
              dir="rtl"
              disabled={isRecording}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* The Voice Recording Button - Sleek & Minimal */}
            <div className="relative flex-shrink-0 w-full sm:w-auto">
              {isRecording && (
                <div className="absolute -inset-1 bg-primary/20 rounded-xl blur-sm animate-pulse" />
              )}
              <Button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                variant="outline"
                className={cn(
                  "relative z-10 h-14 w-full sm:w-16 rounded-xl transition-all duration-300 flex items-center justify-center border-2",
                  isRecording
                    ? "border-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c0e12] hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                )}
              >
                {isRecording ? (
                  <Square className="w-5 h-5 text-rose-600 dark:text-rose-400 fill-rose-600 dark:fill-rose-400" />
                ) : (
                  <Mic className="w-5 h-5 text-slate-700 dark:text-slate-300" />
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
                  : "bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
              )}
            >
              {isRecording ? (
                <div className="flex items-center justify-center w-full">
                  <span className="flex h-2 w-2 relative mr-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                  </span>
                  <span>جاري التسجيل ({Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, "0")}) - سيتم الإيقاف التلقائي عند {userLimits?.voice?.maxPerRequest || 60}ث</span>
                </div>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> المعالجة الذكية...
                </>
              ) : (
                <>
                  سجل وحلل <Sparkles className="w-4 h-4 ml-1 opacity-70" />
                </>
              )}
            </Button>
          </div>
        </form>

        {/* ─── Clarification View ─── */}
        {decision === "clarify" && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-6 h-6 text-amber-600 mt-1" />
              <div className="space-y-1">
                <p className="font-bold text-amber-900 dark:text-amber-400">محتاج توضيح بسيط:</p>
                <p className="text-sm text-amber-700 dark:text-amber-500">{clarificationQuestion}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="اكتب التوضيح هنا..."
                className="bg-white dark:bg-slate-900 border-amber-200 h-10 transition-all focus:scale-[1.02]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const newText = `${text} (${(e.target as HTMLInputElement).value})`;
                    setText(newText);
                    setDecision(null);
                    parseMutation.mutate({ text: newText });
                  }
                }}
              />
              <Button
                variant="outline"
                className="border-amber-200 text-amber-700 hover:bg-amber-100 transition-all h-10"
                onClick={handleSkip}
                disabled={isSkipping}
              >
                {isSkipping ? <Loader2 className="w-4 h-4 animate-spin" /> : "تخطي"}
              </Button>
            </div>
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
              <Badge variant="outline" className="text-[10px]">دقة {Math.round(parseMutation.data?.overallConfidence || 0)}%</Badge>
            </div>

            <div className="space-y-3">
              {parsedItems.map((item, idx) => (
                <div key={idx} className={cn("p-4 rounded-2xl border-2 transition-all space-y-3", getTypeColor(item.type))}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => handleUpdateParsedItem(idx, { amount: parseFloat(e.target.value) })}
                        className="w-24 h-8 text-lg font-bold bg-white/50 dark:bg-black/20 border-0"
                      />
                      <span className="text-sm font-medium">جنيه</span>
                    </div>
                    <Badge className={cn("capitalize",
                      item.type === "income" ? "bg-emerald-500" :
                        item.type === "transfer" ? "bg-sky-500" : "bg-rose-500"
                    )}>
                      {item.type === "income" ? "دخل" : item.type === "transfer" ? "تحويل" : "مصروف"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] opacity-70">الفئة الرئيسة</Label>
                      <select
                        value={item.category}
                        onChange={(e) => handleUpdateParsedItem(idx, { category: e.target.value })}
                        className="w-full text-xs h-9 rounded-lg border bg-white/50 dark:bg-black/20 px-2 outline-none focus:ring-1 ring-emerald-500"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] opacity-70">الفئة الفرعية</Label>
                      <Input
                        value={item.subCategory || ""}
                        onChange={(e) => handleUpdateParsedItem(idx, { subCategory: e.target.value })}
                        className="h-9 text-xs bg-white/50 dark:bg-black/20 border-0"
                        placeholder="أدخل فئة فرعية"
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <Input
                      value={item.description}
                      onChange={(e) => handleUpdateParsedItem(idx, { description: e.target.value })}
                      className="h-9 text-xs bg-white/50 dark:bg-black/20 border-0 italic"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveItems(parsedItems)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 rounded-xl shadow-lg gap-2">
                <Save className="w-4 h-4" /> تأكيد وحفظ
              </Button>
              <Button onClick={() => setDecision(null)} variant="outline" className="rounded-xl h-11">
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
            {showManual ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
        </div>

        {showManual && <ManualForm onSuccess={onSuccess} categories={categories} createMutation={createMutation} />}
      </CardContent>
    </Card>
  );
}

function ManualForm({ onSuccess, categories, createMutation }: any) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("expense");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;
    createMutation.mutate({
      amount: parseFloat(amount),
      type,
      category,
      subCategory,
      description,
      rawText: `${amount} جنيه - ${category}`,
      source: "manual",
    }, {
      onSuccess: () => {
        setAmount("");
        setCategory("");
        setSubCategory("");
        setDescription("");
        toast.success("تم التسجيل يدوياً!");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-4 animate-in slide-in-from-top-4">
      <div className="flex gap-2 p-1 bg-white dark:bg-slate-900 rounded-xl border">
        {['expense', 'income', 'transfer'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
              type === t ? (
                t === 'income' ? "bg-emerald-500 text-white" :
                  t === 'transfer' ? "bg-sky-500 text-white" : "bg-rose-500 text-white"
              ) : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {t === 'income' ? 'دخل' : t === 'transfer' ? 'تحويل' : 'مصروف'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">المبلغ *</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">الفئة *</Label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-9 rounded-md border text-xs px-2 bg-white dark:bg-slate-900">
            <option value="">اختر...</option>
            {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">الفئة الفرعية</Label>
        <Input value={subCategory} onChange={e => setSubCategory(e.target.value)} placeholder="مثلاً: فاتورة النت" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">الوصف</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="تفاصيل إضافية..." className="h-9" />
      </div>
      <Button type="submit" disabled={createMutation.isPending} className="w-full h-10 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-xl">
        حفظ العملية
      </Button>
    </form>
  );
}

function Badge({ children, className, variant = "default" }: any) {
  const variants: any = {
    default: "bg-emerald-500 text-white",
    secondary: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    outline: "border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400",
    destructive: "bg-rose-500 text-white"
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", variants[variant], className)}>
      {children}
    </span>
  );
}
