import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const questionText: Record<string, string> = {
  income_level: "متوسط دخلك الشهري تقريبًا؟",
  income_sources: "مصادر دخلك الأساسية؟",
  family_responsibility: "هل أنت مسؤول ماليًا عن أسرة أو أشخاص آخرين؟",
  children: "هل لديك أطفال؟",
  children_details: "اكتب عدد الأطفال وأعمارهم تقريبًا",
  living_situation: "ما وضع السكن الحالي؟",
  spending_pattern: "نمط صرفك غالبًا عامل إزاي؟",
  supports_others: "مين بتدعمه ماليًا؟",
  fixed_commitments: "عدد الالتزامات الشهرية الثابتة تقريبًا؟",
  app_goal: "هدفك الأساسي من SmartSpend؟",
};

const optionText: Record<string, string> = {
  salary: "وظيفة",
  freelance: "فريلانس",
  business: "أعمال",
  other: "أخرى",
  alone: "أعيش وحدي",
  family: "مع الأسرة",
  shared: "سكن مشترك",
  stable: "ثابت",
  variable: "متغير",
  unclear: "غير واضح",
  parents: "والدين",
  siblings: "إخوة",
  partner: "شريك/زوج",
  organize_expenses: "تنظيم المصاريف",
  reduce_spending: "تقليل الصرف",
  track_income: "تتبع الدخل",
  manage_business: "إدارة مشروع",
};

function normalizeOptions(question: any) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option: any) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return { value, label: optionText[value] || label || value };
  });
}

export function OnboardingCard() {
  const utils = trpc.useUtils();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState<any>("");

  const profile = trpc.profile.getSmartProfile.useQuery(undefined, { retry: false });
  const nextQuestion = trpc.profile.getNextOnboardingQuestion.useQuery(undefined, { retry: false });
  const submitAnswer = trpc.profile.submitOnboardingAnswer.useMutation({
    onSuccess: (data) => {
      utils.profile.getSmartProfile.invalidate();
      utils.profile.getNextOnboardingQuestion.invalidate();
      setValue("");
      if (!data.nextQuestion) {
        toast.success("تم تجهيز البروفايل الذكي.");
        setShow(false);
      }
    },
    onError: (err) => toast.error(err.message || "تعذر حفظ الإجابة"),
  });

  const question = nextQuestion.data?.question as any;
  const options = useMemo(() => normalizeOptions(question), [question]);
  const isComplete = Boolean(profile.data?.profileCompleted || nextQuestion.data?.profileCompleted);

  useEffect(() => {
    if (profile.data && !isComplete && question) {
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, [profile.data, isComplete, question]);

  useEffect(() => {
    setValue(question?.type === "multi_select" ? [] : "");
  }, [question?.key, question?.type]);

  if (!show || isComplete || !question) return null;

  const selectedList = Array.isArray(value) ? value : [];
  const progress = Math.min(90, Object.keys(profile.data?.onboardingAnswers || {}).length * 14 + 12);

  const submit = (skipped = false) => {
    submitAnswer.mutate({
      key: question.key,
      value,
      skipped,
    });
  };

  const renderInput = () => {
    if (question.type === "boolean") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={value === true ? "default" : "outline"} onClick={() => setValue(true)}>
            نعم
          </Button>
          <Button type="button" variant={value === false ? "default" : "outline"} onClick={() => setValue(false)}>
            لا
          </Button>
        </div>
      );
    }

    if (question.type === "select") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((option: any) => (
            <Button
              key={option.value}
              type="button"
              variant={value === option.value ? "default" : "outline"}
              className="justify-start h-11"
              onClick={() => setValue(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      );
    }

    if (question.type === "multi_select") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((option: any) => {
            const active = selectedList.includes(option.value);
            return (
              <Button
                key={option.value}
                type="button"
                variant={active ? "default" : "outline"}
                className="justify-between h-11"
                onClick={() => {
                  setValue(
                    active
                      ? selectedList.filter((item: string) => item !== option.value)
                      : [...selectedList, option.value]
                  );
                }}
              >
                <span>{option.label}</span>
                {active && <Check className="w-4 h-4" />}
              </Button>
            );
          })}
        </div>
      );
    }

    return (
      <Input
        type={question.type === "number" ? "number" : "text"}
        value={value}
        onChange={(event) => setValue(question.type === "number" ? Number(event.target.value) : event.target.value)}
        placeholder={question.type === "number" ? "مثال: 15000" : "اكتب هنا"}
        className="h-12"
        dir={question.type === "number" ? "ltr" : "rtl"}
      />
    );
  };

  const canSubmit =
    question.type === "boolean" ? typeof value === "boolean" : Array.isArray(value) ? value.length > 0 : value !== "";

  return (
    <div className="fixed inset-0 bg-slate-950/55 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg border-0 shadow-2xl">
        <CardContent className="p-6 space-y-5" dir="rtl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">البروفايل الذكي</h3>
                  <Badge variant="secondary">{progress}%</Badge>
                </div>
                <p className="text-sm text-muted-foreground">إجابات قليلة تجعل التصنيف والتقارير أدق.</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShow(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="space-y-3">
            <p className="font-semibold">{questionText[question.key] || question.text}</p>
            {renderInput()}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={() => submit(false)}
              disabled={!canSubmit || submitAnswer.isPending}
            >
              التالي
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => submit(true)}
              disabled={submitAnswer.isPending}
              className={cn("sm:w-28", submitAnswer.isPending && "opacity-70")}
            >
              تخطي
            </Button>
            <Button variant="ghost" onClick={() => setShow(false)} className="sm:w-28">
              لاحقًا
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
