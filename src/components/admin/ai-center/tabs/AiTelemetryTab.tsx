import React from "react";
import { AiUsageLedgerTable } from "./AiUsageLedgerTable";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Coins, Zap, Clock, TrendingUp, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiTelemetryTab() {
  const telemetryQuery = trpc.admin.getAiTelemetryOverview.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const data = telemetryQuery.data;
  const totals = data?.totals || {
    unknownCostRequests: 0,
    unknownUsageRequests: 0,
    cacheMeasuredInputTokens: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    costEgp: 0,
    costUsd: 0,
    avgLatencyMs: 0,
    totalRequests: 0,
    cacheSavingsRate: null,
  };

  const providers = data?.providerDistribution || [];
  const channels = data?.channelBreakdown || [];

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            مرصد استهلاك وتكلفة الذكاء الاصطناعي
          </h2>
          <p className="text-xs text-slate-400">
            القياسات المتاحة للشهر المالي الحالي؛ التكلفة تقديرية إلا عندما يبلغ بها المزوّد ({data?.currentPeriod || "الحالي"})
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => telemetryQuery.refetch()}
          disabled={telemetryQuery.isFetching}
          className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${telemetryQuery.isFetching ? "animate-spin" : ""}`} />
          تحديث لحظي
        </Button>
      </div>

      {/* 1. Hero Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
              <span>إجمالي التوكنز المحروقة</span>
              <Brain className="w-4 h-4 text-indigo-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-indigo-400 font-mono">
              {Number(totals.totalTokens).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-500">
            {totals.totalRequests.toLocaleString()} محاولة / نتيجة محلية مسجلة
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
              <span>إجمالي التكلفة المعروفة</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-400 font-mono">
              ${Number(totals.costUsd || 0).toFixed(6)} USD
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-500 font-mono">
            {totals.unknownCostRequests} سجل تكلفته غير متاحة
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
              <span>نسبة الإدخال المقروء من الكاش</span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-400 font-mono">
              {totals.cacheSavingsRate === null ? "غير متاح" : `${totals.cacheSavingsRate}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-emerald-500/80">
            {Number(totals.cachedTokens).toLocaleString()} توكن من الكاش ضمن {Number(totals.cacheMeasuredInputTokens).toLocaleString()} توكن إدخال بقياس كاش متاح؛ ليست نسبة توفير مالي
          </CardContent>
        </Card>

        <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
              <span>متوسط زمن الاستجابة</span>
              <Clock className="w-4 h-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-sky-400 font-mono">
              {(Number(totals.avgLatencyMs) / 1000).toFixed(2)}s
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-slate-500 font-mono">
            {Math.round(Number(totals.avgLatencyMs))} ms متوسط المعالجة
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-400">Input: {Number(totals.promptTokens).toLocaleString()} · Output: {Number(totals.completionTokens).toLocaleString()} · {totals.unknownUsageRequests} سجل بقياسات ناقصة أو قديمة. المجاميع تخص القيم المعروفة فقط.</p>
      <AiUsageLedgerTable period={data?.currentPeriod} />
      {/* 2. Provider Distribution & Channels Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider Distribution Card */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-lg lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
              <Layers className="w-4 h-4 text-indigo-400" />
              توزيع الاستهلاك على المزودين
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              حصة كل بروفايدر من التوكنز والتكلفة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                لا توجد بيانات مسجلة في هذا الشهر حتى الآن
              </div>
            ) : (
              providers.map((p) => {
                const totalAll = Number(totals.totalTokens || 1);
                const pct = Math.round((Number(p.totalTokens) / totalAll) * 100);
                return (
                  <div key={p.providerSlug} className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">{p.providerSlug}</span>
                      <span className="font-mono text-indigo-400 font-bold">{pct}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>{Number(p.totalTokens).toLocaleString()} tok</span>
                      <span className="font-mono text-amber-400 font-medium">
                        {Number(p.costEgp).toFixed(3)} ج.م
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Channels Breakdown Table */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-lg lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
              <Brain className="w-4 h-4 text-indigo-400" />
              تفصيل الاستهلاك حسب القنوات (Channels)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              الشات، تصنيف المعاملات، الـ OCR، والمكالمات الصوتية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-semibold">القناة (Channel)</th>
                    <th className="pb-3 font-semibold">عدد الطلبات</th>
                    <th className="pb-3 font-semibold">التوكنز</th>
                    <th className="pb-3 font-semibold">التكلفة (ج.م)</th>
                    <th className="pb-3 font-semibold">متوسط السرعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                        لا توجد طلبات مسجلة
                      </td>
                    </tr>
                  ) : (
                    channels.map((c) => (
                      <tr key={c.channel} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-sans font-medium text-slate-200">
                          <Badge variant="outline" className="border-slate-700 bg-slate-900">
                            {c.channel}
                          </Badge>
                        </td>
                        <td className="py-3 text-slate-300">{Number(c.requestCount).toLocaleString()}</td>
                        <td className="py-3 font-bold text-indigo-400">{Number(c.totalTokens).toLocaleString()}</td>
                        <td className="py-3 text-amber-400 font-bold">{Number(c.costEgp).toFixed(3)}</td>
                        <td className="py-3 text-slate-400">{(Number(c.avgLatency) / 1000).toFixed(2)}s</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
