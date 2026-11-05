import { useState } from "react";
import { CATEGORIES } from "@contracts/categories";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { trpc } from "@admin/lib/trpc";
import { DECISION, PARSED_BY } from "../ui/ai-words";
import { word } from "../ui/words";

const categoryName = (categoryId?: string, subId?: string) => {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const sub = category?.subcategories.find((item) => item.id === subId);
  return [category?.name_ar ?? categoryId, sub?.name_ar ?? subId].filter(Boolean).join(" / ");
};

/** How classification is doing against the period before: what saved itself, what the person had to fix, what asked. */
export function Quality({ days }: { days: number }) {
  const quality = trpc.admin.getClassificationQuality.useQuery({ days: Math.max(1, days) });
  if (!quality.data) return null;
  const { current, previous } = quality.data;
  const rows: { label: string; hint: string; now: number; before: number; goodWhenUp: boolean; unit: string }[] = [
    { label: "اتحفظت لوحدها", hint: "من غير ما الشخص يراجع", now: current.autoSaveRate, before: previous.autoSaveRate, goodWhenUp: true, unit: "%" },
    { label: "الغلط الساكت", hint: "اتحفظت لوحدها والشخص رجع غيّرها", now: current.silentMistakeRate, before: previous.silentMistakeRate, goodWhenUp: false, unit: "%" },
    { label: "محتاجة مراجعة", hint: "الشخص أكّدها قبل الحفظ", now: current.reviewRate, before: previous.reviewRate, goodWhenUp: false, unit: "%" },
    { label: "سألت سؤال", hint: "مين أو فئة إيه", now: current.clarifyRate, before: previous.clarifyRate, goodWhenUp: false, unit: "%" },
    { label: "رجعت للذكاء الاصطناعي", hint: "القاموس والقواعد ماكفوش", now: current.modelShare, before: previous.modelShare, goodWhenUp: false, unit: "%" },
    { label: "الوقت", hint: "متوسط الجملة", now: current.avgTimeMs, before: previous.avgTimeMs, goodWhenUp: false, unit: " مللي" },
  ];
  return (
    <section className="mb-4 rounded-xl border p-4">
      <h2 className="font-bold">الجودة في آخر {days} يوم ({current.total.toLocaleString("ar-EG")} جملة) مقارنة باللي قبلها</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {rows.map((row) => {
          const delta = row.now - row.before;
          const better = delta === 0 ? null : (delta > 0) === row.goodWhenUp;
          return (
            <div key={row.label} className="rounded-lg bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground" title={row.hint}>{row.label}</dt>
              <dd className="text-lg font-bold">{row.now}{row.unit}</dd>
              {previous.total > 0 && delta !== 0 && (
                <dd className={`text-xs ${better ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{delta > 0 ? "+" : ""}{Math.round(delta * 10) / 10}{row.unit} عن قبلها</dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

type Item = { description?: string; amount?: number; category?: string; subCategory?: string; type?: string; confidence?: number };

/**
 * Types a sentence through the same pipeline the app uses, as the signed-in admin, without saving anything and
 * without leaving a question behind. Its line in the list below is the admin's own.
 */
export function TrySentence() {
  const [text, setText] = useState("");
  const parse = trpc.ai.parseExpense.useMutation();
  const result = parse.data;
  return (
    <section className="mb-4 rounded-xl border p-4">
      <h2 className="font-bold">جرّب جملة</h2>
      <p className="text-xs text-muted-foreground">بتعدّي على نفس طريق التطبيق بالظبط، بحسابك إنت، ومابتتحفظش في دفترك.</p>
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) parse.mutate({ text: text.trim(), skipClarification: true }); }}>
        <Input className="min-w-64 flex-1" placeholder="اشتريت عيش ب 20 وركبت أوبر ب 85" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" disabled={!text.trim() || parse.isPending}>{parse.isPending ? "بيفهم…" : "افهمها"}</Button>
      </form>
      {parse.error && <p className="mt-2 text-sm text-red-700">{parse.error.message}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{word(DECISION, result.decision)} · {word(PARSED_BY, result.parsedBy)} · {Math.round(result.overallConfidence ?? 0)}% متأكد · {result.processingTimeMs ?? "—"} مللي</p>
          {(result.items as Item[]).length === 0 ? <p className="text-sm text-muted-foreground">مالقاش أي عملية في الجملة.</p> : (
            <ul className="divide-y rounded-md border text-sm">
              {(result.items as Item[]).map((item, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2 p-2">
                  <span>{item.description || "—"} · {categoryName(item.category, item.subCategory)}</span>
                  <span className="font-semibold" dir="ltr">{item.type === "income" ? "+" : "−"}{Number(item.amount ?? 0).toLocaleString("en-US")} ج.م</span>
                </li>
              ))}
            </ul>
          )}
          {result.clarificationQuestion && <p className="text-sm text-amber-700 dark:text-amber-400">كان هيسأل: {result.clarificationQuestion}</p>}
        </div>
      )}
    </section>
  );
}
