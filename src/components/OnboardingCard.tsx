import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Arabic question texts matching the new adaptive-question-engine
const questionMeta: Record<
  string,
  { text: string; emoji: string; hint?: string }
> = {
  income_level: {
    text: "كام تقريباً دخلك الشهري؟",
    emoji: "💰",
    hint: "بالجنيه المصري - اكتب رقم تقريبي",
  },
  income_sources: {
    text: "إيه مصادر دخلك الأساسية؟",
    emoji: "🏦",
    hint: "ممكن تختار أكثر من واحد",
  },
  has_fixed_salary: {
    text: "مرتبك بينزل في وقت ثابت كل شهر؟",
    emoji: "📅",
    hint: "عشان نحسب شهرك المالي صح",
  },
  salary_day: {
    text: "مرتبك بينزل يوم كام من الشهر؟",
    emoji: "💵",
    hint: "رقم من 1 لـ 31",
  },
  app_goal: { text: "إيه أهم حاجة عايز SmartSpend يساعدك فيها؟", emoji: "🎯" },
  children: { text: "عندك أطفال؟", emoji: "👶" },
  children_count: { text: "كام طفل عندك؟", emoji: "👧" },
  children_names: {
    text: "إيه أسماء أطفالك؟",
    emoji: "👧",
    hint: "اكتب اسم كل طفل",
  },
  living_situation: { text: "إيه وضع سكنك الحالي؟", emoji: "🏠" },
  partner_name: {
    text: "إيه اسم شريك/شريكة حياتك؟",
    emoji: "💑",
    hint: "عشان نعرفه لما تقول بعتت فلوس لـ...",
  },
  housing_type: { text: "سكنك إيجار ولا ملك؟", emoji: "🏡" },
  monthly_rent: {
    text: "الإيجار بيبلغ كام شهرياً؟",
    emoji: "🔑",
    hint: "بالجنيه المصري",
  },
  supports_others: {
    text: "بتصرف على مين بشكل منتظم؟",
    emoji: "🤝",
    hint: "ممكن تختار أكثر من واحد",
  },
  has_debt: { text: "عندك أي ديون أو أقساط؟", emoji: "📉" },
  debt_monthly: {
    text: "بتدفع كام على الديون شهرياً؟",
    emoji: "💸",
    hint: "بالجنيه المصري تقريباً",
  },
  profession: {
    text: "إيه وظيفتك أو مجال شغلك؟",
    emoji: "💼",
    hint: "اكتب بحرية - مثال: مصمم، موظف، طبيب",
  },
  car_ownership: { text: "عندك عربية خاصة؟", emoji: "🚗" },
  car_type: { text: "نوع العربية إيه؟", emoji: "🚘", hint: "مثال: كيا سيراتو" },
  monthly_car_cost: {
    text: "بتصرف كام على العربية شهرياً تقريباً؟",
    emoji: "⛽",
    hint: "بنزين + صيانة بالجنيه",
  },
  has_pets: { text: "عندك حيوانات أليفة؟", emoji: "🐾" },
  pet_names: { text: "إيه أسماءهم؟", emoji: "🐱" },
  smoking: { text: "بتدخن؟", emoji: "🚬" },
  subscription_services: {
    text: "إيه الاشتراكات الثابتة عندك؟",
    emoji: "📺",
    hint: "ممكن تختار أكثر من واحد",
  },
  regular_contacts: {
    text: "مين الأشخاص اللي بتحولهم فلوس بانتظام؟",
    emoji: "📇",
    hint: "غير العيلة - اكتب اسم كل شخص",
  },
};

const TOTAL_QUESTIONS = 21; // including conditional salary_day questions

function normalizeOptions(question: any) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option: any) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return { value, label };
  });
}

function initValue(type: string | undefined) {
  if (type === "multi_select") return [];
  if (type === "text_list") return [""];
  return "";
}

