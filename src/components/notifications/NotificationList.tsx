import { useNavigate } from "react-router-dom";
import { Bell, CalendarCheck, CreditCard, PencilLine, ShieldCheck, Wallet } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import type { MessageKey } from "@/i18n/ar";
import {
  notificationKindOf,
  resolveNotificationTarget,
  type NotificationKind,
} from "@contracts/notification-types";

const KIND_ICONS: Record<NotificationKind, typeof Bell> = {
  budget: Wallet,
  plan: CalendarCheck,
  subscription: CreditCard,
  reminder: PencilLine,
  security: ShieldCheck,
  general: Bell,
};

type Group = "today" | "yesterday" | "earlier";
const GROUP_TITLES: Record<Group, MessageKey> = {
  today: "notifications.group.today",
  yesterday: "notifications.group.yesterday",
  earlier: "notifications.group.earlier",
};

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupOf(created: Date, now: Date): Group {
  const days = Math.round((dayStart(now) - dayStart(created)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : "earlier";
}

/** "from 5 minutes" for today, the time for yesterday, the date before that; Western digits like the rest of the app. */
function whenText(
  created: Date,
  now: Date,
  language: "ar" | "en",
  group: Group,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  const locale = language === "en" ? "en" : "ar-EG-u-nu-latn";
  if (group === "today") {
    const minutes = Math.max(0, Math.round((now.getTime() - created.getTime()) / 60_000));
    if (minutes < 1) return t("notifications.time.now");
    // Arabic says "دقيقتين", "3 دقايق", "11 دقيقة": the plural rule picks the form.
    const plural = (count: number) => new Intl.PluralRules(language).select(count) as "one" | "two" | "few" | "many" | "other";
    if (minutes < 60) return t(`notifications.time.minutes.${plural(minutes)}`, { count: minutes });
    const hours = Math.round(minutes / 60);
    return t(`notifications.time.hours.${plural(hours)}`, { count: hours });
  }
  if (group === "yesterday") return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(created);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(created);
}
/**
 * The notification center: grouped by day, newest first. Opening one marks it read and goes to what it is about
 * (`contracts/notification-types.ts`). Shown in the bell's sheet and on /notifications.
 */
export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { language, t } = useLanguage();
  const { data: notifications, isLoading } = trpc.profile.getInAppNotifications.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const markRead = trpc.profile.markInAppNotificationRead.useMutation({
    onSettled: () => utils.profile.getInAppNotifications.invalidate(),
  });
  const markAll = trpc.profile.markAllInAppNotificationsRead.useMutation({
    onSettled: () => utils.profile.getInAppNotifications.invalidate(),
  });

  const now = new Date();
  const unread = notifications?.filter((item) => !item.isRead).length ?? 0;

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("notifications.loading")}</div>;
  }
  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Bell className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <p className="font-semibold">{t("notifications.empty.title")}</p>
        <p className="text-sm text-muted-foreground">{t("notifications.empty.body")}</p>
      </div>
    );
  }

  const groups = (["today", "yesterday", "earlier"] as Group[])
    .map((group) => ({
      group,
      items: notifications.filter((item) => groupOf(new Date(item.createdAt), now) === group),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-4">
      {unread > 0 && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="min-h-11 px-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400"
          >
            {t("notifications.markAll")}
          </button>
        </div>
      )}
      {groups.map(({ group, items }) => (
        <section key={group} className="space-y-2">
          <h3 className="px-1 text-xs font-bold text-muted-foreground">{t(GROUP_TITLES[group])}</h3>
          <ul className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/70">
            {items.map((item) => {
              const Icon = KIND_ICONS[notificationKindOf(item.actionUrl)];
              const created = new Date(item.createdAt);
              return (
                <li key={item.id} className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-slate-200/70 dark:[&:not(:first-child)]:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (!item.isRead) markRead.mutate({ id: item.id });
                      onNavigate?.();
                      navigate(resolveNotificationTarget(item.actionUrl));
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-start active-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("text-sm", item.isRead ? "font-medium" : "font-bold")} dir="auto">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{whenText(created, now, language, group, t)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground" dir="auto">
                        {item.body}
                      </span>
                    </span>
                    {!item.isRead && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-600" aria-label={t("notifications.unread")} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
