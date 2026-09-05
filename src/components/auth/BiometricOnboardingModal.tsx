import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, ShieldCheck, X, Sparkles } from "lucide-react";
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
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs"
        dir="rtl"
        data-testid="biometric-onboarding-modal"
      >
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative p-6 space-y-5"
        >
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

          {/* Icon & Badge */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Fingerprint className="w-8 h-8" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full w-fit">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ميزة أمان ذكية وسريعة</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                تفعيل الدخول بالبصمة (Face ID)
              </h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            ادخل لحسابك بلمسة واحدة واحمهِ من التطفل مع استجابة فورية بدون الحاجة لكتابة كلمة السر في كل مرة.
          </p>

          {/* Feature Bullets */}
          <div className="space-y-2 py-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>دخول فوري في أقل من 50 مللي ثانية وبدون إنترنت</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>حماية وتشفير عتادي خاص بهذا الجهاز فقط</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={handleActivate}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold h-12 rounded-2xl shadow-xl shadow-indigo-600/25 gap-2"
            >
              <Fingerprint className="w-5 h-5" />
              تفعيل الآن بلمسة واحدة
            </Button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  lightTap();
                  onPostpone();
                }}
                className="flex-1 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-2 rounded-xl transition-colors"
              >
                تذكيري لاحقاً
              </button>

              <button
                type="button"
                onClick={() => {
                  lightTap();
                  onOptOut();
                }}
                className="text-xs font-bold text-rose-500/80 hover:text-rose-600 py-2 px-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
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
