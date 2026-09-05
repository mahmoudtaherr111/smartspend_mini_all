import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import {
  getDeferredInstallPrompt,
  isStandalonePwa,
  triggerInstallPrompt,
} from "@/pwa/register-sw";
import {
  getPwaInstallPlatform,
  type PwaInstallPlatform,
} from "@/pwa/install-platform";
import { useAuth } from "@/hooks/useAuth";
import { useHaptics } from "@/hooks/useHaptics";

const DISMISS_KEY = "smartspend_pwa_install_dismissed_v4";

interface InstallStep {
  title: string;
  description: string;
  icon: typeof Share;
}

const PLATFORM_STEPS: Record<PwaInstallPlatform, InstallStep[]> = {
  ios: [
    {
      title: "افتح SmartSpend في Safari",
      description:
        "لو الرابط مفتوح داخل واتساب أو تطبيق تاني، افتحه في Safari الأول.",
      icon: Smartphone,
    },
    {
      title: "اضغط زر المشاركة",
      description: "هتلاقي علامة المشاركة في شريط Safari.",
      icon: Share,
    },
    {
      title: "اختر «إضافة إلى الشاشة الرئيسية»",
      description:
        "وبعدها اضغط «إضافة»؛ هيفتح كتطبيق مستقل من غير شريط المتصفح.",
      icon: PlusSquare,
    },
  ],
  android: [
    {
      title: "افتح القائمة في Chrome",
      description: "اضغط علامة ⋮ أعلى المتصفح.",
      icon: MoreVertical,
    },
    {
      title: "اختر «تثبيت التطبيق»",
      description: "قد تظهر باسم «إضافة إلى الشاشة الرئيسية» حسب إصدار Chrome.",
      icon: Download,
    },
    {
      title: "أكد التثبيت",
      description: "هتلاقي SmartSpend وسط تطبيقاتك ويفتح بملء الشاشة.",
      icon: CheckCircle2,
    },
  ],
  desktop: [
    {
      title: "افتح قائمة المتصفح",
      description:
        "في Chrome أو Edge اضغط قائمة المتصفح أو علامة التثبيت بجوار العنوان.",
      icon: MoreVertical,
    },
    {
      title: "اختر «تثبيت SmartSpend»",
      description: "سيظهر كتطبيق مستقل ويمكن تثبيته في شريط المهام.",
      icon: Download,
    },
  ],
};

export function PwaInstallPrompt() {
  const { user } = useAuth();
  const location = useLocation();
  const { lightTap, success: successHaptic } = useHaptics();
  const storageScope = user ? `${user.type}_${user.id}` : "anonymous";
  const dismissKey = `${DISMISS_KEY}_${storageScope}`;
  const platform = useMemo(() => getPwaInstallPlatform(), []);
  const [canInstall, setCanInstall] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isReadyToShow, setIsReadyToShow] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isStandalonePwa()) return;

    const syncInstallAvailability = () =>
      setCanInstall(Boolean(getDeferredInstallPrompt()));
    const revealTimer = window.setTimeout(() => setIsReadyToShow(true), 1800);

    syncInstallAvailability();
    window.addEventListener("pwa-install-available", syncInstallAvailability);

    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener(
        "pwa-install-available",
        syncInstallAvailability,
      );
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setShowGuide(false);
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      // Private browsing can deny storage; dismiss for this session only.
    }
  };

  const handlePrimaryAction = async () => {
    lightTap();
    if (!canInstall) {
      setShowGuide(true);
      return;
    }

    const installed = await triggerInstallPrompt();
    if (installed) {
      successHaptic();
      dismiss();
    }
  };

  const isEligibleSurface =
    location.pathname === "/dashboard" || location.pathname === "/more";

  if (!isEligibleSurface) return null;

  if (!isReadyToShow || dismissed || isStandalonePwa() || showGuide) {
    return showGuide ? (
      <InstallGuide
        platform={platform}
        onClose={() => setShowGuide(false)}
        onDismiss={dismiss}
      />
    ) : null;
  }

  const platformCopy =
    platform === "ios"
      ? "أضِفه للشاشة الرئيسية وافتحه كتطبيق كامل على iPhone."
      : platform === "android"
        ? "ثبّته على Android وافتحه من تطبيقاتك بلمسة واحدة."
        : "ثبّته كتطبيق مستقل على جهازك.";

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm animate-in fade-in slide-in-from-bottom-6 duration-300 lg:hidden"
      role="region"
      aria-label="تثبيت SmartSpend كتطبيق"
      dir="rtl"
    >
      <div className="relative overflow-hidden rounded-[24px] border border-white/50 bg-white/95 p-3.5 shadow-2xl shadow-slate-950/20 backdrop-blur-2xl dark:border-white/15 dark:bg-slate-900/95">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-emerald-500 via-cyan-400 to-blue-500" />
        <button
          type="button"
          onClick={dismiss}
          className="tap-target absolute start-1.5 top-1.5 flex size-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label="إغلاق اقتراح تثبيت التطبيق"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-start gap-3 ps-8">
          <img
            src="/icon-192.png"
            alt=""
            width="48"
            height="48"
            loading="eager"
            className="size-12 shrink-0 rounded-[14px] shadow-md"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              خلّي SmartSpend تطبيق على موبايلك
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {platformCopy}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button
            type="button"
            onClick={() => void handlePrimaryAction()}
            className="active-press h-11 rounded-2xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
          >
            <Download className="size-4" />
            {canInstall ? "تثبيت الآن" : "اعرف طريقة التثبيت"}
          </Button>
          {canInstall && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowGuide(true)}
              className="active-press h-11 rounded-2xl px-3 text-xs font-bold"
            >
              الخطوات
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InstallGuide({
  platform,
  onClose,
  onDismiss,
}: {
  platform: PwaInstallPlatform;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const steps = PLATFORM_STEPS[platform];
  const deviceName =
    platform === "ios"
      ? "iPhone أو iPad"
      : platform === "android"
        ? "Android"
        : "الكمبيوتر";

  return (
    <AdaptiveDialog open onOpenChange={(open) => !open && onClose()}>
      <AdaptiveDialogContent
        showGrabber={false}
        className="max-w-none rounded-t-[28px] rounded-b-none border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950 sm:max-w-md sm:rounded-2xl sm:p-6"
        dir="rtl"
      >
        <AdaptiveDialogHeader className="pb-4 text-right">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Smartphone className="size-6" />
          </div>
          <AdaptiveDialogTitle className="text-right text-xl font-black">
            ثبّت SmartSpend على {deviceName}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="mt-1 text-right text-sm leading-relaxed">
            الخطوات بتاخد أقل من دقيقة، وبيفتح بعدها بملء الشاشة زي أي تطبيق.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <ol className="space-y-2.5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    <span className="ms-1 text-emerald-600 dark:text-emerald-400">
                      {index + 1}.
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="active-press h-12 rounded-2xl text-sm font-bold"
          >
            رجوع
          </Button>
          <Button
            type="button"
            onClick={onDismiss}
            className="active-press h-12 rounded-2xl bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
          >
            فهمت
          </Button>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
