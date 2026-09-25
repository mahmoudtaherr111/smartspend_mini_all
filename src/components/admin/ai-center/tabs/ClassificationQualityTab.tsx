import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

type Quality = {
  total: number;
  autoSaveRate: number;
  reviewRate: number;
  clarifyRate: number;
  correctionRate: number;
  silentMistakeRate: number;
  modelShare: number;
  avgTimeMs: number;
};

const METRICS: Array<{ key: keyof Quality; label: string; hint: string; unit: string; lowerIsBetter?: boolean }> = [
  { key: "total", label: "جمل اتصنفت", hint: "كل الجمل اللي المحرك قراها", unit: "" },
  { key: "autoSaveRate", label: "اتحفظت لوحدها", hint: "من غير مراجعة ولا سؤال", unit: "%" },
  {
    key: "silentMistakeRate",
    label: "غلط ساكت",
    hint: "من اللي اتحفظ لوحده، المستخدم رجع غيّر فئته",
    unit: "%",
    lowerIsBetter: true,
  },
  { key: "reviewRate", label: "راحت للمراجعة", hint: "المستخدم أكّدها أو عدّلها قبل الحفظ", unit: "%", lowerIsBetter: true },
  { key: "clarifyRate", label: "سؤال", hint: "التطبيق سأل قبل ما يسجل", unit: "%", lowerIsBetter: true },
  { key: "correctionRate", label: "اتعدلت", hint: "أي جملة غيّر المستخدم فئتها", unit: "%", lowerIsBetter: true },
  { key: "modelShare", label: "راحت للـ AI", hint: "المحرك المحلي ماكانش متأكد", unit: "%", lowerIsBetter: true },
  { key: "avgTimeMs", label: "متوسط الوقت", hint: "من الجملة للنتيجة", unit: " ms", lowerIsBetter: true },
];

/**
 * How classification did for real users over a period, beside the period before it. The
 * silent-mistake rate (auto-saved, then changed by the user) is the accuracy number that
 * does not come from the classifier's opinion of itself.
 */
export function ClassificationQualityTab() {
  const [days, setDays] = useState(30);
  const quality = trpc.admin.getClassificationQuality.useQuery({ days });
  const current = quality.data?.current;
  const previous = quality.data?.previous;

  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Gauge className="h-5 w-5 text-emerald-400" />
            جودة التصنيف
          </CardTitle>
          <CardDescription className="text-slate-400">
            آخر {days} يوم، وجنب كل رقم الفترة اللي قبلها.
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === days ? "default" : "outline"}
              onClick={() => setDays(option)}
            >
              {option} يوم
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!current ? (
          <p className="text-sm text-slate-400">{quality.isLoading ? "بنحسب..." : "مفيش بيانات."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {METRICS.map((metric) => {
              const value = current[metric.key];
              const before = previous?.[metric.key] ?? 0;
              const change = Math.round((value - before) * 10) / 10;
              const better = metric.lowerIsBetter ? change < 0 : change > 0;
              return (
                <div key={metric.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">{metric.label}</p>
                  <p className="text-2xl font-bold text-slate-100" dir="ltr">
                    {value.toLocaleString("en-US")}
                    {metric.unit}
                  </p>
                  {metric.key !== "total" && previous && previous.total > 0 && change !== 0 && (
                    <p className={cn("text-xs", better ? "text-emerald-400" : "text-rose-400")} dir="ltr">
                      {change > 0 ? "+" : ""}
                      {change}
                      {metric.unit}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">{metric.hint}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
