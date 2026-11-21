import { cloneElement, useId, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, RefreshCw, RotateCcw, Search, Tv } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../api/router";
import { CATEGORIES } from "@contracts/categories";
import {
  CAPTURE_SOURCE_KINDS,
  CAPTURE_SOURCE_KIND_LABELS,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_CYCLE_LABELS,
  type CaptureSourceKind,
  type SubscriptionCycle,
} from "@contracts/capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AdminCaptureNumbers } from "./AdminCaptureNumbers";

type Catalog = inferRouterOutputs<AppRouter>["captureAdmin"]["catalog"];
type Source = Catalog["sources"][number];
type Subscription = Catalog["subscriptions"][number];

/** One value per line in a text box, as the server stores a list. */
const toLines = (values: string[]) => values.join("\n");
const fromLines = (text: string) =>
  text
    .split(/[\n،,]/)
    .map((value) => value.trim())
    .filter(Boolean);

const cardClass = "border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm";

/**
 * Bank messages in the admin console: the sources whose notifications are read, the subscriptions recognised in card
 * charges (both the capture catalog, `captureAdmin.*`), and the numbers of what capture did with the bulk undo.
 */
export function AdminCaptureTab() {
  return (
    <Tabs defaultValue="sources" dir="rtl" className="space-y-4">
      <TabsList>
        <TabsTrigger value="sources">البنوك والمحافظ</TabsTrigger>
        <TabsTrigger value="subscriptions">الاشتراكات المعروفة</TabsTrigger>
        <TabsTrigger value="numbers">الأرقام</TabsTrigger>
      </TabsList>
      <TabsContent value="sources">
        <SourcesPanel />
      </TabsContent>
      <TabsContent value="subscriptions">
        <SubscriptionsPanel />
      </TabsContent>
      <TabsContent value="numbers">
        <AdminCaptureNumbers />
      </TabsContent>
    </Tabs>
  );
}

function useCatalogMutations() {
  const utils = trpc.useUtils();
  const done = (message: string) => () => {
    toast.success(message);
    void utils.captureAdmin.catalog.invalidate();
  };
  const failed = (error: { message: string }) => toast.error(error.message);
  return {
    syncSeed: trpc.captureAdmin.syncSeed.useMutation({
      onSuccess: (result) => {
        toast.success(`اتضاف ${result.inserted} واتحدّث ${result.updated}`);
        void utils.captureAdmin.catalog.invalidate();
      },
      onError: failed,
    }),
    saveSource: trpc.captureAdmin.saveSource.useMutation({ onSuccess: done("اتحفظ المصدر"), onError: failed }),
    setSourceStatus: trpc.captureAdmin.setSourceStatus.useMutation({ onSuccess: done("اتغيّرت الحالة"), onError: failed }),
    saveSubscription: trpc.captureAdmin.saveSubscription.useMutation({ onSuccess: done("اتحفظ الاشتراك"), onError: failed }),
    setSubscriptionStatus: trpc.captureAdmin.setSubscriptionStatus.useMutation({ onSuccess: done("اتغيّرت الحالة"), onError: failed }),
    restoreSeed: trpc.captureAdmin.restoreSeed.useMutation({ onSuccess: done("رجع زي النسخة الأصلية"), onError: failed }),
  };
}

function OriginBadge({ origin, edited }: { origin: "seed" | "admin"; edited: boolean }) {
  if (origin === "admin") return <Badge variant="secondary">من الأدمن</Badge>;
  return edited ? <Badge variant="outline">أصلي ومتعدّل</Badge> : <Badge variant="outline">أصلي</Badge>;
}

// ─── Sources ───

interface SourceForm {
  id?: number;
  slug: string;
  kind: CaptureSourceKind;
  nameAr: string;
  nameEn: string;
  countries: string;
  androidPackages: string;
  senderIds: string;
  aliases: string;
  notes: string;
  priority: string;
  active: boolean;
}

const emptySource: SourceForm = {
  slug: "",
  kind: "bank",
  nameAr: "",
  nameEn: "",
  countries: "EG",
  androidPackages: "",
  senderIds: "",
  aliases: "",
  notes: "",
  priority: "100",
  active: true,
};

