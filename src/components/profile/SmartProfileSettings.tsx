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
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
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
        "h-10 rounded-xl border px-3 text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-95",
        active
          ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400/50"
          : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-900/50 text-slate-600 dark:text-slate-300",
      )}
    >
      {children}
      {active && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
    </button>
  );
}

export function SmartProfileSettings({ onCancel }: { onCancel?: () => void }) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<'basic' | 'financial' | 'lifestyle' | 'preferences'>('basic');
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

  const tabs = [
    { id: "basic" as const, label: "الهوية", icon: CircleUserRound },
    { id: "financial" as const, label: "المالية", icon: BriefcaseBusiness },
    { id: "lifestyle" as const, label: "الحياة", icon: UsersRound },
    { id: "preferences" as const, label: "تفضيلات AI", icon: Sparkles },
  ];

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-xl overflow-hidden bg-white dark:bg-slate-950">
      <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
              تعديل البروفايل الذكي
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              البيانات هنا تؤثر مباشرة على التصنيف المالي الذكي وتوصيات الذكاء الاصطناعي.
            </CardDescription>
          </div>
          <Badge
            variant={completionScore >= 70 ? "default" : "secondary"}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold shrink-0",
              completionScore >= 70
                ? "bg-indigo-500 text-white"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            )}
          >
            {completionScore}% مكتمل
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6">
        
        {/* Modern Tabs Bar */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/80 dark:bg-slate-900/60 rounded-2xl border border-slate-200/50 dark:border-white/5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2.5 px-1 rounded-xl transition-all duration-300 text-[10px] sm:text-xs font-black",
                  isActive
                    ? "bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-white/5 scale-102"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Basic Info */}
        {activeTab === "basic" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">الاسم</Label>
                <div className="relative">
                  <User className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اسمك الكريم"
                    className="pe-9 rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">المهنة</Label>
                <div className="relative">
                  <BriefcaseBusiness className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={profession}
                    onChange={(event) => setProfession(event.target.value)}
                    placeholder="مثال: مصمم، موظف، صاحب مشروع"
                    className="pe-9 rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">رابط الصورة الشخصية (اختياري)</Label>
                <div className="relative">
                  <LinkIcon className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={avatarInput}
                    onChange={(e) => setAvatarInput(e.target.value)}
                    placeholder="https://..."
                    className="pe-9 text-start rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                    dir="ltr"
                  />
                </div>
              </div>
              {user?.type !== "oauth" && (
                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">رقم التليفون</Label>
                  <div className="relative">
                    <Phone className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      className="pe-9 text-start rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Financial Info */}
        {activeTab === "financial" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">متوسط الدخل الشهري</Label>
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    value={monthlyIncome}
                    onChange={(event) => setMonthlyIncome(event.target.value)}
                    className="rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-bold text-start"
                    placeholder="بالجنيه المصري"
                  />
                </div>
              </div>

              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">هدفك المالي الأساسي</Label>
                <select
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer font-semibold"
                >
                  <option value="organize_expenses">تنظيم المصاريف اليومية</option>
                  <option value="reduce_spending">ترشيد وتقليل الاستهلاك</option>
                  <option value="track_income">تتبع وإحصاء الدخل</option>
                  <option value="manage_business">إدارة الميزانية لمشروع خاص</option>
                </select>
              </div>
            </div>

            {/* Switch 1: Fixed salary */}
            <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-end">
                  <Label className="font-bold text-sm text-slate-800 dark:text-slate-200">هل مرتبك ينزل في تاريخ ثابت؟</Label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">تسهل لنا حساب الشهر المالي الخاص بك تلقائياً</p>
                </div>
                <Switch checked={hasFixedSalary} onCheckedChange={setHasFixedSalary} />
              </div>

              {hasFixedSalary && (
                <div className="space-y-2 text-end mt-4 p-3 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-dashed animate-in slide-in-from-top-2 duration-200">
                  <Label className="font-semibold text-xs text-slate-600 dark:text-slate-400">يوم نزول المرتب المالي (1 - 31)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    min="1"
                    max="31"
                    value={salaryDay}
                    onChange={(event) => setSalaryDay(event.target.value)}
                    placeholder="مثال: 25"
                    className="rounded-xl h-10 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-start font-bold"
                  />
                </div>
              )}
            </div>

            {/* Income Sources */}
            <div className="space-y-3 text-end">
              <Label className="font-bold text-slate-700 dark:text-slate-300">مصادر دخلك المالي</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
            </div>

            {/* Spending Pattern */}
            <div className="space-y-3 text-end">
              <Label className="font-bold text-slate-700 dark:text-slate-300">نمط ونظام صرفك المالي</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["stable", "ثابت ومخطط"],
                  ["variable", "متغير ومرن"],
                  ["unclear", "غير واضح بعد"],
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
            </div>

            {/* Switch 2: Debts */}
            <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-end">
                  <Label className="font-bold text-sm text-slate-800 dark:text-slate-200">هل لديك ديون، جمعيات، أو أقساط؟</Label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">سنقوم بحجز هذا المبلغ من ميزانيتك الشهرية الصافية</p>
                </div>
                <Switch checked={hasDebt} onCheckedChange={setHasDebt} />
              </div>

              {hasDebt && (
                <div className="space-y-2 text-end mt-4 p-3 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-dashed animate-in slide-in-from-top-2 duration-200">
                  <Label className="font-semibold text-xs text-slate-600 dark:text-slate-400">القيمة الإجمالية للأقساط الشهرية</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    value={debtMonthly}
                    onChange={(e) => setDebtMonthly(e.target.value)}
                    placeholder="بالجنيه المصري"
                    className="rounded-xl h-10 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-start font-bold"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Lifestyle */}
        {activeTab === "lifestyle" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Housing & Family */}
            <div className="space-y-4 p-4 bg-slate-50/30 dark:bg-slate-900/10 border rounded-2xl">
              <h4 className="text-xs font-extrabold uppercase text-indigo-500 tracking-wider text-end border-b pb-2">السكن والوضع العائلي</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">وضع السكن الحالي</Label>
                  <select
                    value={livingSituation}
                    onChange={(e) => setLivingSituation(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer font-semibold"
                  >
                    <option value="">اختر من القائمة...</option>
                    {livingSituationOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">اسم شريك / شريكة الحياة</Label>
                  <Input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="اسم الشريك (اختياري)"
                    className="rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium"
                  />
                </div>

                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">نوع ملكية السكن</Label>
                  <select
                    value={housingType}
                    onChange={(e) => setHousingType(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer font-semibold"
                  >
                    <option value="">اختر من القائمة...</option>
                    {housingTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {housingType === "rent" && (
                  <div className="space-y-2 text-end animate-in slide-in-from-top-2 duration-200">
                    <Label className="font-bold text-slate-700 dark:text-slate-300">قيمة الإيجار الشهري</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      dir="ltr"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="بالجنيه المصري"
                      className="rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-bold text-start"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Children & Dependents Switches Group */}
            <div className="space-y-3 p-4 bg-slate-50/30 dark:bg-slate-900/10 border rounded-2xl">
              <h4 className="text-xs font-extrabold uppercase text-indigo-500 tracking-wider text-end border-b pb-2">الأبناء والمسؤوليات</h4>
              
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 p-3">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">لديك أطفال</span>
                  <Switch checked={hasChildren} onCheckedChange={setHasChildren} />
                </div>
                
                <div className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 p-3">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">مسؤول عن أسرة</span>
                  <Switch checked={responsibleForFamily} onCheckedChange={setResponsibleForFamily} />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 p-3">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">تعيش وحدك</span>
                  <Switch checked={livesAlone} onCheckedChange={setLivesAlone} />
                </div>
              </div>

              {hasChildren && (
                <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-dashed animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2 text-end">
                    <Label className="font-bold text-slate-700 dark:text-slate-300">عدد الأطفال</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      dir="ltr"
                      value={childrenCount}
                      onChange={(event) => setChildrenCount(event.target.value)}
                      className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-10 text-start font-bold"
                    />
                  </div>

                  <div className="space-y-2 text-end">
                    <Label className="font-bold text-slate-700 dark:text-slate-300">أسماء أطفالك (اختياري)</Label>
                    <div className="space-y-2">
                      {childrenNames.map((n, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input
                            value={n}
                            onChange={(e) => {
                              const next = [...childrenNames];
                              next[i] = e.target.value;
                              setChildrenNames(next);
                            }}
                            placeholder={`اسم طفلك ${i + 1}`}
                            className="rounded-xl h-10 font-medium"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl"
                            onClick={() =>
                              setChildrenNames(childrenNames.filter((_, j) => j !== i))
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setChildrenNames([...childrenNames, ""])}
                        className="rounded-xl text-xs gap-1 border-dashed hover:bg-indigo-50/50 hover:text-indigo-600 dark:hover:bg-indigo-950/20"
                      >
                        + إضافة اسم طفل
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-dashed">
                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">بتصرف على مين بشكل منتظم؟</Label>
                  <div className="grid grid-cols-2 gap-1.5">
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

                <div className="space-y-2 text-end">
                  <Label className="font-bold text-slate-700 dark:text-slate-300">عدد التزاماتك الشهرية الأخرى</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    value={fixedCommitments}
                    onChange={(event) => setFixedCommitments(event.target.value)}
                    className="rounded-xl border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 h-11 focus:ring-2 focus:ring-indigo-500/10 transition-all font-bold text-start"
                    placeholder="فواتير أخرى، إيجار محال، إلخ"
                  />
                </div>
              </div>
            </div>

            {/* Assets & Luxury Group */}
            <div className="space-y-4 p-4 bg-slate-50/30 dark:bg-slate-900/10 border rounded-2xl">
              <h4 className="text-xs font-extrabold uppercase text-indigo-500 tracking-wider text-end border-b pb-2">السيارة والرفاهية</h4>
              
              {/* Switch 3: Car */}
              <div className="bg-white/50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Car className="w-4 h-4 text-slate-500" /> هل تمتلك سيارة خاصة؟
                  </span>
                  <Switch checked={carOwnership} onCheckedChange={setCarOwnership} />
                </div>
                
                {carOwnership && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-dashed animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1 text-end">
                      <Label className="text-xs font-bold">نوع السيارة وموديلها</Label>
                      <Input
                        value={carType}
                        onChange={(e) => setCarType(e.target.value)}
                        placeholder="مثال: كيا سيراتو"
                        className="rounded-xl h-9"
                      />
                    </div>
                    <div className="space-y-1 text-end">
                      <Label className="text-xs font-bold">المصاريف الشهرية (بنزين + صيانة)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        dir="ltr"
                        value={monthlyCarCost}
                        onChange={(e) => setMonthlyCarCost(e.target.value)}
                        placeholder="بالجنيه"
                        className="rounded-xl h-9 text-start font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Switch 4: Pets */}
              <div className="bg-white/50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <PawPrint className="w-4 h-4 text-slate-500" /> هل تربي حيوانات أليفة؟
                  </span>
                  <Switch checked={hasPets} onCheckedChange={setHasPets} />
                </div>
                
                {hasPets && (
                  <div className="space-y-2 text-end mt-3 pt-3 border-t border-dashed animate-in slide-in-from-top-2 duration-200">
                    <Label className="text-xs font-bold">أسماءهم (اختياري)</Label>
                    <div className="space-y-2">
                      {petNames.map((n, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input
                            value={n}
                            onChange={(e) => {
                              const next = [...petNames];
                              next[i] = e.target.value;
                              setPetNames(next);
                            }}
                            placeholder={`حيوان ${i + 1}`}
                            className="rounded-xl h-9 font-medium"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl"
                            onClick={() => setPetNames(petNames.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPetNames([...petNames, ""])}
                        className="rounded-xl text-xs gap-1 border-dashed hover:bg-indigo-50/50 hover:text-indigo-600"
                      >
                        + إضافة حيوان أليف
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Switch 5: Smoking */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 p-3">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Cigarette className="w-4 h-4 text-slate-500" /> هل تدخن؟
                </span>
                <Switch checked={smoking} onCheckedChange={setSmoking} />
              </div>
            </div>

            {/* Subscriptions & Transfers Group */}
            <div className="space-y-4 p-4 bg-slate-50/30 dark:bg-slate-900/10 border rounded-2xl">
              <h4 className="text-xs font-extrabold uppercase text-indigo-500 tracking-wider text-end border-b pb-2">الاشتراكات والتحويلات المنتظمة</h4>
              
              <div className="space-y-2 text-end">
                <Label className="font-bold text-xs text-slate-600 dark:text-slate-400">الاشتراكات الشهرية الثابتة</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {subscriptionOptions.map((o) => (
                    <TogglePill
                      key={o.value}
                      active={subscriptions.includes(o.value)}
                      onClick={() => toggleList(subscriptions, o.value, setSubscriptions)}
                    >
                      {o.label}
                    </TogglePill>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-end pt-3 border-t border-dashed">
                <Label className="font-bold text-xs text-slate-600 dark:text-slate-400">أشخاص تحوّل لهم أموال بانتظام (عائلة، فريلانسرز، إلخ)</Label>
                <div className="space-y-2">
                  {regularContacts.map((n, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        value={n}
                        onChange={(e) => {
                          const next = [...regularContacts];
                          next[i] = e.target.value;
                          setRegularContacts(next);
                        }}
                        placeholder={`اسم الشخص المستلم ${i + 1}`}
                        className="rounded-xl h-10 font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl"
                        onClick={() =>
                          setRegularContacts(regularContacts.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRegularContacts([...regularContacts, ""])}
                    className="rounded-xl text-xs gap-1 border-dashed hover:bg-indigo-50/50 hover:text-indigo-600"
                  >
                    + إضافة شخص
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Preferences */}
        {activeTab === "preferences" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">مستوى تفصيل التقارير المالية</Label>
                <select
                  value={detailLevel}
                  onChange={(event) => setDetailLevel(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer font-semibold"
                >
                  <option value="summary">مختصر وسريع</option>
                  <option value="balanced">متوازن وشامل</option>
                  <option value="detailed">تفصيلي وتحليلي دقيق</option>
                </select>
              </div>

              <div className="space-y-2 text-end">
                <Label className="font-bold text-slate-700 dark:text-slate-300">معدل تكرار أسئلة الـ AI</Label>
                <select
                  value={questionFriction}
                  onChange={(event) => setQuestionFriction(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 px-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer font-semibold"
                >
                  <option value="low">منخفض (تفاعل قليل)</option>
                  <option value="medium">متوسط (توازن مناسب)</option>
                  <option value="high">مرتفع (أسئلة دقيقة وتفصيلية)</option>
                </select>
              </div>
            </div>

            {/* Switch 6: Alerts */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/50 p-4">
              <div className="space-y-0.5 text-end">
                <Label className="font-bold text-sm text-slate-800 dark:text-slate-200">تنبيهات وتوصيات الميزانية</Label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">تفعيل إشعارات التحذير في حال اقترابك من تجاوز سقف الميزانية</p>
              </div>
              <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
            </div>
          </div>
        )}

        {/* Errors display */}
        {saveError && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300 text-end animate-shake" dir="rtl">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Footer Navigation & Actions */}
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <Button
            onClick={save}
            disabled={updateProfile.isPending}
            className="w-full gap-2 rounded-xl h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/10 transition-all active:scale-98"
          >
            <Save className="w-4 h-4" />
            {updateProfile.isPending ? "جاري الحفظ والتحليل..." : "حفظ بيانات البروفايل الذكي"}
          </Button>

          <div className="flex justify-between items-center gap-2">
            {/* Prev Tab */}
            {activeTab !== "basic" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const idx = tabs.findIndex(t => t.id === activeTab);
                  if (idx > 0) setActiveTab(tabs[idx - 1].id);
                }}
                className="gap-1 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 h-9"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </Button>
            ) : <div />}

            {/* Cancel Button */}
            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="rounded-xl border-slate-200 dark:border-slate-800 h-9 text-xs font-bold px-4"
              >
                إلغاء
              </Button>
            )}

            {/* Next Tab */}
            {activeTab !== "preferences" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const idx = tabs.findIndex(t => t.id === activeTab);
                  if (idx !== -1 && idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
                }}
                className="gap-1 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 h-9"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </Button>
            ) : <div />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
