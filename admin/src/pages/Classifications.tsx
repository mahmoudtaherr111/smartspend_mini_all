import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { DECISION, INPUT, MATCH, PARSED_BY, confidenceWords } from "../ui/ai-words";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { count, dayTime, money, word } from "../ui/words";

const FILTERS = [
  { by: "all", label: "الكل" },
  { by: "unsure", label: "اللي التطبيق ما كانش متأكد منه" },
  { by: "corrected", label: "اللي الناس صححوه" },
  { by: "model", label: "اللي الموديل قرره" },
  { by: "rules", label: "اللي القواعد قررته" },
] as const;

const toneClass = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-700 dark:text-red-400",
};

/** Each sentence people recorded and how the app read it, with the reason for every category in plain words. */
export function Classifications() {
  const [by, setBy] = useState<(typeof FILTERS)[number]["by"]>("all");
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const logs = trpc.adminConsole.classifications.useQuery({ by, days, page });

  return (
    <div>
      <PageHeader
        title="التصنيف وسببه"
        description="كل جملة اتسجلت، والتطبيق فهمها إزاي، وليه اختار الفئة دي، وكان متأكد قد إيه، والشخص صححها ولا لأ."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button key={filter.by} size="sm" variant={by === filter.by ? "default" : "outline"} onClick={() => { setBy(filter.by); setPage(1); }}>
            {filter.label}
          </Button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {[1, 7, 30].map((value) => (
          <Button key={value} size="sm" variant={days === value ? "secondary" : "ghost"} onClick={() => { setDays(value); setPage(1); }}>
            {value === 1 ? "النهارده" : `آخر ${value} يوم`}
          </Button>
        ))}
      </div>

      {logs.isLoading ? (
        <Loading />
      ) : !logs.data ? (
        <LoadError message="ماقدرناش نجيب التصنيفات." onRetry={() => logs.refetch()} />
      ) : logs.data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">مفيش جمل بالفلتر ده في الفترة دي.</p>
      ) : (
        <ul className="space-y-3">
          {logs.data.rows.map((row) => {
            const confidence = confidenceWords(row.confidence ?? 0);
            return (
              <li key={row.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-base font-semibold">«{row.text}»</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{word(PARSED_BY, row.parsedBy)}</Badge>
                    <Badge variant="outline">{word(DECISION, row.decision)}</Badge>
                    {row.corrected && <Badge variant="destructive">الشخص صححها</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.userId && row.userType ? (
                    <Link to={`/people/${row.userType}/${row.userId}`} className="hover:underline">{row.who || "من غير اسم"}</Link>
                  ) : "—"}
                  {" · "}{word(INPUT, row.channel)} · {dayTime(row.createdAt)}
                  {row.tokens ? ` · ${count(row.tokens)} توكن` : ""}
                  {row.timeMs ? ` · ${(row.timeMs / 1000).toFixed(1)} ثانية` : ""}
                  {" · "}<span className={toneClass[confidence.tone]}>{confidence.text}</span>
                </p>
                {row.items.length > 0 && (
                  <ul className="mt-3 divide-y rounded-lg border">
                    {row.items.map((item, index) => (
                      <li key={index} className="p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {item.category}{item.subCategory ? ` ← ${item.subCategory}` : ""}
                            {item.description ? <span className="font-normal text-muted-foreground"> · {item.description}</span> : null}
                          </span>
                          <span className="num font-bold">{money(item.amount)}</span>
                        </div>
                        <div className="mt-1 text-xs">
                          <span className="text-muted-foreground">ليه: </span>
                          {item.matchKind ? word(MATCH, item.matchKind) : "مفيش سبب متسجل"}
                          {item.agreement > 0 && <span className="text-emerald-700 dark:text-emerald-400"> · {item.agreement} طريقة تانية قالت نفس الفئة</span>}
                          {item.disagreement > 0 && <span className="text-amber-700 dark:text-amber-400"> · {item.disagreement} طريقة قالت فئة تانية</span>}
                          {item.categoryIsFallback && <span className="text-amber-700 dark:text-amber-400"> · راحت للفئة العامة</span>}
                        </div>
                        {item.candidates.length > 1 && (
                          <div className="mt-1 text-xs text-muted-foreground">فئات كانت محتملة: {item.candidates.join("، ")}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {row.model && <p className="mt-2 text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{row.model}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {logs.data && (
        <div className="mt-4 flex gap-2">
          {page > 1 && <Button variant="outline" size="sm" onClick={() => setPage(page - 1)}>الأحدث</Button>}
          {logs.data.hasMore && <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>الأقدم</Button>}
        </div>
      )}
    </div>
  );
}