function SourcesPanel() {
  const { data, isLoading } = trpc.captureAdmin.catalog.useQuery();
  const actions = useCatalogMutations();
  const [kind, setKind] = useState<"all" | CaptureSourceKind>("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<SourceForm | null>(null);

  const sources = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return (data?.sources ?? []).filter(
      (source) =>
        (kind === "all" || source.kind === kind) &&
        (!wanted || [source.slug, source.nameAr, source.nameEn, ...source.androidPackages].some((value) => value.toLowerCase().includes(wanted))),
    );
  }, [data, kind, query]);

  const edit = (source: Source) =>
    setForm({
      id: source.id,
      slug: source.slug,
      kind: source.kind,
      nameAr: source.nameAr,
      nameEn: source.nameEn,
      countries: source.countries.join(", "),
      androidPackages: toLines(source.androidPackages),
      senderIds: toLines(source.senderIds),
      aliases: toLines(source.aliases),
      notes: source.notes ?? "",
      priority: String(source.priority),
      active: source.status === "active",
    });

  const save = () => {
    if (!form) return;
    actions.saveSource.mutate(
      {
        id: form.id,
        item: {
          slug: form.slug.trim(),
          kind: form.kind,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          countries: fromLines(form.countries).map((code) => code.toUpperCase()),
          androidPackages: fromLines(form.androidPackages),
          senderIds: fromLines(form.senderIds),
          aliases: fromLines(form.aliases),
          notes: form.notes.trim() ? form.notes : null,
          priority: Number(form.priority) || 0,
          status: form.active ? "active" : "disabled",
        },
      },
      { onSuccess: () => setForm(null) },
    );
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">بنحمّل المصادر…</div>;

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-violet-700 dark:text-violet-400">
            <Building2 className="h-5 w-5" />
            البنوك والمحافظ اللي بنقرا رسايلها
          </CardTitle>
          <CardDescription dir="rtl">
            التطبيقات وأسماء الراسل اللي هنا بس هي اللي الموبايلات بتقرا إشعاراتها. أي تعديل بيوصل كل السيرفرات في ثواني،
            والموبايلات في أول مرة تسأل. حط اسم تطبيق أو راسل بس لما تتأكد منه.
          </CardDescription>
          <p className="mt-2 font-mono text-xs text-slate-400">النسخة: {data?.version}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1 rounded-xl" disabled={actions.syncSeed.isPending} onClick={() => actions.syncSeed.mutate()}>
            <RefreshCw className="h-4 w-4" /> حمّل البيانات الأصلية
          </Button>
          <Button className="gap-1 rounded-xl" onClick={() => setForm({ ...emptySource })}>
            <Plus className="h-4 w-4" /> مصدر جديد
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute end-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر بالاسم أو اسم التطبيق" className="pe-9" />
          </div>
          <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع ({data?.sources.length ?? 0})</SelectItem>
              {CAPTURE_SOURCE_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {CAPTURE_SOURCE_KIND_LABELS[value]} ({data?.sources.filter((source) => source.kind === value).length ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="p-3 text-start font-medium">الاسم</th>
                <th className="p-3 text-start font-medium">النوع</th>
                <th className="p-3 text-start font-medium">تطبيقات أندرويد</th>
                <th className="p-3 text-start font-medium">أسماء الراسل</th>
                <th className="p-3 text-start font-medium">شغّال</th>
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className="p-3">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{source.nameAr}</div>
                    <div className="text-xs text-slate-500">
                      {source.nameEn} · <span className="font-mono">{source.slug}</span>
                    </div>
                    <div className="mt-1">
                      <OriginBadge origin={source.origin} edited={Boolean(source.adminEditedAt)} />
                    </div>
                  </td>
                  <td className="p-3">{CAPTURE_SOURCE_KIND_LABELS[source.kind]}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {source.androidPackages.length ? source.androidPackages.map((pkg) => <div key={pkg}>{pkg}</div>) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {source.senderIds.length ? source.senderIds.join(", ") : <span className="text-slate-400">لسه مش مؤكد</span>}
                  </td>
                  <td className="p-3">
                    <Switch
                      checked={source.status === "active"}
                      onCheckedChange={(checked) => actions.setSourceStatus.mutate({ id: source.id, status: checked ? "active" : "disabled" })}
                      aria-label={`شغّال: ${source.nameAr}`}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => edit(source)} aria-label={`عدّل ${source.nameAr}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {source.origin === "seed" && source.adminEditedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => actions.restoreSeed.mutate({ table: "source", id: source.id })}
                          aria-label={`رجّع ${source.nameAr} زي الأصلي`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    مفيش مصادر. دوس «حمّل البيانات الأصلية» عشان تتحط البنوك والمحافظ المعروفة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل مصدر" : "مصدر جديد"}</DialogTitle>
            <DialogDescription>كل سطر في الخانات الطويلة قيمة واحدة.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <Field label="الاسم المختصر (إنجليزي صغير)">
                <Input dir="ltr" value={form.slug} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
              </Field>
              <Field label="النوع">
                <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value as CaptureSourceKind })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPTURE_SOURCE_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CAPTURE_SOURCE_KIND_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الاسم بالعربي">
                <Input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} />
              </Field>
              <Field label="الاسم بالإنجليزي">
                <Input dir="ltr" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
              </Field>
              <Field label="تطبيقات أندرويد (من Google Play)">
                <Textarea dir="ltr" rows={3} value={form.androidPackages} onChange={(event) => setForm({ ...form, androidPackages: event.target.value })} />
              </Field>
              <Field label="أسماء الراسل في الـ SMS (من رسالة حقيقية)">
                <Textarea dir="ltr" rows={2} value={form.senderIds} onChange={(event) => setForm({ ...form, senderIds: event.target.value })} />
              </Field>
              <Field label="أسماؤه جوه نص الرسالة">
                <Textarea rows={2} value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} />
              </Field>
              <Field label="الدول (مثال: EG)">
                <Input dir="ltr" value={form.countries} onChange={(event) => setForm({ ...form, countries: event.target.value })} />
              </Field>
              <Field label="ملاحظات">
                <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
              <div className="flex items-center justify-between gap-4">
                <Field label="الترتيب (الأصغر الأول)">
                  <Input dir="ltr" type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
                  شغّال
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={actions.saveSource.isPending}>
              احفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Subscriptions ───

const SPENDING_CATEGORIES = CATEGORIES.filter((category) => category.type === "expense");

interface SubscriptionForm {
  id?: number;
  slug: string;
  name: string;
  nameAr: string;
  kind: "service" | "store";
  matchTokens: string;
  categoryId: string;
  subCategoryId: string;
  cycle: SubscriptionCycle;
  active: boolean;
}

const emptySubscription: SubscriptionForm = {
  slug: "",
  name: "",
  nameAr: "",
  kind: "service",
  matchTokens: "",
  categoryId: "subscriptions",
  subCategoryId: "streaming",
  cycle: "monthly",
  active: true,
};

const categoryLabel = (categoryId: string, subCategoryId: string) => {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const sub = category?.subcategories.find((item) => item.id === subCategoryId);
  return category ? `${category.name_ar} / ${sub?.name_ar ?? subCategoryId}` : `${categoryId} / ${subCategoryId}`;
};

function SubscriptionsPanel() {
  const { data, isLoading } = trpc.captureAdmin.catalog.useQuery();
  const actions = useCatalogMutations();
  const [form, setForm] = useState<SubscriptionForm | null>(null);

  const edit = (item: Subscription) =>
    setForm({
      id: item.id,
      slug: item.slug,
      name: item.name,
      nameAr: item.nameAr,
      kind: item.kind,
      matchTokens: toLines(item.matchTokens),
      categoryId: item.categoryId,
      subCategoryId: item.subCategoryId,
      cycle: item.cycle,
      active: item.status === "active",
    });

  const save = () => {
    if (!form) return;
    actions.saveSubscription.mutate(
      {
        id: form.id,
        item: {
          slug: form.slug.trim(),
          name: form.name,
          nameAr: form.nameAr,
          kind: form.kind,
          matchTokens: fromLines(form.matchTokens),
          categoryId: form.categoryId,
          subCategoryId: form.subCategoryId,
          cycle: form.cycle,
          status: form.active ? "active" : "disabled",
        },
      },
      { onSuccess: () => setForm(null) },
    );
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">بنحمّل الاشتراكات…</div>;
  const subcategories = SPENDING_CATEGORIES.find((category) => category.id === form?.categoryId)?.subcategories ?? [];

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-violet-700 dark:text-violet-400">
            <Tv className="h-5 w-5" />
            الاشتراكات اللي بنعرفها من خصم الكارت
          </CardTitle>
          <CardDescription dir="rtl">
            الكلمات اللي بتظهر في اسم التاجر في رسالة البنك (زي NETFLIX.COM أو OPENAI *CHATGPT SUBSCR). الأطول هو اللي
            بيكسب، فـ «GOOGLE *GOOGLE» بيبقى يوتيوب مش جوجل بلاي.
          </CardDescription>
        </div>
        <Button className="gap-1 rounded-xl" onClick={() => setForm({ ...emptySubscription })}>
          <Plus className="h-4 w-4" /> اشتراك جديد
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="p-3 text-start font-medium">الخدمة</th>
              <th className="p-3 text-start font-medium">الكلمات في كشف البنك</th>
              <th className="p-3 text-start font-medium">التصنيف</th>
              <th className="p-3 text-start font-medium">كل قد إيه</th>
              <th className="p-3 text-start font-medium">شغّال</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.subscriptions ?? []).map((item) => (
              <tr key={item.id}>
                <td className="p-3">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {item.nameAr} <span className="text-xs font-normal text-slate-500">({item.name})</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <OriginBadge origin={item.origin} edited={Boolean(item.adminEditedAt)} />
                    {item.kind === "store" && <Badge variant="secondary">متجر تطبيقات</Badge>}
                  </div>
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">
                  {item.matchTokens.join(" · ")}
                </td>
                <td className="p-3">{categoryLabel(item.categoryId, item.subCategoryId)}</td>
                <td className="p-3">{SUBSCRIPTION_CYCLE_LABELS[item.cycle]}</td>
                <td className="p-3">
                  <Switch
                    checked={item.status === "active"}
                    onCheckedChange={(checked) => actions.setSubscriptionStatus.mutate({ id: item.id, status: checked ? "active" : "disabled" })}
                    aria-label={`شغّال: ${item.nameAr}`}
                  />
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(item)} aria-label={`عدّل ${item.nameAr}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {item.origin === "seed" && item.adminEditedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => actions.restoreSeed.mutate({ table: "subscription", id: item.id })}
                        aria-label={`رجّع ${item.nameAr} زي الأصلي`}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(data?.subscriptions.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  مفيش اشتراكات. «حمّل البيانات الأصلية» في تبويب البنوك والمحافظ بيحطها.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "تعديل اشتراك" : "اشتراك جديد"}</DialogTitle>
            <DialogDescription>كل سطر في الكلمات قيمة واحدة، وبتتقارن من غير حروف كبيرة وصغيرة.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <Field label="الاسم المختصر (إنجليزي صغير)">
                <Input dir="ltr" value={form.slug} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
              </Field>
              <Field label="الاسم">
                <Input dir="ltr" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="الاسم بالعربي">
                <Input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} />
              </Field>
              <Field label="النوع">
                <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value as SubscriptionForm["kind"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">خدمة</SelectItem>
                    <SelectItem value="store">متجر تطبيقات (بيحاسب عن غيره)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="الكلمات في كشف البنك">
                <Textarea dir="ltr" rows={3} value={form.matchTokens} onChange={(event) => setForm({ ...form, matchTokens: event.target.value })} />
              </Field>
              <Field label="التصنيف">
                <Select
                  value={form.categoryId}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      categoryId: value,
                      subCategoryId: SPENDING_CATEGORIES.find((category) => category.id === value)?.subcategories[0]?.id ?? "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPENDING_CATEGORIES.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="التصنيف الفرعي">
                <Select value={form.subCategoryId} onValueChange={(value) => setForm({ ...form, subCategoryId: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between gap-4">
                <Field label="بيتجدد كل قد إيه">
                  <Select value={form.cycle} onValueChange={(value) => setForm({ ...form, cycle: value as SubscriptionCycle })}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBSCRIPTION_CYCLES.map((cycle) => (
                        <SelectItem key={cycle} value={cycle}>
                          {SUBSCRIPTION_CYCLE_LABELS[cycle]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
                  شغّال
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setForm(null)}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={actions.saveSubscription.isPending}>
              احفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** A label tied to its control, so a screen reader names the field. */
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-300">
        {label}
      </Label>
      {cloneElement(children, { id })}
    </div>
  );
}
