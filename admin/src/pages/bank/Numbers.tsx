import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@admin/kit/button";
import { Input } from "@admin/kit/input";
import { trpc } from "@admin/lib/trpc";
import { Confirm } from "../../ui/Confirm";
import { LoadError, Loading } from "../../ui/states";

const KIND: Record<string, string> = {
  card_purchase: "شراء بالكارت", international_purchase: "شراء بعملة تانية", online_purchase: "شراء أونلاين", bill_payment: "فاتورة",
  mobile_recharge: "شحن رصيد", transfer_out: "تحويل خارج", transfer_in: "تحويل داخل", atm_withdrawal: "سحب نقدي", cash_deposit: "إيداع",
  refund: "مرتجع", reversal: "إلغاء", salary: "مرتب", fee: "رسوم", interest: "فوايد", cashback: "كاش باك", card_payment: "سداد كارت",
  installment: "قسط", other: "تاني",
};
const OUTCOME: Record<string, string> = {
  recorded: "اتسجلت", review: "مستنية المستخدم", merged: "اتضمت لعملية تانية", not_transaction: "مش عملية فلوس", declined: "مرفوضة",
  on_hold: "محجوزة", failed: "الموديل مابيردش", invalid_reply: "رد غلط", financial_upgrade: "مستنية الدفتر", disabled: "مقفول",
  capacity: "زحمة", daily_cap: "سقف التكلفة", gone: "اتمسحت", held: "فوق حد الباقة",
};

/** What capture did per bank and kind of message, the model's queue, and taking back one bank's recordings. */
export function Numbers() {
  const [days, setDays] = useState(7);
  const funnel = trpc.captureAdmin.funnel.useQuery({ days });
  const [undo, setUndo] = useState({ sourceSlug: "", hours: "24" });
  const [preview, setPreview] = useState<{ rows: number; users: number; range: { sourceSlug: string; from: string; to: string; onlyAuto: boolean } } | null>(null);
  const bulk = trpc.captureAdmin.bulkUndo.useMutation({ onError: (error) => toast.error(error.message) });

  if (funnel.isLoading) return <Loading />;
  if (!funnel.data) return <LoadError message="ماقدرناش نجيب الأرقام." onRetry={() => funnel.refetch()} />;
  const data = funnel.data;
  const waiting = data.model.filter((row) => row.status !== "done").reduce((sum, row) => sum + row.jobs, 0);

  const runUndo = async () => {
    const range = { sourceSlug: undo.sourceSlug.trim(), from: new Date(Date.now() - Number(undo.hours) * 3600_000).toISOString(), to: new Date().toISOString(), onlyAuto: true };
    const counted = await bulk.mutateAsync({ ...range, apply: false });
    if (!counted.rows) return void toast.info("مفيش عمليات اتسجلت لوحدها من البنك ده في الفترة دي.");
    setPreview({ rows: counted.rows, users: counted.users, range });
  };
  const applyUndo = async () => {
    if (!preview) return;
    const done = await bulk.mutateAsync({ ...preview.range, apply: true });
    setPreview(null);
    toast.success(`اتلغت ${done.removed} عملية`);
    void funnel.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30].map((value) => (
          <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>
            {value === 1 ? "النهارده" : `آخر ${value} يوم`}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="اتسجلت لوحدها" value={data.rows.reduce((sum, row) => sum + row.auto, 0)} />
        <Stat label="المستخدمين لغوها" value={data.rows.reduce((sum, row) => sum + row.autoUndone, 0)} tone="warn" />
        <Stat label="مستنية الموديل دلوقتي" value={waiting} hint={data.oldestWaitingAt ? `أقدم واحدة من ${new Date(data.oldestWaitingAt).toLocaleTimeString("ar-EG")}` : undefined} />
      </div>
      {data.paused.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">بنوك موقفة عن التسجيل لوحدها (رسايلها بتستنى المستخدم): {data.paused.join("، ")}</p>
      )}

      <section className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>{["البنك", "النوع", "اتسجلت", "لوحدها", "اتلغت", "مستنية", "فوق الحد"].map((head) => <th key={head} className="p-2 text-start font-medium">{head}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">مفيش رسايل في الفترة دي.</td></tr>
            ) : data.rows.map((row) => {
              const undoneShare = row.auto ? row.autoUndone / row.auto : 0;
              return (
                <tr key={`${row.sourceSlug}:${row.kind}`} className="border-t">
                  <td className="p-2" dir="ltr">{row.sourceSlug ?? "غير معروف"}</td>
                  <td className="p-2">{KIND[row.kind] ?? row.kind}</td>
                  <td className="num p-2">{row.recorded}</td>
                  <td className="num p-2">{row.auto}</td>
                  <td className={`num p-2 ${undoneShare >= 0.1 ? "font-bold text-rose-700" : ""}`}>{row.autoUndone}</td>
                  <td className="num p-2">{row.review}</td>
                  <td className="num p-2">{row.held}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="font-semibold">طابور الذكاء الاصطناعي</h3>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {data.model.length === 0 ? <li className="text-muted-foreground">مفيش.</li> : data.model.map((row) => (
            <li key={`${row.status}:${row.outcome}`} className="flex justify-between border-b py-1">
              <span>{row.status === "done" ? OUTCOME[row.outcome ?? ""] ?? row.outcome : `${row.status === "running" ? "بتتقري" : "مستنية"}${row.outcome ? ` (${OUTCOME[row.outcome] ?? row.outcome})` : ""}`}</span>
              <span className="num font-semibold">{row.jobs}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-rose-200 p-4">
        <h3 className="font-semibold">إلغاء جماعي لبنك</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">لو بنك غيّر شكل رسايله واتسجلت عمليات غلط، الغي اللي اتسجل لوحده منه في آخر كام ساعة. هتشوف العدد قبل ما تأكد.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input className="w-40" dir="ltr" placeholder="cib" aria-label="البنك" value={undo.sourceSlug} onChange={(e) => setUndo({ ...undo, sourceSlug: e.target.value })} />
          <Input className="w-24" dir="ltr" inputMode="numeric" aria-label="الساعات" value={undo.hours} onChange={(e) => setUndo({ ...undo, hours: e.target.value.replace(/\D/g, "") })} />
          <span className="text-sm text-muted-foreground">ساعة</span>
          <Button variant="destructive" size="sm" disabled={!undo.sourceSlug.trim() || !Number(undo.hours) || bulk.isPending} onClick={() => void runUndo()}>شوف العدد وألغي</Button>
        </div>
      </section>
      <Confirm open={!!preview} onOpenChange={(open) => !open && setPreview(null)} title={`تلغي ${preview?.rows ?? 0} عملية؟`} confirmLabel="ألغيها" danger
        typeToConfirm={preview?.range.sourceSlug} busy={bulk.isPending} onConfirm={() => void applyUndo()}>
        <p>هتتمسح من دفاتر {preview?.users ?? 0} مستخدم، وكل واحد هيرجعله عدد عملياته في الشهر. ده مابيترجعش.</p>
      </Confirm>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-2xl font-bold ${tone === "warn" && value > 0 ? "text-amber-700" : ""}`}>{value.toLocaleString("ar-EG")}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
