import { useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/context";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";

/** How many entries were written offline and are still waiting to be sent. */
function countUnsentOffline(): number {
  const count = (key: string) => {
    try {
      const items: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(items) ? items.length : 0;
    } catch {
      return 0;
    }
  };
  return count("smartspend_offline_texts") + count("smartspend_offline_manual");
}

/** Sign-out with a confirmation (More and the profile). Logging out clears the offline queue, so it says so first. */
export function SignOutDialog({ trigger }: { trigger: ReactNode }) {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const unsentCount = open ? countUnsentOffline() : 0;

  const confirm = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!isLoggingOut) setOpen(next);
      }}
    >
      <AdaptiveDialogTrigger asChild>{trigger}</AdaptiveDialogTrigger>
      <AdaptiveDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("more.logout.title")}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>{t("more.logout.description")}</AdaptiveDialogDescription>
          {unsentCount > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {t("more.logout.unsentWarning", { count: unsentCount })}
            </p>
          )}
        </AdaptiveDialogHeader>
        <AdaptiveDialogFooter>
          <AdaptiveDialogClose asChild>
            <Button ref={cancelRef} variant="outline" disabled={isLoggingOut}>
              {t("more.logout.cancel")}
            </Button>
          </AdaptiveDialogClose>
          <Button variant="destructive" disabled={isLoggingOut} onClick={() => void confirm()}>
            {isLoggingOut ? t("more.logout.loading") : t("more.logout.confirm")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
