import { useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BriefcaseBusiness, Check, CircleUserRound, Save, Sparkles, UsersRound } from "lucide-react";
import { toast } from "sonner";

const avatarSet = ["emerald", "sky", "rose", "amber", "violet", "slate"];
const avatarClasses: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

const incomeSources = [
  { value: "salary", label: "وظيفة" },
  { value: "freelance", label: "فريلانس" },
  { value: "business", label: "أعمال" },
  { value: "other", label: "أخرى" },
];

const supportOptions = [
  { value: "parents", label: "والدين" },
  { value: "siblings", label: "إخوة" },
  { value: "partner", label: "شريك/زوج" },
  { value: "other", label: "أخرى" },
];

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function TogglePill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-md border px-3 text-sm transition-colors flex items-center justify-center gap-2",
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
          : "border-border bg-background hover:bg-muted"
      )}
    >
      {children}
      {active && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

export function SmartProfileSettings() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.profile.getSmartProfile.useQuery();
  const updateProfile = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث البروفايل الذكي.");
      utils.profile.getSmartProfile.invalidate();
      utils.profile.getNextOnboardingQuestion.invalidate();
    },
    onError: (err) => toast.error(err.message || "تعذر تحديث البروفايل"),
  });

  const [profession, setProfession] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [goal, setGoal] = useState("organize_expenses");
  const [spendingPattern, setSpendingPattern] = useState("variable");
  const [hasChildren, setHasChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState("");
  const [responsibleForFamily, setResponsibleForFamily] = useState(false);
  const [livesAlone, setLivesAlone] = useState(false);
  const [supportsOthers, setSupportsOthers] = useState<string[]>([]);
  const [fixedCommitments, setFixedCommitments] = useState("");
  const [detailLevel, setDetailLevel] = useState("summary");
  const [questionFriction, setQuestionFriction] = useState("medium");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [avatarId, setAvatarId] = useState<string>("emerald");

  useEffect(() => {
    if (!profile) return;
    setProfession(String(profile.basicInfo?.profession || ""));
    setMonthlyIncome(String(profile.financialInfo?.averageMonthlyIncome || ""));
    setSelectedSources(listValue(profile.financialInfo?.incomeSources));
    setGoal(String(profile.financialInfo?.primaryGoal || "organize_expenses"));
    setSpendingPattern(String(profile.financialInfo?.spendingPattern || "variable"));
    setHasChildren(Boolean(profile.lifestyleInfo?.hasChildren));
    setChildrenCount(String(profile.lifestyleInfo?.childrenCount || ""));
    setResponsibleForFamily(Boolean(profile.lifestyleInfo?.responsibleForFamily));
    setLivesAlone(Boolean(profile.lifestyleInfo?.livesAlone));
    setSupportsOthers(listValue(profile.lifestyleInfo?.supportsOthers));
    setFixedCommitments(String(profile.lifestyleInfo?.fixedMonthlyCommitments || ""));
    setDetailLevel(String(profile.preferences?.detailLevel || "summary"));
    setQuestionFriction(String(profile.preferences?.questionFriction || "medium"));
    setAlertsEnabled(profile.preferences?.alertsEnabled !== false);
    setAvatarId(profile.avatarId || "emerald");
  }, [profile]);

  const completionScore = useMemo(() => {
    const checks = [
      monthlyIncome,
      selectedSources.length > 0,
      goal,
      spendingPattern,
      typeof hasChildren === "boolean",
      typeof responsibleForFamily === "boolean",
      fixedCommitments,
      avatarId,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [avatarId, fixedCommitments, goal, hasChildren, monthlyIncome, responsibleForFamily, selectedSources.length, spendingPattern]);

  const toggleList = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const save = () => {
    updateProfile.mutate({
      basicInfo: { profession: profession || null },
      financialInfo: {
        averageMonthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
        incomeSources: selectedSources,
        primaryGoal: goal,
        spendingPattern,
      },
      lifestyleInfo: {
        hasChildren,
        childrenCount: childrenCount ? Number(childrenCount) : null,
        responsibleForFamily,
        livesAlone,
        supportsOthers,
        fixedMonthlyCommitments: fixedCommitments ? Number(fixedCommitments) : null,
      },
      preferences: {
        detailLevel,
        reportStyle: detailLevel === "detailed" ? "analytical" : "balanced",
        questionFriction,
        alertsEnabled,
      },
      avatarId,
      profileCompleted: completionScore >= 70,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">جاري تحميل البروفايل الذكي...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              البروفايل الذكي
            </CardTitle>
            <CardDescription>البيانات هنا تؤثر مباشرة على التصنيف والتقارير والـ AI insights.</CardDescription>
          </div>
          <Badge variant={completionScore >= 70 ? "default" : "secondary"}>{completionScore}% مكتمل</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <CircleUserRound className="w-4 h-4" />
            الهوية
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {avatarSet.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAvatarId(id)}
                className={cn(
                  "h-12 rounded-md border flex items-center justify-center transition-colors",
                  avatarId === id ? "border-slate-900 dark:border-white" : "border-border"
                )}
              >
                <span className={cn("w-7 h-7 rounded-full", avatarClasses[id])} />
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>المهنة</Label>
            <Input value={profession} onChange={(event) => setProfession(event.target.value)} placeholder="مثال: مصمم، موظف، صاحب مشروع" />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <BriefcaseBusiness className="w-4 h-4" />
            الوضع المالي
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>متوسط الدخل الشهري</Label>
              <Input type="number" dir="ltr" value={monthlyIncome} onChange={(event) => setMonthlyIncome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>هدفك الأساسي</Label>
              <select value={goal} onChange={(event) => setGoal(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="organize_expenses">تنظيم المصاريف</option>
                <option value="reduce_spending">تقليل الصرف</option>
                <option value="track_income">تتبع الدخل</option>
                <option value="manage_business">إدارة مشروع</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {incomeSources.map((source) => (
              <TogglePill key={source.value} active={selectedSources.includes(source.value)} onClick={() => toggleList(selectedSources, source.value, setSelectedSources)}>
                {source.label}
              </TogglePill>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["stable", "ثابت"],
              ["variable", "متغير"],
              ["unclear", "غير واضح"],
            ].map(([value, label]) => (
              <TogglePill key={value} active={spendingPattern === value} onClick={() => setSpendingPattern(value)}>
                {label}
              </TogglePill>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <UsersRound className="w-4 h-4" />
            نمط الحياة
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              لديك أطفال
              <Switch checked={hasChildren} onCheckedChange={setHasChildren} />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              مسؤول عن أسرة
              <Switch checked={responsibleForFamily} onCheckedChange={setResponsibleForFamily} />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              تعيش وحدك
              <Switch checked={livesAlone} onCheckedChange={setLivesAlone} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>عدد الأطفال</Label>
              <Input type="number" dir="ltr" value={childrenCount} onChange={(event) => setChildrenCount(event.target.value)} disabled={!hasChildren} />
            </div>
            <div className="space-y-2">
              <Label>عدد الالتزامات الشهرية</Label>
              <Input type="number" dir="ltr" value={fixedCommitments} onChange={(event) => setFixedCommitments(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {supportOptions.map((option) => (
              <TogglePill key={option.value} active={supportsOthers.includes(option.value)} onClick={() => toggleList(supportsOthers, option.value, setSupportsOthers)}>
                {option.label}
              </TogglePill>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>تفصيل التقارير</Label>
              <select value={detailLevel} onChange={(event) => setDetailLevel(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="summary">مختصر</option>
                <option value="balanced">متوازن</option>
                <option value="detailed">تفصيلي</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>دقة الأسئلة</Label>
              <select value={questionFriction} onChange={(event) => setQuestionFriction(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">عالية</option>
              </select>
            </div>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              التنبيهات
              <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
            </label>
          </div>
        </section>

        <Button onClick={save} disabled={updateProfile.isPending} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {updateProfile.isPending ? "جاري الحفظ..." : "حفظ البروفايل الذكي"}
        </Button>
      </CardContent>
    </Card>
  );
}
