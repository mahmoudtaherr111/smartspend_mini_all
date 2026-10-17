import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/i18n/context";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type DeviceState = "on" | "off" | "blocked" | "iphoneNotInstalled" | "unsupported";

function deviceState(isSupported: boolean, isSubscribed: boolean): DeviceState {
  if (typeof window === "undefined") return "unsupported";
  const isIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // On iPhone, notifications exist only for the app added to the Home Screen.
  if (isIphone && !installed) return "iphoneNotInstalled";
  if (!isSupported || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return isSubscribed ? "on" : "off";
}

/** Settings › Notifications: whether this device receives them, and which alerts the account gets. */
export function NotificationSettings() {
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  const { isSupported, isSubscribed, subscribeToPush } = usePushNotifications();
  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const save = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => utils.profile.getSmartProfile.invalidate(),
  });
  const alertsEnabled = (profile?.preferences as Record<string, unknown> | undefined)?.alertsEnabled !== false;
  const state = deviceState(isSupported, isSubscribed);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold text-muted-foreground">{t("notifications.settings.device")}</h2>
        <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="font-semibold">{t(`notifications.settings.state.${state}`)}</p>
          <p className="text-sm text-muted-foreground">{t(`notifications.settings.hint.${state}`)}</p>
          {state === "off" && (
            <Button className="h-11 w-full" onClick={() => void subscribeToPush()}>
              {t("notifications.settings.turnOn")}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold text-muted-foreground">{t("notifications.settings.alerts")}</h2>
        <label className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("notifications.settings.alertsRow")}</span>
            <span className="block text-xs text-muted-foreground">{t("notifications.settings.alertsHint")}</span>
          </span>
          <Switch
            className="data-[state=checked]:bg-emerald-600"
            checked={alertsEnabled}
            disabled={!profile || save.isPending}
            onCheckedChange={(checked) => save.mutate({ preferences: { alertsEnabled: checked } })}
          />
        </label>
      </section>
    </div>
  );
}
