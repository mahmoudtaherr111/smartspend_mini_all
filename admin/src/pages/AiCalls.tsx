import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { CHANNEL, count, dayTime, usd, word } from "../ui/words";

type Call = inferRouterOutputs<AppRouter>["adminConsole"]["aiCalls"]["rows"][number];

const PERIODS = [
  { days: 1, label: "النهارده" },
  { days: 7, label: "آخر 7 أيام" },
  { days: 30, label: "آخر 30 يوم" },
];

/** Where the input tokens of one call went, part by part, so a costly call explains itself. */
function Anatomy({ call }: { call: Call }) {
  const parts = [
    ["تعليمات النظام", call.systemPrompt],
    ["ذاكرة المساعد", call.memory],
    ["المحادثة اللي فاتت", call.history],
    ["كلام المستخدم", call.userInput],
    ["تعريف الأدوات", call.tools],
  ] as const;
  const total = parts.reduce((sum, [, value]) => sum + (value ?? 0), 0);
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-muted-foreground">الوقت</dt><dd>{dayTime(call.createdAt)}</dd></div>
        <div><dt className="text-muted-foreground">مين</dt><dd>{call.who ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">المطلوب</dt><dd>{word(CHANNEL, call.channel)}</dd></div>
        <div><dt className="text-muted-foreground">الموديل</dt><dd dir="ltr" className="text-end">{call.provider} · {call.model}</dd></div>
        <div><dt className="text-muted-foreground">التكلفة</dt><dd className="num">{usd(call.usd)} ({count(Math.round(call.egp * 100) / 100)} ج.م)</dd></div>
        <div><dt className="text-muted-foreground">الوقت اللي خده</dt><dd className="num">{call.latencyMs ? `${(call.latencyMs / 1000).toFixed(1)} ثانية` : "—"}</dd></div>
        <div><dt className="text-muted-foreground">توكنز داخلة</dt><dd className="num">{count(call.input)}{call.cached ? ` (منها ${count(call.cached)} متخزّنة بسعر أقل)` : ""}</dd></div>
        <div><dt className="text-muted-foreground">توكنز خارجة</dt><dd className="num">{count(call.output)}{call.reasoning ? ` (منها ${count(call.reasoning)} تفكير)` : ""}</dd></div>
      </dl>
      {total > 0 && (
        <div>
          <div className="mb-2 font-semibold">التوكنز الداخلة راحت فين</div>
          <ul className="space-y-2">
            {parts.map(([label, value]) => (
              <li key={label}>
                <div className="flex justify-between text-xs"><span>{label}</span><span className="num">{count(value ?? 0)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.round(((value ?? 0) / total) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {call.httpStatus && call.httpStatus >= 400 && (
        <p className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/40 dark:text-red-300">
          النداء فشل (كود {call.httpStatus}). التطبيق جرّب الموديل الاحتياطي لو موجود.
        </p>
      )}
      {call.finishReason && call.finishReason !== "stop" && call.finishReason !== "STOP" && (
        <p className="text-xs text-muted-foreground">سبب نهاية الرد: <span dir="ltr">{call.finishReason}</span></p>
      )}
    </div>
  );
}

/** Every AI call with its cost, and the totals by what was asked and by model. */
export function AiCalls() {
  const [days, setDays] = useState(1);
  const [channel, setChannel] = useState<string | undefined>();
  const [failedOnly, setFailedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Call | null>(null);
  const calls = trpc.adminConsole.aiCalls.useQuery({ days, channel, failedOnly, page });

  const total = calls.data?.byChannel.reduce((sum, row) => sum + row.usd, 0) ?? 0;
  const totalCalls = calls.data?.byChannel.reduce((sum, row) => sum + row.calls, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="نداءات الذكاء"
        description="كل مرة التطبيق سأل موديل ذكاء: مين، ليه، أنهي موديل رد، بكام توكن، وكلّف كام. اضغط على أي نداء تشوف التفاصيل."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((period) => (
          <Button key={period.days} size="sm" variant={days === period.days ? "default" : "outline"} onClick={() => { setDays(period.days); setPage(1); }}>
            {period.label}
          </Button>
        ))}
        <label className="ms-2 flex items-center gap-2 text-sm">
          <Switch checked={failedOnly} onCheckedChange={(value) => { setFailedOnly(value); setPage(1); }} />
          اللي فشل بس
        </label>
        {channel && (
          <Button size="sm" variant="ghost" onClick={() => setChannel(undefined)}>
            إلغاء فلتر «{word(CHANNEL, channel)}» ×
          </Button>
        )}
      </div>

      {calls.isLoading ? (
        <Loading />
      ) : !calls.data ? (
        <LoadError message="ماقدرناش نجيب النداءات." onRetry={() => calls.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-background p-4">
              <h2 className="font-bold">التكلفة حسب المطلوب</h2>
              <p className="mb-3 text-xs text-muted-foreground">الإجمالي {usd(total)} في {count(totalCalls)} نداء. اضغط على أي سطر تشوف نداءاته بس.</p>
              {calls.data.byChannel.length === 0 ? (
                <p className="text-sm text-muted-foreground">مفيش نداءات في الفترة دي.</p>
              ) : (
                <ul className="space-y-2">
                  {[...calls.data.byChannel].sort((a, b) => b.usd - a.usd).map((row) => (
                    <li key={row.channel}>
                      <button className="w-full text-start" onClick={() => { setChannel(row.channel); setPage(1); }}>
                        <div className="flex justify-between text-sm">
                          <span>{word(CHANNEL, row.channel)} <span className="text-xs text-muted-foreground">({count(row.calls)} نداء{row.failed ? `، فشل ${count(row.failed)}` : ""})</span></span>
                          <span className="num font-bold">{usd(row.usd)}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${total ? Math.max(2, Math.round((row.usd / total) * 100)) : 0}%` }} /></div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border bg-background p-4">
              <h2 className="font-bold">الموديلات</h2>
              <p className="mb-3 text-xs text-muted-foreground">مين اشتغل، وكلّف كام، وبيرد في قد إيه، وكام مرة فشل.</p>
              {calls.data.byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground">مفيش نداءات في الفترة دي.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {calls.data.byModel.map((row) => (
                    <li key={`${row.provider}/${row.model}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate" dir="ltr">{row.provider} · {row.model}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <span className="num">{count(row.calls)}</span> نداء · <span className="num">{(row.avgLatencyMs / 1000).toFixed(1)}</span> ث
                        {row.failed ? <span className="text-red-700 dark:text-red-400"> · فشل {count(row.failed)}</span> : null}
                      </span>
                      <span className="num shrink-0 font-bold">{usd(row.usd)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-start font-medium">الوقت</th>
                  <th className="px-3 py-2.5 text-start font-medium">مين</th>
                  <th className="px-3 py-2.5 text-start font-medium">المطلوب</th>
                  <th className="px-3 py-2.5 text-start font-medium">الموديل</th>
                  <th className="px-3 py-2.5 text-start font-medium">توكنز داخلة / خارجة</th>
                  <th className="px-3 py-2.5 text-start font-medium">التكلفة</th>
                </tr>
              </thead>
              <tbody>
                {calls.data.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">مفيش نداءات بالفلتر ده.</td></tr>
                ) : (
                  calls.data.rows.map((call) => (
                    <tr key={call.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpen(call)}>
                      <td className="px-3 py-2 whitespace-nowrap">{dayTime(call.createdAt)}</td>
                      <td className="px-3 py-2">
                        {call.userId && call.userType ? (
                          <Link to={`/people/${call.userType}/${call.userId}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                            {call.who || "من غير اسم"}
                          </Link>
                        ) : "السيستم"}
                      </td>
                      <td className="px-3 py-2">
                        {word(CHANNEL, call.channel)}
                        {call.httpStatus && call.httpStatus >= 400 && <Badge variant="destructive" className="ms-2">فشل</Badge>}
                      </td>
                      <td className="px-3 py-2" dir="ltr" style={{ textAlign: "right" }}>{call.model}</td>
                      <td className="num px-3 py-2">{count(call.input)} / {count(call.output)}</td>
                      <td className="num px-3 py-2 font-bold">{usd(call.usd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
          <div className="flex gap-2">
            {page > 1 && <Button variant="outline" size="sm" onClick={() => setPage(page - 1)}>الأحدث</Button>}
            {calls.data.hasMore && <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>الأقدم</Button>}
          </div>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(value) => !value && setOpen(null)}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>تفاصيل النداء</SheetTitle></SheetHeader>
          <div className="mt-4">{open && <Anatomy call={open} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
