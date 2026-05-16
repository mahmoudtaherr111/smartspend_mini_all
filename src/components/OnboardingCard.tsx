import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

// Arabic question texts matching the new adaptive-question-engine
const questionMeta: Record<string, { text: string; emoji: string; hint?: string }> = {
  income_level:            { text: "كام تقريباً دخلك الشهري؟", emoji: "💰", hint: "بالجنيه المصري - اكتب رقم تقريبي" },
  income_sources:          { text: "إيه مصادر دخلك الأساسية؟", emoji: "🏦", hint: "ممكن تختار أكثر من واحد" },
  family_responsibility:   { text: "هل أنت مسؤول مادياً عن أسرتك أو حد تاني؟", emoji: "👨‍👩‍👧" },
  children:                { text: "عندك أطفال؟", emoji: "👶" },
  children_count:          { text: "كام طفل عندك؟", emoji: "👧" },
  living_situation:        { text: "إيه وضع سكنك الحالي؟", emoji: "🏠" },
  housing_type:            { text: "سكنك إيجار ولا ملك؟", emoji: "🏡" },
  monthly_rent:            { text: "الإيجار بيبلغ كام شهرياً؟", emoji: "🔑", hint: "بالجنيه المصري" },
  spending_pattern:        { text: "إزاي بتوصف طريقة صرفك؟", emoji: "💳" },
  supports_others:         { text: "بتصرف على مين بشكل منتظم؟", emoji: "🤝", hint: "ممكن تختار أكثر من واحد" },
  fixed_commitments:       { text: "كام التزام ثابت شهري عندك؟", emoji: "📋", hint: "إيجار + أقساط + اشتراكات..." },
  fixed_commitments_total: { text: "إجمالي التزاماتك الثابتة شهرياً كام؟", emoji: "📊", hint: "بالجنيه المصري تقريباً" },
  has_debt:                { text: "عندك أي ديون أو أقساط؟", emoji: "📉" },
  debt_monthly:            { text: "بتدفع كام على الديون شهرياً؟", emoji: "💸", hint: "بالجنيه المصري تقريباً" },
  has_savings:             { text: "عندك ادخار أو صندوق طوارئ؟", emoji: "🏦" },
  biggest_expense_category:{ text: "إيه أكبر بند بيستهلك فلوسك شهرياً؟", emoji: "🛒" },
  app_goal:                { text: "إيه أهم حاجة عايز SmartSpend يساعدك فيها؟", emoji: "🎯" },
  profession:              { text: "إيه وظيفتك أو مجال شغلك؟", emoji: "💼", hint: "اكتب بحرية - مثال: مصمم، موظف، طبيب" },
  age_range:               { text: "إيه فئتك العمرية؟", emoji: "🎂" },
};

const TOTAL_QUESTIONS = 12; // approximate for progress

function normalizeOptions(question: any) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option: any) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return { value, label };
  });
}