export function OnboardingCard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState<any>("");
  // Track the current question locally to avoid race conditions with query invalidation
  const [localQuestion, setLocalQuestion] = useState<any>(null);
  const isUsingLocal = useRef(false);
  // CRITICAL: Accumulate ALL answers locally so we never lose them even if DB save fails
  const accumulatedAnswers = useRef<Record<string, any>>({});
  const storageScope = user ? `${user.type}_${user.id}` : "anonymous";
  const answersStorageKey = `onboarding_answers_${storageScope}`;
  const dismissedStorageKey = `onboarding_last_dismissed_${storageScope}`;

  const profile = trpc.profile.getSmartProfile.useQuery(undefined, {
    retry: false,
  });
  const nextQuestion = trpc.profile.getNextOnboardingQuestion.useQuery(
    undefined,
    { retry: false },
  );
  const dismissMutation = trpc.profile.dismissOnboarding.useMutation();
  const submitAnswer = trpc.profile.submitOnboardingAnswer.useMutation({
    onSuccess: (data) => {
      // Merge server-returned answers into our local accumulator
      if (data.allAnswers) {
        accumulatedAnswers.current = {
          ...accumulatedAnswers.current,
          ...data.allAnswers,
        };
      }

      if (!data.nextQuestion) {
        toast.success(
          "تم تجهيز البروفايل الذكي! 🎉 التقارير ستكون أدق وأكثر تخصيصاً.",
        );
        setShow(false);
        setLocalQuestion(null);
        isUsingLocal.current = false;
        accumulatedAnswers.current = {};
        try {
          localStorage.removeItem(answersStorageKey);
          localStorage.removeItem(dismissedStorageKey);
        } catch (e) {}
      } else {
        // Use local question state to avoid race condition with server refetch
        setLocalQuestion(data.nextQuestion);
        isUsingLocal.current = true;
      }
      // Reset value for the NEXT question type
      setValue(initValue(data.nextQuestion?.type));
      // Only invalidate the profile (for progress count), NOT the question query
      utils.profile.getSmartProfile.invalidate();
    },
    onError: (err) => toast.error(err.message || "تعذر حفظ الإجابة. جرب تاني."),
  });

  // Initialize accumulated answers from server profile on first load
  useEffect(() => {
    if (profile.data) {
      if (
        profile.data.onboardingAnswers &&
        Object.keys(accumulatedAnswers.current).length === 0
      ) {
        accumulatedAnswers.current = { ...profile.data.onboardingAnswers };
      }
      
      // Local Storage fallback to reconstruct lost DB state
      try {
        const local = localStorage.getItem(answersStorageKey);
        if (local) {
          const parsed = JSON.parse(local);
          accumulatedAnswers.current = { ...parsed, ...accumulatedAnswers.current };
        }
      } catch (e) {}
    }
  }, [profile.data?.onboardingAnswers, profile.data?.basicInfo?.name]);

  // Sync to local storage when accumulated answers change via submission
  useEffect(() => {
    if (Object.keys(accumulatedAnswers.current).length > 0 && profile.data) {
      try {
        localStorage.setItem(
          answersStorageKey,
          JSON.stringify(accumulatedAnswers.current)
        );
      } catch (e) {}
    }
  }, [localQuestion]);

  // Determine which question to show: local (after submit) or server (initial load)
  const question =
    isUsingLocal.current && localQuestion
      ? localQuestion
      : nextQuestion.data?.question;
  const options = useMemo(() => normalizeOptions(question), [question]);
  // Only consider complete if profileCompleted=true AND there are no more questions from the engine
  const isComplete = Boolean(
    (profile.data?.profileCompleted || nextQuestion.data?.profileCompleted) &&
    !question,
  );

  const answeredCount = Math.max(
    Object.keys(profile.data?.onboardingAnswers || {}).length,
    Object.keys(accumulatedAnswers.current).length,
  );
  const progress = Math.min(
    95,
    Math.round((answeredCount / TOTAL_QUESTIONS) * 100),
  );

  // Smart reminder: show after delay + 48h cooldown
  useEffect(() => {
    if (profile.data && !isComplete && question) {
      const lastAsked = nextQuestion.data?.lastAskedAt;
      let inCooldown = false;
      
      const now = Date.now();
      
      // Check server cooldown
      if (lastAsked) {
        const hoursSince = (now - new Date(lastAsked).getTime()) / (1000 * 3600);
        if (hoursSince < 48) inCooldown = true;
      }
      
      // Check local dismiss cooldown (CRITICAL: because server doesn't save dismissals)
      try {
        const localDismissed = localStorage.getItem(dismissedStorageKey);
        if (localDismissed) {
          const hoursSinceDismiss = (now - parseInt(localDismissed, 10)) / (1000 * 3600);
          if (hoursSinceDismiss < 48) inCooldown = true;
        }
      } catch (e) {}

      if (!inCooldown) {
        const delay = answeredCount === 0 ? 15000 : 300000; // 15s for new users, 5min otherwise
        const timer = setTimeout(() => setShow(true), delay);
        return () => clearTimeout(timer);
      }
    }
  }, [
    profile.data,
    isComplete,
    question,
    nextQuestion.data?.lastAskedAt,
    answeredCount,
  ]);

  // Initialize value when server question loads (only if we're not using local state)
  useEffect(() => {
    if (!isUsingLocal.current && question) {
      setValue(initValue(question.type));
    }
  }, [question?.key]);

  // If queries are still loading, don't render anything yet
  if (profile.isLoading || nextQuestion.isLoading) return null;

  // If profile is truly complete and no more questions, hide the card
  if (isComplete) return null;

  // If there's no question (query error or all answered), check if we should show based on error
  if (!question) {
    // If the query errored, show a retry button so user isn't stuck
    if (nextQuestion.isError || profile.isError) {
      return null; // silently hide on error
    }
    return null;
  }

  if (!show) {
    return (
      <Button
        onClick={() => setShow(true)}
        className="w-full sm:w-auto mb-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md animate-in fade-in zoom-in"
      >
        <Sparkles className="w-4 h-4" />
        كمل بياناتك عشان نعرفك أكتر
      </Button>
    );
  }

  const meta = questionMeta[question.key] || {
    text: question.text,
    emoji: "❓",
  };
  const selectedList = Array.isArray(value) ? value : [];

  const submit = (skipped = false) => {
    if (submitAnswer.isPending) return;
    submitAnswer.mutate({
      key: question.key,
      value,
      skipped,
      // Send ALL accumulated answers so backend can reconstruct state even if DB lost them
      accumulatedAnswers: accumulatedAnswers.current,
    });
  };

  const canSubmit =
    question.type === "boolean"
      ? typeof value === "boolean"
      : question.type === "text_list"
        ? Array.isArray(value) && value.some((v: string) => v.trim() !== "")
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
              className={cn(
                "h-12 text-base",
                value === val && "ring-2 ring-emerald-400",
              )}
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
                value === option.value && "ring-2 ring-emerald-400",
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
                  active && "ring-2 ring-emerald-400",
                )}
                onClick={() =>
                  setValue(
                    active
                      ? selectedList.filter(
                          (item: string) => item !== option.value,
                        )
                      : [...selectedList, option.value],
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

    // text_list: multiple text inputs (e.g. children names)
    if (question.type === "text_list") {
      const listItems = Array.isArray(value) ? value : [""];
      const listCount = question.listCount || 3;
      return (
        <div className="space-y-2">
          {listItems.map((item: string, idx: number) => (
            <Input
              key={idx}
              value={item}
              onChange={(e) => {
                const next = [...listItems];
                next[idx] = e.target.value;
                setValue(next);
              }}
              placeholder={`الاسم ${idx + 1}...`}
              className="h-11 text-base"
              dir="rtl"
              autoFocus={idx === 0}
            />
          ))}
          {listItems.length < Math.max(listCount, 10) && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm text-muted-foreground h-9"
              onClick={() => setValue([...listItems, ""])}
            >
              + إضافة اسم تاني
            </Button>
          )}
        </div>
      );
    }

    return (
      <Input
        type={question.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) =>
          setValue(
            question.type === "number"
              ? Number(e.target.value)
              : e.target.value,
          )
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
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -mt-1"
              onClick={() => {
                setShow(false);
                try { localStorage.setItem(dismissedStorageKey, Date.now().toString()); } catch(e) {}
                dismissMutation.mutate();
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5" />

          {/* Question */}
          <div className="space-y-3">
            <p className="font-semibold text-base leading-relaxed">
              {meta.text}
            </p>
            {meta.hint && (
              <p className="text-xs text-muted-foreground -mt-1">{meta.hint}</p>
            )}
            {renderInput()}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className={cn(
                "flex-1 gap-2 h-11 text-sm transition-all",
                canSubmit && !submitAnswer.isPending
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg ring-2 ring-emerald-500/50"
                  : ""
              )}
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
              onClick={() => {
                setShow(false);
                try { localStorage.setItem(dismissedStorageKey, Date.now().toString()); } catch(e) {}
                dismissMutation.mutate();
              }}
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
