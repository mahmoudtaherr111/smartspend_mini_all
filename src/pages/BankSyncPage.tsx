import { useState } from "react";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { IosSetupFlow } from "@/components/bank-sync/IosSetupFlow";
import { AndroidSetupFlow } from "@/components/bank-sync/AndroidSetupFlow";
import { Smartphone, Apple, ArrowRight } from "lucide-react";

type Device = "ios" | "android" | null;

export default function BankSyncPage() {
  const [device, setDevice] = useState<Device>(null);

  if (device === "ios") return <IosSetupFlow onBack={() => setDevice(null)} />;
  if (device === "android") return <AndroidSetupFlow onBack={() => setDevice(null)} />;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-20 px-4">
      <SEOMeta title="ربط حسابك البنكي - SmartSpend" />

      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-900 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            تتبع تلقائي بالكامل
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            اربط حسابك البنكي آلياً ⚡
          </h1>
          <p className="text-emerald-50 text-sm sm:text-base leading-relaxed opacity-90 max-w-lg mx-auto">
            أي رسالة من البنك أو InstaPay أو Vodafone Cash ستُسجَّل تلقائياً في حسابك — بدون أي تدخل منك.
            آمن 100% ولا نطلب أي بيانات بنكية.
          </p>
        </div>
      </div>

      {/* Device Selector */}
      <div className="space-y-4">
        <p className="text-center text-sm font-bold text-muted-foreground uppercase tracking-widest">
          اختر نوع هاتفك
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* iPhone */}
          <button
            id="select-ios"
            onClick={() => setDevice("ios")}
            className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-sm hover:shadow-xl hover:border-emerald-400 dark:hover:border-emerald-500 transition-all duration-300 hover:-translate-y-1 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <Apple className="w-10 h-10 text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">iPhone</h2>
              <p className="text-xs text-muted-foreground mt-1">iOS 16+ • بدون أي تطبيق إضافي</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              3 خطوات فقط
            </div>
            <ArrowRight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all opacity-0 group-hover:opacity-100" />
          </button>

          {/* Android */}
          <button
            id="select-android"
            onClick={() => setDevice("android")}
            className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-sm hover:shadow-xl hover:border-emerald-400 dark:hover:border-emerald-500 transition-all duration-300 hover:-translate-y-1 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <Smartphone className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Android</h2>
              <p className="text-xs text-muted-foreground mt-1">Android 8+ • تطبيق صغير 5MB فقط</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              3 خطوات فقط
            </div>
            <ArrowRight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all opacity-0 group-hover:opacity-100" />
          </button>
        </div>

        {/* Supported providers */}
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 text-center mb-3 uppercase tracking-widest">يدعم جميع البنوك والمحافظ المصرية</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold">
            {["CIB","NBE","Banque Misr","QNB","HSBC","Alex Bank","InstaPay","Vodafone Cash","Orange Money","Fawry","Etisalat Cash","وأكثر..."].map((p) => (
              <span key={p} className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
