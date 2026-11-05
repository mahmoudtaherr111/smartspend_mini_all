import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading } from "../ui/states";
import { dayTime } from "../ui/words";

/** What each background job does, in words; a job missing here shows its own name. */
const JOB: Record<string, string> = {
  "daily-auth-cleanup": "تنضيف الجلسات والأكواد القديمة",
  "classification-log-cleanup": "تنضيف سجل التصنيف",
  "coaching-reminders": "تذكيرات المدرب",
  "scheduled-notifications": "الإشعارات المجدولة",
  "whatsapp-outbox": "بعت رسايل واتساب",
  "cashflow-cutover": "تحويل الدفتر للدخل والصرف",
  "cashflow-cutover-at-boot": "تحويل الدفتر أول تشغيل",
  "capture-ai-sweep": "قراية رسايل البنك المستنية",
  "capture-silent-devices": "تنبيه الموبايلات اللي بطّلت تبعت",
  "capture-breaker": "إيقاف البنوك اللي رسايلها بتتلغي كتير",
  "taxonomy-migration": "نقل الفئات القديمة",
  "memory-embedding-backfill": "ذاكرة المساعد",
  "voice-call-memory": "ملخص المكالمات",
  "smart-activity-notifications": "إشعارات التذكير بالتسجيل",
  "monthly-report-generation": "التقرير الشهري",
  "monthly-behavior-snapshots": "صورة سلوك الشهر",
  "nightly-rollup-reconciliation": "مراجعة أرقام الأيام",
  "data-retention-lifecycle": "مسح البيانات اللي مدتها خلصت",
  "daily-subscription-expiry": "انتهاء الاشتراكات",
  "seed-default-templates": "قوالب الإشعارات الأساسية",
  "seed-capture-catalog": "قايمة البنوك الأساسية",
};

function every(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes === 1) return "كل دقيقة";
  if (minutes < 60) return `كل ${minutes} دقيقة`;
  if (minutes === 24 * 60) return "كل يوم";
  if (minutes === 7 * 24 * 60) return "كل أسبوع";
  if (minutes >= 28 * 24 * 60) return "كل شهر";
  return `كل ${Math.round(minutes / 60)} ساعة`;
}

/** The background jobs as the server recorded them: one row per job, the late and failing ones first. */
export function Jobs() {
  const jobs = trpc.adminConsole.jobs.useQuery(undefined, { refetchInterval: 60_000 });
  if (jobs.isLoading) return <Loading />;
  if (!jobs.data) return <LoadError message="ماقدرناش نجيب المهام." onRetry={() => jobs.refetch()} />;
  if (!jobs.data.recorded) {
    return <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">السيرفر لسه مابيسجلش المهام: جدول `scheduled_job_runs` مش موجود. شغّل `npm run db:migrate`.</p>;
  }
  const rows = [...jobs.data.jobs].sort((a, b) => Number(b.late || b.lastStatus === "failed") - Number(a.late || a.lastStatus === "failed"));
  const ranAny = rows.some((row) => row.runs24h > 0);
  return (
    <div className="mt-3 space-y-2">
      {!ranAny && <p className="text-sm text-amber-700 dark:text-amber-400">مفيش ولا مهمة اشتغلت في آخر 24 ساعة: غالباً مفيش سيرفر شغال بـ ENABLE_CRONS=true.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="p-2 text-start">المهمة</th><th className="p-2 text-start">بتشتغل</th><th className="p-2 text-start">آخر مرة</th><th className="p-2 text-start">آخر نجاح</th><th className="p-2 text-start">آخر 24 ساعة</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.jobName} className={row.late || row.lastStatus === "failed" ? "bg-red-50 dark:bg-red-950/30" : ""}>
                <td className="p-2"><div className="font-semibold">{JOB[row.jobName] ?? row.jobName}</div><div className="text-xs text-muted-foreground" dir="ltr">{row.jobName}</div></td>
                <td className="p-2">{row.schedule ? every(row.intervalMinutes) : "مرة أول تشغيل"}</td>
                <td className="p-2">
                  {row.lastStartedAt ? dayTime(row.lastStartedAt) : "لسه"}
                  {row.lastStatus === "failed" && <div className="text-xs text-red-700 dark:text-red-400">وقعت ({row.lastErrorName})</div>}
                  {row.lastDurationMs !== null && row.lastStatus !== "failed" && <div className="text-xs text-muted-foreground">خدت {row.lastDurationMs < 1000 ? `${row.lastDurationMs} مللي` : `${(row.lastDurationMs / 1000).toFixed(1)} ث`}</div>}
                </td>
                <td className="p-2">{row.lastOkAt ? dayTime(row.lastOkAt) : "—"}{row.late && <div className="text-xs font-semibold text-red-700 dark:text-red-400">متأخرة</div>}</td>
                <td className="p-2">{row.runs24h} مرة{row.failures24h > 0 && <span className="text-red-700 dark:text-red-400"> · {row.failures24h} وقعت</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
