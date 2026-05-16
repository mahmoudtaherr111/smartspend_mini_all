import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Edit, Sparkles, Target, Home, Users, TrendingDown, TrendingUp,
  Wallet, CreditCard, PiggyBank, CheckCircle2, AlertCircle
} from "lucide-react";

const avatarColors: Record<string, { bg: string; ring: string; text: string }> = {
  emerald: { bg: "from-emerald-400 to-teal-500", ring: "ring-emerald-300", text: "text-emerald-50" },
  sky:     { bg: "from-sky-400 to-blue-500",     ring: "ring-sky-300",     text: "text-sky-50"     },
  rose:    { bg: "from-rose-400 to-pink-500",    ring: "ring-rose-300",    text: "text-rose-50"    },
  amber:   { bg: "from-amber-400 to-orange-500", ring: "ring-amber-300",   text: "text-amber-50"   },
  violet:  { bg: "from-violet-400 to-purple-500",ring: "ring-violet-300",  text: "text-violet-50"  },
  slate:   { bg: "from-slate-400 to-gray-500",   ring: "ring-slate-300",   text: "text-slate-50"   },
};

const goalLabels: Record<string, string> = {
  organize_expenses: "تنظيم المصاريف",
  reduce_spending:   "تقليل الصرف",
  track_income:      "تتبع الدخل",
  save_money:        "الادخار",
  manage_business:   "إدارة مشروع",
  pay_debt:          "سداد الديون",
};
const patternLabels: Record<string, string> = {
  stable:    "صرف ثابت",
  variable:  "صرف متغير",
  impulsive: "صرف مندفع",
  saver:     "مدخّر",
  unclear:   "غير محدد",
};
const savingsLabels: Record<string, string> = {
  yes_regular:   "يدخر بانتظام ✅",
  yes_irregular: "يدخر أحياناً",
  no:            "لا يدخر",
  trying:        "يحاول يبدأ",
};
const housingLabels: Record<string, string> = {
  rent:         "إيجار",
  owned:        "ملك",
  family_owned: "بيت العيلة",
};

function StatBadge({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-white/20">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground text-center">{label}</p>
    </div>
  );
}

