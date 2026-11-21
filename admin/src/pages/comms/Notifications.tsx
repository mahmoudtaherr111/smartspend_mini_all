import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@admin/kit/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@admin/kit/dialog";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { Textarea } from "@admin/kit/textarea";
import { trpc } from "@admin/lib/trpc";
import { Confirm } from "../../ui/Confirm";
import { LoadError, Loading } from "../../ui/states";
import { cairoInputToIso, cairoInputValue, dayTime, PLAN } from "../../ui/words";

/** The automatic notifications the server sends on an event, with the values each text may use. */
const EVENTS: Record<string, { label: string; when: string; vars: string[] }> = {
  budget_near_limit: { label: "ميزانية قربت تخلص", when: "لما الصرف يوصل لنسبة من ميزانية فئة.", vars: ["budgetTitle", "spent", "limit", "percentage"] },
  budget_category_exceeded: { label: "ميزانية فئة عدّت", when: "لما الصرف يعدّي ميزانية فئة.", vars: ["budgetTitle", "spent", "limit", "percentage"] },
  budget_exceeded: { label: "الصرف عدّى الدخل", when: "لما صرف الشهر يعدّي الدخل المسجّل.", vars: ["totalSpent", "budgetLimit"] },
  subscription_ending: { label: "الاشتراك بيخلص", when: "قبل ما الاشتراك المدفوع يخلص.", vars: ["planName", "daysLeft"] },
  inactivity_reminder: { label: "تذكير بالتسجيل", when: "لمستخدم ماسجلش النهارده.", vars: [] },
  pro_conversion_streak: { label: "أيام متتالية", when: "لمستخدم مجاني بيسجل أيام ورا بعض.", vars: ["currentStreak"] },
  dormant_reactivation: { label: "رجوع بعد غياب", when: "لمستخدم بقاله أسبوع ماسجلش.", vars: [] },
  coach_reminder: { label: "تذكير المدرب", when: "بعد مكالمة مع سمارت المدرب.", vars: [] },
  manual_scheduled: { label: "إشعار مجدول", when: "في المعاد اللي حددته، للناس اللي اخترتهم.", vars: [] },
};

type Template = { id: number; name: string; eventType: string; titleTemplateAr: string | null; bodyTemplateAr: string | null; titleTemplateEn: string | null; bodyTemplateEn: string | null; isActive: boolean | null; targetSegment: unknown; sendAt: string | Date | null };
type Segment = { plan?: string; device?: string; minUsage?: number };
type Form = { id?: number; name: string; eventType: string; titleAr: string; bodyAr: string; titleEn: string; bodyEn: string; sendAt: string; plan: string; device: string; minUsage: string };

const segmentOf = (value: unknown): Segment => {
  let parsed = value;
  while (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  return parsed && typeof parsed === "object" ? (parsed as Segment) : {};
};


/** A push as the phone shows it, so the admin sees the words before anyone else does. */
function Preview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-3 text-white shadow" dir="rtl">
      <div className="text-xs text-white/60">SmartSpend · دلوقتي</div>
      <div className="mt-1 font-semibold">{title || "العنوان"}</div>
      <div className="text-sm text-white/90">{body || "نص الإشعار"}</div>
    </div>
  );
}

