import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { Confirm } from "../ui/Confirm";
import { LoadError, Loading } from "../ui/states";
import {
  ACCOUNT,
  CHANNEL,
  PLAN,
  PLATFORM,
  ROLE,
  SOURCE,
  STORE,
  SUBSCRIPTION,
  TICKET,
  count,
  day,
  dayTime,
  money,
  usd,
  word,
} from "../ui/words";

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rounded-xl border bg-background p-4">
      <h2 className="font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-0.5 font-bold">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

type Pending =
  | { kind: "plan"; value: string }
  | { kind: "role"; value: string }
  | { kind: "limit"; value: number }
  | { kind: "reset" }
  | { kind: "delete" }
  | null;

/** One person, everything about them, and every action an admin may take on their account. */
export function Person() {
  const params = useParams();
  const navigate = useNavigate();
  const type = params.type === "oauth" ? "oauth" : "local";
  const id = Number(params.id);
  const utils = trpc.useUtils();
  const person = trpc.adminConsole.person.useQuery({ type, id }, { enabled: id > 0 });
  const [pending, setPending] = useState<Pending>(null);
  const [limit, setLimit] = useState("");

  const done = (message: string) => {
    toast.success(message);
    setPending(null);
    void utils.adminConsole.person.invalidate({ type, id });
    void utils.adminConsole.searchPeople.invalidate();
  };
  const failed = (error: { message: string }) => toast.error(error.message);
  const setPlan = trpc.admin.updateUserPlanV2.useMutation({ onSuccess: () => done("الباقة اتغيرت"), onError: failed });
  const setRole = trpc.admin.updateUserRole.useMutation({ onSuccess: () => done("الصلاحية اتغيرت"), onError: failed });
  const setTokenLimit = trpc.admin.setUserTokenLimit.useMutation({ onSuccess: () => done("حد الذكاء اتحفظ"), onError: failed });
  const resetTokens = trpc.admin.resetUserTokens.useMutation({ onSuccess: () => done("استهلاك الذكاء اتصفّر"), onError: failed });
  const revoke = trpc.admin.revokeSession.useMutation({ onSuccess: () => done("الجهاز اتسجل خروجه"), onError: failed });
  const remove = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("الحساب اتمسح");
      navigate("/people");
    },
    onError: failed,
  });

  if (person.isLoading) return <Loading />;
  if (person.data === null) return <LoadError message="الحساب ده مش موجود، يمكن اتمسح." onRetry={() => navigate("/people")} />;
  if (!person.data) return <LoadError message="ماقدرناش نجيب بيانات الحساب." onRetry={() => person.refetch()} />;
  const p = person.data;
  const busy = setPlan.isPending || setRole.isPending || setTokenLimit.isPending || resetTokens.isPending || remove.isPending;
  const who = { userId: p.id, userType: p.type };

  return (
    <div className="space-y-4">
      <Link to="/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        كل الناس
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{p.name || "من غير اسم"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {word(ACCOUNT, p.type)} · <span dir="ltr">{p.contact ?? "—"}</span> · سجّل {day(p.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{word(PLAN, p.plan)}</Badge>
          {p.role !== "user" && <Badge variant="outline">{word(ROLE, p.role)}</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact label="عمليات الشهر ده" value={count(p.recordedThisMonth)} />
        <Fact label="كل العمليات" value={count(p.recordedTotal)} />
        <Fact label="آخر عملية" value={day(p.lastRecordedAt)} />
        <Fact label="أيام متتالية" value={count(p.currentStreak)} />
        <Fact label="نداءات الذكاء الشهر ده" value={count(p.aiThisMonth.calls)} />
        <Fact label="توكنز داخلة / خارجة" value={`${count(p.aiThisMonth.input)} / ${count(p.aiThisMonth.output)}`} />
        <Fact label="تكلفة الذكاء الشهر ده" value={usd(p.aiThisMonth.usd)} />
        <Fact label="آخر دخول" value={day(p.lastSignInAt)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="آخر العمليات" note="آخر 20 عملية سجلها، بالمصدر اللي جت منه.">
          {p.recent.length === 0 ? (
            <Empty>لسه ما سجّلش أي عملية.</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {p.recent.map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{row.description || row.rawText || row.category}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.category} · {word(SOURCE, row.source)} · {dayTime(row.date)}
                    </div>
                  </div>
                  <div className={`num shrink-0 font-bold ${row.type === "income" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                    {row.type === "income" ? "+" : ""}
                    {money(row.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="آخر نداءات الذكاء" note="كل نداء بالموديل اللي رد، والتوكنز، والتكلفة.">
          {p.aiCalls.length === 0 ? (
            <Empty>مفيش نداءات ذكاء ليه لسه.</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {p.aiCalls.map((call) => (
                <li key={call.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div>
                      {word(CHANNEL, call.channel)}
                      {call.httpStatus && call.httpStatus >= 400 && (
                        <Badge variant="destructive" className="ms-2">
                          فشل
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground" dir="auto">
                      {call.provider} · {call.model} · {dayTime(call.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-end text-xs">
                    <div className="num font-bold">{usd(call.usd)}</div>
                    <div className="num text-muted-foreground">
                      {count(call.input)} داخل · {count(call.output)} خارج
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="الأجهزة" note="الأجهزة اللي داخل منها دلوقتي. تسجيل خروج جهاز بيقفل جلسته فورًا.">
          {p.devices.length === 0 ? (
            <Empty>مش داخل من أي جهاز دلوقتي.</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {p.devices.map((device) => (
                <li key={device.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div>{word(PLATFORM, device.platform)}</div>
                    <div className="text-xs text-muted-foreground">دخل {dayTime(device.createdAt)}</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate({ sessionId: device.id })}>
                    سجّل خروجه
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {p.captureDevices.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              رسايل البنوك شغالة على:{" "}
              {p.captureDevices.map((d) => `${word(PLATFORM, d.platform)} ${d.appVersion ?? ""} (آخر ظهور ${day(d.lastSeenAt)})`).join("، ")}
            </p>
          )}
        </Section>

        <Section title="الاشتراك والتذاكر">
          {p.purchases.length === 0 ? (
            <Empty>ما اشتركش من أي متجر.</Empty>
          ) : (
            <ul className="mb-3 divide-y text-sm">
              {p.purchases.map((purchase, index) => (
                <li key={index} className="py-2">
                  {word(STORE, purchase.store)} · {word(SUBSCRIPTION, purchase.status)} · لحد {day(purchase.expiresAt)}
                </li>
              ))}
            </ul>
          )}
          {p.tickets.length === 0 ? (
            <Empty>ما بعتش أي تذكرة دعم.</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {p.tickets.map((ticket) => (
                <li key={ticket.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate">{ticket.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {word(TICKET, ticket.status)} · {day(ticket.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="إجراءات على الحساب" note="كل إجراء بيتسجل في سجل الرقابة باسمك.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>الباقة</Label>
            <Select value={p.plan} onValueChange={(value) => value !== p.plan && setPending({ kind: "plan", value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>الصلاحية</Label>
            <Select value={p.role} onValueChange={(value) => value !== p.role && setPending({ kind: "role", value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token-limit">حد الذكاء الشهري ليه (توكنز)</Label>
            <div className="flex gap-2">
              <Input
                id="token-limit"
                inputMode="numeric"
                dir="ltr"
                placeholder="مثلًا 200000"
                value={limit}
                onChange={(event) => setLimit(event.target.value.replace(/[^\d]/g, ""))}
              />
              <Button variant="outline" disabled={!limit} onClick={() => setPending({ kind: "limit", value: Number(limit) })}>
                احفظ
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">بيغلب حد الباقة للشخص ده بس.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" onClick={() => setPending({ kind: "reset" })}>
              صفّر استهلاك الذكاء
            </Button>
            <Button variant="destructive" onClick={() => setPending({ kind: "delete" })}>
              امسح الحساب
            </Button>
          </div>
        </div>
      </Section>

      <Confirm
        open={pending?.kind === "plan"}
        onOpenChange={(open) => !open && setPending(null)}
        title="تغيير الباقة"
        confirmLabel="غيّر الباقة"
        busy={busy}
        onConfirm={() => pending?.kind === "plan" && setPlan.mutate({ ...who, plan: pending.value as "free" | "pro" | "ultra" })}
      >
        <p>
          باقة {p.name || "الحساب"} هتتغير من «{word(PLAN, p.plan)}» لـ«{pending?.kind === "plan" ? word(PLAN, pending.value) : ""}» فورًا،
          من غير ما يدفع. لو مشترك من متجر، المتجر هيفضل يحاسبه لحد ما يلغي من هناك.
        </p>
      </Confirm>
      <Confirm
        open={pending?.kind === "role"}
        onOpenChange={(open) => !open && setPending(null)}
        title="تغيير الصلاحية"
        confirmLabel="غيّر الصلاحية"
        danger={pending?.kind === "role" && pending.value === "admin"}
        typeToConfirm={pending?.kind === "role" && pending.value === "admin" ? "أدمن" : undefined}
        busy={busy}
        onConfirm={() => pending?.kind === "role" && setRole.mutate({ ...who, role: pending.value as "user" | "moderator" | "admin" })}
      >
        <p>
          صلاحية {p.name || "الحساب"} هتبقى «{pending?.kind === "role" ? word(ROLE, pending.value) : ""}».
          {pending?.kind === "role" && pending.value === "admin" && " الأدمن بيقدر يغيّر كل حاجة في الموقع، بما فيها الفلوس وبيانات الناس."}
          {pending?.kind === "role" && pending.value === "moderator" && " المشرف بيرد على الدعم بس."}
        </p>
      </Confirm>
      <Confirm
        open={pending?.kind === "limit"}
        onOpenChange={(open) => !open && setPending(null)}
        title="حد الذكاء الشهري"
        confirmLabel="احفظ الحد"
        busy={busy}
        onConfirm={() => pending?.kind === "limit" && setTokenLimit.mutate({ ...who, monthlyTokenLimit: pending.value })}
      >
        <p>
          {p.name || "الحساب"} هيقدر يستخدم لحد {pending?.kind === "limit" ? count(pending.value) : ""} توكن في الشهر، بدل حد باقته.
        </p>
      </Confirm>
      <Confirm
        open={pending?.kind === "reset"}
        onOpenChange={(open) => !open && setPending(null)}
        title="تصفير استهلاك الذكاء"
        confirmLabel="صفّر"
        busy={busy}
        onConfirm={() => resetTokens.mutate(who)}
      >
        <p>عداد التوكنز بتاعه هيرجع صفر، فيقدر يستخدم الذكاء تاني لحد حد باقته. التكلفة اللي اتصرفت فعلًا مش هتتمسح من السجل.</p>
      </Confirm>
      <Confirm
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title="مسح الحساب نهائيًا"
        confirmLabel="امسح نهائيًا"
        danger
        typeToConfirm="امسح"
        busy={busy}
        onConfirm={() => remove.mutate(who)}
      >
        <p>
          كل بيانات {p.name || "الحساب"} هتتمسح نهائيًا: {count(p.recordedTotal)} عملية، ومحافظه، وأهدافه، ومحادثاته. مفيش رجوع في ده.
        </p>
      </Confirm>
    </div>
  );
}
