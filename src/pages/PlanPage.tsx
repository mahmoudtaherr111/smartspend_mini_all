/**
 * «خطتك والتزاماتك»: what is free until payday from the user's own records, the plan they agreed to with Smart and
 * its steps and reminders, and the commitments and expected income they told the app about, with which payment paid
 * which due date. Everything comes from `coach.*` (api/coach-router.ts); nothing here computes money itself.
 */
import { useMemo, useState } from "react";
import { useNavigate, useInRouterContext } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CalendarClock, CheckCircle2, CircleDashed, ListChecks, Plus, Wallet } from "lucide-react";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";

const egp = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج`;

const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: "اتدفع", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  partial: { label: "اتدفع جزء", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  due: { label: "لسه", tone: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  overdue: { label: "فات ميعاده", tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
  unconfirmed: { label: "اتدفع ولا لأ؟", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
};

const KINDS: Array<{ id: string; label: string; direction: "in" | "out" }> = [
  { id: "rent", label: "إيجار", direction: "out" },
  { id: "bill", label: "فاتورة", direction: "out" },
  { id: "subscription", label: "اشتراك", direction: "out" },
  { id: "school", label: "مدارس", direction: "out" },
  { id: "installment", label: "قسط", direction: "out" },
  { id: "debt", label: "دين أو سلفة", direction: "out" },
  { id: "gam3eya", label: "جمعية", direction: "out" },
  { id: "salary", label: "مرتب", direction: "in" },
  { id: "freelance", label: "شغل حر", direction: "in" },
  { id: "other", label: "حاجة تانية", direction: "out" },
];

const RECURRENCE = [
  { id: "monthly", label: "كل شهر" },
  { id: "weekly", label: "كل أسبوع" },
  { id: "yearly", label: "كل سنة" },
  { id: "once", label: "مرة واحدة" },
];

function PositionCard({ position }: { position: NonNullable<ReturnType<typeof useOverview>["data"]>["position"] }) {
  const notes = [
    position.wallets.count === 0 ? "مفيش محافظ متسجلة، فالحساب بيبدأ من صفر." : null,
    position.wallets.unknownAge ? "فيه رصيد مش معروف اتسجل امتى؛ حدّثه من المحافظ." : null,
    position.wallets.oldestObservedDay ? `أقدم رصيد متسجل يوم ${position.wallets.oldestObservedDay}، والمصاريف بعده مش متخصومة منه.` : null,
    position.duesUnknownAmount.length ? `مبلغها مش معروف: ${position.duesUnknownAmount.map((o) => o.title).join("، ")}.` : null,
    position.undated.length ? `ميعادها مش معروف فمش محسوبة: ${position.undated.map((u) => u.title).join("، ")}.` : null,
  ].filter(Boolean);
  return (
    <Card className="border-emerald-500/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Wallet className="h-4 w-4 text-emerald-600" />
          {position.untilIsPayday ? `لحد القبض (${position.until})` : `لحد ${position.until}`}
          <span className="text-xs font-normal text-muted-foreground">· {position.days} يوم</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">اللي في المحافظ</div>
            <div className="font-bold">{egp(position.wallets.total)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">عليك ولسه مادفعتوش</div>
            <div className="font-bold">{egp(position.duesKnown)}</div>
          </div>
          <div className="col-span-2 rounded-xl bg-emerald-500/5 p-3">
            <div className="text-xs text-muted-foreground">الفاضل بعد الالتزامات (من غير أي دخل جاي)</div>
            <div className={`text-lg font-bold ${position.freeBeforeIncome < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
              {egp(position.freeBeforeIncome)}
            </div>
          </div>
          {position.incomeConfirmed > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">دخل مؤكد جاي</div>
              <div className="font-bold">{egp(position.incomeConfirmed)}</div>
            </div>
          )}
          {position.incomeEstimated > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">دخل متوقع (لو وصل)</div>
              <div className="font-bold text-muted-foreground">{egp(position.incomeEstimated)}</div>
            </div>
          )}
        </div>
        {notes.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function useOverview() {
  return trpc.coach.overview.useQuery();
}

function PlanCard({ plan }: { plan: NonNullable<NonNullable<ReturnType<typeof useOverview>["data"]>["plan"]> }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.coach.overview.invalidate();
  const stepStatus = trpc.coach.setStepStatus.useMutation({ onSuccess: refresh });
  const setReminder = trpc.coach.setReminder.useMutation({
    onSuccess: () => { toast.success("التذكير اتظبط جوه التطبيق."); void refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const cancelReminder = trpc.coach.cancelReminder.useMutation({ onSuccess: refresh });
  const endPlan = trpc.coach.endPlan.useMutation({ onSuccess: refresh });
  const [remindFor, setRemindFor] = useState<number | null>(null);
  const [remindAt, setRemindAt] = useState("");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold"><ListChecks className="h-4 w-4 text-indigo-600" />{plan.title}</div>
            {plan.goal && <p className="mt-1 text-xs text-muted-foreground">{plan.goal}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              من {plan.acceptedAt?.slice(0, 10)}{plan.reviewDay ? ` · المراجعة ${plan.reviewDay}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => endPlan.mutate({ planId: plan.id, status: "completed" })}>خلصت</Button>
        </div>
        {plan.evidence.length > 0 && (
          <p className="text-[11px] text-muted-foreground">اتفقنا عليها على: {plan.evidence.map((fact) => `${fact.label} ${egp(fact.value)}`).join("، ")}</p>
        )}
        <ul className="space-y-2">
          {plan.steps.map((step) => (
            <li key={step.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 text-sm">
                  {step.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                  <span className={step.status === "skipped" ? "text-muted-foreground line-through" : ""}>{step.title}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                  {step.status === "pending" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => stepStatus.mutate({ stepId: step.id, status: "done" })}>اتعملت</Button>
                      <Button size="sm" variant="ghost" onClick={() => stepStatus.mutate({ stepId: step.id, status: "skipped" })}>مش هعملها</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => stepStatus.mutate({ stepId: step.id, status: "pending" })}>رجّعها</Button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {step.reminderStatus === "scheduled" && step.remindAt ? (
                  <>
                    تذكير {new Date(step.remindAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })}
                    <Button size="sm" variant="link" className="h-auto p-0" onClick={() => cancelReminder.mutate({ stepId: step.id })}>إلغاء</Button>
                  </>
                ) : remindFor === step.id ? (
                  <>
                    <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="h-8 w-auto" aria-label="ميعاد التذكير بتوقيت القاهرة" />
                    <Button
                      size="sm"
                      disabled={!remindAt}
                      onClick={() => {
                        // The day and hour as picked, read on Cairo's clock by the server (the time shown beside it).
                        setReminder.mutate({ stepId: step.id, at: remindAt });
                        setRemindFor(null);
                      }}
                    >
                      ظبّط
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setRemindFor(step.id)}>فكّرني جوه التطبيق</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button className="text-xs text-muted-foreground underline" onClick={() => endPlan.mutate({ planId: plan.id, status: "cancelled" })}>
          إلغاء الخطة
        </button>
      </CardContent>
    </Card>
  );
}

function DueList({ due, settlements }: Pick<NonNullable<ReturnType<typeof useOverview>["data"]>, "due" | "settlements">) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState<string | null>(null);
  const settle = trpc.coach.settle.useMutation({
    onSuccess: () => { toast.success("اتسجل إنه اتدفع."); setOpen(null); void utils.coach.overview.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const unsettle = trpc.coach.unsettle.useMutation({
    onSuccess: () => { toast.success("اتفكّ ربط السداد؛ العملية نفسها موجودة زي ما هي."); void utils.coach.overview.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const openItem = useMemo(() => due.find((o) => `${o.cashflowId}:${o.dueDay}` === open) ?? null, [due, open]);
  const suggestions = trpc.coach.paymentSuggestions.useQuery(
    { cashflowId: openItem?.cashflowId ?? 0, dueDay: openItem?.dueDay ?? "2000-01-01" },
    { enabled: Boolean(openItem) },
  );
  if (!due.length) return <p className="text-sm text-muted-foreground">مفيش مواعيد متسجلة في الأيام دي.</p>;
  return (
    <ul className="space-y-2">
      {due.map((o) => {
        const key = `${o.cashflowId}:${o.dueDay}`;
        const status = STATUS[o.status];
        return (
          <li key={key} className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{o.direction === "in" ? "جاي: " : ""}{o.title}</div>
                <div className="text-xs text-muted-foreground">{o.dueDay}{o.amount !== null ? ` · ${egp(o.amount)}` : " · المبلغ مش معروف"}{o.certainty === "estimated" ? " · تقديري" : ""}</div>
                {o.contactName && <div className="text-xs text-muted-foreground">الشخص: {o.contactName}</div>}
                {o.status === "partial" && <div className="text-xs text-muted-foreground">اتدفع {egp(o.paid)}{o.remaining !== null ? ` · فاضل ${egp(o.remaining)}` : ""}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className={status.tone} variant="secondary">{status.label}</Badge>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === key ? null : key)}>{o.status === "paid" ? "راجع السداد" : "اتدفع؟"}</Button>
              </div>
            </div>
            {open === key && (
              <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                {settlements.filter((s) => s.cashflowId === o.cashflowId && s.dueDay === o.dueDay).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2">
                    <span>{s.expenseId === null ? "سداد من غير عملية متسجلة" : "سداد مربوط بعملية"} · {egp(Number(s.amount))}</span>
                    <Button size="sm" variant="outline" disabled={unsettle.isPending} onClick={() => unsettle.mutate({ settlementId: s.id })}>فكّ ربط السداد</Button>
                  </div>
                ))}
                {o.status !== "paid" && (suggestions.isLoading ? <div className="text-muted-foreground">بيجيب العمليات القريبة…</div> : suggestions.error ? <div className="text-red-600">مش قادرين نجيب اقتراحات السداد دلوقتي. جرّب تاني.</div> : suggestions.data?.length ? (
                  <>
                    <div className="text-muted-foreground">عمليات قريبة ممكن تكون هي (اختار واحدة):</div>
                    {suggestions.data.map((s) => (
                      <Button key={s.id} size="sm" variant="secondary" className="me-2" disabled={settle.isPending} onClick={() => settle.mutate({ cashflowId: o.cashflowId, dueDay: o.dueDay, expenseId: s.id })}>
                        {s.description || s.category} · المتاح {egp(s.available)}
                      </Button>
                    ))}
                  </>
                ) : (
                  <div className="text-muted-foreground">مالقيناش عملية متسجلة شبهه.</div>
                ))}
                {o.status !== "paid" && <Button size="sm" variant="ghost" onClick={() => settle.mutate({ cashflowId: o.cashflowId, dueDay: o.dueDay, expenseId: null, amount: o.remaining ?? undefined })} disabled={o.remaining === null || settle.isPending}>
                  دفعته من غير ما أسجله
                </Button>}
                <p className="text-muted-foreground">فكّ الربط بيرجع الميعاد غير مدفوع، وبيسيب العملية المتسجلة زي ما هي.</p>
                {o.kind === "debt" && <p className="text-muted-foreground">ده يعلّم الميعاد إنه اتدفع بس. رصيد الدين بيتغيّر لما تسجّل السداد في عملياتك.</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AddCommitment() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("rent");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [recurrence, setRecurrence] = useState("monthly");
  const [startDay, setStartDay] = useState("");
  const [estimated, setEstimated] = useState(false);
  const [contactId, setContactId] = useState("none");
  const [debtDirection, setDebtDirection] = useState<"in" | "out">("out");
  const contacts = trpc.profile.listContacts.useQuery({ filter: "personal" }, { enabled: open && kind === "debt" });
  const add = trpc.coach.addCashflow.useMutation({
    onSuccess: () => { toast.success("اتضاف."); setOpen(false); setTitle(""); setAmount(""); setStartDay(""); setContactId("none"); void utils.coach.overview.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const direction = kind === "debt" ? debtDirection : KINDS.find((k) => k.id === kind)?.direction ?? "out";
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Plus className="me-1 h-4 w-4" />ضيف التزام أو دخل جاي</Button>;
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RECURRENCE.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {kind === "debt" && (
          <>
            <Select value={debtDirection} onValueChange={(value) => setDebtDirection(value as "in" | "out")}>
              <SelectTrigger aria-label="اتجاه رد الدين"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="out">أنا هردّ الفلوس</SelectItem>
                <SelectItem value="in">هترجعلي الفلوس</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger aria-label="صاحب الدين"><SelectValue placeholder="اختار الشخص" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">من غير ربط بشخص</SelectItem>
                {contacts.data?.contacts.map((contact) => <SelectItem key={contact.id} value={String(contact.id)}>{contact.name}{contact.relation ? ` (${contact.relation})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {contacts.error && <p className="text-xs text-red-600">مش قادرين نجيب الأشخاص دلوقتي. جرّب تاني.</p>}
            <p className="text-xs text-muted-foreground">ده ميعاد ردّ الدين بس، مش تسجيل سلفة جديدة أو سداد.</p>
          </>
        )}
        <Input placeholder="الاسم (إيجار الشقة، قسط الموبايل…)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input inputMode="decimal" placeholder="المبلغ (سيبه فاضي لو مش عارفه)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className="block text-xs text-muted-foreground">
          أول ميعاد (سيبه فاضي لو مش عارفه)
          <Input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} className="mt-1" />
        </label>
        {direction === "in" && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />
            المبلغ أو الميعاد مش مضمون
          </label>
        )}
        <div className="flex gap-2">
          <Button
            disabled={title.trim().length < 2 || add.isPending}
            onClick={() => add.mutate({
              kind: kind as never,
              direction,
              title: title.trim(),
              amount: amount.trim() ? Number(amount.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".").replace(/[,،٬\s]/g, "")) : null,
              recurrence: recurrence as never,
              startDay: startDay || null,
              certainty: direction === "in" && estimated ? "estimated" : "confirmed",
              contactId: kind === "debt" && contactId !== "none" ? Number(contactId) : null,
            })}
          >
            احفظ
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RouterPlanBackButton() {
  const navigate = useNavigate();
  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/more");
    }
  };
  return (
    <button
      onClick={handleBack}
      className="tap-target active-press flex size-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
      aria-label="الرجوع"
    >
      <ArrowRight className="size-5" />
    </button>
  );
}

