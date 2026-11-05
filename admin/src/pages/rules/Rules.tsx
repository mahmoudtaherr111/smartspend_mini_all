import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CATEGORIES } from "@contracts/categories";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { trpc } from "@admin/lib/trpc";
import { Confirm } from "../../ui/Confirm";
import { LoadError, Loading, PageHeader } from "../../ui/states";
import { dayTime } from "../../ui/words";

const categoryName = (categoryId: string, subId?: string | null) => {
  const category = CATEGORIES.find((item) => item.id === categoryId || item.name_ar === categoryId);
  const sub = category?.subcategories.find((item) => item.id === subId || item.name_ar === subId);
  return [category?.name_ar ?? categoryId, sub?.name_ar ?? subId].filter(Boolean).join(" / ");
};

const PAGE = 50;

/** Words people taught the app: "this word means this category", one per person. Removing one makes the app ask again. */
function Learned() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<{ id: number; word: string } | null>(null);
  const rules = trpc.admin.getLearnedRules.useQuery({ page, limit: PAGE });
  const remove = trpc.admin.deleteLearnedRule.useMutation({
    onSuccess: () => { toast.success("اتشالت"); setRemoving(null); void utils.admin.getLearnedRules.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const rows = useMemo(() => {
    const q = search.trim();
    return (rules.data?.rules ?? []).filter((row) => !q || row.word.includes(q) || row.userName.includes(q) || categoryName(row.category, row.subCategory).includes(q));
  }, [rules.data, search]);
  if (rules.isLoading) return <Loading />;
  if (!rules.data) return <LoadError message="ماقدرناش نجيب القاموس." onRetry={() => rules.refetch()} />;
  const pages = Math.max(1, Math.ceil(Number(rules.data.total) / PAGE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="دوّر في الصفحة دي" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-sm text-muted-foreground">{Number(rules.data.total).toLocaleString("ar-EG")} كلمة اتعلمها التطبيق من الناس</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">مفيش كلمات هنا.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40"><th className="p-3 text-start">الكلمة</th><th className="p-3 text-start">بقت</th><th className="p-3 text-start">علّمها</th><th className="p-3 text-start">إمتى</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3 font-semibold">{row.word}</td>
                  <td className="p-3">{categoryName(row.category, row.subCategory)}</td>
                  <td className="p-3"><Link className="underline" to={`/people/${row.userType}/${row.userId}`}>{row.userName}</Link></td>
                  <td className="p-3 text-muted-foreground">{dayTime(row.createdAt)}</td>
                  <td className="p-3 text-end"><Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemoving({ id: row.id, word: row.word })}>شيل</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>الأحدث</Button>
          <span className="text-sm">صفحة {page} من {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>الأقدم</Button>
        </div>
      )}
      <Confirm open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="شيل الكلمة" confirmLabel="شيل" danger busy={remove.isPending}
        onConfirm={() => removing && remove.mutate({ id: removing.id })}>
        <p>«{removing?.word}» هتتشال من قاموس الشخص ده بس. المرة الجاية اللي يكتبها، التطبيق هيصنّفها من الأول أو يسأله.</p>
      </Confirm>
    </div>
  );
}

const STATUS: Record<string, string> = { pending: "مستني", resolved: "اتحل", ignored: "اتساب" };

/** Questions the app asked someone about a sentence it could not finish (who, or which category). */
function Questions() {
  const utils = trpc.useUtils();
  const [showAll, setShowAll] = useState(false);
  const list = trpc.admin.getPendingClarifications.useQuery();
  const resolve = trpc.admin.resolveClarification.useMutation({
    onSuccess: () => void utils.admin.getPendingClarifications.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  if (list.isLoading) return <Loading />;
  if (!list.data) return <LoadError message="ماقدرناش نجيب الأسئلة." onRetry={() => list.refetch()} />;
  const rows = list.data.filter((row) => showAll || row.status === "pending");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={showAll ? "outline" : "default"} onClick={() => setShowAll(false)}>المستنية ({list.data.filter((row) => row.status === "pending").length})</Button>
        <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(true)}>الكل</Button>
        <span className="text-sm text-muted-foreground">المستخدم بيجاوب من التطبيق. من هنا تقفل سؤال قديم محدش هيجاوبه.</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">مفيش أسئلة مستنية.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{row.question}</div>
                <div className="text-sm text-muted-foreground">الجملة: «{row.originalText}»</div>
                <div className="text-xs text-muted-foreground">
                  <Link className="underline" to={`/people/${row.userType}/${row.userId}`}>صاحبها</Link> · {dayTime(row.createdAt)} · {STATUS[row.status] ?? row.status}
                </div>
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: row.id, status: "resolved" })}>اتحل</Button>
                  <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: row.id, status: "ignored" })}>سيبه</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = [
  { id: "learned", label: "اللي التطبيق اتعلمه" },
  { id: "questions", label: "أسئلة للمستخدمين" },
] as const;

export function Rules() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("learned");
  return (
    <div>
      <PageHeader title="القاموس والأسئلة" description="الكلمات اللي الناس علّموها للتطبيق، والأسئلة اللي التطبيق سألها لما ماقدرش يكمّل جملة." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => (
          <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "default" : "outline"} onClick={() => setOpen(tab.id)}>{tab.label}</Button>
        ))}
      </div>
      {open === "learned" ? <Learned /> : <Questions />}
    </div>
  );
}
