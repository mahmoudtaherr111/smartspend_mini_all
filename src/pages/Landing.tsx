import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { Brain, Mic, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import darkModeLogo from "../../photos/dark_mode_logo-removebg-preview.png";
import whiteModeLogo from "../../photos/white_mode_logo-removebg-preview.png";

export default function Landing() {
  const { theme } = useTheme();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30" dir="rtl">
      <SEOMeta path="/" title="SmartSpend AI — إدارة مصاريفك بالعامية" />
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <img 
              src={whiteModeLogo} 
              alt="SmartSpend" 
              className="h-10 w-auto object-contain block dark:hidden"
            />
            <img 
              src={darkModeLogo} 
              alt="SmartSpend" 
              className="h-10 w-auto object-contain hidden dark:block"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/privacy">الخصوصية</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">تسجيل الدخول</Link>
            </Button>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link to="/login">ابدأ مجاناً</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-14 space-y-16">
        <section className="text-center space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            تحليل بالعامية المصرية + صوت
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            سجّل مصاريفك بطريقتك…
            <span className="block text-emerald-600 dark:text-emerald-400">والذكاء اليساعدك تفهم فين فلوسك رايحة</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            اكتب زي ما بتتكلم، سجّل بالصوت، وشوف إحصائيات وتنبيهات مفيدة لميزانيتك — مصمم للاستخدام اليومي على الموبايل.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" asChild>
              <Link to="/login">ابدأ مجاناً</Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <Link to="/login">عندي حساب</Link>
            </Button>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Feature icon={<Mic className="w-6 h-6" />} title="إدخال صوتي" desc="سجّل مصروفك بصوتك والنظام يحوّله لنص." />
          <Feature icon={<Brain className="w-6 h-6" />} title="تحليل ذكي" desc="اقتراحات وتنبيهات حسب أنماط صرفك." />
          <Feature icon={<LineChart className="w-6 h-6" />} title="تقارير شهرية" desc="ملخصات واضحة للدخل والصرف والفئات." />
          <Feature icon={<ShieldCheck className="w-6 h-6" />} title="حسابك محمي" desc="تسجيل دخول آمن وخطط اشتراك واضحة." />
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <Card className="border-emerald-100 dark:border-emerald-900/40">
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold">مجاني</h3>
              <p className="text-sm text-muted-foreground">ابدأ بسرعة، سجّل العمليات، وشوف ملخص الشهر.</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200/80 dark:border-amber-900/40 shadow-md">
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                برو <span className="text-xs font-normal text-muted-foreground">(قريباً: دفع حقيقي)</span>
              </h3>
              <p className="text-sm text-muted-foreground">ميزات أعمق، حدود أعلى للـ AI، وتجربة أنظف.</p>
            </CardContent>
          </Card>
          <Card className="border-violet-200/80 dark:border-violet-900/40">
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold">ألترا</h3>
              <p className="text-sm text-muted-foreground">لمستخدمين محترفين محتاجين أقصى قدرات التحليل.</p>
            </CardContent>
          </Card>
        </section>

        <footer className="text-center text-sm text-muted-foreground pb-10 space-x-4 space-x-reverse">
          <Link to="/privacy" className="hover:underline">سياسة الخصوصية</Link>
          <span>·</span>
          <Link to="/terms" className="hover:underline">شروط الاستخدام</Link>
        </footer>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800">
      <CardContent className="pt-6 space-y-3">
        <div className="text-emerald-600 dark:text-emerald-400">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}
