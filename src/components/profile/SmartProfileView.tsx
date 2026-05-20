import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Edit, Sparkles, Home, Users, Wallet, CreditCard, PiggyBank,
  CheckCircle2, AlertCircle, Briefcase, Car, Cigarette, PhoneCall,
  Tv, Heart, ShieldCheck
} from "lucide-react";

const avatarColors: Record<string, { bg: string; ring: string; text: string; glow: string }> = {
  emerald: { bg: "from-emerald-400 to-teal-600", ring: "ring-emerald-300", text: "text-emerald-50", glow: "shadow-emerald-500/30" },
  sky:     { bg: "from-sky-400 to-blue-600",     ring: "ring-sky-300",     text: "text-sky-50",     glow: "shadow-sky-500/30" },
  rose:    { bg: "from-rose-400 to-pink-600",    ring: "ring-rose-300",    text: "text-rose-50",    glow: "shadow-rose-500/30" },
  amber:   { bg: "from-amber-400 to-orange-600", ring: "ring-amber-300",   text: "text-amber-50",   glow: "shadow-amber-500/30" },
  violet:  { bg: "from-violet-400 to-purple-600",ring: "ring-violet-300",  text: "text-violet-50",  glow: "shadow-violet-500/30" },
  slate:   { bg: "from-slate-600 to-slate-800",  ring: "ring-slate-400",   text: "text-slate-50",   glow: "shadow-slate-500/30" },
};

const goalLabels: Record<string, string> = {
  organize_expenses: "تنظيم المصاريف",
  reduce_spending:   "تقليل الصرف",
  track_income:      "تتبع الدخل",
  save_money:        "الادخار وبناء الثروة",
  manage_business:   "إدارة مشروع",
  pay_debt:          "التحرر من الديون",
};

const patternLabels: Record<string, string> = {
  stable:    "صرف مستقر",
  variable:  "صرف مرن",
  impulsive: "محتاج تحكم",
  saver:     "عقلية مدخّر",
  unclear:   "قيد التحليل",
};

const housingLabels: Record<string, string> = {
  rent:         "إيجار",
  owned:        "ملك",
  family_owned: "سكن عائلي",
};

function PremiumStatCard({ label, value, icon, delay }: { label: string; value: string; icon: React.ReactNode; delay: number }) {
  return (
    <div 
      className="relative overflow-hidden group rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-white/40 dark:border-white/10 backdrop-blur-xl p-4 transition-all duration-300 hover:shadow-xl hover:bg-white/60 dark:hover:bg-slate-800/60 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity duration-500 rotate-12 scale-150">
        {icon}
      </div>
      <div className="flex flex-col gap-2 relative z-10">
        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-1">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{value}</p>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function PremiumInfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl transition-colors ${highlight ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100/50 dark:border-indigo-800/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${highlight ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      <span className={`text-sm font-bold ${highlight ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
    </div>
  );
}

