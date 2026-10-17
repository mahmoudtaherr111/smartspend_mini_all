import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/i18n/context";
import { NotificationList } from "@/components/notifications/NotificationList";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";

/** The bell: how many are unread, and the notification center in a sheet. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { t } = useLanguage();
  const { data: notifications } = trpc.profile.getInAppNotifications.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const unread = notifications?.filter((item) => !item.isRead).length ?? 0;

  // A push that arrives while the app is open shows in the bell at once (sent by src/sw.js).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") void utils.profile.getInAppNotifications.invalidate();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [utils]);

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <button
          type="button"
          className="relative flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label={unread > 0 ? t("notifications.bellUnread", { count: unread }) : t("notifications.title")}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent className="max-h-[85vh] sm:max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("notifications.title")}</AdaptiveDialogTitle>
        </AdaptiveDialogHeader>
        <div className="overflow-y-auto px-4 pb-6 md:px-0">
          <NotificationList onNavigate={() => setOpen(false)} />
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
