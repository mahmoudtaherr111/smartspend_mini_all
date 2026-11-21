import { useState } from "react";
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
import { day } from "../../ui/words";

const PLATFORM: Record<string, string> = { all: "أندرويد وآيفون", android: "أندرويد", ios: "آيفون", web: "الموقع (مركون)" };
type Ad = { id: number; title: string; content: string; imageUrl: string | null; linkUrl: string | null; targetPlan: string | null; platformTarget: string; frequencyCapPerDay: number; startDate: string | Date | null; endDate: string | Date | null; clicks: number | null; impressions: number | null; isActive: boolean | null };
type Form = { id?: number; title: string; content: string; imageUrl: string; linkUrl: string; targetPlan: "free" | "all"; platformTarget: "all" | "android" | "ios"; frequencyCapPerDay: string; startDate: string; endDate: string };
const EMPTY: Form = { title: "", content: "", imageUrl: "", linkUrl: "", targetPlan: "free", platformTarget: "all", frequencyCapPerDay: "0", startDate: "", endDate: "" };
const isUrl = (value: string) => !value || /^https:\/\/[^\s]+$/i.test(value);

/** The sponsored card in the app: campaigns, who sees them, and how many saw and pressed each. */
export function Ads() {
  const utils = trpc.useUtils();
  const stats = trpc.ads.stats.useQuery();
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<Ad | null>(null);
  const refresh = () => void utils.ads.stats.invalidate();
  const failed = (error: { message: string }) => toast.error(error.message);
  const create = trpc.ads.create.useMutation({ onSuccess: () => { toast.success("الحملة اتضافت"); setForm(null); refresh(); }, onError: failed });
  const update = trpc.ads.update.useMutation({ onSuccess: () => { toast.success("اتحفظ"); setForm(null); refresh(); }, onError: failed });
  const remove = trpc.ads.delete.useMutation({ onSuccess: () => { toast.success("اتشالت"); setRemoving(null); refresh(); }, onError: failed });
  if (stats.isLoading) return <Loading />;
  if (!stats.data) return <LoadError message="ماقدرناش نجيب الإعلانات." onRetry={() => stats.refetch()} />;
  const ads = stats.data.ads as Ad[];
  const ready = form && form.title.trim() && form.content.trim() && isUrl(form.imageUrl) && isUrl(form.linkUrl);

  const save = () => {
    if (!form) return;
    const common = { title: form.title.trim(), content: form.content.trim(), imageUrl: form.imageUrl.trim() || undefined, linkUrl: form.linkUrl.trim() || undefined, platformTarget: form.platformTarget, frequencyCapPerDay: Number(form.frequencyCapPerDay || 0) };
    if (form.id) update.mutate({ id: form.id, ...common });
    else create.mutate({ ...common, targetPlan: form.targetPlan, ...(form.startDate ? { startDate: form.startDate } : {}), ...(form.endDate ? { endDate: form.endDate } : {}) });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setForm(EMPTY)}>حملة جديدة</Button>
        <span className="text-sm text-muted-foreground">كل الحملات: {Number(stats.data.totalImpressions ?? 0).toLocaleString("ar-EG")} مشاهدة و{Number(stats.data.totalClicks ?? 0).toLocaleString("ar-EG")} ضغطة.</span>
      </div>
      {ads.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">مفيش حملات. الكارت مابيظهرش في التطبيق من غير حملة شغالة.</p> : (
        <ul className="divide-y rounded-xl border">
          {ads.map((ad) => {
            const views = Number(ad.impressions ?? 0);
            const clicks = Number(ad.clicks ?? 0);
            return (
              <li key={ad.id} className="flex flex-wrap items-start gap-3 p-3">
                {ad.imageUrl && <img src={ad.imageUrl} alt="" className="size-14 rounded-md object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{ad.title}</div>
                  <div className="text-sm text-muted-foreground">{ad.content}</div>
                  <div className="text-xs text-muted-foreground">
                    {ad.targetPlan === "all" ? "لكل الباقات" : "للمجانية بس"} · {PLATFORM[ad.platformTarget] ?? ad.platformTarget}
                    {ad.frequencyCapPerDay > 0 ? ` · ${ad.frequencyCapPerDay} مرة في اليوم بالكتير` : ""}
                    {ad.startDate || ad.endDate ? ` · من ${day(ad.startDate)} لـ ${day(ad.endDate)}` : ""}
                    {` · ${views.toLocaleString("ar-EG")} مشاهدة · ${clicks.toLocaleString("ar-EG")} ضغطة${views ? ` (${((clicks / views) * 100).toFixed(1)}%)` : ""}`}
                  </div>
                </div>
                <Switch checked={!!ad.isActive} aria-label={`تشغيل ${ad.title}`} onCheckedChange={(isActive) => update.mutate({ id: ad.id, isActive })} />
                <Button size="sm" variant="outline" onClick={() => setForm({ id: ad.id, title: ad.title, content: ad.content, imageUrl: ad.imageUrl ?? "", linkUrl: ad.linkUrl ?? "", targetPlan: ad.targetPlan === "all" ? "all" : "free", platformTarget: ad.platformTarget === "android" || ad.platformTarget === "ios" ? ad.platformTarget : "all", frequencyCapPerDay: String(ad.frequencyCapPerDay), startDate: "", endDate: "" })}>عدّل</Button>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemoving(ad)}>شيل</Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-start">
          <DialogHeader className="text-start"><DialogTitle>{form?.id ? "تعديل حملة" : "حملة جديدة"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="ad-title">العنوان</Label><Input id="ad-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ad-text">النص</Label><Textarea id="ad-text" rows={2} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ad-img">رابط الصورة</Label><Input id="ad-img" dir="ltr" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ad-link">بيفتح إيه لما يضغط</Label><Input id="ad-link" dir="ltr" placeholder="https://…" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
                {(!isUrl(form.imageUrl) || !isUrl(form.linkUrl)) && <p className="text-xs text-red-700">الروابط لازم تبدأ بـ https://</p>}</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="ad-platform">موبايل</Label>
                  <select id="ad-platform" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.platformTarget} onChange={(e) => setForm({ ...form, platformTarget: e.target.value as Form["platformTarget"] })}>
                    <option value="all">الاتنين</option><option value="android">أندرويد</option><option value="ios">آيفون</option>
                  </select></div>
                <div className="space-y-1.5"><Label htmlFor="ad-plan">لمين</Label>
                  <select id="ad-plan" disabled={!!form.id} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.targetPlan} onChange={(e) => setForm({ ...form, targetPlan: e.target.value as Form["targetPlan"] })}>
                    <option value="free">المجانية بس</option><option value="all">كل الباقات</option>
                  </select></div>
                <div className="space-y-1.5"><Label htmlFor="ad-cap">مرات في اليوم</Label><Input id="ad-cap" dir="ltr" inputMode="numeric" value={form.frequencyCapPerDay} onChange={(e) => setForm({ ...form, frequencyCapPerDay: e.target.value.replace(/\D/g, "") })} /><p className="text-xs text-muted-foreground">0 = من غير حد.</p></div>
              </div>
              {!form.id && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="ad-start">تبدأ</Label><Input id="ad-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="ad-end">تخلص</Label><Input id="ad-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
                </div>
              )}
              {form.id && <p className="text-xs text-muted-foreground">الباقة والمواعيد بتتحدد لما الحملة تتعمل. عشان تغيّرها، اعمل حملة جديدة.</p>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button disabled={!ready || create.isPending || update.isPending} onClick={save}>احفظ</Button>
            <Button variant="outline" onClick={() => setForm(null)}>رجوع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirm open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="شيل الحملة" confirmLabel="شيل" danger busy={remove.isPending} onConfirm={() => removing && remove.mutate({ id: removing.id })}>
        <p>«{removing?.title}» هتتشال مع أرقام مشاهداتها وضغطاتها. لو عايز توقفها بس، اقفل المفتاح.</p>
      </Confirm>
    </div>
  );
}
