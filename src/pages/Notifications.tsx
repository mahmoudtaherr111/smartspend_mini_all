import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLanguage } from "@/i18n/context";
import { NotificationList } from "@/components/notifications/NotificationList";

/** The notification center as a page: where a push with nowhere better to go opens. */
export default function Notifications() {
  const navigate = useNavigate();
  const { dir, t } = useLanguage();
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-5 dark:bg-slate-950/40" dir={dir}>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/dashboard"))}
            className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300"
            aria-label={t("common.back")}
          >
            <BackArrow className="size-5" />
          </button>
          <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
        </div>
        <NotificationList />
      </div>
    </div>
  );
}
