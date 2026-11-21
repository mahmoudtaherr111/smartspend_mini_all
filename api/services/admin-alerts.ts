/**
 * Telling the admins something needs them: an in-app notification to every admin, which the console's «النهارده» page
 * lists and the phone app shows (decision 0035). There is no other channel yet.
 *
 * `watchOperations` runs every 15 minutes (`api/boot.ts`): a background job that is late or failing, and a server check
 * that fails (`server-status.ts`), each reach the admins once per quiet period, never every quarter hour.
 */
import { and, desc, eq } from "drizzle-orm";
import { inAppNotifications, localUsers, users } from "../../db/schema";
import { createLogger } from "../lib/log";
import { stateGet, stateSet } from "../lib/redis-client";
import { getDb } from "../queries/connection";
import { loadJobOverview } from "./job-runs";
import { loadServerStatus } from "./server-status";

const log = createLogger("admin-alerts");

/** Where an admin alert points: the console reads its own alerts by this. */
export const ADMIN_ALERT_URL = "/admin";

/** Sends `title` to every admin; with `dedupeKey`, at most once per `quietSeconds` across replicas. */
export async function notifyAdmins(title: string, body: string, dedupeKey?: string, quietSeconds = 3600): Promise<number> {
  if (dedupeKey) {
    const key = `capture:alert:${dedupeKey}`;
    if (await stateGet(key)) return 0;
    await stateSet(key, quietSeconds, "1");
  }
  const db = getDb();
  const admins = [
    ...(await db.select({ userId: users.id }).from(users).where(eq(users.role, "admin"))).map((row) => ({ userId: row.userId, userType: "oauth" })),
    ...(await db.select({ userId: localUsers.id }).from(localUsers).where(eq(localUsers.role, "admin"))).map((row) => ({ userId: row.userId, userType: "local" })),
  ];
  if (admins.length > 0) await db.insert(inAppNotifications).values(admins.map((admin) => ({ ...admin, title, body, actionUrl: ADMIN_ALERT_URL })));
  return admins.length;
}

/** The words of a failing server check, for an alert; the console's status page says the rest. */
const CHECK_TITLES: Record<string, string> = {
  database: "قاعدة البيانات مش بترد",
  migrations: "فيه تحديث لقاعدة البيانات ماتطبقش",
  redis: "Redis متحدد بس مش متوصل",
  jobs: "المهام في الخلفية واقفة",
  push: "إشعارات الموبايل واقفة",
  storage: "صور الفواتير بتتحفظ على ديسك السيرفر",
  ai: "الذكاء الاصطناعي واقف",
};

/** One pass: what is late or failing now, each sent once until it has been quiet for its period. */
export async function watchOperations(now = new Date(), notify: typeof notifyAdmins = notifyAdmins): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  const { jobs, recorded } = await loadJobOverview(now);
  if (recorded) {
    for (const job of jobs) {
      if (job.late) {
        if (await notify("مهمة متأخرة", `«${job.jobName}» مااشتغلتش بنجاح في ميعادها. افتح «التشغيل» في لوحة الإدارة.`, `job-late:${job.jobName}`, 6 * 3600)) sent.push(`late:${job.jobName}`);
      } else if (job.lastStatus === "failed") {
        if (await notify("مهمة بتقع", `«${job.jobName}» وقعت آخر مرة (${job.lastErrorName ?? "خطأ"}). افتح «التشغيل» في لوحة الإدارة.`, `job-failed:${job.jobName}`, 3600)) sent.push(`failed:${job.jobName}`);
      }
    }
  }
  // A check must fail on two passes in a row: right after a restart, Redis or the database can be a moment from
  // connected, and that is not worth waking anyone for.
  const status = await loadServerStatus(now);
  for (const check of status.checks.filter((item) => item.state === "fail")) {
    const title = CHECK_TITLES[check.id];
    if (!title) continue;
    const seenKey = `ops:failing:${check.id}`;
    const failingBefore = Boolean(await stateGet(seenKey));
    await stateSet(seenKey, 40 * 60, "1");
    if (!failingBefore) continue;
    if (await notify(title, "افتح «حالة السيرفر» في لوحة الإدارة، وهتلاقي إيه اللي ناقص ويتعمل إيه.", `check:${check.id}`, 6 * 3600)) sent.push(`check:${check.id}`);
  }
  if (sent.length) log.warn({ event: "admin_alerts.sent", alerts: sent }, "Admins were alerted");
  return { sent };
}

/** The signed-in admin's latest alerts, newest first. */
export async function listAdminAlerts(admin: { id: number; type: string }, limit = 20) {
  return getDb()
    .select({ id: inAppNotifications.id, title: inAppNotifications.title, body: inAppNotifications.body, isRead: inAppNotifications.isRead, createdAt: inAppNotifications.createdAt })
    .from(inAppNotifications)
    .where(and(eq(inAppNotifications.userId, admin.id), eq(inAppNotifications.userType, admin.type), eq(inAppNotifications.actionUrl, ADMIN_ALERT_URL)))
    .orderBy(desc(inAppNotifications.id))
    .limit(limit);
}

/** Marks the signed-in admin's alerts as read. */
export async function markAdminAlertsRead(admin: { id: number; type: string }): Promise<void> {
  await getDb()
    .update(inAppNotifications)
    .set({ isRead: true })
    .where(and(eq(inAppNotifications.userId, admin.id), eq(inAppNotifications.userType, admin.type), eq(inAppNotifications.actionUrl, ADMIN_ALERT_URL)));
}
