import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@admin/kit/badge";
import { Button } from "@admin/kit/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@admin/kit/dialog";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { Textarea } from "@admin/kit/textarea";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading } from "../../ui/states";

const KINDS = { bank: "بنك", wallet: "محفظة", payment_network: "شبكة دفع", fintech: "تطبيق مالي", telecom: "شركة اتصالات", sms_app: "تطبيق رسايل" } as const;
type Kind = keyof typeof KINDS;
interface SourceForm {
  id?: number; slug: string; kind: Kind; nameAr: string; nameEn: string; androidPackages: string; senderIds: string; aliases: string;
  notes: string; priority: string; status: "active" | "disabled";
}
const list = (value: string) => value.split(/[,\n،]/).map((item) => item.trim()).filter(Boolean);
const EMPTY: SourceForm = { slug: "", kind: "bank", nameAr: "", nameEn: "", androidPackages: "", senderIds: "", aliases: "", notes: "", priority: "100", status: "active" };

/**
 * The banks, wallets and apps capture knows. A message from one nobody listed is still read and recorded; listing it
 * names the bank on the user's line, lets the phone read its app's notifications (its Android package) and lets the
 * admin pause it. A sender id is the name its SMS arrive from ("QNB", "VF-Cash").
 */
export function Sources() {
  const utils = trpc.useUtils();
  const catalog = trpc.captureAdmin.catalog.useQuery();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<SourceForm | null>(null);
  const done = (message: string) => { toast.success(message); setForm(null); void utils.captureAdmin.catalog.invalidate(); };
  const save = trpc.captureAdmin.saveSource.useMutation({ onSuccess: () => done("اتحفظ، والموبايلات بتاخد التغيير في أول مزامنة"), onError: (e) => toast.error(e.message) });
  const status = trpc.captureAdmin.setSourceStatus.useMutation({ onSuccess: () => void utils.captureAdmin.catalog.invalidate(), onError: (e) => toast.error(e.message) });
  const restore = trpc.captureAdmin.restoreSeed.useMutation({ onSuccess: () => done("رجع زي ما اتشحن"), onError: (e) => toast.error(e.message) });
  const sync = trpc.captureAdmin.syncSeed.useMutation({ onSuccess: () => done("القايمة الأصلية اتحمّلت، واللي إنت عدّلته فضل زي ما هو"), onError: (e) => toast.error(e.message) });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog.data?.sources ?? []).filter((row) => !q || [row.slug, row.nameAr, row.nameEn, ...row.senderIds, ...row.androidPackages].some((v) => v.toLowerCase().includes(q)));
  }, [catalog.data, search]);
  if (catalog.isLoading) return <Loading />;
  if (!catalog.data) return <LoadError message="ماقدرناش نجيب القايمة." onRetry={() => catalog.refetch()} />;

  const submit = () => {
    if (!form) return;
    save.mutate({ id: form.id, item: {
      slug: form.slug.trim(), kind: form.kind, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim(), countries: ["EG"],
      androidPackages: list(form.androidPackages), senderIds: list(form.senderIds), aliases: list(form.aliases),
      notes: form.notes.trim() || null, priority: Number(form.priority) || 100, status: form.status,
    } });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="دوّر باسم أو راسل أو تطبيق" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button size="sm" onClick={() => setForm(EMPTY)}>ضيف بنك أو محفظة</Button>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>حمّل القايمة الأصلية</Button>
        <span className="text-xs text-muted-foreground">{catalog.data.sources.length} مصدر</span>
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{row.nameAr}</span>
                <Badge variant="secondary">{KINDS[row.kind as Kind] ?? row.kind}</Badge>
                {row.adminEditedAt && <Badge variant="outline">متعدّل</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                {row.slug}{row.senderIds.length ? ` · SMS: ${row.senderIds.join(", ")}` : ""}{row.androidPackages.length ? ` · ${row.androidPackages.length} app` : ""}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              {row.status === "active" ? "شغال" : "موقوف"}
              <Switch checked={row.status === "active"} aria-label={`تشغيل ${row.nameAr}`} onCheckedChange={(on) => status.mutate({ id: row.id, status: on ? "active" : "disabled" })} />
            </label>
            <Button size="sm" variant="outline" onClick={() => setForm({ id: row.id, slug: row.slug, kind: row.kind as Kind, nameAr: row.nameAr, nameEn: row.nameEn,
              androidPackages: row.androidPackages.join("\n"), senderIds: row.senderIds.join(", "), aliases: row.aliases.join(", "), notes: row.notes ?? "", priority: String(row.priority), status: row.status as SourceForm["status"] })}>عدّل</Button>
            {row.origin === "seed" && row.adminEditedAt && <Button size="sm" variant="ghost" onClick={() => restore.mutate({ id: row.id, table: "source" })}>رجّعه</Button>}
          </li>
        ))}
      </ul>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-start">
          <DialogHeader><DialogTitle>{form?.id ? "تعديل" : "مصدر جديد"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم بالعربي"><Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
                <Field label="الاسم بالإنجليزي"><Input dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
                <Field label="الاسم المختصر (حروف إنجليزي صغيرة)"><Input dir="ltr" value={form.slug} disabled={!!form.id} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
                <Field label="النوع">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                    {Object.entries(KINDS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="أسماء الراسل في الـ SMS" hint="زي QNB أو VF-Cash، مفصولة بفاصلة. من رسالة حقيقية بس.">
                <Input dir="ltr" value={form.senderIds} onChange={(e) => setForm({ ...form, senderIds: e.target.value })} />
              </Field>
              <Field label="تطبيقات أندرويد" hint="اسم الحزمة من Google Play، كل واحد في سطر. إشعاراتها بس هي اللي بتتقري.">
                <Textarea dir="ltr" rows={2} value={form.androidPackages} onChange={(e) => setForm({ ...form, androidPackages: e.target.value })} />
              </Field>
              <Field label="أسماء تانية بيتكتب بيها" hint="بتساعد نعرف البنك من اسم الراسل.">
                <Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
              </Field>
              <Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              <Button className="w-full" disabled={save.isPending} onClick={submit}>احفظ</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
