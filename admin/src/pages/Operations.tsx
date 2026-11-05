import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { SaveBar } from "../ui/SaveBar";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { dayTime } from "../ui/words";

// Each AI feature an admin can stop for everyone (api/lib/feature-switches.ts), in the words of the app.
const SWITCHES = [
  ["ai_off_parse", "فهم الجمل المكتوبة", "لو وقفته، الناس تقدر تسجل يدوي بس."],
  ["ai_off_chat", "المحادثة مع المساعد", "مركز الذكاء بيقول إن المساعد متوقف مؤقتًا."],
  ["ai_off_speech", "التسجيل بالصوت", "زرار الميكروفون بيختفي من التطبيق."],
  ["ai_off_image", "قراءة الفواتير", "زرار الكاميرا بيختفي من التطبيق."],
  ["ai_off_report", "التقارير الذكية", "التقرير الشهري والمقارنة والتقرير السنوي."],
  ["ai_off_goal", "تحليل الأهداف", "الخطة الذكية للأهداف."],
  ["ai_off_business", "ذكاء حساب الشغل", ""],
] as const;

const FIELDS = [
  ["mobile_min_version_android", "أقل إصدار أندرويد مسموح", "1.0.0", "أي حد عنده إصدار أقدم هيشوف شاشة «حدّث التطبيق» بس. سيبه فاضي لو مش عايز تجبر حد."],
  ["mobile_min_version_ios", "أقل إصدار آيفون مسموح", "1.0.0", ""],
  ["mobile_store_url_android", "رابط التطبيق على Google Play", "https://play.google.com/store/apps/details?id=…", "زرار «حدّث» بيفتحه."],
  ["mobile_store_url_ios", "رابط التطبيق على App Store", "https://apps.apple.com/app/…", ""],
] as const;

const ACTION: Record<string, string> = {
  UPDATE_SYSTEM_SETTINGS: "غيّر الإعدادات",
  UPDATE_USER_PLAN: "غيّر باقة مستخدم",
  UPDATE_USER_ROLE: "غيّر صلاحية مستخدم",
  DELETE_USER: "مسح حساب",
  REVOKE_SESSION: "سجّل خروج جهاز",
  ADD_AI_PROVIDER: "ضاف موصل",
  UPDATE_AI_PROVIDER: "عدّل موصل",
  DELETE_AI_PROVIDER: "شال موصل",
  SET_USER_TOKEN_LIMIT: "حدد حد ذكاء لمستخدم",
  RESET_USER_TOKENS: "صفّر استهلاك ذكاء",
  RESPOND_SUPPORT_TICKET: "رد على تذكرة",
};

/** The controls for a bad day and for app releases, and the record of what every admin changed. */
export function Operations() {
  const utils = trpc.useUtils();
  const settings = trpc.admin.getSettings.useQuery();
  const audit = trpc.admin.getAuditLogs.useQuery({ page: 1, limit: 30 });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("اتحفظ، والتغيير بيوصل لكل السيرفرات خلال دقايق");
      setDraft({});
      void utils.admin.getSettings.invalidate();
      void utils.admin.getAuditLogs.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const saved = (settings.data ?? {}) as Record<string, string>;
  const value = (key: string, fallback = "") => draft[key] ?? saved[key] ?? fallback;
  const changes = useMemo(() => Object.entries(draft).filter(([key, v]) => (saved[key] ?? "") !== v), [draft, saved]);
  const set = (key: string, v: string) => setDraft((current) => ({ ...current, [key]: v }));

  if (settings.isLoading) return <Loading />;
  if (!settings.data) return <LoadError message="ماقدرناش نجيب الإعدادات." onRetry={() => settings.refetch()} />;

  const cap = value("ai_daily_cost_cap_usd", "50");

  return (
    <div>
      <PageHeader
        title="التشغيل"
        description="وقّف ميزة عن كل الناس لو فيها مشكلة، وحط سقف لتكلفة الذكاء، وأجبر الناس على التحديث. كل تغيير بيتسجل باسمك تحت."
      />

      <section className="rounded-xl border bg-background p-4">
        <h2 className="font-bold">ميزات الذكاء</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">لو ميزة فيها مشكلة أو بتصرف كتير، وقّفها من هنا من غير ما تستنى نسخة جديدة.</p>
        <ul className="mt-3 divide-y">
          {SWITCHES.map(([key, label, hint]) => {
            const on = value(key, "false") !== "true";
            return (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{label}</div>
                  {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <span className={on ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>{on ? "شغالة" : "موقوفة"}</span>
                  <Switch checked={on} aria-label={label} onCheckedChange={(checked) => set(key, String(!checked))} />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border bg-background p-4">
        <h2 className="font-bold">سقف تكلفة الذكاء في اليوم</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Label htmlFor="cap" className="sr-only">السقف بالدولار</Label>
          <span className="text-sm">$</span>
          <Input id="cap" dir="ltr" inputMode="decimal" className="w-32" value={cap} onChange={(e) => set("ai_daily_cost_cap_usd", e.target.value.replace(/[^\d.]/g, ""))} />
          <span className="text-sm text-muted-foreground">
            {Number(cap) > 0 ? `لما تكلفة كل الناس توصل $${cap} في اليوم، الذكاء بيقف لحد نص الليل بتوقيت القاهرة، والتسجيل اليدوي بيفضل شغال.` : "صفر يعني من غير سقف، وده خطر لو حصل استخدام غلط."}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded-xl border bg-background p-4">
        <h2 className="font-bold">تطبيقات الموبايل</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {FIELDS.map(([key, label, placeholder, hint]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} dir="ltr" placeholder={placeholder} value={value(key)} onChange={(e) => set(key, e.target.value.trim())} />
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border bg-background p-4">
        <h2 className="font-bold">سجل الرقابة</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">آخر 30 حاجة الأدمنز غيروها، باسم كل واحد.</p>
        {audit.isLoading ? (
          <Loading />
        ) : !audit.data ? (
          <LoadError message="ماقدرناش نجيب السجل." onRetry={() => audit.refetch()} />
        ) : audit.data.logs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">لسه محدش غيّر حاجة.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {audit.data.logs.map((log: { id: number; action: string; adminName?: string; targetType: string | null; targetId: string | null; createdAt: string | Date }) => (
              <li key={log.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <b>{log.adminName || "أدمن"}</b> {ACTION[log.action] ?? log.action}
                  {log.targetId && log.targetType !== "system_settings" ? <span className="text-muted-foreground"> ({log.targetId})</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{dayTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SaveBar
        changes={changes.length}
        busy={save.isPending}
        onSave={() => save.mutate(Object.fromEntries(changes))}
        onDiscard={() => setDraft({})}
      />
    </div>
  );
}