function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${danger ? "text-rose-600" : ""}`}>{value}</span>
    </div>
  );
}

export function SmartProfileView({ onEdit }: { onEdit: () => void }) {
  const { data: profile, isLoading } = trpc.profile.getSmartProfile.useQuery();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
          جاري تحميل البروفايل الذكي...
        </CardContent>
      </Card>
    );
  }

  if (!profile) return null;

  const avatarId = profile.avatarId || "emerald";
  const colors = avatarColors[avatarId] || avatarColors.emerald;
  const financial = profile.financialInfo as any;
  const lifestyle = profile.lifestyleInfo as any;
  const basic = profile.basicInfo as any;
  const inferred = profile.aiInferredAttributes as any;

  const completionScore = (() => {
    const checks = [
      financial?.averageMonthlyIncome,
      financial?.primaryGoal,
      financial?.spendingPattern,
      lifestyle?.responsibleForFamily !== undefined,
      lifestyle?.housingType || lifestyle?.livingSituation,
      financial?.hasDebt !== undefined,
      financial?.savingsStatus,
      basic?.profession,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const income = Number(financial?.averageMonthlyIncome || 0);
  const rent = Number(lifestyle?.monthlyRent || 0);
  const commitments = Number(lifestyle?.fixedMonthlyCommitments || 0);
  const debtMonthly = Number(financial?.monthlyDebtPayment || 0);
  const fixedTotal = Number(financial?.fixedCommitmentsTotal || (rent + debtMonthly + commitments * 500));
  const savingsRate = income > 0 ? Math.max(0, Math.round(((income - fixedTotal) / income) * 100)) : null;

  return (
    <div className="space-y-4">
      {/* Cover Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        {/* Gradient Cover */}
        <div className={`h-28 bg-gradient-to-br ${colors.bg} relative`}>
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
            backgroundSize: "30px 30px"
          }} />
        </div>

        <CardContent className="relative px-5 pb-5 pt-0">
          {/* Avatar + Edit button row */}
          <div className="flex justify-between items-end -mt-10 mb-4">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${colors.bg} ${colors.ring} ring-4 ring-offset-2 ring-offset-background flex items-center justify-center shadow-lg`}>
              <Sparkles className={`w-9 h-9 ${colors.text}`} />
            </div>
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 mb-1">
              <Edit className="w-3.5 h-3.5" />
              تعديل
            </Button>
          </div>

          {/* Name & badges */}
          <div className="space-y-1 mb-4">
            <h2 className="text-xl font-bold">
              {basic?.profession || "مستخدم SmartSpend"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {financial?.primaryGoal && (
                <Badge variant="secondary" className="text-xs">
                  🎯 {goalLabels[String(financial.primaryGoal)] || financial.primaryGoal}
                </Badge>
              )}
              {financial?.spendingPattern && (
                <Badge variant="outline" className="text-xs">
                  💳 {patternLabels[String(financial.spendingPattern)] || financial.spendingPattern}
                </Badge>
              )}
              {lifestyle?.hasChildren && (
                <Badge variant="outline" className="text-xs">
                  👨‍👩‍👧 أب/أم
                </Badge>
              )}
            </div>
          </div>

          {/* Completion */}
          <div className="space-y-1 mb-5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>اكتمال البروفايل</span>
              <span>{completionScore}%</span>
            </div>
            <Progress value={completionScore} className="h-2" />
            {completionScore < 70 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" />
                أكمل البروفايل لتقارير AI أدق
              </p>
            )}
            {completionScore >= 70 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3 h-3" />
                البروفايل مكتمل - التقارير مخصصة لك
              </p>
            )}
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatBadge
              label="الدخل الشهري"
              value={income > 0 ? `${income.toLocaleString()} ج` : "—"}
              icon={<Wallet className="w-4 h-4" />}
            />
            <StatBadge
              label="نسبة الادخار"
              value={savingsRate !== null ? `${savingsRate}%` : "—"}
              icon={<PiggyBank className="w-4 h-4" />}
            />
            <StatBadge
              label="الأطفال"
              value={lifestyle?.hasChildren ? String(lifestyle.childrenCount || "نعم") : "لا"}
              icon={<Users className="w-4 h-4" />}
            />
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Financial */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />
                الوضع المالي
              </p>
              <div>
                <InfoRow label="نوع السكن" value={housingLabels[String(lifestyle?.housingType)] || "غير محدد"} />
                {rent > 0 && <InfoRow label="الإيجار الشهري" value={`${rent.toLocaleString()} ج.م`} />}
                <InfoRow
                  label="ديون/أقساط"
                  value={financial?.hasDebt === true ? `نعم (${debtMonthly > 0 ? `${debtMonthly.toLocaleString()} ج.م/شهر` : "موجودة"})` : financial?.hasDebt === false ? "لا" : "—"}
                  danger={financial?.hasDebt === true}
                />
                <InfoRow
                  label="الادخار"
                  value={savingsLabels[String(financial?.savingsStatus)] || "—"}
                />
                {fixedTotal > 0 && (
                  <InfoRow label="إجمالي الالتزامات" value={`${fixedTotal.toLocaleString()} ج.م`} />
                )}
              </div>
            </div>

            {/* Lifestyle */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Home className="w-3.5 h-3.5" />
                نمط الحياة
              </p>
              <div>
                <InfoRow
                  label="مسؤول عن أسرة"
                  value={lifestyle?.responsibleForFamily === true ? "نعم" : lifestyle?.responsibleForFamily === false ? "لا" : "—"}
                />
                {Array.isArray(lifestyle?.supportsOthers) && lifestyle.supportsOthers.length > 0 && (
                  <InfoRow label="يدعم مالياً" value={lifestyle.supportsOthers.join("، ")} />
                )}
                <InfoRow
                  label="أكبر بند صرف"
                  value={String(financial?.biggestExpenseCategory || "—")}
                />
                {(lifestyle as any)?.ageRange && (
                  <InfoRow label="الفئة العمرية" value={String((lifestyle as any).ageRange)} />
                )}
                {Array.isArray(financial?.incomeSources) && financial.incomeSources.length > 0 && (
                  <InfoRow label="مصادر الدخل" value={financial.incomeSources.join("، ")} />
                )}
              </div>
            </div>
          </div>

          {/* AI Inferred Attributes */}
          {inferred && Object.keys(inferred).length > 0 && (
            <div className="mt-5 pt-4 border-t">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-violet-600 dark:text-violet-400">استنتاجات AI</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(inferred).slice(0, 6).map(([key, val]) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-xs bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 border-violet-100 dark:border-violet-800"
                  >
                    {String(val)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