export function OnboardingCard() {
  const utils = trpc.useUtils();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState<any>("");
  const [localNextQuestion, setLocalNextQuestion] = useState<any>(null);

  const profile = trpc.profile.getSmartProfile.useQuery(undefined, { retry: false });
  const nextQuestion = trpc.profile.getNextOnboardingQuestion.useQuery(undefined, { retry: false });
  const submitAnswer = trpc.profile.submitOnboardingAnswer.useMutation({
    onSuccess: async (data) => {
      if (!data.nextQuestion) {
        toast.success("تم تجهيز البروفايل الذكي! 🎉 التقارير ستكون أدق وأكثر تخصيصاً.");
        setShow(false);
        setLocalNextQuestion(null);
      } else {
        setLocalNextQuestion(data.nextQuestion);
      }
      const nextType = data.nextQuestion?.type;
      setValue(nextType === "multi_select" ? [] : nextType === "boolean" ? "" : "");
      utils.profile.getSmartProfile.invalidate();
      utils.profile.getNextOnboardingQuestion.invalidate();
    },
    onError: (err) => toast.error(err.message || "تعذر حفظ الإجابة. جرب تاني."),
  });

  const question = (localNextQuestion || nextQuestion.data?.question) as any;
  const options = useMemo(() => normalizeOptions(question), [question]);
  const isComplete = Boolean(profile.data?.profileCompleted || nextQuestion.data?.profileCompleted);

  const answeredCount = Object.keys(profile.data?.onboardingAnswers || {}).length;
  const progress = Math.min(95, Math.round((answeredCount / TOTAL_QUESTIONS) * 100));

  useEffect(() => {
    if (profile.data && !isComplete && question) {
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, [profile.data, isComplete, question]);

  useEffect(() => {
    if (!localNextQuestion) {
      setValue(question?.type === "multi_select" ? [] : "");
    }
  }, [question?.key, question?.type, localNextQuestion]);

  if (!show || isComplete || !question) return null;

  const meta = questionMeta[question.key] || { text: question.text, emoji: "❓" };
  const selectedList = Array.isArray(value) ? value : [];

  const submit = (skipped = false) => {
    if (submitAnswer.isPending) return;
    submitAnswer.mutate({ key: question.key, value, skipped });
  };

  const canSubmit =
    question.type === "boolean"
      ? typeof value === "boolean"
      : Array.isArray(value)
      ? value.length > 0
      : value !== "";

  const renderInput = () => {
    if (question.type === "boolean") {
      return (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "✅ نعم", val: true },
            { label: "❌ لا", val: false },
          ].map(({ label, val }) => (
            <Button
              key={String(val)}
              type="button"
              variant={value === val ? "default" : "outline"}
              className={cn("h-12 text-base", value === val && "ring-2 ring-emerald-400")}
              onClick={() => setValue(val)}
            >
              {label}
            </Button>
          ))}
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
              className={cn(
                "justify-start h-11 text-sm",
                value === option.value && "ring-2 ring-emerald-400"
              )}
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
                className={cn(
                  "justify-between h-11 text-sm",
                  active && "ring-2 ring-emerald-400"
                )}
                onClick={() =>
                  setValue(
                    active
                      ? selectedList.filter((item: string) => item !== option.value)
                      : [...selectedList, option.value]
                  )
                }
              >
                <span>{option.label}</span>
                {active && <Check className="w-4 h-4 shrink-0" />}
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
        onChange={(e) =>
          setValue(question.type === "number" ? Number(e.target.value) : e.target.value)
        }
        placeholder={question.type === "number" ? "اكتب رقم..." : "اكتب هنا..."}
        className="h-12 text-base"
        dir={question.type === "number" ? "ltr" : "rtl"}
        autoFocus
      />
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <Card className="w-full sm:max-w-lg rounded-b-none sm:rounded-2xl border-0 shadow-2xl overflow-hidden">
        {/* Gradient header bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400" />

        <CardContent className="p-5 sm:p-6 space-y-5" dir="rtl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-950/40 dark:to-sky-950/40 flex items-center justify-center text-2xl shadow-sm">
                {meta.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base">البروفايل الذكي</h3>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs"
                  >
                    {progress}% مكتمل
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  إجاباتك تجعل تقارير AI أدق وأكثر تخصيصاً لك.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 -mt-1" onClick={() => setShow(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5" />

          {/* Question */}
          <div className="space-y-3">
            <p className="font-semibold text-base leading-relaxed">{meta.text}</p>
            {meta.hint && (
              <p className="text-xs text-muted-foreground -mt-1">{meta.hint}</p>
            )}
            {renderInput()}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="flex-1 gap-2 h-11 text-sm"
              onClick={() => submit(false)}
              disabled={!canSubmit || submitAnswer.isPending}
            >
              {submitAnswer.isPending ? (
                <Sparkles className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  التالي
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => submit(true)}
              disabled={submitAnswer.isPending}
              className="sm:w-24 h-11 text-sm"
            >
              تخطي
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShow(false)}
              className="sm:w-24 h-11 text-sm text-muted-foreground"
            >
              لاحقاً
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
