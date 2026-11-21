import { useState } from "react";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { AUDIT_ACTION, auditAction, cairoInputToIso, dayTime } from "../ui/words";

const PAGE = 50;

/** What a details value says, short: the server writes only ids, counts, switches and masked numbers here. */
function details(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join("، ") : typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}`)
    .join(" · ")
    .slice(0, 300);
}

/** Every change an admin made, newest first, by action and day. */
export function Audit() {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const log = trpc.admin.getAuditLogs.useQuery({
    page,
    limit: PAGE,
    ...(action ? { action } : {}),
    ...(from ? { startDate: cairoInputToIso(`${from}T00:00`) } : {}),
    ...(to ? { endDate: cairoInputToIso(`${to}T23:59`) } : {}),
  });
  const pages = log.data ? Math.max(1, Math.ceil(Number(log.data.total) / PAGE)) : 1;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <PageHeader title="سجل الأدمن" description="كل حاجة أدمن غيّرها، مين وإمتى وعلى إيه. السجل مابيتعدلش ومابيتمسحش من اللوحة." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block font-semibold">الإجراء</span>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={action} onChange={(e) => reset(() => setAction(e.target.value))}>
            <option value="">كل الإجراءات</option>
            {Object.entries(AUDIT_ACTION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span className="block font-semibold">من يوم</span><Input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} /></label>
        <label className="space-y-1 text-sm"><span className="block font-semibold">لحد يوم</span><Input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} /></label>
        {(action || from || to) && <Button variant="ghost" onClick={() => reset(() => { setAction(""); setFrom(""); setTo(""); })}>امسح الفلاتر</Button>}
      </div>
      {log.isLoading ? <Loading /> : !log.data ? <LoadError message="ماقدرناش نجيب السجل." onRetry={() => log.refetch()} /> : log.data.logs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">مفيش حاجة بالفلاتر دي.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{Number(log.data.total).toLocaleString("ar-EG")} إجراء</p>
          <ul className="divide-y rounded-xl border">
            {log.data.logs.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div><b>{row.adminName}</b> {auditAction(row.action)}{row.targetId && row.targetType !== "system_settings" ? <span className="text-muted-foreground"> · {row.targetType} {row.targetId}</span> : null}</div>
                  {details(row.details) && <div className="text-xs text-muted-foreground" dir="auto">{details(row.details)}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{dayTime(row.createdAt)}</span>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>الأحدث</Button>
              <span className="text-sm">صفحة {page} من {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>الأقدم</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
