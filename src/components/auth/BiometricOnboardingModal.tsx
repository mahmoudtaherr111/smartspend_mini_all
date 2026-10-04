import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, ShieldCheck, X, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useHaptics } from "@/hooks/useHaptics";

interface BiometricOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostpone: () => void;
  onOptOut: () => void;
}

export function BiometricOnboardingModal({
  isOpen,
  onClose,
  onPostpone,
  onOptOut,
}: BiometricOnboardingModalProps) {
  const navigate = useNavigate();
  const { mediumTap, lightTap } = useHaptics();

  if (!isOpen) return null;

  const handleActivate = () => {
    mediumTap();
    onClose();
    navigate("/settings/security?highlight=1");
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
        dir="rtl"
        data-testid="biometric-onboarding-modal"
      >
        {/* Backdrop dismiss */}
        <div
          className="absolute inset-0 -z-10"
          onClick={() => {
            lightTap();
            onPostpone();
          }}
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, y: "100%", scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: "100%", scale: 0.98 }}
          transition={{ type: "spring", damping: 28, stiffness: 350 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border-t sm:border border-slate-200/80 dark:border-slate-800 rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden relative p-6 sm:p-7 space-y-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:pb-7"
        >
          {/* Top Grab Handle for Mobile PWA Sheet */}
          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700/80 rounded-full mx-auto -mt-1 mb-2 sm:hidden" />

          {/* Close button */}
          <button
            type="button"
            onClick={() => {
              lightTap();
              onPostpone();
            }}
            className="absolute top-4 start-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Hero Icon Badge */}
          <div className="flex flex-col items-center text-center pt-2 sm:pt-1">
            <div className="relative mb-4">
              <div className="w-18 h-18 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                <Fingerprint className="w-9 h-9" strokeWidth={1.8} />
              </div>
              <div className="absolute -bottom-1 -end-1 w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              تفعيل الدخول بالبصمة (Face ID)
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-1.5 max-w-sm">
              سجّل دخولك لحسابك وأكّد أمان بياناتك المالية بسرعة وسهولة دون الحاجة لكتابة كلمة المرور في كل مرة.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800/80 text-start">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-indigo-100/80 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  وصول فوري وسهل
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  دخول مباشر لحسابك بلمسة واحدة أو بالتعرف على الوجه.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-emerald-100/80 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  حماية مشفرة ومحلية
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  بياناتك الحيوية مؤمنة على هذا الجهاز فقط ولا تغادره أبداً.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  تحكم كامل بخصوصيتك
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  تقدر توقف الميزة أو تعدلها في أي وقت من إعدادات الأمان.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              onClick={handleActivate}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold h-12 rounded-2xl shadow-md shadow-indigo-600/20 gap-2 text-sm transition-all"
            >
              <Fingerprint className="w-5 h-5" />
              تفعيل الآن بلمسة واحدة
            </Button>

            <button
              type="button"
              onClick={() => {
                lightTap();
                onPostpone();
              }}
              className="w-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-2.5 rounded-xl transition-colors text-center"
            >
              تذكيري لاحقاً
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => {
                  lightTap();
                  onOptOut();
                }}
                className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
              >
                عدم التذكير مجدداً
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
