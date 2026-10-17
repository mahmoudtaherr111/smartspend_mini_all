import { Fingerprint, KeyRound, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/context";
import type { MessageKey } from "@/i18n/ar";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";

type BiometricPlatform = "ios" | "android" | "other";

/** The name people know on their own phone: Face ID on iPhone, fingerprint on Android, a passkey elsewhere. */
function biometricPlatform(): BiometricPlatform {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(agent)) return "android";
  return "other";
}

const COPY: Record<BiometricPlatform, { icon: typeof Fingerprint; title: MessageKey; body: MessageKey; action: MessageKey }> = {
  ios: { icon: ScanFace, title: "biometric.prompt.title.ios", body: "biometric.prompt.body", action: "biometric.prompt.action.ios" },
  android: { icon: Fingerprint, title: "biometric.prompt.title.android", body: "biometric.prompt.body", action: "biometric.prompt.action.android" },
  other: { icon: KeyRound, title: "biometric.prompt.title.other", body: "biometric.prompt.body.other", action: "biometric.prompt.action.other" },
};

interface BiometricOnboardingModalProps {
  isOpen: boolean;
  isEnrolling: boolean;
  onTurnOn: () => void;
  onNotNow: () => void;
}

/** The one place that suggests fingerprint / Face ID sign-in; Settings › Security keeps the switch. */
export function BiometricOnboardingModal({ isOpen, isEnrolling, onTurnOn, onNotNow }: BiometricOnboardingModalProps) {
  const { t } = useLanguage();
  const copy = COPY[biometricPlatform()];
  const Icon = copy.icon;

  return (
    <AdaptiveDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isEnrolling) onNotNow();
      }}
    >
      <AdaptiveDialogContent data-testid="biometric-prompt">
        <AdaptiveDialogHeader className="items-center text-center">
          <Icon className="mb-2 size-10 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} aria-hidden="true" />
          <AdaptiveDialogTitle className="text-lg">{t(copy.title)}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>{t(copy.body)}</AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <AdaptiveDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="h-11 w-full" onClick={onTurnOn} disabled={isEnrolling}>
            {isEnrolling ? t("biometric.prompt.enrolling") : t(copy.action)}
          </Button>
          <Button variant="ghost" className="h-11 w-full text-muted-foreground" onClick={onNotNow} disabled={isEnrolling}>
            {t("biometric.prompt.notNow")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