export function SmartProfileView({ onEdit }: { onEdit: () => void }) {
  const { data: profile, isLoading } = trpc.profile.getSmartProfile.useQuery();

  if (isLoading) {
    return (
      <div className="w-full h-96 rounded-3xl bg-slate-100/50 dark:bg-slate-800/50 animate-pulse flex items-center justify-center border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-500">جاري تجهيز البروفايل الذكي...</p>
        </div>
      </div>
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
      lifestyle?.livingSituation,
      financial?.hasDebt !== undefined,
      basic?.profession,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const income = Number(financial?.averageMonthlyIncome || 0);
  const rent = Number(lifestyle?.monthlyRent || 0);
  const commitments = Number(lifestyle?.fixedMonthlyCommitments || 0);
  const debtMonthly = Number(financial?.monthlyDebtPayment || 0);
  const carCost = Number(lifestyle?.monthlyCarCost || 0);
  const fixedTotal = Number(financial?.fixedCommitmentsTotal || (rent + debtMonthly + commitments + carCost));
  const savingsRate = income > 0 ? Math.max(0, Math.round(((income - fixedTotal) / income) * 100)) : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* 🌟 Premium Hero Header */}
      <div className="relative rounded-[2.5rem] overflow-hidden bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
        
        {/* Dynamic Gradient Background */}
        <div className={`h-40 sm:h-48 w-full bg-gradient-to-br ${colors.bg} relative overflow-hidden`}>
          {/* Glass pattern overlay */}
          <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")"
          }} />
          {/* Glowing orbs */}
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/20 blur-3xl rounded-full" />
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-black/10 blur-3xl rounded-full" />
        </div>

        {/* Profile Content Container */}
        <div className="px-6 sm:px-10 pb-10 relative">
          
          {/* Avatar & Edit Button Row */}
          <div className="flex flex-col sm:flex-row justify-between items-center sm:items-end -mt-16 sm:-mt-20 gap-4 mb-8">
            <div className="relative group">
              <div className={`absolute inset-0 bg-gradient-to-br ${colors.bg} blur-xl opacity-50 rounded-full group-hover:opacity-75 transition-opacity duration-500`} />
              <div className={`relative w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br ${colors.bg} ${colors.ring} ring-8 ring-white dark:ring-slate-950 flex items-center justify-center shadow-2xl ${colors.glow} transform transition-transform duration-500 group-hover:scale-105`}>
                <Sparkles className={`w-14 h-14 sm:w-16 sm:h-16 ${colors.text} drop-shadow-md animate-pulse`} style={{ animationDuration: '3s' }} />
              </div>
            </div>

            <div className="flex gap-3 w-full sm:w-auto">
              <Button 
                onClick={onEdit} 
                className="w-full sm:w-auto rounded-full px-6 h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:shadow-indigo-300 dark:hover:shadow-indigo-800/40 gap-2 text-sm font-bold"
              >
                <Edit className="w-4 h-4" />
                تحديث البروفايل
              </Button>
            </div>
          </div>

          {/* User Info Header */}
          <div className="text-center sm:text-right space-y-3 mb-8">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {basic?.name || "مستخدم SmartSpend"}
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium flex items-center justify-center sm:justify-start gap-2">
              <Briefcase className="w-5 h-5" />
              {basic?.profession || "لم يتم تحديد المهنة"}
            </p>
            
            {/* Elegant Badges */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-2">
              {financial?.primaryGoal && (
                <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 border-0 px-3 py-1 text-sm font-medium">
                  🎯 {goalLabels[String(financial.primaryGoal)] || financial.primaryGoal}
                </Badge>
              )}
              {financial?.spendingPattern && (
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 border-0 px-3 py-1 text-sm font-medium">
                  💡 {patternLabels[String(financial.spendingPattern)] || financial.spendingPattern}
                </Badge>
              )}
              {lifestyle?.smoking && (
                <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 border-0 px-3 py-1 text-sm font-medium">
                  🚬 مدخن
                </Badge>
              )}
            </div>
          </div>

          {/* AI Completion Bar (Glassmorphism) */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 mb-10">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">قوة البروفايل الذكي</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {completionScore === 100 ? "ممتاز! تقارير الذكاء الاصطناعي الآن بأعلى دقة." : "أكمل بياناتك للحصول على تقارير مالية مخصصة وعميقة."}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-black text-violet-600 dark:text-violet-400">{completionScore}%</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${completionScore}%` }}
              />
            </div>
          </div>

          {/* 💎 Floating Glass Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <PremiumStatCard delay={100} label="الدخل الشهري" value={income > 0 ? `${income.toLocaleString()} ج` : "—"} icon={<Wallet className="w-5 h-5" />} />
            <PremiumStatCard delay={200} label="التزامات ثابتة" value={fixedTotal > 0 ? `${fixedTotal.toLocaleString()} ج` : "—"} icon={<CreditCard className="w-5 h-5" />} />
            <PremiumStatCard delay={300} label="معدل الادخار" value={savingsRate !== null ? `${savingsRate}%` : "—"} icon={<PiggyBank className="w-5 h-5" />} />
            <PremiumStatCard delay={400} label="حجم الأسرة" value={lifestyle?.childrenCount ? String(Number(lifestyle.childrenCount) + (lifestyle.partnerName ? 2 : 1)) : (lifestyle?.partnerName ? "2" : "1")} icon={<Users className="w-5 h-5" />} />
          </div>

          {/* 🧩 Deep Info Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            
            {/* Financial Deep Dive */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="w-4 h-4" />
                </span>
                البصمة المالية
              </h3>
              <div className="space-y-1">
                <PremiumInfoRow icon={<Home className="w-4 h-4" />} label="نظام السكن" value={housingLabels[String(lifestyle?.housingType)] || "غير محدد"} />
                {rent > 0 && <PremiumInfoRow icon={<Wallet className="w-4 h-4" />} label="الإيجار الشهري" value={`${rent.toLocaleString()} ج.م`} highlight />}
                <PremiumInfoRow icon={<AlertCircle className="w-4 h-4" />} label="ديون أو أقساط" value={financial?.hasDebt === true ? `نعم (${debtMonthly > 0 ? `${debtMonthly.toLocaleString()} ج/شهر` : ""})` : financial?.hasDebt === false ? "لا يوجد" : "—"} highlight={financial?.hasDebt} />
                {Array.isArray(financial?.incomeSources) && financial.incomeSources.length > 0 && (
                  <PremiumInfoRow icon={<Briefcase className="w-4 h-4" />} label="مصادر الدخل" value={financial.incomeSources.join(" + ")} />
                )}
              </div>
            </div>

            {/* Lifestyle Deep Dive */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <Heart className="w-4 h-4" />
                </span>
                نمط الحياة والعائلة
              </h3>
              <div className="space-y-1">
                {lifestyle?.partnerName && <PremiumInfoRow icon={<Users className="w-4 h-4" />} label="شريك الحياة" value={String(lifestyle.partnerName)} />}
                {Array.isArray(lifestyle?.childrenNames) && lifestyle.childrenNames.length > 0 && (
                  <PremiumInfoRow icon={<Users className="w-4 h-4" />} label="الأبناء" value={lifestyle.childrenNames.join("، ")} highlight />
                )}
                {lifestyle?.carOwnership && (
                  <PremiumInfoRow icon={<Car className="w-4 h-4" />} label="السيارة" value={`${lifestyle?.carType || "نعم"}${carCost > 0 ? ` (${carCost.toLocaleString()} ج/شهر)` : ""}`} highlight />
                )}
                {Array.isArray(lifestyle?.subscriptions) && lifestyle.subscriptions.length > 0 && (
                  <PremiumInfoRow icon={<Tv className="w-4 h-4" />} label="الاشتراكات" value={lifestyle.subscriptions.length} />
                )}
                {Array.isArray(lifestyle?.regularContacts) && lifestyle.regularContacts.length > 0 && (
                  <PremiumInfoRow icon={<PhoneCall className="w-4 h-4" />} label="أشخاص تحول لهم" value={lifestyle.regularContacts.join("، ")} />
                )}
              </div>
            </div>

          </div>

          {/* ✨ AI Brain Insights */}
          {inferred && Object.keys(inferred).length > 0 && (
            <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-violet-900/20">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />
              
              <div className="relative z-10">
                <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  تحليل الذكاء الاصطناعي (AI Brain)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(inferred).slice(0, 6).map(([key, val]) => (
                    <div key={key} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 hover:bg-white/20 transition-colors">
                      <p className="text-violet-200 text-xs font-medium mb-1 truncate">{key}</p>
                      <p className="text-white font-bold text-sm">{String(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
