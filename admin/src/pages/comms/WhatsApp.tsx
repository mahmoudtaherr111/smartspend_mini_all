import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { Textarea } from "@admin/kit/textarea";
import { trpc } from "@admin/lib/trpc";
import { Confirm } from "../../ui/Confirm";
import { LoadError, Loading } from "../../ui/states";
import { dayTime } from "../../ui/words";

const MESSAGE_STATUS: Record<string, string> = { queued: "في الطابور", sending: "بيتبعت", sent: "اتبعت", delivered: "وصل", read: "اتقرا", failed: "ماوصلش" };
const PURPOSE: Record<string, string> = { verification: "كود تحقق", report: "التقرير الشهري", reminder: "تذكير", reply: "رد من اللوحة", marketing: "تسويق" };
const TEMPLATE_STATUS: Record<string, string> = { APPROVED: "Meta وافقت", PENDING: "مستنية موافقة Meta", REJECTED: "Meta رفضت", LOCAL_ONLY: "لسه مااتبعتتش لـ Meta" };
const TEMPLATE_NAME: Record<string, string> = { smartspend_payment_reminder: "تذكير بالدفع", smartspend_verification: "كود التحقق", smartspend_monthly_report: "التقرير الشهري" };

function Status() {
  const status = trpc.adminWhatsapp.getStatus.useQuery();
  if (status.isLoading) return <Loading />;
  if (!status.data) return <LoadError message="ماقدرناش نجيب حالة واتساب." onRetry={() => status.refetch()} />;
  const data = status.data;
  return (
    <section className="rounded-xl border p-4">
      {!data.configured ? (
        <p className="font-semibold text-amber-700 dark:text-amber-400">واتساب مش متوصّل: متغيرات WhatsApp Cloud API مش متحطة على السيرفر، فمفيش رسايل بتتبعت.</p>
      ) : (
        <p className="font-semibold">متوصّل برقم {data.business?.displayPhoneNumber ?? "الخدمة"} {data.business?.verifiedName ? `(${data.business.verifiedName})` : ""}{data.business?.qualityRating ? ` · الجودة عند Meta: ${data.business.qualityRating}` : ""}</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["أرقام مسجّلة", data.consent.total], ["موافقين على التقارير", data.consent.reports], ["قفلوا الرسايل", data.consent.optedOut],
          ["اتبعت النهارده", data.todayMetrics.total], ["وصل", data.todayMetrics.delivered], ["اتقرا", data.todayMetrics.read], ["ماوصلش", data.todayMetrics.failed], ["في الطابور", data.todayMetrics.queued],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-bold">{Number(value).toLocaleString("ar-EG")}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Switches() {
  const utils = trpc.useUtils();
  const settings = trpc.adminWhatsapp.getSettings.useQuery();
  const update = trpc.adminWhatsapp.updateSettings.useMutation({ onSuccess: () => { toast.success("اتحفظ"); void utils.adminWhatsapp.getSettings.invalidate(); }, onError: (error) => toast.error(error.message) });
  if (!settings.data) return null;
  const rows = [
    { key: "otpEnabled" as const, on: settings.data.otpEnabled, label: "كود التحقق على واتساب", hint: "لما حد يعمل حساب برقمه، لازم يكتب الكود اللي وصله واتساب. لو مقفول، الحساب بيتعمل من غير ما نتأكد إن الرقم بتاعه." },
    { key: "reportsEnabled" as const, on: settings.data.reportsEnabled, label: "التقرير الشهري على واتساب", hint: "للباقات اللي الميزة مفتوحة لها، واللي ماقفلوهاش من إعداداتهم." },
    { key: "marketingPaused" as const, on: !settings.data.marketingPaused, label: "رسايل التسويق", hint: "لو اتقفلت، مفيش أي رسالة تسويق بتخرج حتى للي موافقين." },
  ];
  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-bold">التشغيل</h2>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4 py-3">
            <div><div className="text-sm font-semibold">{row.label}</div><div className="text-xs text-muted-foreground">{row.hint}</div></div>
            <Switch checked={row.on} aria-label={row.label} disabled={update.isPending}
              onCheckedChange={(on) => update.mutate(row.key === "marketingPaused" ? { marketingPaused: !on } : { [row.key]: on })} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Templates() {
  const utils = trpc.useUtils();
  const templates = trpc.adminWhatsapp.getTemplates.useQuery();
  const [confirming, setConfirming] = useState(false);
  const sync = trpc.adminWhatsapp.syncTemplates.useMutation({
    onSuccess: (result) => { toast.success(`اتبعت ${result.results.filter((row) => row.status === "SUBMITTED").length} قالب لـ Meta`); setConfirming(false); void utils.adminWhatsapp.getTemplates.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">القوالب</h2>
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>ابعتها لـ Meta تراجعها</Button>
      </div>
      <p className="text-xs text-muted-foreground">واتساب مابيسمحش ببدء رسالة غير بقالب Meta وافقت عليه. القوالب مكتوبة في الكود.</p>
      <ul className="mt-2 divide-y text-sm">
        {(templates.data ?? []).map((row) => (
          <li key={row.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{TEMPLATE_NAME[row.name] ?? row.name} <span className="text-xs text-muted-foreground" dir="ltr">{row.name}</span></span>
            <span className={row.status === "APPROVED" ? "text-emerald-700" : row.status === "REJECTED" ? "text-red-700" : "text-muted-foreground"}>{TEMPLATE_STATUS[row.status] ?? row.status}</span>
          </li>
        ))}
      </ul>
      <Confirm open={confirming} onOpenChange={setConfirming} title="ابعت القوالب لـ Meta" confirmLabel="ابعت" busy={sync.isPending} onConfirm={() => sync.mutate()}>
        <p>كل القوالب هتتبعت لـ Meta تراجعها. المراجعة بتاخد من دقايق لأيام، والقالب اللي اتوافق عليه قبل كده بيفضل زي ما هو.</p>
      </Confirm>
    </section>
  );
}

function Outbox() {
  const [status, setStatus] = useState<"" | "queued" | "sending" | "sent" | "delivered" | "read" | "failed">("");
  const log = trpc.adminWhatsapp.getOutboxLog.useQuery({ limit: 100, ...(status ? { status } : {}) });
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">آخر الرسايل</h2>
        <select aria-label="الحالة" className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">كل الحالات</option>
          {Object.entries(MESSAGE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {log.isLoading ? <Loading /> : !log.data?.length ? <p className="mt-2 text-sm text-muted-foreground">مفيش رسايل.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="p-2 text-start">إمتى</th><th className="p-2 text-start">لـ</th><th className="p-2 text-start">إيه</th><th className="p-2 text-start">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {log.data.map((row) => (
                <tr key={row.id}>
                  <td className="p-2">{dayTime(row.createdAt)}</td>
                  <td className="p-2" dir="ltr">{row.recipient}</td>
                  <td className="p-2">{PURPOSE[row.purpose] ?? row.purpose}</td>
                  <td className="p-2">{MESSAGE_STATUS[row.status] ?? row.status}{row.errorCode ? <span className="text-xs text-red-700"> · كود {row.errorCode}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A reply to someone who wrote to the service number in the last 24 hours, the only free-text message WhatsApp allows. */
function Reply() {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const send = trpc.adminWhatsapp.sendDirectMessage.useMutation({ onSuccess: () => { toast.success("اتبعت"); setText(""); }, onError: (error) => toast.error(error.message) });
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-bold">رد على حد</h2>
      <p className="text-xs text-muted-foreground">بينفع بس لحد بعت لرقم الخدمة في آخر 24 ساعة. بعدها لازم قالب.</p>
      <div className="space-y-1.5"><Label htmlFor="wa-phone">الرقم</Label><Input id="wa-phone" dir="ltr" placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} /></div>
      <div className="space-y-1.5"><Label htmlFor="wa-text">الرسالة</Label><Textarea id="wa-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <Button disabled={phone.length < 8 || !text.trim() || send.isPending} onClick={() => send.mutate({ phone, text: text.trim() })}>ابعت</Button>
    </section>
  );
}

/** The WhatsApp service number: its state, its switches, its templates, what it sent, and a reply box. */
export function WhatsApp() {
  return (
    <div className="space-y-4">
      <Status />
      <div className="grid gap-4 lg:grid-cols-2"><Switches /><Templates /></div>
      <Outbox />
      <Reply />
    </div>
  );
}
