import { useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  BriefcaseBusiness,
  Car,
  Check,
  CircleUserRound,
  Heart,
  Save,
  Sparkles,
  UsersRound,
  Phone,
  Link as LinkIcon,
  User,
  PawPrint,
  Cigarette,
  CreditCard,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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
  { value: "extended", label: "أقارب" },
  { value: "none", label: "ما حدش" },
];

const subscriptionOptions = [
  { value: "netflix", label: "Netflix / Shahid" },
  { value: "gym", label: "جيم / نادي" },
  { value: "internet", label: "إنترنت منزلي" },
  { value: "phone_plan", label: "باقة موبايل" },
  { value: "insurance", label: "تأمين" },
  { value: "other", label: "أخرى" },
];

const livingSituationOptions = [
  { value: "alone", label: "ساكن لوحدي" },
  { value: "family", label: "مع العيلة" },
  { value: "shared", label: "سكن مشترك" },
  { value: "married", label: "مع زوج/زوجة" },
];

const housingTypeOptions = [
  { value: "rent", label: "إيجار" },
  { value: "owned", label: "ملك" },
  { value: "family_owned", label: "بيت العيلة" },
];

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function friendlyProfileError(message?: string) {
  if (!message) return "تعذر تحديث البروفايل الذكي. حاول مرة أخرى.";
  if (message.includes("Failed query") || message.includes("Unknown column")) {
    return "قاعدة البيانات تحتاج تحديثات البروفايل الذكي. تم تفعيل وضع التوافق، أعد المحاولة.";
  }
  if (message.toLowerCase().includes("fetch") || message.includes("الخادم")) {
    return "تعذر الاتصال بالخادم. تأكد أن التطبيق يعمل ثم حاول مرة أخرى.";
  }
  if (message.includes("UNAUTHORIZED") || message.includes("تسجيل الدخول")) {
    return "انتهت الجلسة. سجل الدخول مرة أخرى.";
  }
  return message;
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
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
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
      {active && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

export function SmartProfileSettings() {
  const utils = trpc.useUtils();
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.profile.getSmartProfile.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const { user } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateUserInfo = trpc.profile.updateUserInfo.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.localAuth.me.invalidate();
    },
  });
  const updateProfile = trpc.profile.updateSmartProfile.useMutation({
    onMutate: () => setSaveError(null),
    onSuccess: () => {
      toast.success("تم تحديث البروفايل الذكي.");
      utils.profile.getSmartProfile.invalidate();
      utils.profile.getNextOnboardingQuestion.invalidate();
    },
    onError: (err) => {
      const message = friendlyProfileError(err.message);
      setSaveError(message);
      toast.error(message);
    },
  });

  const [profession, setProfession] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [hasFixedSalary, setHasFixedSalary] = useState(false);
  const [salaryDay, setSalaryDay] = useState("");
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

  // Deep personal data state
  const [partnerName, setPartnerName] = useState("");
  const [childrenNames, setChildrenNames] = useState<string[]>([]);
  const [livingSituation, setLivingSituation] = useState("");
  const [housingType, setHousingType] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [hasDebt, setHasDebt] = useState(false);
  const [debtMonthly, setDebtMonthly] = useState("");
  const [carOwnership, setCarOwnership] = useState(false);
  const [carType, setCarType] = useState("");
  const [monthlyCarCost, setMonthlyCarCost] = useState("");
  const [hasPets, setHasPets] = useState(false);
  const [petNames, setPetNames] = useState<string[]>([]);
  const [smoking, setSmoking] = useState(false);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [regularContacts, setRegularContacts] = useState<string[]>([]);

  // Basic info state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarInput, setAvatarInput] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setAvatarInput(user.avatar || "");
    }
  }, [user]);

  // We are keeping avatarId as a preset fallback for backward compatibility
  const [avatarId, setAvatarId] = useState<string>("emerald");

  useEffect(() => {
    if (!profile) return;
    setProfession(String(profile.basicInfo?.profession || ""));
    setMonthlyIncome(String(profile.financialInfo?.averageMonthlyIncome || ""));
    setHasFixedSalary(Boolean(profile.financialInfo?.hasFixedSalary));
    setSalaryDay(String(profile.financialInfo?.salaryDay || ""));
    setSelectedSources(listValue(profile.financialInfo?.incomeSources));
    setGoal(String(profile.financialInfo?.primaryGoal || "organize_expenses"));
    setSpendingPattern(
      String(profile.financialInfo?.spendingPattern || "variable"),
    );
    setHasChildren(Boolean(profile.lifestyleInfo?.hasChildren));
    setChildrenCount(String(profile.lifestyleInfo?.childrenCount || ""));
    setResponsibleForFamily(
      Boolean(profile.lifestyleInfo?.responsibleForFamily),
    );
    setLivesAlone(Boolean(profile.lifestyleInfo?.livesAlone));
    setSupportsOthers(listValue(profile.lifestyleInfo?.supportsOthers));
    setFixedCommitments(
      String(profile.lifestyleInfo?.fixedMonthlyCommitments || ""),
    );
    setDetailLevel(String(profile.preferences?.detailLevel || "summary"));
    setQuestionFriction(
      String(profile.preferences?.questionFriction || "medium"),
    );
    setAlertsEnabled(profile.preferences?.alertsEnabled !== false);
    setAvatarId(profile.avatarId || "emerald");

    // Deep personal data
    setPartnerName(String(profile.lifestyleInfo?.partnerName || ""));
    setChildrenNames(listValue(profile.lifestyleInfo?.childrenNames));
    setLivingSituation(String(profile.lifestyleInfo?.livingSituation || ""));
    setHousingType(String(profile.lifestyleInfo?.housingType || ""));
    setMonthlyRent(String(profile.lifestyleInfo?.monthlyRent || ""));
    setHasDebt(Boolean(profile.financialInfo?.hasDebt));
    setDebtMonthly(String(profile.financialInfo?.monthlyDebtPayment || ""));
    setCarOwnership(Boolean(profile.lifestyleInfo?.carOwnership));
    setCarType(String(profile.lifestyleInfo?.carType || ""));
    setMonthlyCarCost(String(profile.lifestyleInfo?.monthlyCarCost || ""));
    setHasPets(Boolean(profile.lifestyleInfo?.hasPets));
    setPetNames(listValue(profile.lifestyleInfo?.petNames));
    setSmoking(Boolean(profile.lifestyleInfo?.smoking));
    setSubscriptions(listValue(profile.lifestyleInfo?.subscriptions));
    setRegularContacts(listValue(profile.lifestyleInfo?.regularContacts));
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
      name,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [
    avatarId,
    fixedCommitments,
    goal,
    hasChildren,
    monthlyIncome,
    responsibleForFamily,
    selectedSources.length,
    spendingPattern,
  ]);

  const toggleList = (
    list: string[],
    value: string,
    setter: (next: string[]) => void,
  ) => {
    setter(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  };

  const save = () => {
    const income = nullableNumber(monthlyIncome);
    const children = nullableNumber(childrenCount);
    const commitments = nullableNumber(fixedCommitments);

    if ([income, children, commitments].some(Number.isNaN)) {
      const message =
        "استخدم أرقام صحيحة وموجبة في الدخل، عدد الأطفال، والالتزامات.";
      setSaveError(message);
      toast.error(message);
      return;
    }

    updateProfile.mutate({
      basicInfo: { profession: profession || null },
      financialInfo: {
        averageMonthlyIncome: income,
        hasFixedSalary,
        salaryDay: nullableNumber(salaryDay),
        incomeSources: selectedSources,
        primaryGoal: goal,
        spendingPattern,
        hasDebt,
        monthlyDebtPayment: hasDebt ? nullableNumber(debtMonthly) : null,
      },
      lifestyleInfo: {
        hasChildren,
        childrenCount: hasChildren ? children : null,
        childrenNames: hasChildren ? childrenNames.filter((n) => n.trim()) : [],
        partnerName: partnerName.trim() || null,
        livingSituation: livingSituation || null,
        housingType: housingType || null,
        monthlyRent:
          housingType === "rent" ? nullableNumber(monthlyRent) : null,
        responsibleForFamily,
        livesAlone,
        supportsOthers,
        fixedMonthlyCommitments: commitments,
        carOwnership,
        carType: carOwnership ? carType.trim() || null : null,
        monthlyCarCost: carOwnership ? nullableNumber(monthlyCarCost) : null,
        hasPets,
        petNames: hasPets ? petNames.filter((n) => n.trim()) : [],
        smoking,
        subscriptions,
        regularContacts: regularContacts.filter((n) => n.trim()),
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

    if (name.trim()) {
      updateUserInfo.mutate({ name, phone, avatar: avatarInput });
    }
  };

  if (isLoading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">البروفايل الذكي</p>
              <p className="text-sm text-muted-foreground">
                جاري تحميل الإعدادات الأساسية...
              </p>
            </div>
            <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-16 rounded-md bg-muted animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-700 dark:text-rose-300">
                تعذر تحميل البروفايل الذكي
              </p>
              <p className="text-sm text-muted-foreground">
                {friendlyProfileError(error?.message)}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </CardContent>
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
            <CardDescription>
              البيانات هنا تؤثر مباشرة على التصنيف والتقارير والـ AI insights.
            </CardDescription>
          </div>
          <Badge variant={completionScore >= 70 ? "default" : "secondary"}>
            {completionScore}% مكتمل
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <CircleUserRound className="w-4 h-4" />
            الهوية
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 hidden">
            {avatarSet.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAvatarId(id)}
                className={cn(
                  "h-12 rounded-md border flex items-center justify-center transition-colors",
                  avatarId === id
                    ? "border-slate-900 dark:border-white"
                    : "border-border",
                )}
              >
                <span
                  className={cn("w-7 h-7 rounded-full", avatarClasses[id])}
                />
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <div className="relative">
                <User className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك"
                  className="pr-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>رابط الصورة الشخصية (اختياري)</Label>
              <div className="relative">
                <LinkIcon className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={avatarInput}
                  onChange={(e) => setAvatarInput(e.target.value)}
                  placeholder="https://..."
                  className="pr-9 text-left"
                  dir="ltr"
                />
              </div>
            </div>

            {user?.type !== "oauth" && (
              <div className="space-y-2">
                <Label>رقم التليفون</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="رقم التليفون"
                    className="pr-9 text-right"
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>المهنة</Label>
              <Input
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
                placeholder="مثال: مصمم، موظف، صاحب مشروع"
              />
            </div>
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
              <Input
                type="number"
                inputMode="decimal"
                dir="ltr"
                value={monthlyIncome}
                onChange={(event) => setMonthlyIncome(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>هدفك الأساسي</Label>
              <select
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="organize_expenses">تنظيم المصاريف</option>
                <option value="reduce_spending">تقليل الصرف</option>
                <option value="track_income">تتبع الدخل</option>
                <option value="manage_business">إدارة مشروع</option>
              </select>
            </div>
          </div>

          {selectedSources.includes("salary") && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3 bg-muted/50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-right">
                  <Label>هل مرتبك ينزل في تاريخ ثابت؟</Label>
                  <p className="text-[11px] text-muted-foreground">
                    هنحسب شهرك المالي منه
                  </p>
                </div>
                <Button
                  variant={hasFixedSalary ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHasFixedSalary(!hasFixedSalary)}
                  className="h-8"
                >
                  {hasFixedSalary ? "نعم ثابت" : "لا"}
                </Button>
              </div>

              {hasFixedSalary && (
                <div className="space-y-2">
                  <Label>بينزل يوم كام في الشهر؟ (1-31)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    min="1"
                    max="31"
                    value={salaryDay}
                    onChange={(event) => setSalaryDay(event.target.value)}
                    placeholder="مثال: 5"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {incomeSources.map((source) => (
              <TogglePill
                key={source.value}
                active={selectedSources.includes(source.value)}
                onClick={() =>
                  toggleList(selectedSources, source.value, setSelectedSources)
                }
              >
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
              <TogglePill
                key={value}
                active={spendingPattern === value}
                onClick={() => setSpendingPattern(value)}
              >
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
              <Switch
                checked={responsibleForFamily}
                onCheckedChange={setResponsibleForFamily}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              تعيش وحدك
              <Switch checked={livesAlone} onCheckedChange={setLivesAlone} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>عدد الأطفال</Label>
              <Input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={childrenCount}
                onChange={(event) => setChildrenCount(event.target.value)}
                disabled={!hasChildren}
              />
            </div>
            <div className="space-y-2">
              <Label>عدد الالتزامات الشهرية</Label>
              <Input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={fixedCommitments}
                onChange={(event) => setFixedCommitments(event.target.value)}
              />
            </div>
          </div>

          {/* Children Names */}
          {hasChildren && (
            <div className="space-y-2">
              <Label>أسماء الأطفال</Label>
              {childrenNames.map((n, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={n}
                    onChange={(e) => {
                      const next = [...childrenNames];
                      next[i] = e.target.value;
                      setChildrenNames(next);
                    }}
                    placeholder={`طفل ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() =>
                      setChildrenNames(childrenNames.filter((_, j) => j !== i))
                    }
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChildrenNames([...childrenNames, ""])}
              >
                + إضافة اسم
              </Button>
            </div>
          )}

          {/* Living Situation */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>وضع السكن</Label>
              <select
                value={livingSituation}
                onChange={(e) => setLivingSituation(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">اختر...</option>
                {livingSituationOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>اسم شريك/شريكة الحياة</Label>
              <Input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="اسم الشريك (اختياري)"
              />
            </div>
          </div>

          {/* Housing */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>نوع السكن</Label>
              <select
                value={housingType}
                onChange={(e) => setHousingType(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">اختر...</option>
                {housingTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {housingType === "rent" && (
              <div className="space-y-2">
                <Label>الإيجار الشهري</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="بالجنيه"
                />
              </div>
            )}
          </div>

          {/* Debt */}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              عندك ديون / أقساط
              <Switch checked={hasDebt} onCheckedChange={setHasDebt} />
            </label>
            {hasDebt && (
              <div className="space-y-2">
                <Label>المبلغ الشهري للديون</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  value={debtMonthly}
                  onChange={(e) => setDebtMonthly(e.target.value)}
                  placeholder="بالجنيه"
                />
              </div>
            )}
          </div>

          {/* Support Others */}
          <div className="space-y-2">
            <Label>بتصرف على مين بشكل منتظم؟</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {supportOptions.map((option) => (
                <TogglePill
                  key={option.value}
                  active={supportsOthers.includes(option.value)}
                  onClick={() =>
                    toggleList(supportsOthers, option.value, setSupportsOthers)
                  }
                >
                  {option.label}
                </TogglePill>
              ))}
            </div>
          </div>
        </section>

        {/* Deep Personal Data Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Heart className="w-4 h-4" />
            بيانات شخصية (اختيارية - تحسّن دقة AI)
          </div>

          {/* Car */}
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                <Car className="w-4 h-4" /> عندك عربية
              </span>
              <Switch
                checked={carOwnership}
                onCheckedChange={setCarOwnership}
              />
            </label>
            {carOwnership && (
              <>
                <div className="space-y-2">
                  <Label>نوع العربية</Label>
                  <Input
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    placeholder="مثال: كيا سيراتو"
                  />
                </div>
                <div className="space-y-2">
                  <Label>تكلفة شهرية</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    value={monthlyCarCost}
                    onChange={(e) => setMonthlyCarCost(e.target.value)}
                    placeholder="بنزين + صيانة"
                  />
                </div>
              </>
            )}
          </div>

          {/* Pets */}
          <div className="space-y-2">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                <PawPrint className="w-4 h-4" /> عندك حيوانات أليفة
              </span>
              <Switch checked={hasPets} onCheckedChange={setHasPets} />
            </label>
            {hasPets && (
              <div className="space-y-2">
                <Label>أسماءهم</Label>
                {petNames.map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={n}
                      onChange={(e) => {
                        const next = [...petNames];
                        next[i] = e.target.value;
                        setPetNames(next);
                      }}
                      placeholder={`حيوان ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() =>
                        setPetNames(petNames.filter((_, j) => j !== i))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPetNames([...petNames, ""])}
                >
                  + إضافة
                </Button>
              </div>
            )}
          </div>

          {/* Smoking */}
          <label className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="flex items-center gap-2">
              <Cigarette className="w-4 h-4" /> بتدخن
            </span>
            <Switch checked={smoking} onCheckedChange={setSmoking} />
          </label>

          {/* Subscriptions */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> الاشتراكات الثابتة
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {subscriptionOptions.map((o) => (
                <TogglePill
                  key={o.value}
                  active={subscriptions.includes(o.value)}
                  onClick={() =>
                    toggleList(subscriptions, o.value, setSubscriptions)
                  }
                >
                  {o.label}
                </TogglePill>
              ))}
            </div>
          </div>

          {/* Regular Contacts */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" /> أشخاص بتحولهم فلوس بانتظام
            </Label>
            {regularContacts.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={n}
                  onChange={(e) => {
                    const next = [...regularContacts];
                    next[i] = e.target.value;
                    setRegularContacts(next);
                  }}
                  placeholder={`شخص ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() =>
                    setRegularContacts(
                      regularContacts.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRegularContacts([...regularContacts, ""])}
            >
              + إضافة شخص
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>تفصيل التقارير</Label>
              <select
                value={detailLevel}
                onChange={(event) => setDetailLevel(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="summary">مختصر</option>
                <option value="balanced">متوازن</option>
                <option value="detailed">تفصيلي</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>دقة الأسئلة</Label>
              <select
                value={questionFriction}
                onChange={(event) => setQuestionFriction(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">عالية</option>
              </select>
            </div>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              التنبيهات
              <Switch
                checked={alertsEnabled}
                onCheckedChange={setAlertsEnabled}
              />
            </label>
          </div>
        </section>

        {saveError && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <Button
          onClick={save}
          disabled={updateProfile.isPending}
          className="w-full gap-2"
        >
          <Save className="w-4 h-4" />
          {updateProfile.isPending ? "جاري الحفظ..." : "حفظ البروفايل الذكي"}
        </Button>
      </CardContent>
    </Card>
  );
}
