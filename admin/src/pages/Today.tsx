import { Link } from "react-router-dom";
import { CheckCircle2, CircleAlert, KeyRound, MessageSquare, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@admin/kit/button";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";

const n = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("en-US"));

function ago(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `من ${hours} ساعة`;
  return `من ${Math.round(hours / 24)} يوم`;
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClass = {
    neutral: "text-muted-foreground",
    good: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    bad: "text-red-700 dark:text-red-400",
  }[tone];
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="num mt-1 text-3xl font-bold">{value}</div>
      {note && <div className={`mt-1 text-xs ${toneClass}`}>{note}</div>}
    </div>
  );
}

function Task({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b py-3 last:border-b-0">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 text-sm">{text}</span>
      {action}
    </li>
  );
}

/** The home page: what happened today, what needs the admin, and whether the system is really up. */
export function Today() {
  const today = trpc.adminConsole.today.useQuery(undefined, { refetchInterval: 60_000 });

  if (today.isLoading) return <Loading />;
  if (!today.data) return <LoadError message="ماقدرناش نجيب أرقام النهارده." onRetry={() => today.refetch()} />;
  const d = today.data;

  const change =
    d.recordedToday !== null && d.recordedYesterday ? Math.round(((d.recordedToday - d.recordedYesterday) / d.recordedYesterday) * 100) : null;
  const costShare = d.aiCostToday !== null && d.aiDailyCapUsd > 0 ? d.aiCostToday / d.aiDailyCapUsd : null;
  const failShare = d.callsHour && d.failedCallsHour !== null ? d.failedCallsHour / d.callsHour : 0;

  const tasks: ReactNode[] = [];
  if (d.openTickets) {
    tasks.push(
      <Task
        key="tickets"
        icon={<MessageSquare className="size-5 text-red-600" aria-hidden />}
        text={`${d.openTickets} تذكرة دعم من غير رد، أقدمها ${ago(d.oldestTicketAt)}`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/support">رد</Link>
          </Button>
        }
      />,
    );
  }
  if (failShare >= 0.05) {
    tasks.push(
      <Task
        key="ai-failing"
        icon={<Sparkles className="size-5 text-amber-600" aria-hidden />}
        text={`${Math.round(failShare * 100)}% من نداءات الذكاء فشلت في آخر ساعة (${n(d.failedCallsHour)} من ${n(d.callsHour)})`}
      />,
    );
  }
  if (d.unresolvedKeyErrors) {
    tasks.push(
      <Task
        key="keys"
        icon={<KeyRound className="size-5 text-amber-600" aria-hidden />}
        text={`${d.unresolvedKeyErrors} خطأ في مفاتيح الموصلات لسه ما اتحلش`}
      />,
    );
  }
  if (costShare !== null && costShare >= 0.8) {
    tasks.push(
      <Task
        key="cost"
        icon={<CircleAlert className="size-5 text-amber-600" aria-hidden />}
        text={`تكلفة الذكاء النهارده وصلت ${Math.round(costShare * 100)}% من السقف. لو وصلت 100% المساعد هيقف لحد نص الليل.`}
      />,
    );
  }

  const up = (ok: boolean | null, label: string) =>
    ok === null ? null : (
      <span className={`inline-flex items-center gap-1.5 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
        {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
        {label} {ok ? "شغالة" : "واقفة"}
      </span>
    );

  return (
    <div>
      <PageHeader
        title="النهارده"
        description="الأرقام دي من العمليات اللي الناس سجّلتها فعلًا، مش من مرات فتح التطبيق. بتتحدث كل دقيقة."
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="أرقام النهارده">
        <Metric
          label="سجّلوا النهارده"
          value={n(d.recordedToday)}
          note={change === null ? "مفيش أرقام امبارح للمقارنة" : `${change >= 0 ? "+" : ""}${change}% عن امبارح`}
          tone={change === null ? "neutral" : change >= 0 ? "good" : "warn"}
        />
        <Metric label="سجّلوا الأسبوع ده" value={n(d.recordedWeek)} note={`حسابات جديدة: ${n(d.signupsWeek)}`} />
        <Metric
          label="رجعوا بعد أسبوع"
          value={d.returnedPercent === null ? "—" : `${d.returnedPercent}%`}
          note="من اللي سجّلوا الأسبوع اللي فات ورجعوا سجّلوا تاني"
          tone={d.returnedPercent === null ? "neutral" : d.returnedPercent >= 40 ? "good" : "warn"}
        />
        <Metric
          label="تكلفة الذكاء النهارده"
          value={d.aiCostToday === null ? "—" : `$${d.aiCostToday.toFixed(2)}`}
          note={d.aiDailyCapUsd > 0 ? `من سقف $${d.aiDailyCapUsd}` : "من غير سقف يومي"}
          tone={costShare === null ? "neutral" : costShare >= 0.8 ? "bad" : "good"}
        />
        <Metric label="مشتركين نشطين من المتاجر" value={n(d.activeStoreSubs)} />
        <Metric label="تذاكر دعم مفتوحة" value={n(d.openTickets)} tone={d.openTickets ? "warn" : "good"} note={d.openTickets ? ago(d.oldestTicketAt) : "مفيش حد مستني"} />
        <Metric
          label="نداءات الذكاء آخر ساعة"
          value={n(d.callsHour)}
          note={d.callsHour ? `فشل منها ${n(d.failedCallsHour)}` : d.latestAiCallAt ? `آخر نداء ${ago(d.latestAiCallAt)}` : "مفيش نداءات لسه"}
          tone={failShare >= 0.05 ? "bad" : "neutral"}
        />
      </section>

      <section className="mt-6 rounded-xl border bg-background p-4" aria-labelledby="needs-you">
        <h2 id="needs-you" className="mb-1 font-bold">
          محتاج تدخلك
        </h2>
        {tasks.length ? (
          <ul>{tasks}</ul>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">مفيش حاجة مستنياك دلوقتي.</p>
        )}
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-background p-4 text-sm" aria-label="حالة السيستم">
        {up(d.health.database, "قاعدة البيانات")}
        {up(d.health.redis, "الذاكرة السريعة (Redis)")}
        {d.health.redis === null && <span className="text-muted-foreground">الذاكرة السريعة (Redis) مش متوصلة في الإعداد ده</span>}
        <span className="text-muted-foreground">آخر فحص: {ago(d.checkedAt)}</span>
      </section>
    </div>
  );
}
