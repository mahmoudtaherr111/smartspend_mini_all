import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const cardClass = "border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm";

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/**
 * What capture did, per bank and kind, and the tools to stop a mistake (decision 0032): the numbers of the last days
 * (`captureAdmin.funnel`), the banks stopped from recording on their own, the model's queue, and the bulk undo of one
 * bank's recordings in a period (`captureAdmin.bulkUndo`).
 */
export function AdminCaptureNumbers() {
  const [days, setDays] = useState(7);
  const funnel = trpc.captureAdmin.funnel.useQuery({ days });
  const data = funnel.data;

  return (
    <div className="space-y-4">
      <Card className={cardClass}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>اللي حصل في العمليات</CardTitle>
            <CardDescription>
              كل عملية اتلقطت من رسايل البنوك وحصلها إيه، لكل بنك ونوع. الرسايل اللي السيرفر رماها (أكواد وإعلانات) مش متعدودة هنا.
            </CardDescription>
          </div>
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="w-36" aria-label="الفترة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">آخر يوم</SelectItem>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {data && data.paused.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>بنوك واقفة عن التسجيل لوحدها:</span>
              {data.paused.map((slug) => (
                <Badge key={slug} variant="destructive" className="font-mono">
                  {slug}
                </Badge>
              ))}
              <span className="text-xs text-slate-500">بتتشال من قسم التسجيل من رسايل البنك في الإعدادات.</span>
            </div>
          )}
          {funnel.isLoading ? (
            <p className="text-sm text-slate-500">بنحمّل الأرقام...</p>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-sm text-slate-500">مفيش عمليات في الفترة دي.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-end">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="p-2 text-start">البنك</th>
                    <th className="p-2 text-start">النوع</th>
                    <th className="p-2">اتسجلت</th>
                    <th className="p-2">مستنية</th>
                    <th className="p-2">محفوظة</th>
                    <th className="p-2">مش مصروف</th>
                    <th className="p-2">اتمسحت</th>
                    <th className="p-2">لوحدها</th>
                    <th className="p-2">اترجع فيها</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.sourceSlug}:${row.kind}`} className="border-b last:border-0">
                      <td className="p-2 text-start font-mono">{row.sourceSlug ?? "—"}</td>
                      <td className="p-2 text-start font-mono">{row.kind}</td>
                      <td className="p-2">{row.recorded}</td>
                      <td className="p-2">{row.review}</td>
                      <td className="p-2">{row.held}</td>
                      <td className="p-2">{row.dismissed}</td>
                      <td className="p-2">{row.deleted}</td>
                      <td className="p-2">{row.auto}</td>
                      <td className={`p-2 ${row.auto > 0 && row.autoUndone / row.auto > 0.05 ? "text-rose-600 font-bold" : ""}`}>
                        {row.autoUndone} ({percent(row.autoUndone, row.auto)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader>
          <CardTitle>قراية الذكاء الاصطناعي</CardTitle>
          <CardDescription>الرسايل اللي القارئ ماكانش متأكد منها، والمستخدم وافق إن الموديل يقراها.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!data || data.model.length === 0 ? (
            <p className="text-slate-500">مفيش رسايل راحت للموديل في الفترة دي.</p>
          ) : (
            <ul className="space-y-1">
              {data.model.map((row) => (
                <li key={`${row.status}:${row.outcome}`} className="flex justify-between gap-4">
                  <span className="font-mono">{row.outcome ?? row.status}</span>
                  <span>{row.jobs}</span>
                </li>
              ))}
            </ul>
          )}
          {data?.oldestWaitingAt && (
            <p className="text-amber-600">أقدم رسالة مستنية من {new Date(data.oldestWaitingAt).toLocaleString("ar-EG")}.</p>
          )}
        </CardContent>
      </Card>

      <BulkUndoCard />
      <TimelineCard />
    </div>
  );
}

/** "local:12" or "oauth:7" as the timeline's input, or null. */
const ownerOf = (text: string) => {
  const match = /^(local|oauth):(\d+)$/.exec(text.trim().toLowerCase());
  return match ? { userType: match[1] as "local" | "oauth", userId: Number(match[2]) } : null;
};

const when = (value: string | Date | null | undefined) => (value ? new Date(value).toLocaleString("ar-EG") : "—");

/** One user's capture for support: phones and their health, consents, use, and the latest payments and model jobs. */
function TimelineCard() {
  const [text, setText] = useState("");
  const owner = ownerOf(text);
  const timeline = trpc.captureAdmin.timeline.useQuery(owner ?? { userType: "local", userId: 1 }, { enabled: owner !== null });
  const data = owner ? timeline.data : undefined;
  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle>تتبّع مستخدم</CardTitle>
        <CardDescription>موبايلاته وحالتها، وموافقاته، واستهلاكه، وآخر عملياته وقراية الذكاء الاصطناعي. من غير أي نص رسالة.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="timeline-user">المستخدم (local:12 أو oauth:7)</Label>
          <Input id="timeline-user" dir="ltr" className="font-mono" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {data && (
          <div className="space-y-3">
            <div>
              <p className="font-bold">الموبايلات</p>
              {data.devices.length === 0 ? (
                <p className="text-slate-500">مفيش.</p>
              ) : (
                <ul className="space-y-1">
                  {data.devices.map((device) => {
                    const health = device.health as { access?: boolean; waiting?: number } | null;
                    return (
                      <li key={device.id} className="font-mono">
                        #{device.id} {device.platform} {device.appVersion ?? ""} · آخر تقرير {when(device.lastHeartbeatAt)} · صلاحية{" "}
                        {health?.access === false ? "مقفولة" : health?.access ? "شغالة" : "—"} · مستني {health?.waiting ?? "—"}
                        {device.revokedAt ? " · موقوف" : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="font-bold">الموافقات</p>
              <ul>
                {data.consents.map((consent) => (
                  <li key={`${consent.scope}:${String(consent.grantedAt)}`} className="font-mono">
                    {consent.scope} {consent.textVersion} · {when(consent.grantedAt)}
                    {consent.revokedAt ? ` · اترجع فيها ${when(consent.revokedAt)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-bold">آخر العمليات</p>
              <ul className="max-h-64 overflow-y-auto">
                {data.events.map((event) => (
                  <li key={event.id} className="font-mono">
                    {when(event.createdAt)} · {event.status} · {event.kind} · {event.sourceSlug ?? "—"} · {event.readerVersion ?? ""}
                    {event.autoRecorded ? " · لوحدها" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-bold">قراية الذكاء الاصطناعي</p>
              <ul>
                {data.jobs.map((job) => (
                  <li key={job.id} className="font-mono">
                    {when(job.createdAt)} · {job.status} · {job.outcome ?? "—"} · {job.attempts} محاولة
                  </li>
                ))}
              </ul>
            </div>
            <p>كروت وجمل بيتجاهلها: {data.ignored}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A `datetime-local` value as an ISO instant, or null when the box is empty or invalid. */
const isoOf = (local: string) => {
  const date = new Date(local);
  return local && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

function BulkUndoCard() {
  const utils = trpc.useUtils();
  const [sourceSlug, setSourceSlug] = useState("");
  const [readerVersion, setReaderVersion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyAuto, setOnlyAuto] = useState(true);
  const [preview, setPreview] = useState<{ rows: number; users: number; max: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bulkUndo = trpc.captureAdmin.bulkUndo.useMutation({ onError: (error) => toast.error(error.message) });

  const input = () => {
    const fromIso = isoOf(from);
    const toIso = isoOf(to);
    if (!sourceSlug.trim() || !fromIso || !toIso) return null;
    return { sourceSlug: sourceSlug.trim(), readerVersion: readerVersion.trim() || undefined, from: fromIso, to: toIso, onlyAuto };
  };

  const count = () => {
    const ready = input();
    if (!ready) return toast.error("اكتب البنك وبداية الفترة ونهايتها.");
    bulkUndo.mutate({ ...ready, apply: false }, { onSuccess: (result) => setPreview(result) });
  };

  const apply = () => {
    const ready = input();
    if (!ready) return;
    bulkUndo.mutate(
      { ...ready, apply: true },
      {
        onSuccess: (result) => {
          toast.success(`اتشال ${result.removed} صف من دفاتر المستخدمين`);
          setConfirming(false);
          setPreview(null);
          void utils.captureAdmin.funnel.invalidate();
        },
      },
    );
  };

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle>إلغاء جماعي</CardTitle>
        <CardDescription>
          لو بنك اتقرت رسايله غلط في فترة، بتشيل الصفوف اللي اتسجلت منها من دفاتر المستخدمين، والحد الشهري بيرجعلهم. احسب العدد الأول.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bulk-source">البنك (الـ slug)</Label>
          <Input id="bulk-source" dir="ltr" className="font-mono" value={sourceSlug} onChange={(e) => (setSourceSlug(e.target.value), setPreview(null))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bulk-version">نسخة القارئ (اختياري)</Label>
          <Input id="bulk-version" dir="ltr" className="font-mono" placeholder="reader-v1" value={readerVersion} onChange={(e) => (setReaderVersion(e.target.value), setPreview(null))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bulk-from">من</Label>
          <Input id="bulk-from" type="datetime-local" value={from} onChange={(e) => (setFrom(e.target.value), setPreview(null))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bulk-to">لحد</Label>
          <Input id="bulk-to" type="datetime-local" value={to} onChange={(e) => (setTo(e.target.value), setPreview(null))} />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Switch id="bulk-auto" checked={onlyAuto} onCheckedChange={(checked) => (setOnlyAuto(checked), setPreview(null))} />
          <Label htmlFor="bulk-auto">اللي اتسجل لوحده بس (من غير اللي المستخدم أكّده)</Label>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button variant="outline" onClick={count} disabled={bulkUndo.isPending}>
            احسب
          </Button>
          {preview && (
            <>
              <span className="text-sm">
                {preview.rows} صف عند {preview.users} مستخدم
                {preview.rows > preview.max ? `، وهيتشال ${preview.max} في المرة` : ""}.
              </span>
              <Button variant="destructive" disabled={preview.rows === 0 || bulkUndo.isPending} onClick={() => setConfirming(true)}>
                شيل الصفوف دي
              </Button>
            </>
          )}
        </div>
      </CardContent>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تشيل {preview?.rows ?? 0} صف؟</DialogTitle>
            <DialogDescription>بيتشالوا من دفاتر المستخدمين ومش بيرجعوا. الرسايل المتأخرة عن نفس العمليات مش هترجّعهم.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              رجوع
            </Button>
            <Button variant="destructive" onClick={apply} disabled={bulkUndo.isPending}>
              أيوه، شيلهم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
