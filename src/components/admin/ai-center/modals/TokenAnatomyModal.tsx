import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, Coins, Layers, Zap, ChevronDown, Sparkles } from "lucide-react";

export interface LedgerItemData {
  id?: number;
  traceId?: string;
  channel?: string;
  providerSlug?: string;
  modelId?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  systemPromptTokens?: number;
  memoryRagTokens?: number;
  historyTokens?: number;
  userInputTokens?: number;
  toolSchemaTokens?: number;
  costEgp?: number | string;
  costUsd?: number | string;
  latencyMs?: number;
  createdAt?: string | Date;
  [key: string]: any;
}

interface TokenAnatomyModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledgerItem: LedgerItemData | null;
}

export function TokenAnatomyModal({ isOpen, onClose, ledgerItem }: TokenAnatomyModalProps) {
  const [showRaw, setShowRaw] = React.useState(false);

  if (!ledgerItem) return null;

  const totalTokens = Number(ledgerItem.totalTokens || 0);
  const promptTokens = Number(ledgerItem.promptTokens || 0);
  const completionTokens = Number(ledgerItem.completionTokens || 0);
  const cachedTokens = Number(ledgerItem.cachedTokens || 0);
  const reasoningTokens = Number(ledgerItem.reasoningTokens || 0);

  const systemTokens = Number(ledgerItem.systemPromptTokens || 0);
  const memoryTokens = Number(ledgerItem.memoryRagTokens || 0);
  const historyTokens = Number(ledgerItem.historyTokens || 0);
  const userTokens = Number(ledgerItem.userInputTokens || 0);
  const outTokens = Math.max(0, completionTokens - reasoningTokens);

  // Proportions
  const sysPct = totalTokens > 0 ? Math.round((systemTokens / totalTokens) * 100) : 0;
  const memPct = totalTokens > 0 ? Math.round((memoryTokens / totalTokens) * 100) : 0;
  const histPct = totalTokens > 0 ? Math.round((historyTokens / totalTokens) * 100) : 0;
  const userPct = totalTokens > 0 ? Math.round((userTokens / totalTokens) * 100) : 0;
  const cotPct = totalTokens > 0 ? Math.round((reasoningTokens / totalTokens) * 100) : 0;
  const outPct = totalTokens > 0 ? Math.max(0, 100 - (sysPct + memPct + histPct + userPct + cotPct)) : 0;

  const cacheSavingsPct = promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-950 text-slate-100 border-slate-800 p-6">
        <DialogHeader className="border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Brain className="w-5 h-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  تشريح استهلاك التوكنز للطلب
                  <Badge variant="outline" className="font-mono text-xs border-slate-700 bg-slate-900">
                    <Clock className="w-3 h-3 ml-1" />
                    {ledgerItem.createdAt ? new Date(ledgerItem.createdAt).toLocaleTimeString("ar-EG") : "الآن"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {ledgerItem.createdAt ? new Date(ledgerItem.createdAt).toLocaleString("ar-EG") : "الآن"} | القناة: {ledgerItem.channel || "عام"}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                {ledgerItem.providerSlug}
              </Badge>
              <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-mono text-xs">
                {ledgerItem.modelId}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* 1. Stacked Proportional Breakdown Bar */}
        <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/60">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
            <span>توزيع أجزاء الحمولة (Payload Anatomy Breakdown)</span>
            <span className="font-mono text-indigo-400 font-bold">{totalTokens.toLocaleString()} Total Tokens</span>
          </div>

          {/* Visual Stacked Bar */}
          <div className="h-6 w-full rounded-xl bg-slate-950 overflow-hidden flex p-0.5 gap-0.5 border border-slate-800">
            {sysPct > 0 && (
              <div
                style={{ width: `${sysPct}%` }}
                title={`System Rules: ${systemTokens} tok (${sysPct}%)`}
                className="bg-indigo-600 h-full rounded-l transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
              >
                {sysPct > 10 ? `${sysPct}%` : ""}
              </div>
            )}
            {memPct > 0 && (
              <div
                style={{ width: `${memPct}%` }}
                title={`Financial Memory/RAG: ${memoryTokens} tok (${memPct}%)`}
                className="bg-purple-600 h-full transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
              >
                {memPct > 10 ? `${memPct}%` : ""}
              </div>
            )}
            {histPct > 0 && (
              <div
                style={{ width: `${histPct}%` }}
                title={`Chat History: ${historyTokens} tok (${histPct}%)`}
                className="bg-slate-600 h-full transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
              >
                {histPct > 10 ? `${histPct}%` : ""}
              </div>
            )}
            {userPct > 0 && (
              <div
                style={{ width: `${userPct}%` }}
                title={`User Query: ${userTokens} tok (${userPct}%)`}
                className="bg-emerald-600 h-full transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
              >
                {userPct > 5 ? `${userPct}%` : ""}
              </div>
            )}
            {cotPct > 0 && (
              <div
                style={{ width: `${cotPct}%` }}
                title={`CoT Reasoning: ${reasoningTokens} tok (${cotPct}%)`}
                className="bg-amber-500 h-full transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-black overflow-hidden"
              >
                {cotPct > 5 ? `${cotPct}%` : ""}
              </div>
            )}
            {outPct > 0 && (
              <div
                style={{ width: `${outPct}%` }}
                title={`Output: ${outTokens} tok (${outPct}%)`}
                className="bg-sky-500 h-full rounded-r transition-all hover:opacity-80 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
              >
                {outPct > 5 ? `${outPct}%` : ""}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px] pt-1">
            <div className="flex items-center gap-1.5 text-indigo-300">
              <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" />
              <span>قواعد النظام ({systemTokens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-300">
              <span className="w-2.5 h-2.5 rounded bg-purple-600 inline-block" />
              <span>الذاكرة والـ RAG ({memoryTokens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded bg-slate-600 inline-block" />
              <span>السجل السابق ({historyTokens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
              <span>سؤال العميل ({userTokens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
              <span>التفكير CoT ({reasoningTokens})</span>
            </div>
            <div className="flex items-center gap-1.5 text-sky-300">
              <span className="w-2.5 h-2.5 rounded bg-sky-500 inline-block" />
              <span>الرد النهائي ({outTokens})</span>
            </div>
          </div>
        </div>

        {/* 2. Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              التكلفة الفعلية
            </div>
            <div className="text-base font-bold text-amber-400 font-mono">
              {Number(ledgerItem.costEgp || 0).toFixed(4)} ج.م
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              ${Number(ledgerItem.costUsd || 0).toFixed(6)} USD
            </div>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              كاش البرومبت
            </div>
            <div className="text-base font-bold text-emerald-400 font-mono">
              {cachedTokens.toLocaleString()} tok
            </div>
            <div className="text-[10px] text-emerald-500/80 font-medium">
              وفرت {cacheSavingsPct}% من المدخلات
            </div>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              زمن الاستجابة
            </div>
            <div className="text-base font-bold text-sky-400 font-mono">
              {ledgerItem.latencyMs} ms
            </div>
            <div className="text-[10px] text-slate-500">
              {(Number(ledgerItem.latencyMs) / 1000).toFixed(2)} ثانية
            </div>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              نسبة الإدخال / الإخراج
            </div>
            <div className="text-base font-bold text-indigo-300 font-mono">
              {promptTokens} / {completionTokens}
            </div>
            <div className="text-[10px] text-slate-500">
              In: {Math.round((promptTokens / totalTokens) * 100)}% | Out: {Math.round((completionTokens / totalTokens) * 100)}%
            </div>
          </div>
        </div>

        {/* 3. Deep Diagnosis Insights */}
        <div className="bg-indigo-950/20 border border-indigo-800/30 rounded-xl p-4 text-xs space-y-2">
          <div className="font-bold text-indigo-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            تحليل كفاءة الطلب (Token Efficiency Diagnosis)
          </div>
          <p className="text-slate-300 leading-relaxed">
            {sysPct > 50 ? (
              <span className="text-amber-300 font-medium">
                ⚠️ تعليمات النظام (System Rules) تستهلك أكثر من نصف حمولة التوكنز ({sysPct}%). يُنصح بتمكين الـ Prompt Caching لخفض التكلفة بـ 90%.
              </span>
            ) : cachedTokens > 0 ? (
              <span className="text-emerald-300 font-medium">
                ✅ تم استخدام كاش المزود بنجاح وتوفير {cachedTokens.toLocaleString()} توكن إدخال بتخفيض مالي فوري.
              </span>
            ) : (
              <span>
                الطلب متوازن: استهلك سؤال المستخدم وسياق الذاكرة والرد النهائي أحجاماً مناسبة دون تضخم.
              </span>
            )}
          </p>
        </div>

        {/* 4. Raw JSON Toggle */}
        <div className="border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono"
          >
            <span>{showRaw ? "إخفاء" : "عرض"} تفاصيل الـ JSON الخام</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRaw ? "rotate-180" : ""}`} />
          </button>
          {showRaw && (
            <pre className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
              {JSON.stringify(ledgerItem, null, 2)}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
