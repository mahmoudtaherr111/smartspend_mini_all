import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CATEGORIES } from "@contracts/categories";
import { SUBSCRIPTION_CYCLE_LABELS, type SubscriptionCycle } from "@contracts/capture";
import { Button } from "@admin/kit/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@admin/kit/dialog";
import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading } from "../../ui/states";
import { Field } from "./Sources";

const SPENDING = CATEGORIES.filter((category) => category.type === "expense");
interface Form { id?: number; slug: string; name: string; nameAr: string; kind: "service" | "store"; matchTokens: string; categoryId: string; subCategoryId: string; cycle: SubscriptionCycle; status: "active" | "disabled" }
const EMPTY: Form = { slug: "", name: "", nameAr: "", kind: "service", matchTokens: "", categoryId: "subscriptions", subCategoryId: "streaming", cycle: "monthly", status: "active" };
const label = (categoryId: string, subId: string) => {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  return `${category?.name_ar ?? categoryId} / ${category?.subcategories.find((sub) => sub.id === subId)?.name_ar ?? subId}`;
};

/** Subscriptions recognised from a card charge's merchant name, and where each is filed before the model is asked. */
export function Subscriptions() {
  const utils = trpc.useUtils();
  const catalog = trpc.captureAdmin.catalog.useQuery();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const save = trpc.captureAdmin.saveSubscription.useMutation({
    onSuccess: () => { toast.success("اتحفظ"); setForm(null); void utils.captureAdmin.catalog.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const status = trpc.captureAdmin.setSubscriptionStatus.useMutation({ onSuccess: () => void utils.captureAdmin.catalog.invalidate(), onError: (e) => toast.error(e.message) });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog.data?.subscriptions ?? []).filter((row) => !q || [row.name, row.nameAr, ...row.matchTokens].some((v) => v.toLowerCase().includes(q)));
  }, [catalog.data, search]);
  if (catalog.isLoading) return <Loading />;
  if (!catalog.data) return <LoadError message="ماقدرناش نجيب الاشتراكات." onRetry={() => catalog.refetch()} />;
  const subs = SPENDING.find((category) => category.id === form?.categoryId)?.subcategories ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="دوّر" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button size="sm" onClick={() => setForm(EMPTY)}>ضيف اشتراك</Button>
        <span className="text-xs text-muted-foreground">لما اسم التاجر في الخصم فيه كلمة من دول، العملية بتتسجل في فئتها على طول.</span>
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{row.nameAr} <span className="text-xs font-normal text-muted-foreground" dir="ltr">{row.name}</span></div>
              <div className="text-xs text-muted-foreground">{label(row.categoryId, row.subCategoryId)} · {SUBSCRIPTION_CYCLE_LABELS[row.cycle]} · <span dir="ltr">{row.matchTokens.join(", ")}</span></div>
            </div>
            <Switch checked={row.status === "active"} aria-label={`تشغيل ${row.nameAr}`} onCheckedChange={(on) => status.mutate({ id: row.id, status: on ? "active" : "disabled" })} />
            <Button size="sm" variant="outline" onClick={() => setForm({ id: row.id, slug: row.slug, name: row.name, nameAr: row.nameAr, kind: row.kind, matchTokens: row.matchTokens.join(", "),
              categoryId: row.categoryId, subCategoryId: row.subCategoryId, cycle: row.cycle, status: row.status })}>عدّل</Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-start">
          <DialogHeader><DialogTitle>{form?.id ? "تعديل اشتراك" : "اشتراك جديد"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم بالعربي"><Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
                <Field label="الاسم بالإنجليزي"><Input dir="ltr" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="الاسم المختصر"><Input dir="ltr" value={form.slug} disabled={!!form.id} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
                <Field label="بيتجدد">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as SubscriptionCycle })}>
                    {Object.entries(SUBSCRIPTION_CYCLE_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </Field>
                <Field label="الفئة">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value, subCategoryId: SPENDING.find((c) => c.id === e.target.value)?.subcategories[0]?.id ?? "" })}>
                    {SPENDING.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
                  </select>
                </Field>
                <Field label="الفئة الفرعية">
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.subCategoryId} onChange={(e) => setForm({ ...form, subCategoryId: e.target.value })}>
                    {subs.map((sub) => <option key={sub.id} value={sub.id}>{sub.name_ar}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="كلمات بتظهر في اسم التاجر" hint="زي netflix أو google *youtube، مفصولة بفاصلة.">
                <Input dir="ltr" value={form.matchTokens} onChange={(e) => setForm({ ...form, matchTokens: e.target.value })} />
              </Field>
              <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate({ id: form.id, item: {
                slug: form.slug.trim(), name: form.name.trim(), nameAr: form.nameAr.trim(), kind: form.kind,
                matchTokens: form.matchTokens.split(/[,،]/).map((v) => v.trim().toLowerCase()).filter(Boolean),
                categoryId: form.categoryId, subCategoryId: form.subCategoryId, cycle: form.cycle, status: form.status,
              } })}>احفظ</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
