import { useState } from "react";
import { Moon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SEASONS = [
  { id: "ramadan", label: "رمضان" },
  { id: "eid_fitr", label: "عيد الفطر" },
  { id: "eid_adha", label: "عيد الأضحى" },
  { id: "school", label: "المدارس" },
  { id: "summer", label: "الصيف" },
] as const;

type SeasonId = (typeof SEASONS)[number]["id"];

const egp = (value: number) => `${Math.round(value).toLocaleString("ar-EG")} ج`;

/**
 * "رمضان كلفني كام": what the last Ramadan, Eid, school start or summer cost, by category,
 * next to the same season a year earlier. Seasons are dates, not categories, so ياميش
 * رمضان stays in أكل وشرب and still counts here.
 */
export function SeasonsPanel() {
  const [season, setSeason] = useState<SeasonId>("ramadan");
  const query = trpc.expense.getSeasonSpending.useQuery({ season }, { staleTime: 5 * 60_000 });
  const data = query.data;
  const categories = Array.isArray(data?.byCategory) ? data.byCategory : [];
  const previous = data?.previous?.total ?? 0;
  const change = data && previous > 0 ? Math.round(((data.total - previous) / previous) * 100) : null;

  return (
    <Card id="seasons">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Moon className="h-5 w-5 text-amber-600" />
          المواسم كلفتك كام
        </CardTitle>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="المواسم">
          {SEASONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={season === item.id}
              onClick={() => setSeason(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                season === item.id ? "border-amber-500 bg-amber-50 font-bold dark:bg-amber-950/40" : "text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">بنحسب...</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">مفيش بيانات للموسم ده لسه.</p>
        ) : (
          <>
            <p className="text-sm">
              {data.label} ({data.startDay} → {data.endDay}):{" "}
              <span className="font-bold">{egp(data.total)}</span>
            </p>
            {change !== null && (
              <p className={cn("text-xs", change > 0 ? "text-rose-600" : "text-emerald-600")}>
                {change > 0 ? `أكتر من السنة اللي فاتت بـ ${change}%` : change < 0 ? `أقل من السنة اللي فاتت بـ ${Math.abs(change)}%` : "زي السنة اللي فاتت"}
                {" "}({egp(previous)})
              </p>
            )}
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">ماسجلتش مصاريف في الفترة دي.</p>
            ) : (
              categories.slice(0, 5).map((row) => (
                <div key={row.category} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
                  <span>{row.category}</span>
                  <span className="font-medium">{egp(row.amount)}</span>
                </div>
              ))
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