function SendNow() {
  const stats = trpc.admin.getNotificationStats.useQuery();
  const [target, setTarget] = useState<"all" | "free" | "pro" | "ultra" | "specific">("all");
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState<{ id: number; type: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const people = trpc.adminConsole.searchPeople.useQuery({ query: search.trim() }, { enabled: target === "specific" && search.trim().length >= 2 });
  const send = trpc.admin.sendInstantNotification.useMutation({
    onSuccess: (result) => { toast.success(`اتبعت لـ ${result.sentCount} جهاز`); setConfirming(false); setTitle(""); setBody(""); },
    onError: (error) => toast.error(error.message),
  });
  const ready = title.trim() && body.trim() && (target !== "specific" || person);
  const audience = target === "specific" ? person?.name : target === "all" ? "كل الناس" : `باقة ${PLAN[target]}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3 rounded-xl border p-4">
        <div className="space-y-1.5">
          <Label>لمين</Label>
          <div className="flex flex-wrap gap-2">
            {(["all", "free", "pro", "ultra", "specific"] as const).map((value) => (
              <Button key={value} size="sm" variant={target === value ? "default" : "outline"} onClick={() => setTarget(value)}>
                {value === "all" ? "كل الناس" : value === "specific" ? "شخص واحد" : PLAN[value]}
              </Button>
            ))}
          </div>
        </div>
        {target === "specific" && (
          <div className="space-y-1.5">
            <Input placeholder="دوّر بالاسم أو الرقم أو الإيميل" value={search} onChange={(e) => { setSearch(e.target.value); setPerson(null); }} />
            {person ? <p className="text-sm">هيوصل لـ <b>{person.name}</b></p> : (
              <ul className="divide-y rounded-md border text-sm">
                {(people.data ?? []).slice(0, 6).map((row) => (
                  <li key={`${row.type}:${row.id}`}><button className="w-full p-2 text-start hover:bg-muted" onClick={() => setPerson({ id: row.id, type: row.type, name: row.name || "من غير اسم" })}>{row.name || "من غير اسم"} <span className="text-xs text-muted-foreground">{row.contact}</span></button></li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="space-y-1.5"><Label htmlFor="n-title">العنوان</Label><Input id="n-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="n-body">النص</Label><Textarea id="n-body" maxLength={240} rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">بيوصل للموبايلات اللي سمحت بالإشعارات: {stats.data ? `${stats.data.android} أندرويد و${stats.data.ios} آيفون` : "…"}، وبيفتح صفحة الإشعارات في التطبيق.</p>
        <Button disabled={!ready} onClick={() => setConfirming(true)}>ابعت</Button>
      </section>
      <div className="space-y-2">
        <div className="text-sm font-semibold">هيظهر كده</div>
        <Preview title={title} body={body} />
      </div>
      <Confirm open={confirming} onOpenChange={setConfirming} title="ابعت الإشعار" confirmLabel="ابعت" busy={send.isPending}
        onConfirm={() => send.mutate({ targetType: target, title: title.trim(), body: body.trim(), ...(target === "specific" && person ? { targetUserId: person.id, targetUserType: person.type } : {}) })}>
        <p>«{title}» هيتبعت دلوقتي لـ {audience}. الإشعار اللي اتبعت مايرجعش.</p>
      </Confirm>
    </div>
  );
}

function TemplateDialog({ form, onClose }: { form: Form | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Form | null>(form);
  const [lastForm, setLastForm] = useState<Form | null>(form);
  if (form !== lastForm) { setLastForm(form); setDraft(form); }
  const done = () => { toast.success("اتحفظ"); void utils.admin.getNotificationTemplates.invalidate(); onClose(); };
  const create = trpc.admin.createNotificationTemplate.useMutation({ onSuccess: done, onError: (error) => toast.error(error.message) });
  const update = trpc.admin.updateNotificationTemplate.useMutation({ onSuccess: done, onError: (error) => toast.error(error.message) });
  if (!draft) return null;
  const set = (patch: Partial<Form>) => setDraft({ ...draft, ...patch });
  const scheduled = draft.eventType === "manual_scheduled";
  const event = EVENTS[draft.eventType];
  const segment = scheduled ? { plan: draft.plan || "all", ...(draft.device ? { device: draft.device } : {}), ...(Number(draft.minUsage) > 0 ? { minUsage: Number(draft.minUsage) } : {}) } : undefined;
  const ready = draft.name.trim() && draft.titleAr.trim() && draft.bodyAr.trim() && (!scheduled || draft.sendAt);
  const save = () => {
    const sendAt = scheduled && draft.sendAt ? cairoInputToIso(draft.sendAt) : undefined;
    if (draft.id) update.mutate({ id: draft.id, name: draft.name.trim(), titleTemplateAr: draft.titleAr.trim(), bodyTemplateAr: draft.bodyAr.trim(), titleTemplateEn: draft.titleEn.trim() || undefined, bodyTemplateEn: draft.bodyEn.trim() || undefined, ...(segment ? { targetSegment: segment } : {}), ...(sendAt ? { sendAt } : {}) });
    else create.mutate({ name: draft.name.trim(), eventType: draft.eventType, titleTemplate: draft.titleAr.trim(), bodyTemplate: draft.bodyAr.trim(), titleTemplateAr: draft.titleAr.trim(), bodyTemplateAr: draft.bodyAr.trim(), titleTemplateEn: draft.titleEn.trim() || undefined, bodyTemplateEn: draft.bodyEn.trim() || undefined, ...(segment ? { targetSegment: segment } : {}), ...(sendAt ? { sendAt } : {}) });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-start">
        <DialogHeader className="text-start"><DialogTitle>{draft.id ? "تعديل" : "إشعار مجدول جديد"} · {event?.label ?? draft.eventType}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {event && <p className="text-sm text-muted-foreground">{event.when}</p>}
          <div className="space-y-1.5"><Label htmlFor="t-name">اسمه هنا</Label><Input id="t-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-title">العنوان</Label><Input id="t-title" value={draft.titleAr} onChange={(e) => set({ titleAr: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-body">النص</Label><Textarea id="t-body" rows={3} value={draft.bodyAr} onChange={(e) => set({ bodyAr: e.target.value })} /></div>
          {event && event.vars.length > 0 && <p className="text-xs text-muted-foreground">تقدر تكتب: <span dir="ltr">{event.vars.map((name) => `{{${name}}}`).join("  ")}</span>، وكل واحدة بتتبدل بقيمتها للمستخدم.</p>}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">النسخة الإنجليزي (لو لغة الموبايل إنجليزي)</summary>
            <div className="mt-2 space-y-2" dir="ltr">
              <Input placeholder="Title" value={draft.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
              <Textarea placeholder="Body" rows={2} value={draft.bodyEn} onChange={(e) => set({ bodyEn: e.target.value })} />
            </div>
          </details>
          {scheduled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="t-at">يتبعت إمتى (بتوقيت القاهرة)</Label><Input id="t-at" type="datetime-local" value={draft.sendAt} onChange={(e) => set({ sendAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="t-plan">لأنهي باقة</Label>
                <select id="t-plan" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.plan} onChange={(e) => set({ plan: e.target.value })}>
                  <option value="all">كل الباقات</option><option value="free">{PLAN.free}</option><option value="pro">{PLAN.pro}</option><option value="ultra">{PLAN.ultra}</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="t-device">لأنهي موبايل</Label>
                <select id="t-device" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.device} onChange={(e) => set({ device: e.target.value })}>
                  <option value="">الاتنين</option><option value="android">أندرويد</option><option value="ios">آيفون</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="t-usage">سجّل على الأقل</Label><Input id="t-usage" dir="ltr" inputMode="numeric" value={draft.minUsage} onChange={(e) => set({ minUsage: e.target.value.replace(/\D/g, "") })} /><p className="text-xs text-muted-foreground">عدد عمليات. فاضي = أي حد.</p></div>
            </div>
          )}
          <Preview title={draft.titleAr} body={draft.bodyAr} />
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button disabled={!ready || create.isPending || update.isPending} onClick={save}>احفظ</Button>
          <Button variant="outline" onClick={onClose}>رجوع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Templates({ scheduled }: { scheduled: boolean }) {
  const utils = trpc.useUtils();
  const list = trpc.admin.getNotificationTemplates.useQuery();
  const [editing, setEditing] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<Template | null>(null);
  const toggle = trpc.admin.toggleNotificationTemplate.useMutation({ onSuccess: () => void utils.admin.getNotificationTemplates.invalidate(), onError: (error) => toast.error(error.message) });
  const remove = trpc.admin.deleteNotificationTemplate.useMutation({ onSuccess: () => { toast.success("اتشال"); setRemoving(null); void utils.admin.getNotificationTemplates.invalidate(); }, onError: (error) => toast.error(error.message) });
  if (list.isLoading) return <Loading />;
  if (!list.data) return <LoadError message="ماقدرناش نجيب الإشعارات." onRetry={() => list.refetch()} />;
  const rows = (list.data as Template[]).filter((row) => (row.eventType === "manual_scheduled") === scheduled);
  const formOf = (row: Template): Form => {
    const segment = segmentOf(row.targetSegment);
    return { id: row.id, name: row.name, eventType: row.eventType, titleAr: row.titleTemplateAr ?? "", bodyAr: row.bodyTemplateAr ?? "", titleEn: row.titleTemplateEn ?? "", bodyEn: row.bodyTemplateEn ?? "", sendAt: cairoInputValue(row.sendAt), plan: segment.plan ?? "all", device: segment.device ?? "", minUsage: segment.minUsage ? String(segment.minUsage) : "" };
  };

  return (
    <div className="space-y-3">
      {scheduled && <Button size="sm" onClick={() => setEditing({ name: "", eventType: "manual_scheduled", titleAr: "", bodyAr: "", titleEn: "", bodyEn: "", sendAt: "", plan: "all", device: "", minUsage: "" })}>إشعار مجدول جديد</Button>}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{scheduled ? "مفيش إشعارات مجدولة." : "مفيش قوالب. السيرفر بيضيف القوالب الأساسية أول ما يشتغل."}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{EVENTS[row.eventType]?.label ?? row.name} {scheduled && <span className="text-xs font-normal text-muted-foreground">· {row.name}</span>}</div>
                <div className="text-sm">{row.titleTemplateAr}</div>
                <div className="text-sm text-muted-foreground">{row.bodyTemplateAr}</div>
                {scheduled ? <div className="text-xs text-muted-foreground">{row.sendAt ? `يتبعت ${dayTime(row.sendAt)}` : "من غير معاد"} · {segmentOf(row.targetSegment).plan && segmentOf(row.targetSegment).plan !== "all" ? `باقة ${PLAN[segmentOf(row.targetSegment).plan!] ?? segmentOf(row.targetSegment).plan}` : "كل الباقات"}</div>
                  : <div className="text-xs text-muted-foreground">{EVENTS[row.eventType]?.when}</div>}
              </div>
              <Switch checked={!!row.isActive} aria-label={`تشغيل ${row.name}`} onCheckedChange={(isActive) => toggle.mutate({ id: row.id, isActive })} />
              <Button size="sm" variant="outline" onClick={() => setEditing(formOf(row))}>عدّل</Button>
              {scheduled && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemoving(row)}>شيل</Button>}
            </li>
          ))}
        </ul>
      )}
      <TemplateDialog form={editing} onClose={() => setEditing(null)} />
      <Confirm open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="شيل الإشعار المجدول" confirmLabel="شيل" danger busy={remove.isPending} onConfirm={() => removing && remove.mutate({ id: removing.id })}>
        <p>«{removing?.name}» مش هيتبعت.</p>
      </Confirm>
    </div>
  );
}

function SentLog() {
  const logs = trpc.admin.getNotificationLogs.useQuery();
  if (logs.isLoading) return <Loading />;
  if (!logs.data) return <LoadError message="ماقدرناش نجيب السجل." onRetry={() => logs.refetch()} />;
  return logs.data.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لسه مفيش إشعارات اتبعتت.</p> : (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40"><th className="p-3 text-start">إمتى</th><th className="p-3 text-start">لمين</th><th className="p-3 text-start">من</th><th className="p-3 text-start">الحالة</th></tr></thead>
        <tbody className="divide-y">
          {logs.data.map((row) => (
            <tr key={row.id}>
              <td className="p-3">{dayTime(row.sentAt)}</td>
              <td className="p-3">{row.userId ? <Link className="underline" to={`/people/${row.userType}/${row.userId}`}>صفحته</Link> : "—"}</td>
              <td className="p-3">{row.templateId ? "إشعار تلقائي أو مجدول" : "إرسال من اللوحة"} · {row.sentVia === "whatsapp" ? "واتساب" : row.sentVia === "in_app" ? "جوه التطبيق" : "إشعار"}</td>
              <td className="p-3">{row.status === "failed" ? <span className="text-red-700">ماوصلش</span> : "اتبعت"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { id: "send", label: "ابعت دلوقتي" },
  { id: "auto", label: "التلقائية" },
  { id: "scheduled", label: "المجدولة" },
  { id: "log", label: "اللي اتبعت" },
] as const;

/** Push notifications: send one now, the texts of the automatic ones, the scheduled ones, and the last 100 sent. */
export function Notifications() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("send");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "secondary" : "ghost"} onClick={() => setOpen(tab.id)}>{tab.label}</Button>)}
      </div>
      {open === "send" && <SendNow />}
      {open === "auto" && <Templates scheduled={false} />}
      {open === "scheduled" && <Templates scheduled />}
      {open === "log" && <SentLog />}
    </div>
  );
}
