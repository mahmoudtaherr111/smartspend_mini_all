import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingDown,
  AlertTriangle,
  BarChart3,
} from "lucide-react";

interface AIInsightsProps {
  month: string;
}

export function AIInsights({ month }: AIInsightsProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [compareMonth, setCompareMonth] = useState(() => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // generateMonthlyInsights is a mutation, so use useMutation + manual trigger
  const insightsMutation = trpc.ai.generateMonthlyInsights.useMutation();
  const compareMutation = trpc.ai.compareMonths.useMutation();

  const [insightsData, setInsightsData] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<string | null>(null);

  const handleGenerateInsights = () => {
    insightsMutation.mutate(
      { month },
      {
        onSuccess: (data) => {
          setInsightsData(data.insights);
        },
        onError: () => {
          setInsightsData(null);
        },
      }
    );
  };

  const handleCompare = () => {
    setShowComparison(true);
    compareMutation.mutate(
      { month1: month, month2: compareMonth },
      {
        onSuccess: (data) => {
          setCompareData(data.comparison);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Generate Insights Button */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5 text-amber-500" />
            تحليل الذكاء الاصطناعي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!insightsData && !insightsMutation.isPending && (
            <div className="text-center py-4">
              <Lightbulb className="w-12 h-12 mx-auto mb-3 text-amber-400" />
              <p className="text-muted-foreground mb-3">
                اضغط على الزرار عشان الذكاء الاصطناعي يحلل مصاريفك
              </p>
              <Button
                onClick={handleGenerateInsights}
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                <Sparkles className="w-4 h-4" />
                حلل مصاريفي
              </Button>
            </div>
          )}

          {insightsMutation.isPending && (
            <div className="text-center py-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
              <p className="text-muted-foreground">
                جاري تحليل بياناتك بالذكاء الاصطناعي...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ده ممكن ياخد شوية وقت
              </p>
            </div>
          )}

          {insightsMutation.isError && (
            <div className="text-center py-4">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-500" />
              <p className="text-muted-foreground mb-3">
                فيه مشكلة في التحليل. جرب تاني.
              </p>
              <Button
                variant="outline"
                onClick={handleGenerateInsights}
                className="gap-2"
              >
                جرب تاني
              </Button>
            </div>
          )}

          {insightsData && (() => {
            // Parse the JSON insights properly
            let parsed: any = null;
            try {
              parsed = typeof insightsData === "string" ? JSON.parse(insightsData) : insightsData;
            } catch {
              // If not valid JSON, show as text
              parsed = { response_text: insightsData };
            }
            
            return (
              <div className="p-4 rounded-xl bg-white/60 dark:bg-slate-800/60 space-y-4">
                {/* Main Analysis Text */}
                {parsed.response_text && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {parsed.response_text}
                  </p>
                )}

                {/* Alerts */}
                {parsed.alerts && parsed.alerts.length > 0 && (
                  <div className="space-y-2">
                    {parsed.alerts.map((alert: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data Table replaced by Smart Visual Cards */}
                {parsed.data_table && parsed.data_table.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    {parsed.data_table.map((row: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-sm">{row.category}</span>
                          <span className="text-xs text-muted-foreground">{row.change || "-"}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{Number(row.amount).toLocaleString()} ج.م</span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{row.percent}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {parsed.personalization && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                      <p className="text-xs text-muted-foreground mb-1">الاستقرار</p>
                      <p className="font-semibold text-sm">
                        {parsed.personalization.behavioral_summary?.financial_stability || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                      <p className="text-xs text-muted-foreground mb-1">السلوك</p>
                      <p className="font-semibold text-sm">
                        {parsed.personalization.behavioral_summary?.spending_behavior || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                      <p className="text-xs text-muted-foreground mb-1">الاتجاه</p>
                      <p className="font-semibold text-sm">
                        {parsed.personalization.comparative_analysis?.trend || "-"}
                      </p>
                    </div>
                  </div>
                )}

                {parsed.personalization?.saving_opportunities?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">فرص توفير</p>
                    {parsed.personalization.saving_opportunities.map((item: string, i: number) => (
                      <div key={i} className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900 p-2 text-sm">
                        {item}
                      </div>
                    ))}
                  </div>
                )}

                {/* Personality Badge */}
                {parsed.personality_flag && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>🧠 الشخصية المالية:</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {parsed.personality_flag === "impulsive" ? "مندفع" : 
                       parsed.personality_flag === "conservative" ? "محافظ" : 
                       parsed.personality_flag === "stressed" ? "متوتر" : 
                       parsed.personality_flag === "balanced" ? "متوازن" : 
                       parsed.personality_flag === "new_user" ? "مستخدم جديد" : 
                       parsed.personality_flag}
                    </span>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateInsights}
                  disabled={insightsMutation.isPending}
                  className="text-xs"
                >
                  {insightsMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  تحديث التحليل
                </Button>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Month Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            مقارنة بين الشهور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <span className="text-sm">قارن بشهر:</span>
            <input
              type="month"
              value={compareMonth}
              onChange={(e) => setCompareMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-background"
            />
            <Button
              size="sm"
              onClick={handleCompare}
              disabled={
                compareMonth === month || compareMutation.isPending
              }
            >
              {compareMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "قارن"
              )}
            </Button>
          </div>

          {showComparison && compareMutation.isPending && (
            <div className="text-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          )}

          {showComparison && compareData && (
            <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <div className="flex items-start gap-2 text-sm">
                <TrendingDown className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                <p className="leading-relaxed whitespace-pre-wrap">
                  {compareData}
                </p>
              </div>
            </div>
          )}

          {showComparison && compareMutation.isError && (
            <div className="text-center py-2 text-sm text-red-500">
              فيه مشكلة في المقارنة. جرب تاني.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
