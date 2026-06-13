import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Target,
  Sparkles,
  Loader2,
  Compass,
  Car,
  Bike,
  Landmark,
  Plane,
  Heart,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialGoalsPanelProps {
  mode?: "dashboard" | "profile" | "dialog";
  onSuccess?: () => void;
}

export function FinancialGoalsPanel({
  mode = "dashboard",
  onSuccess,
}: FinancialGoalsPanelProps) {
  const { data, refetch, isError, error } = trpc.goals.list.useQuery(
    undefined,
    { retry: 1 },
  );
  const createMutation = trpc.goals.create.useMutation({
    onSuccess: () => {
      refetch();
      if (onSuccess) onSuccess();
    },
  });
  const analyzeMutation = trpc.goals.analyze.useMutation({
    onSuccess: () => refetch(),
  });

  const [title, setTitle] = useState("");
  const [cost, setCost] = useState<string>("");
  const [description, setDescription] = useState("");

  const isPro = data?.isPro ?? false;

  const hasActiveGoal = data?.goals.some((g) => g.status === "active") ?? false;
  
  // Hiding logic:
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("smartspend_hide_goals_panel") === "true";
    }
    return false;
  });

  const handleDismiss = () => {
    localStorage.setItem("smartspend_hide_goals_panel", "true");
    setIsDismissed(true);
  };

  // If on dashboard and user already has an active goal, or dismissed, hide the creation widget completely
  if (mode === "dashboard" && (hasActiveGoal || isDismissed)) {
    return null;
  }

  const handleCreate = () => {
    const finalTitle = title.trim();
    if (!finalTitle) return;

    const targetAmount = Number(cost) || 50000;

    createMutation.mutate({
      title: finalTitle,
      description: description.trim() || undefined,
      targetAmount,
    });

    setTitle("");
    setCost("");
    setDescription("");
  };

  const getDreamIcon = (goalTitle: string) => {
    const t = goalTitle.toLowerCase();
    if (t.includes("عربية") || t.includes("سيارة") || t.includes("car"))
      return <Car className="w-5 h-5 text-amber-500" />;
    if (
      t.includes("موتوسيكل") ||
      t.includes("فيسبا") ||
      t.includes("بايك") ||
      t.includes("bike")
    )
      return <Bike className="w-5 h-5 text-emerald-500" />;
    if (t.includes("عمرة") || t.includes("حج") || t.includes("كعبة"))
      return <Compass className="w-5 h-5 text-indigo-500" />;
    if (
      t.includes("سفر") ||
      t.includes("رحلة") ||
      t.includes("طيار") ||
      t.includes("travel")
    )
      return <Plane className="w-5 h-5 text-sky-500" />;
    if (
      t.includes("شقة") ||
      t.includes("بيت") ||
      t.includes("منزل") ||
      t.includes("house")
    )
      return <Landmark className="w-5 h-5 text-rose-500" />;
    if (t.includes("جواز") || t.includes("فرح") || t.includes("زواج"))
      return <Heart className="w-5 h-5 text-pink-500" />;
    return <Target className="w-5 h-5 text-violet-500" />;
  };

  const cardContent = (
    <div className="space-y-4 text-end" dir="rtl">
      {/* Premium Marketing Copy */}
      <div className="space-y-1 bg-gradient-to-br from-indigo-50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-slate-900 p-3.5 rounded-xl border border-indigo-100/30 dark:border-slate-800">
        <h4 className="font-extrabold text-xs sm:text-sm text-indigo-950 dark:text-indigo-200">
          حدد أهدافك المالية وهنساعدك تحقق حلمك! 🚀
        </h4>
        <p className="text-[10px] sm:text-xs text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed font-medium">
          هنعملك نظام مالي مخصص يمشي مع دخلك ومصروفاتك عشان تتبع الفائض وتحوله
          لمدخرات حقيقية تقربك من أحلامك خطوة بخطوة.
        </p>
      </div>

      {isError && (
        <p className="text-xs text-destructive rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          {error?.message || "تعذّر تحميل الأهداف."}
        </p>
      )}

      {/* Forms inputs */}
      <div className="space-y-3.5 pt-1">
        {/* Goal Title */}
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground font-bold block">
            إيه هو حلمك المالي الجاي؟ 🌟
          </span>
          <Input
            placeholder="اكتب حلمك هنا (مثال: شراء سيارة، تكاليف الجواز، رحلة عمرة...)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-semibold text-xs sm:text-sm"
          />
        </div>

        {/* Goal Cost & Description Side-by-Side on all screens */}
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {/* Right label (Cost) */}
            <span className="text-[11px] text-muted-foreground font-bold block min-h-[32px] flex items-end">
              الهدف ده بكام؟ (ج.م) 💰
            </span>
            {/* Left label (Details) */}
            <span className="text-[11px] text-muted-foreground font-bold block min-h-[32px] flex items-end">
              ممكن تديني شوية تفاصيل؟ (اختياري)
            </span>

            {/* Right input (Cost) */}
            <Input
              type="number"
              placeholder="التكلفة بالجنيه"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-11 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-bold text-xs sm:text-sm text-start"
              dir="ltr"
            />
            {/* Left input (Details) */}
            <Input
              placeholder="مثلاً: 6 شهور"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-medium text-xs sm:text-sm"
            />
          </div>
          {/* Opaque full-width guide caption to avoid layout truncation on mobile */}
          <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-medium text-end mt-1.5 leading-relaxed">
            💡 مثال للتفاصيل: شايف إنك ممكن توصل لهدفك ده بعد قد إيه؟ (مثلاً: 6
            شهور)
          </p>
        </div>

        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending || !title.trim()}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 dark:shadow-indigo-950/20 font-bold text-xs sm:text-sm gap-2 transition-all active:scale-[0.98]"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>ابدأ رحلتك للادخار وحقق حلمك 🚀</span>
            </>
          )}
        </Button>
      </div>

      {/* Render Active List (Only on dashboard or non-dialog) */}
      {mode !== "dialog" && (
        <div className="space-y-3 pt-3.5 border-t border-slate-100 dark:border-slate-800/80">
          {(data?.goals || []).length > 0 ? (
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground font-bold block mb-1">
                أحلامك الجاري تحقيقها:
              </span>
              {(data?.goals || []).map((g) => {
                const targetAmt = Number(g.targetAmount) || 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-slate-100 dark:border-slate-800/60 p-3 bg-white/50 dark:bg-slate-950/30 flex flex-col gap-2 shadow-sm transition-all hover:scale-[1.01]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          {getDreamIcon(g.title)}
                        </div>
                        <div className="min-w-0 text-end">
                          <p className="font-extrabold text-xs sm:text-sm text-foreground truncate">
                            {g.title}
                          </p>
                          {g.description && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {g.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-start shrink-0">
                        <span className="font-extrabold text-xs sm:text-sm block">
                          {targetAmt.toLocaleString()} ج
                        </span>
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-semibold">
                          قيد الادخار
                        </span>
                      </div>
                    </div>

                    {isPro && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-[10px] h-7 border-dashed border-indigo-200 hover:border-indigo-400 font-bold gap-1 mt-1 rounded-lg"
                        onClick={() => analyzeMutation.mutate({ goalId: g.id })}
                        disabled={analyzeMutation.isPending}
                      >
                        {analyzeMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                        )}
                        تحليل Pro للمدخرات
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-xs font-semibold">
              🎯 مفيش أهداف مسجلة لسه.. حدد حلمك فوق وابدأ!
            </div>
          )}
        </div>
      )}
    </div>
  );

  // If in Dialog mode, render pure form contents without the outer card wrappers
  if (mode === "dialog") {
    return cardContent;
  }

  return (
    <Card className="border-indigo-100 dark:border-slate-800 shadow-xl overflow-hidden bg-gradient-to-b from-white to-slate-50/20 dark:from-slate-900 dark:to-slate-950/40 rounded-2xl relative">
      {mode === "dashboard" && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 start-2 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 z-10"
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
      <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80 bg-indigo-50/20 dark:bg-indigo-950/10">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-foreground">
          <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
          <span>الأهداف المالية والأحلام 🎯</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{cardContent}</CardContent>
    </Card>
  );
}
