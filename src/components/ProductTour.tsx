import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

export function ProductTour() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("smartspend_tour_seen");
    if (!hasSeenTour) {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const finishTour = () => {
    localStorage.setItem("smartspend_tour_seen", "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm pointer-events-auto"
        onClick={finishTour}
      />
      <div
        className="relative z-50 bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-sm w-full pointer-events-auto animate-in zoom-in-95 fade-in duration-300 border border-slate-200 dark:border-slate-800"
        dir="rtl"
      >
        <button
          onClick={finishTour}
          className="absolute top-5 start-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 rounded-2xl flex items-center justify-center mb-5 text-emerald-600 shadow-inner">
          <Sparkles className="w-7 h-7" />
        </div>
        <h3 className="text-2xl font-bold mb-3 text-slate-900 dark:text-slate-100">
          أهلاً بيك في SmartSpend! 🚀
        </h3>
        <p className="text-slate-600 dark:text-slate-400 text-base mb-6 leading-relaxed">
          تقدر تسجل مصاريفك بسهولة جداً. دوس على علامة المايك 🎤 وقول مثلاً:{" "}
          <br />
          <span className="font-bold text-emerald-700 dark:text-emerald-400 mt-3 block bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
            "صرفت 150 جنيه في مطعم"
          </span>
          <span className="block mt-3 text-sm text-slate-500">
            والذكاء الاصطناعي هيفهمها ويصنفها لوحده!
          </span>
        </p>
        <Button
          onClick={finishTour}
          className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-base font-bold h-12 rounded-xl shadow-md transition-all active:scale-95"
        >
          يلا نبدأ!
        </Button>
      </div>
    </div>
  );
}