function PlanBackButton() {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <RouterPlanBackButton />;
  }
  return (
    <button
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          window.history.back();
        } else if (typeof window !== "undefined") {
          window.location.href = "/more";
        }
      }}
      className="tap-target active-press flex size-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200"
      aria-label="الرجوع"
    >
      <ArrowRight className="size-5" />
    </button>
  );
}

export default function PlanPage() {
  const overview = useOverview();
  const data = overview.data;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-4" dir="rtl">
      <SEOMeta title="خطتك والتزاماتك - SmartSpend" />
      <div className="flex items-center gap-3">
        <PlanBackButton />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">خطتك والتزاماتك</h1>
      </div>
      {overview.isLoading ? (
        <p className="text-sm text-muted-foreground">بيحمّل…</p>
      ) : overview.error || !data ? (
        <p className="text-sm text-red-600">مش قادرين نجيب الخطة دلوقتي. جرّب تاني.</p>
      ) : (
        <>
          <PositionCard position={data.position} />
          {data.plan ? (
            <PlanCard plan={data.plan} />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                مفيش خطة متفق عليها. اتكلم مع سمارت عن هدفك، ولو اتفقتوا على خطوات بيتحفظوا هنا بموافقتك بس.
              </CardContent>
            </Card>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-bold">المواعيد</h2>
            <DueList due={data.due} settlements={data.settlements ?? []} />
          </section>
          <AddCommitment />
        </>
      )}
    </div>
  );
}
