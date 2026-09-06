import React from "react";
import { trpc } from "@/providers/trpc";
import {
  readUsageDisplay,
  formatUsageCount,
  formatUsageUsd,
} from "@/lib/ai-usage-display";
import {
  TokenAnatomyModal,
  type LedgerItemData,
} from "../modals/TokenAnatomyModal";

export function UsageLedgerRows({
  rows,
  inspect,
}: {
  rows: LedgerItemData[];
  inspect: (row: LedgerItemData) => void;
}) {
  return (
    <tbody>
      {rows.map((row) => {
        const usage = readUsageDisplay(row);
        return (
          <tr key={row.traceId || row.id} className="border-t border-slate-800">
            <td className="p-3">
              <button
                type="button"
                onClick={() => inspect(row)}
                className="text-indigo-300 underline"
              >
                {row.createdAt
                  ? new Date(row.createdAt).toLocaleTimeString("ar-EG")
                  : "تفاصيل"}
              </button>
              <div className="text-slate-400">
                {row.channel} · {usage.status}
              </div>
              <div
                className="font-mono text-[10px] text-slate-500"
                title={usage.operationId || undefined}
              >
                {usage.operationId?.slice(0, 8)}
              </div>
            </td>
            <td className="p-3">
              <div>{row.providerSlug}</div>
              <div className="max-w-56 break-all font-mono text-slate-400">
                {row.modelId}
              </div>
            </td>
            <td className="p-3">{formatUsageCount(usage.input)}</td>
            <td className="p-3">{formatUsageCount(usage.output)}</td>
            <td className="p-3 text-emerald-300">
              {formatUsageCount(usage.cache)}
              <div className="text-[10px]">{usage.cacheLabel}</div>
            </td>
            <td className="p-3">{formatUsageCount(usage.writes)}</td>
            <td className="p-3 text-amber-300">
              <span dir="ltr">{formatUsageUsd(usage.usd)}</span>
              <div className="text-[10px]">{usage.costLabel}</div>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

export function AiUsageLedgerTable({ period }: { period?: string }) {
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<LedgerItemData | null>(null);
  const query = trpc.admin.getAiTokenLedger.useQuery({
    billingPeriod: period,
    page,
    limit: 25,
  });
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
      <h3 className="font-bold">تفاصيل استهلاك كل عملية</h3>
      <p className="text-xs text-slate-400">
        كل محاولة لها صف؛ المعرّف يجمع محاولات العملية نفسها. الكاش جزء من
        الإدخال، وليس توكنز إضافية. غير متاح يعني أن القياس لم يصل.
      </p>
      {query.isError ? (
        <p role="alert">
          تعذر تحميل السجل.{" "}
          <button onClick={() => query.refetch()} className="underline">
            إعادة المحاولة
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr>
                {[
                  "العملية",
                  "المزوّد والموديل",
                  "Input",
                  "Output",
                  "Cache hit",
                  "Cache write",
                  "USD",
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <UsageLedgerRows
              rows={query.data?.rows || []}
              inspect={setSelected}
            />
          </table>
          {query.isLoading ? (
            <p>جارٍ التحميل…</p>
          ) : !query.data?.rows.length ? (
            <p>لا توجد عمليات مسجلة.</p>
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-4 text-xs">
        <button
          disabled={page <= 1 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          السابق
        </button>
        <span>صفحة {page}</span>
        <button
          disabled={page * 25 >= (query.data?.total || 0) || query.isFetching}
          onClick={() => setPage(page + 1)}
        >
          التالي
        </button>
        <button onClick={() => query.refetch()}>تحديث السجل</button>
      </div>
      <TokenAnatomyModal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        ledgerItem={selected}
      />
    </div>
  );
}
