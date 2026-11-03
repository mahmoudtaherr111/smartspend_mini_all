import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { PLATFORM, SOURCE, STORE, SUBSCRIPTION, count, word } from "../ui/words";

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", day: "numeric", month: "short" }).format(new Date(iso));

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border bg-background p-4">
      <h2 className="font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function share(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/** The shade of a retention cell: darker green for a higher share, so the triangle reads at a glance. */
function cellStyle(value: number | null) {
  if (value === null) return { background: "transparent" };
  return { background: `rgba(5, 150, 105, ${Math.min(0.85, 0.08 + value / 110)})`, color: value > 55 ? "white" : undefined };
}

/** Are people coming, recording, and coming back; how they record; which phones and versions they use. */
export function Growth() {
  const [days, setDays] = useState(30);
  const growth = trpc.adminConsole.growth.useQuery({ days });

  if (growth.isLoading) return <Loading />;
  if (!growth.data) return <LoadError message="ماقدرناش نجيب أرقام النمو." onRetry={() => growth.refetch()} />;
  const g = growth.data;
  const daily = g.daily.map((row) => ({ ...row, label: shortDay(row.day), activation: row.signups ? share(row.activated, row.signups) : null }));
  const totalSignups = g.daily.reduce((sum, row) => sum + row.signups, 0);
  const totalActivated = g.daily.reduce((sum, row) => sum + row.activated, 0);
  const totalRecords = g.sources.reduce((sum, row) => sum + row.count, 0);
  const totalSeen = g.platforms.reduce((sum, row) => sum + row.people, 0);

  return (
    <div>
      <PageHeader
        title="النمو"
        description="الناس بتيجي؟ بتسجل؟ بترجع؟ وبتستخدم التطبيق إزاي ومن أنهي موبايل. كل الأيام بتوقيت القاهرة."
        actions={
          <div className="flex gap-2">
            {[14, 30, 60].map((value) => (
              <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>
                آخر {value} يوم
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="كل يوم" note="اللي سجلوا عملية واحدة على الأقل، والحسابات الجديدة.">
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" reversed />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} orientation="right" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="recorders" name="سجّلوا" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="signups" name="حسابات جديدة" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="سجّلوا في أول يوم"
          note={`من ${count(totalSignups)} حساب جديد في الفترة، ${count(totalActivated)} سجّلوا أول عملية خلال 24 ساعة (${share(totalActivated, totalSignups)}%). ده أهم رقم في الأسابيع الأولى.`}
        >
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" reversed />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} orientation="right" />
                <Tooltip formatter={(value) => [`${value}%`, "سجّلوا في أول يوم"]} />
                <Bar dataKey="activation" name="سجّلوا في أول يوم" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="بيرجعوا؟"
          note="كل سطر ناس سجلوا في نفس الأسبوع، وكل خانة نسبة اللي منهم سجّلوا عملية في الأسبوع ده من بعد تسجيلهم. الخانات الفاضية لسه ما جاش وقتها."
        >
          {g.cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">مفيش حسابات جديدة في آخر 6 أسابيع.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-start font-medium">سجّلوا أسبوع</th>
                    <th className="px-2 py-2 text-start font-medium">عددهم</th>
                    {["أول أسبوع", "التاني", "التالت", "الرابع", "الخامس", "السادس"].map((label) => (
                      <th key={label} className="px-2 py-2 text-center font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.cohorts.map((cohort) => (
                    <tr key={cohort.weekStart} className="border-t">
                      <td className="px-2 py-1.5">{shortDay(cohort.weekStart)}</td>
                      <td className="num px-2 py-1.5">{count(cohort.size)}</td>
                      {cohort.weeks.map((value, index) => (
                        <td key={index} className="num px-1 py-1">
                          <div className="rounded px-2 py-1 text-center" style={cellStyle(value)}>{value === null ? "" : `${value}%`}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="بيسجلوا إزاي" note={`${count(totalRecords)} عملية في الفترة.`}>
          <ul className="space-y-2 text-sm">
            {[...g.sources].sort((a, b) => b.count - a.count).map((row) => (
              <li key={row.source}>
                <div className="flex justify-between"><span>{word(SOURCE, row.source)}</span><span className="num">{share(row.count, totalRecords)}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${share(row.count, totalRecords)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="من أنهي موبايل" note="الناس اللي استخدموا التطبيق في آخر 7 أيام.">
          {totalSeen === 0 ? (
            <p className="text-sm text-muted-foreground">لسه مفيش استخدام متسجل بالمنصة. بيبدأ يتسجل من أول نسخة فيها التحديث ده.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {g.platforms.map((row) => (
                <li key={row.platform}>
                  <div className="flex justify-between"><span>{word(PLATFORM, row.platform)}</span><span className="num">{count(row.people)} ({share(row.people, totalSeen)}%)</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${share(row.people, totalSeen)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
          {g.versions.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground">الإصدارات المستخدمة</div>
              <ul className="mt-1 divide-y text-sm">
                {[...g.versions].sort((a, b) => b.people - a.people).map((row) => (
                  <li key={`${row.platform}-${row.version}`} className="flex justify-between py-1.5">
                    <span>{word(PLATFORM, row.platform)} <span dir="ltr">{row.version}</span></span>
                    <span className="num">{count(row.people)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel title="الاشتراكات من المتاجر">
          {g.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">لسه مفيش اشتراكات من المتاجر.</p>
          ) : (
            <ul className="divide-y text-sm">
              {g.subscriptions.map((row) => (
                <li key={`${row.store}-${row.status}`} className="flex justify-between py-1.5">
                  <span>{word(STORE, row.store)} · {word(SUBSCRIPTION, row.status)}</span>
                  <span className="num">{count(row.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
