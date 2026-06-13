import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  X,
  ShieldCheck,
  Mic,
  ArrowLeft,
  ArrowRight,
  Wallet,
  Trophy,
} from "lucide-react";

const STEPS = [
  {
    icon: (
      <Sparkles className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
    ),
    title: "أهلاً بيك في SmartSpend! 🚀",
    description:
      "أذكى مساعد مالي شخصي في مصر. مش محتاج تسجل مصاريفك يدوياً ولا تكتب تصنيفات معقدة.",
    highlight: "إحنا هنا عشان نسهل حياتك المالية.",
  },
  {
    icon: <Mic className="w-8 h-8 text-sky-600 dark:text-sky-400" />,
    title: "سجل بصوتك أو اكتب زي ما بتكلم صحبك 🗣️",
    description: "دوس على علامة المايك وقول:",
    highlight: '"صرفت 150 جنيه في مطعم"',
    extra: "والذكاء الاصطناعي هيفهمها ويصنفها لوحده!",
  },
  {
    icon: (
      <ShieldCheck className="w-8 h-8 text-violet-600 dark:text-violet-400" />
    ),
    title: "تتبع آلي 100% آمن 🔒",
    description:
      "تطبيق الأندرويد بيقرأ رسائل البنك (SMS) علشان يسجل مصاريفك تلقائياً.",
    highlight:
      "الرسائل بتتقرأ على تليفونك فقط (Offline) وبدون ما توصل لخوادمنا لحماية خصوصيتك.",
    extra: "أمانك هو أولويتنا.",
  },
  {
    icon: <Trophy className="w-8 h-8 text-amber-600 dark:text-amber-400" />,
    title: "جاهز تبدأ التحدي؟ 🏆",
    description:
      "سجل أول عملية دلوقتي عشان تفتح تحليل 'الشخصية المالية' وتعرف إزاي بتحوش وتصرف.",
    highlight: "مستنيين أول إنجاز ليك!",
  },
];

export function OnboardingFlow() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("smartspend_onboarding_v2");
    if (!hasSeenTour) {
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const finishTour = () => {
    localStorage.setItem("smartspend_onboarding_v2", "true");
    setShow(false);
  };

  const nextStep = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finishTour();
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!show) return null;

  const currentStep = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm pointer-events-auto transition-opacity"
        onClick={finishTour}
      />

      <div
        className="relative z-[101] bg-white dark:bg-[#0c0e12] p-6 sm:p-8 rounded-[2rem] shadow-2xl max-w-sm w-full pointer-events-auto animate-in zoom-in-95 fade-in duration-300 border border-slate-200 dark:border-slate-800"
        dir="rtl"
      >
        <button
          onClick={finishTour}
          className="absolute top-5 start-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-100/50 dark:bg-slate-800/50 rounded-full p-2"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Dots Indicator */}
        <div className="flex gap-1.5 justify-center mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-emerald-500" : "w-1.5 bg-slate-200 dark:bg-slate-800"}`}
            />
          ))}
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-100 dark:border-slate-800">
            {currentStep.icon}
          </div>

          <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-slate-100">
            {currentStep.title}
          </h3>

          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
            {currentStep.description}
          </p>

          {currentStep.highlight && (
            <div className="w-full font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50 mb-3 text-sm">
              {currentStep.highlight}
            </div>
          )}

          {currentStep.extra && (
            <p className="text-xs text-slate-500 font-medium mb-4">
              {currentStep.extra}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
          <Button
            onClick={nextStep}
            className="flex-1 bg-black hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 text-white text-sm font-bold h-12 rounded-xl shadow-md transition-all active:scale-95 gap-2"
          >
            {step === STEPS.length - 1 ? "يلا نبدأ!" : "التالي"}
            {step !== STEPS.length - 1 && <ArrowLeft className="w-4 h-4" />}
          </Button>

          {step > 0 && (
            <Button
              onClick={prevStep}
              variant="outline"
              className="px-4 h-12 rounded-xl border-slate-200 dark:border-slate-800"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
