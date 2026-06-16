import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  FileDown,
  Share2,
} from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";

interface AIInsightsProps {
  month: string;
}

export function AIInsights({ month }: AIInsightsProps) {
  const { hasProAccess } = useAuth();
  const isPro = hasProAccess;
  const exportHtml = trpc.export.monthlyReportHtml.useMutation();
  const { success: hapticSuccess, error: hapticError } = useHaptics();
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
  const [compareTrace, setCompareTrace] = useState<Record<string, unknown> | null>(null);
  const [compareStatus, setCompareStatus] = useState<string>("idle");
  const [compareRunning, setCompareRunning] = useState(false);
  const reportCompareQaRef = useRef<string | null>(null);

  // Automatically fetch cached insights on load to prevent token waste and rate limit errors
  const cachedQuery = trpc.ai.getCachedMonthlyInsights.useQuery({ month });

  useEffect(() => {
    if (cachedQuery.data?.exists && cachedQuery.data.insights) {
      setInsightsData(cachedQuery.data.insights);
    } else {
      setInsightsData(null);
    }
  }, [cachedQuery.data, month]);

  const handleGenerateInsights = () => {
    insightsMutation.mutate(
      { month, forceRefresh: true },
      {
        onSuccess: (data) => {
          setInsightsData(data.insights);
          hapticSuccess();
        },
        onError: () => {
          setInsightsData(null);
          hapticError();
        },
      },
    );
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const handleShare = () => {
    if (!canShare || !insightsData) return;
    try {
      let text = "🧠 تحليل مصاريفي من SmartSpend AI:\n\n";
      try {
        const parsed =
          typeof insightsData === "string"
            ? JSON.parse(insightsData)
            : insightsData;
        text += parsed.response_text || "";

        if (parsed.alerts && parsed.alerts.length > 0) {
          text +=
            "\n\n⚠️ التنبيهات المالية:\n" +
            parsed.alerts.map((a: string) => `• ${a}`).join("\n");
        }
        if (parsed.personalization?.saving_opportunities?.length > 0) {
          text +=
            "\n\n💡 فرص التوفير المتاحة:\n" +
            parsed.personalization.saving_opportunities
              .map((o: string) => `• ${o}`)
              .join("\n");
        }
      } catch {
        text += String(insightsData);
      }
      text += "\n\nتتبع مصاريفك بالذكاء الاصطناعي مع SmartSpend AI!";

      navigator
        .share({
          title: "تحليل المصاريف الذكي",
          text: text,
          url: window.location.origin,
        })
        .catch(() => {});
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  const runCompare = (targetMonth = compareMonth) => {
    setShowComparison(true);
    setCompareMonth(targetMonth);
    setCompareData(null);
    setCompareTrace(null);
    setCompareRunning(true);
    setCompareStatus(`started:${month}:${targetMonth}`);
    void compareMutation
      .mutateAsync({ month1: month, month2: targetMonth })
      .then((data) => {
        setCompareStatus(`success:${month}:${targetMonth}`);
        setCompareData(data.comparison);
        setCompareTrace(
          data.trace && typeof data.trace === "object"
            ? (data.trace as Record<string, unknown>)
            : null,
        );
      })
      .catch((error) => {
        setCompareStatus(`error:${error?.message ?? "unknown"}`);
        setCompareTrace(null);
      })
      .finally(() => {
        setCompareRunning(false);
      });
  };

  const handleCompare = () => {
    runCompare();
  };

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const targetMonth = params.get("report_qa_compare_month");
    if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth) || targetMonth === month) return;

    const qaKey = `${month}:${targetMonth}`;
    if (reportCompareQaRef.current === qaKey || compareRunning || compareMutation.isPending) return;

    reportCompareQaRef.current = qaKey;
    runCompare(targetMonth);
  }, [compareMutation.isPending, compareRunning, month]);

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
          {cachedQuery.isLoading && (
            <div className="text-center py-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
              <p className="text-muted-foreground">جاري تحميل التحليل المالي الذكي...</p>
            </div>
          )}

          {!cachedQuery.isLoading && !insightsData && !insightsMutation.isPending && (
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
              <p className="text-sm font-medium text-foreground mb-1">
                {insightsMutation.error?.message || "فيه مشكلة في التحليل."}
              </p>
              <p className="text-muted-foreground text-xs mb-3">
                {insightsMutation.error?.data?.code === "TOO_MANY_REQUESTS"
                  ? "يمكنك الترقية لخطة أعلى للحصول على تقارير أكتر."
                  : insightsMutation.error?.data?.code === "FORBIDDEN"
                    ? "حدّث خطتك للاستمتاع بالتحليلات الذكية."
                    : "جرب تاني بعد شوية."}
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

          {insightsData &&
            (() => {
              // Parse the JSON insights properly
              let parsed: any = null;
              try {
                parsed =
                  typeof insightsData === "string"
                    ? JSON.parse(insightsData)
                    : insightsData;
              } catch {
                // If not valid JSON, show as text
                parsed = { response_text: insightsData };
              }
              const trace =
                parsed.ai_trace && typeof parsed.ai_trace === "object"
                  ? (parsed.ai_trace as Record<string, unknown>)
                  : null;
              const traceTools = Array.isArray(trace?.tools)
                ? trace.tools.map((item) => String(item)).join(", ")
                : "none";
              const numericAccuracy =
                trace?.numericAccuracy && typeof trace.numericAccuracy === "object"
                  ? (trace.numericAccuracy as Record<string, unknown>)
                  : null;
              const accuracyPercent =
                typeof numericAccuracy?.accuracy === "number"
                  ? Math.round(numericAccuracy.accuracy * 100)
                  : null;

              return (
                <div className="p-4 rounded-xl bg-white/60 dark:bg-slate-800/60 space-y-4">
                  {trace && (
                    <div
                      className="rounded-lg border bg-white/70 dark:bg-slate-900/70 p-3 text-xs text-muted-foreground space-y-1"
                      aria-label={`report-ai-trace route=${String(trace.route ?? "unknown")} tools=${traceTools} risk=${String(trace.hallucinationRisk ?? "unknown")}`}
                    >
                      <div className="font-medium text-foreground">Trace</div>
                      <div>
                        route={String(trace.route ?? "unknown")} · tools={traceTools}
                      </div>
                      <div>
                        facts={String(trace.factCount ?? 0)} · source={String(trace.factsSource ?? "unknown")} · LLM={String(trace.llmCalls ?? 0)} · embed={String(trace.embeddingCalls ?? 0)}
                      </div>
                      <div>
                        risk={String(trace.hallucinationRisk ?? "unknown")}
                        {accuracyPercent !== null ? ` · nums ${accuracyPercent}%` : ""}
                      </div>
                      <div>
                        tokens in={String(trace.inputTokens ?? 0)} / total={String(trace.totalTokens ?? 0)} · model={String(trace.model ?? "unknown")}
                      </div>
                    </div>
                  )}

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
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-sm"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <span>{alert}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data Table replaced by Smart Visual Cards */}
                  {/* Removing the data_table squares as requested by user to focus on deep analysis */}

                  {parsed.personalization &&
                    (() => {
                      const labelFor = (value: unknown, fallback = "-") => {
                        if (!value) return fallback;
                        const map: Record<string, string> = {
                          stable: "مستقر",
                          watch: "يحتاج متابعة",
                          pressure: "ضغط مالي",
                          planned: "مخطط",
                          spiky: "صرف فجائي",
                          emotional: "صرف عاطفي",
                          concentrated: "متركز",
                          balanced: "متوازن",
                          impulsive: "مندفع",
                          conservative: "محافظ",
                          stressed: "مضغوط",
                          trending_up: "في زيادة",
                          trending_down_or_flat: "مستقر أو في انخفاض",
                        };
                        return map[String(value)] || String(value);
                      };

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              الاستقرار
                            </p>
                            <p className="font-semibold text-sm">
                              {labelFor(
                                parsed.personalization.behavioral_summary
                                  ?.financial_stability,
                              )}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              السلوك
                            </p>
                            <p className="font-semibold text-sm">
                              {labelFor(
                                parsed.personalization.behavioral_summary
                                  ?.spending_behavior,
                              )}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              الاتجاه
                            </p>
                            <p className="font-semibold text-sm">
                              {labelFor(
                                parsed.personalization.comparative_analysis
                                  ?.trend,
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                  {parsed.personalization?.saving_opportunities?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">فرص توفير</p>
                      {parsed.personalization.saving_opportunities.map(
                        (item: string, i: number) => (
                          <div
                            key={i}
                            className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900 p-2 text-sm"
                          >
                            {item}
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {/* Personality Badge */}
                  {parsed.personality_flag && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>🧠 الشخصية المالية:</span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {parsed.personality_flag === "impulsive"
                          ? "مندفع"
                          : parsed.personality_flag === "conservative"
                            ? "محافظ"
                            : parsed.personality_flag === "stressed"
                              ? "متوتر"
                              : parsed.personality_flag === "balanced"
                                ? "متوازن"
                                : parsed.personality_flag === "new_user"
                                  ? "مستخدم جديد"
                                  : parsed.personality_flag}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full">
                    {canShare && insightsData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShare}
                        className="text-xs gap-1.5 min-h-[44px] w-full sm:w-auto active-press text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:text-emerald-700"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        مشاركة التحليل
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateInsights}
                      disabled={insightsMutation.isPending}
                      className="text-xs min-h-[44px] w-full sm:w-auto active-press"
                    >
                      {insightsMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin me-1" />
                      ) : (
                        <Sparkles className="w-3 h-3 me-1" />
                      )}
                      تحديث التحليل
                    </Button>
                    {isPro && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 min-h-[44px] w-full sm:w-auto active-press"
                        disabled={exportHtml.isPending}
                        onClick={() =>
                          exportHtml.mutate(
                            {
                              month,
                              insightsJson:
                                typeof insightsData === "string"
                                  ? insightsData
                                  : JSON.stringify(insightsData),
                            },
                            {
                              onSuccess: (res) => {
                                const blob = new Blob([res.data], {
                                  type: "text/html;charset=utf-8",
                                });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = res.filename;
                                a.click();
                                URL.revokeObjectURL(url);
                              },
                            },
                          )
                        }
                      >
                        {exportHtml.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <FileDown className="w-3 h-3" />
                        )}
                        تصدير تقرير Pro
                      </Button>
                    )}
                  </div>
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
              disabled={compareMonth === month || compareRunning || compareMutation.isPending}
            >
              {compareRunning || compareMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "قارن"
              )}
            </Button>
          </div>

          {import.meta.env.DEV && (
            <div
              className="sr-only"
              aria-label={`compare-qa-status ${compareStatus}`}
            >
              {compareStatus}
            </div>
          )}

          {showComparison && (compareRunning || compareMutation.isPending) && (
            <div className="text-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          )}

          {showComparison && compareData && (
            <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              {compareTrace &&
                (() => {
                  const traceTools = Array.isArray(compareTrace.tools)
                    ? compareTrace.tools.map((item) => String(item)).join(", ")
                    : "none";
                  const numericAccuracy =
                    compareTrace.numericAccuracy && typeof compareTrace.numericAccuracy === "object"
                      ? (compareTrace.numericAccuracy as Record<string, unknown>)
                      : null;
                  const accuracyPercent =
                    typeof numericAccuracy?.accuracy === "number"
                      ? Math.round(numericAccuracy.accuracy * 100)
                      : null;

                  return (
                    <div
                      className="rounded-lg border bg-white/70 dark:bg-slate-900/70 p-3 text-xs text-muted-foreground space-y-1"
                      aria-label={`compare-ai-trace route=${String(compareTrace.route ?? "unknown")} tools=${traceTools} risk=${String(compareTrace.hallucinationRisk ?? "unknown")}`}
                    >
                      <div className="font-medium text-foreground">Trace</div>
                      <div>
                        route={String(compareTrace.route ?? "unknown")} · tools={traceTools}
                      </div>
                      <div>
                        facts={String(compareTrace.factCount ?? 0)} · source={String(compareTrace.factsSource ?? "unknown")} · LLM={String(compareTrace.llmCalls ?? 0)} · embed={String(compareTrace.embeddingCalls ?? 0)}
                      </div>
                      <div>
                        risk={String(compareTrace.hallucinationRisk ?? "unknown")}
                        {accuracyPercent !== null ? ` · nums ${accuracyPercent}%` : ""}
                      </div>
                      <div>
                        tokens in={String(compareTrace.inputTokens ?? 0)} / total={String(compareTrace.totalTokens ?? 0)} · model={String(compareTrace.model ?? "unknown")}
                      </div>
                    </div>
                  );
                })()}
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
