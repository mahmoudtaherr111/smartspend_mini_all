import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Mic, MicOff, Plus, Loader2, Sparkles } from "lucide-react";

// Speech Recognition Types
type SpeechRecognitionType = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
    };
    length: number;
  };
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionType;
    webkitSpeechRecognition: SpeechRecognitionType;
  }
}

interface ExpenseFormProps {
  onSuccess: () => void;
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [activeTab, setActiveTab] = useState<"voice" | "manual">("voice");
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);

  const parseMutation = trpc.ai.parseExpense.useMutation({
    onSuccess: (data) => {
      if (data.success && data.expenses.length > 0) {
        // Create each parsed expense
        data.expenses.forEach((expense) => {
          createMutation.mutate({
            amount: expense.amount,
            category: expense.category,
            description: expense.description,
            rawText: text,
            source: "voice",
          });
        });
        setText("");
        toast.success(`تم تسجيل ${data.expenses.length} مصروف بنجاح!`);
      } else {
        toast.error(data.error || "مش قادر أفهم المصروف. جرب تكتبه بطريقة تانية.");
      }
    },
    onError: () => {
      toast.error("فيه مشكلة في تحليل النص.");
    },
  });

  const createMutation = trpc.expense.create.useMutation({
    onSuccess: () => {
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "فيه مشكلة في تسجيل المصروف.");
    },
  });

  const handleVoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("اكتب أو سجل المصروف الأول!");
      return;
    }
    parseMutation.mutate({ text });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAmount || !manualCategory) {
      toast.error("اكتب المبلغ والفئة على الأقل!");
      return;
    }
    createMutation.mutate({
      amount: parseFloat(manualAmount),
      category: manualCategory,
      description: manualDescription,
      rawText: `${manualAmount} جنيه - ${manualCategory}${manualDescription ? ` - ${manualDescription}` : ""}`,
      source: "manual",
    }, {
      onSuccess: () => {
        setManualAmount("");
        setManualCategory("");
        setManualDescription("");
        toast.success("تم تسجيل المصروف بنجاح!");
      },
    });
  };

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("المتصفح مش بيدعم التسجيل الصوتي. جرب Chrome.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognition.onerror = () => {
      toast.error("فيه مشكلة في الميكروفون. جرب تاني.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const isSubmitting = parseMutation.isPending || createMutation.isPending;

  const categories = [
    "أكل", "مواصلات", "تسوق", "فواتير", "صحة", "ترفيه", "تعليم",
    "ملابس", "إيجار", "بنزين", "إنترنت", "موبايل", "أهل وبيت", "هدايا", "صيانة", "اشتراكات", "أخرى"
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          سجل مصروف جديد
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tab switcher */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={activeTab === "voice" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("voice")}
            className="flex-1 gap-1"
          >
            <Mic className="w-4 h-4" />
            صوتي / نصي
          </Button>
          <Button
            type="button"
            variant={activeTab === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("manual")}
            className="flex-1 gap-1"
          >
            <Plus className="w-4 h-4" />
            يدوي
          </Button>
        </div>

        {activeTab === "voice" ? (
          <form onSubmit={handleVoiceSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>اكتب أو سجل المصروف بالعربي</Label>
              <div className="flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="مثال: دفعت 200 جنيه أكل في المطعم..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                اكتب المصروف بالعربي وهنحلهولك بالAI. ممكن تكتب أكتر من مصروف في نفس الجملة.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isSubmitting ? "جاري التحليل..." : "حلل بالذكاء الاصطناعي"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ (جنيه) *</Label>
                <Input
                  type="number"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="200"
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>الفئة *</Label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">اختر الفئة</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف (اختياري)</Label>
              <Input
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="مثال: أكل مع صحابي في المطعم"
              />
            </div>
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isSubmitting ? "جاري..." : "سجل المصروف"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
