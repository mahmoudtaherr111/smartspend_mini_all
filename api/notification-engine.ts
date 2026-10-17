import { db } from "./queries/connection";
import { notificationTemplates, inAppNotifications, notificationLogs, pushSubscriptions, users, localUsers, userProfiles, expenses, expenseDailyRollups } from "../db/schema";
import { eq, and, or, lte, gte, lt, sql, isNull, inArray } from "drizzle-orm";
import webpush from "web-push";
import { messaging, isFirebaseInitialized } from "./services/firebase";
import { env } from "./lib/env";
import { businessDateKey, businessDayRange, businessMonthRange } from "./lib/app-time";
import { createLogger } from "./lib/log";
import { notificationType } from "../contracts/notification-types";

const log = createLogger("notifications");

const appUrl = env.APP_URL || "http://localhost:3000";
// The app icon beside the text, and an alpha-only mark for Android's status bar: a full-colour image there shows
// as a white square. No large image: the logo used to fill the expanded notification.
const iconUrl = `${appUrl}/icon-192.png`;
const badgeUrl = `${appUrl}/badge-96.png`;

/** One push, shaped the same for FCM and plain Web Push: grouped by type, written in the user's direction. */
interface PushContent {
  title: string;
  body: string;
  actionUrl: string;
  type: string;
  lang: string;
}

function webPushOptions(item: PushContent) {
  const dir: "ltr" | "rtl" = item.lang === "en" ? "ltr" : "rtl";
  return { icon: iconUrl, badge: badgeUrl, tag: item.type, dir, lang: item.lang };
}

export function fcmMessage(token: string, item: PushContent) {
  return {
    token,
    notification: { title: item.title, body: item.body },
    data: { url: item.actionUrl, type: item.type },
    webpush: { notification: webPushOptions(item), fcmOptions: { link: item.actionUrl } },
    apns: { payload: { aps: { sound: "default" } } },
  };
}

export function legacyPayload(item: PushContent): string {
  return JSON.stringify({ title: item.title, body: item.body, url: item.actionUrl, type: item.type, ...webPushOptions(item) });
}

function parseSegment(segment: any): any {
  if (!segment) return {};
  let result = segment;
  while (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch (e) {
      break;
    }
  }
  return result || {};
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendPushBatch(
  notifications: Array<PushContent & { sub: any }>
) {
  if (notifications.length === 0) return;

  const fcmMessages: any[] = [];
  const legacyWebPushList: any[] = [];

  for (const item of notifications) {
    const { sub } = item;
    if (isFirebaseInitialized && messaging && sub.fcmToken) {
      fcmMessages.push(fcmMessage(sub.fcmToken, item));
    } else if (sub.endpoint && sub.p256dh && sub.auth) {
      legacyWebPushList.push(item);
    }
  }

  // 1. Send FCM in chunks of 500 (FCM limits multicast/batch to 500) with a 2-second cooldown to pace network load
  if (fcmMessages.length > 0 && isFirebaseInitialized && messaging) {
    const chunkSize = 500;
    for (let i = 0; i < fcmMessages.length; i += chunkSize) {
      if (i > 0) {
        await delay(2000); // 2-second cooldown to stagger FCM delivery
      }
      const chunk = fcmMessages.slice(i, i + chunkSize);
      try {
        await messaging.sendEach(chunk);
      } catch (err) {
        console.error("FCM batch send error:", err);
      }
    }
  }

  // 2. Send legacy Web Push in paced parallel requests (e.g. 10 at a time, with a 1-second delay) to prevent socket exhaustion
  if (legacyWebPushList.length > 0) {
    const chunkSize = 10;
    for (let i = 0; i < legacyWebPushList.length; i += chunkSize) {
      if (i > 0) {
        await delay(1000); // 1-second cooldown between legacy batches
      }
      const chunk = legacyWebPushList.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map(async (item) => {
          try {
            await webpush.sendNotification({
              endpoint: item.sub.endpoint,
              keys: { p256dh: item.sub.p256dh, auth: item.sub.auth }
            }, legacyPayload(item));
          } catch (err: any) {
            console.error("Legacy push failed for sub:", item.sub.id, err.message);
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, item.sub.id));
            }
          }
        })
      );
    }
  }
}

async function triggerTemplateNotificationsBatch(
  template: any,
  targets: Array<{ id: number; type: string; name?: string; currentStreak?: number | null }>,
  variablesBuilder: (user: any) => Record<string, string>,
) {
  if (targets.length === 0) return;
  const type = String(template.eventType || "manual_scheduled");
  const actionUrl = notificationType(type).destination;

  const targetIds = targets.map(u => u.id);
  const oauthIds = targets.filter(u => u.type === "oauth").map(u => u.id);
  const localIds = targets.filter(u => u.type === "local").map(u => u.id);

  // 1. Fetch user profile preferences in bulk to determine languages
  const profiles = targetIds.length > 0
    ? await db.select({
        userId: userProfiles.userId,
        userType: userProfiles.userType,
        preferences: userProfiles.preferences
      })
      .from(userProfiles)
      .where(
        or(
          oauthIds.length > 0 ? and(inArray(userProfiles.userId, oauthIds), eq(userProfiles.userType, "oauth")) : sql`false`,
          localIds.length > 0 ? and(inArray(userProfiles.userId, localIds), eq(userProfiles.userType, "local")) : sql`false`
        )
      )
    : [];

  const langMap = new Map<string, string>();
  // Users who switched budget and activity alerts off in Settings > Notifications. Messages an admin schedules still arrive.
  const alertsOff = new Set<string>();
  for (const p of profiles) {
    let lang = "ar";
    try {
      if (p.preferences) {
        const prefs = typeof p.preferences === "string" ? JSON.parse(p.preferences) : p.preferences;
        if (prefs && prefs.language) lang = prefs.language;
        if (prefs?.alertsEnabled === false) alertsOff.add(`${p.userType}:${p.userId}`);
      }
    } catch(e) {}
    langMap.set(`${p.userType}:${p.userId}`, lang);
  }

  // 2. Fetch push subscriptions in bulk
  const subsList = targetIds.length > 0
    ? await db.select()
        .from(pushSubscriptions)
        .where(
          or(
            oauthIds.length > 0 ? and(inArray(pushSubscriptions.userId, oauthIds), eq(pushSubscriptions.userType, "oauth")) : sql`false`,
            localIds.length > 0 ? and(inArray(pushSubscriptions.userId, localIds), eq(pushSubscriptions.userType, "local")) : sql`false`
          )
        )
    : [];

  const subsByUser = new Map<string, any[]>();
  for (const sub of subsList) {
    const key = `${sub.userType}:${sub.userId}`;
    if (!subsByUser.has(key)) subsByUser.set(key, []);
    subsByUser.get(key)!.push(sub);
  }

  const inAppInserts: any[] = [];
  const logsInserts: any[] = [];
  const pushBatchList: any[] = [];

  for (const user of targets) {
    if (type !== "manual_scheduled" && alertsOff.has(`${user.type}:${user.id}`)) continue;
    const lang = langMap.get(`${user.type}:${user.id}`) || "ar";
    let title = lang === "en" 
      ? (template.titleTemplateEn || template.titleTemplate || "") 
      : (template.titleTemplateAr || template.titleTemplate || "");
    let body = lang === "en" 
      ? (template.bodyTemplateEn || template.bodyTemplate || "") 
      : (template.bodyTemplateAr || template.bodyTemplate || "");

    const variables = variablesBuilder(user);
    for (const [key, val] of Object.entries(variables)) {
       title = title.replace(new RegExp(`{{${key}}}`, "g"), val);
       body = body.replace(new RegExp(`{{${key}}}`, "g"), val);
    }

    inAppInserts.push({
      userId: user.id,
      userType: user.type,
      title,
      body,
      actionUrl
    });

    logsInserts.push({
      templateId: template.id,
      userId: user.id,
      userType: user.type,
      sentVia: "system",
      status: "sent"
    });

    const subs = subsByUser.get(`${user.type}:${user.id}`) || [];
    for (const sub of subs) {
      // Device segment filter (web | ios | android) from target segment if present
      const targetDevice = parseSegment(template.targetSegment).device;
      if (targetDevice && targetDevice !== "all" && sub.deviceType !== targetDevice) {
        continue;
      }

      pushBatchList.push({ sub, title, body, actionUrl, type, lang });
    }
  }

  // Bulk insert in-app notifications with a 500ms cooldown to reduce DB query spikes
  if (inAppInserts.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < inAppInserts.length; i += chunkSize) {
      if (i > 0) {
        await delay(500); // 500ms cooldown between database inserts
      }
      await db.insert(inAppNotifications).values(inAppInserts.slice(i, i + chunkSize));
    }
  }

  // Bulk insert notification logs with a 500ms cooldown
  if (logsInserts.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < logsInserts.length; i += chunkSize) {
      if (i > 0) {
        await delay(500); // 500ms cooldown between database inserts
      }
      await db.insert(notificationLogs).values(logsInserts.slice(i, i + chunkSize));
    }
  }

  // Bulk send push notifications
  if (pushBatchList.length > 0) {
    await sendPushBatch(pushBatchList);
  }
}

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      "mailto:contact@smartspend.com",
      vapidPublicKey,
      vapidPrivateKey,
    );
  } catch (error) {
    console.warn("⚠️ Failed to set VAPID details for Web Push. Web Push fallback might not function:", error);
  }
} else {
  console.warn("⚠️ VAPID keys not configured in environment. Web Push fallback is disabled.");
}

/**
 * Resolves preferred language for a user based on userProfiles preferences.
 * Defaults to "ar" (Arabic).
 */
export async function getUserNotificationPrefs(userId: number, userType: string): Promise<{ lang: string; alertsEnabled: boolean }> {
  try {
    const profile = await db.select({ preferences: userProfiles.preferences })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
      .limit(1);

    if (profile[0] && profile[0].preferences) {
      const prefs = typeof profile[0].preferences === "string" 
        ? JSON.parse(profile[0].preferences) 
        : profile[0].preferences;
      return { lang: prefs?.language || "ar", alertsEnabled: prefs?.alertsEnabled !== false };
    }
  } catch (error) {
    console.error("Failed to retrieve user language:", error);
  }
  return { lang: "ar", alertsEnabled: true };
}

/**
 * Universal helper to send a push notification to a device subscription.
 * Handles both modern FCM tokens (iOS/Android/Web) and legacy Web-Push endpoints.
 */
export async function sendPush(sub: any, item: PushContent): Promise<boolean> {
  if (isFirebaseInitialized && messaging && sub.fcmToken) {
    try {
      await messaging.send(fcmMessage(sub.fcmToken, item));
      return true;
    } catch (err: any) {
      // A registration token lets anyone holding the server key push to that phone: the row id is enough.
      log.error({ err, event: "push.fcm.failed", subscriptionId: sub.id }, "FCM push failed");
      // Clean up invalid or stale tokens
      if (
        err.code === "messaging/registration-token-not-registered" || 
        err.code === "messaging/invalid-argument"
      ) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
      return false;
    }
  } else if (sub.endpoint && sub.p256dh && sub.auth) {
    // Legacy Web Push Web-Push fallback
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, legacyPayload(item));
      return true;
    } catch (err: any) {
      console.error("Legacy Web Push failed for sub id:", sub.id, err);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
      return false;
    }
  }
  return false;
}

let isSeeded = false;

export async function processScheduledNotifications() {
  if (!isSeeded) {
    await seedDefaultTemplates().catch(err => console.error("Error seeding default templates:", err));
    isSeeded = true;
  }
  const now = new Date();
  
  const templates = await db.select().from(notificationTemplates)
    .where(and(eq(notificationTemplates.isActive, true), eq(notificationTemplates.eventType, 'manual_scheduled'), lte(notificationTemplates.sendAt, now)));

  if (templates.length === 0) return;

  for (const template of templates) {
    const segment = parseSegment(template.targetSegment);

    if (segment.userId && segment.userType) {
      await triggerTemplateNotificationsBatch(
        template,
        [{ id: Number(segment.userId), type: segment.userType }],
        () => ({})
      );
    } else {
      let offset = 0;
      const limit = 1000;

      while (true) {
        let oauthQuery = db.select({ id: users.id, plan: users.plan }).from(users);
        let localQuery = db.select({ id: localUsers.id, plan: localUsers.plan }).from(localUsers);

        const applyFilters = (query: any, table: any, isOauth: boolean) => {
          const conds = [];
          if (segment.plan && segment.plan !== "all") {
             if (segment.plan === "free") conds.push(eq(table.plan, "free"));
             if (segment.plan === "pro") conds.push(or(eq(table.plan, "pro"), sql`${table.plan} LIKE 'pro%'`));
             if (segment.plan === "ultra") conds.push(eq(table.plan, "ultra"));
          }
          if (segment.minUsage !== undefined && segment.minUsage > 0) {
             conds.push(sql`(SELECT COALESCE(SUM(${expenseDailyRollups.txnCount}), 0) FROM ${expenseDailyRollups} WHERE ${expenseDailyRollups.userId} = ${table.id} AND ${expenseDailyRollups.userType} = ${isOauth ? 'oauth' : 'local'}) >= ${segment.minUsage}`);
          }
          if (conds.length > 0) return query.where(and(...conds));
          return query;
        };

        const oauthRes = await applyFilters(oauthQuery, users, true).limit(limit).offset(offset);
        const localRes = await applyFilters(localQuery, localUsers, false).limit(limit).offset(offset);

        if (oauthRes.length === 0 && localRes.length === 0) break;

        const batchUsers = [
           ...oauthRes.map((u: any) => ({ ...u, type: "oauth" })),
           ...localRes.map((u: any) => ({ ...u, type: "local" }))
        ];

        if (batchUsers.length > 0) {
           await triggerTemplateNotificationsBatch(
             template,
             batchUsers.map(u => ({ id: u.id, type: u.type })),
             () => ({})
           );
        }

        if (oauthRes.length < limit && localRes.length < limit) break;
        offset += limit;
      }
    }

    await db.update(notificationTemplates).set({ isActive: false }).where(eq(notificationTemplates.id, template.id));
  }
}

export async function triggerEventNotification(eventType: string, user: { id: number, type: string }, variables: Record<string, string>) {
  const templates = await db.select().from(notificationTemplates)
    .where(and(eq(notificationTemplates.eventType, eventType), eq(notificationTemplates.isActive, true)));
  if (templates.length === 0) return;
  const { lang, alertsEnabled } = await getUserNotificationPrefs(user.id, user.type);
  if (!alertsEnabled) return;
  const actionUrl = notificationType(eventType).destination;

  for (const template of templates) {
    
    let title = lang === "en" 
      ? (template.titleTemplateEn || template.titleTemplate || "") 
      : (template.titleTemplateAr || template.titleTemplate || "");
    let body = lang === "en" 
      ? (template.bodyTemplateEn || template.bodyTemplate || "") 
      : (template.bodyTemplateAr || template.bodyTemplate || "");

    for (const [key, val] of Object.entries(variables)) {
       title = title.replace(new RegExp(`{{${key}}}`, "g"), val);
       body = body.replace(new RegExp(`{{${key}}}`, "g"), val);
    }

    await db.insert(inAppNotifications).values({
        userId: user.id,
        userType: user.type,
        title,
        body,
        actionUrl
    });

    const subs = await db.select().from(pushSubscriptions).where(
        and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.userType, user.type))
    );

    for (const sub of subs) {
       await sendPush(sub, { title, body, actionUrl, type: eventType, lang });
    }
    
    await db.insert(notificationLogs).values({
      templateId: template.id,
      userId: user.id,
      userType: user.type,
      sentVia: "system",
      status: "sent"
    });
  }
}

/**
 * Checks if a user has exceeded their profile monthly income budget.
 * dispatches a notification if they breached their limit this month.
 */
export async function checkUserBudgetExceeded(userId: number, userType: string) {
  try {
    // The user's own budgets decide when to warn: each one at its alert threshold and
    // again past its limit, once per cycle. Only a user without budgets is compared with
    // the monthly income in their profile.
    const { checkBudgetAlerts, listBudgetStatuses } = await import("./services/budget-status");
    if ((await listBudgetStatuses(userId, userType)).length > 0) {
      await checkBudgetAlerts(userId, userType, async (alert, status) => {
        await triggerEventNotification(
          alert === "exceeded" ? "budget_category_exceeded" : "budget_near_limit",
          { id: userId, type: userType },
          {
            budgetTitle: status.title,
            spent: status.currentSpent.toLocaleString("ar-EG"),
            limit: Number(status.monthlyLimit).toLocaleString("ar-EG"),
            percentage: String(status.percentage),
          },
        );
      });
      return;
    }

    // 1. Fetch user's profile monthly income budget
    const profile = await db.select({ monthlyIncome: userProfiles.monthlyIncome })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
      .limit(1);

    if (!profile[0] || !profile[0].monthlyIncome) return;
    const budgetLimit = parseFloat(profile[0].monthlyIncome);
    if (budgetLimit <= 0) return;

    // 2. Calculate sum of expenses for this month from rollups (§3.2 & §3.14)
    const monthRange = businessMonthRange();
    const startDay = businessDateKey(monthRange.start);
    const endDay = businessDateKey(monthRange.endExclusive);

    const [{ totalSpent }] = await db
      .select({
        totalSpent: sql<number>`COALESCE(SUM(${expenseDailyRollups.expense}), 0)`,
      })
      .from(expenseDailyRollups)
      .where(
        and(
          eq(expenseDailyRollups.userId, userId),
          eq(expenseDailyRollups.userType, userType),
          gte(expenseDailyRollups.day, startDay),
          lt(expenseDailyRollups.day, endDay),
        ),
      );

    // 3. If totalSpent exceeds budgetLimit, check if we already warned them this month
    if (totalSpent > budgetLimit) {
      // Find template for budget warning (event_type: 'budget_exceeded')
      const templates = await db.select().from(notificationTemplates)
        .where(and(eq(notificationTemplates.eventType, 'budget_exceeded'), eq(notificationTemplates.isActive, true)))
        .limit(1);

      if (templates.length === 0) return;
      const template = templates[0];

      // Check logs for this template & user this month
      const logged = await db.select().from(notificationLogs)
        .where(
          and(
            eq(notificationLogs.templateId, template.id),
            eq(notificationLogs.userId, userId),
            eq(notificationLogs.userType, userType),
            gte(notificationLogs.sentAt, monthRange.start),
            lt(notificationLogs.sentAt, monthRange.endExclusive)
          )
        )
        .limit(1);

      if (logged.length === 0) {
        // Trigger notification!
        await triggerEventNotification(
          "budget_exceeded",
          { id: userId, type: userType },
          { 
            totalSpent: totalSpent.toLocaleString("ar-EG"), 
            budgetLimit: budgetLimit.toLocaleString("ar-EG") 
          },
        );
      }
    }
  } catch (error) {
    console.error("Error checking user budget limit:", error);
  }
}

/** A default template: Arabic (also the language-less fallback) and English. */
interface DefaultTemplate {
  name: string;
  eventType: string;
  ar: { title: string; body: string };
  en: { title: string; body: string };
}

/**
 * The texts the app ships with, in the voice of docs/guides/writing-app-messages.md: short, no emoji, no English
 * in the Arabic, nothing promised that does not exist.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "ميزانية قربت تخلص",
    eventType: "budget_near_limit",
    ar: { title: "ميزانية {{budgetTitle}} قربت تخلص", body: "صرفت {{spent}} من {{limit}} جنيه ({{percentage}}%)." },
    en: { title: "{{budgetTitle}} budget almost used", body: "You spent {{spent}} of {{limit}} EGP ({{percentage}}%)." },
  },
  {
    name: "ميزانية عدّت الحد",
    eventType: "budget_category_exceeded",
    ar: { title: "ميزانية {{budgetTitle}} عدّت الحد", body: "صرفت {{spent}} والحد {{limit}} جنيه." },
    en: { title: "{{budgetTitle}} budget exceeded", body: "You spent {{spent}}; the limit is {{limit}} EGP." },
  },
  {
    name: "الصرف عدّى الدخل",
    eventType: "budget_exceeded",
    ar: { title: "صرفك عدّى دخلك الشهر ده", body: "صرفت {{totalSpent}} جنيه، ودخلك المسجّل {{budgetLimit}}. افتح الإحصائيات تشوف راحت فين." },
    en: { title: "You spent more than your income", body: "You spent {{totalSpent}} EGP against {{budgetLimit}} EGP of income. Open your stats to see where it went." },
  },
  {
    name: "الاشتراك قرب يخلص",
    eventType: "subscription_ending",
    ar: { title: "اشتراك {{planName}} بيخلص {{daysLeft}}", body: "جدّد عشان مميزاتك تفضل شغالة." },
    en: { title: "Your {{planName}} plan ends soon", body: "Renew to keep your features." },
  },
  {
    name: "تذكير بالتسجيل",
    eventType: "inactivity_reminder",
    ar: { title: "سجّلت مصاريف النهارده؟", body: "سجّل اللي صرفته عشان أرقامك تفضل مظبوطة." },
    en: { title: "Logged today's spending?", body: "Add what you spent so your numbers stay right." },
  },
  {
    name: "أيام متتالية",
    eventType: "pro_conversion_streak",
    ar: { title: "{{currentStreak}} أيام ورا بعض", body: "بتسجّل مصاريفك بانتظام. Pro فيه تقارير وتحليلات أكتر لو حابب." },
    en: { title: "{{currentStreak}} days in a row", body: "You log your spending every day. Pro has more reports if you want them." },
  },
  {
    name: "رجوع بعد غياب",
    eventType: "dormant_reactivation",
    ar: { title: "بقالك أسبوع مسجلتش", body: "سجّل عملية واحدة النهارده وكمّل متابعة فلوسك." },
    en: { title: "It's been a week", body: "Log one thing today and keep track of your money." },
  },
];

/** The Arabic texts shipped before: a stored template still holding both was never edited, so it is updated. */
const PREVIOUS_DEFAULTS: Record<string, { title: string; body: string }> = {
  budget_near_limit: { title: "ميزانية {{budgetTitle}} قربت تخلص", body: "صرفت {{spent}} من {{limit}} جنيه ({{percentage}}%). خلّي بالك الأيام الجاية." },
  budget_category_exceeded: { title: "ميزانية {{budgetTitle}} عدّت الحد", body: "صرفت {{spent}} والحد كان {{limit}} جنيه ({{percentage}}%)." },
  budget_exceeded: { title: "تنبيه: عدّيت الميزانية اللي حاططها ⚠️", body: "إجمالي نفقاتك هذا الشهر {{totalSpent}} تخطى الحد المسموح به {{budgetLimit}} في ملفك الشخصي. اضغط لمراجعة إحصائياتك." },
  subscription_ending: { title: "اشتراك {{planName}} بيخلص {{daysLeft}}", body: "جدّد دلوقتي عشان تفضل مميزاتك شغالة من غير ما تقف." },
  inactivity_reminder: { title: "أين اختفيت؟ 🎯", body: "بقالك فترة ماسجلتش مصاريفك. سجّل اللي صرفته عشان أرقامك تفضل مظبوطة." },
  pro_conversion_streak: { title: "أنت على مسار رائع! 🌟", body: "سجّلت مصاريفك {{currentStreak}} أيام متتالية. اشترك في برو الآن للحصول على تقارير وتحليلات غير محدودة بخصم 30%!" },
  dormant_reactivation: { title: "افتقدناك في SmartSpend! 💙", body: "بقالك أسبوع ماسجلتش مصاريفك. العودة للتتبع ستساعدك على تحقيق أهدافك المالية وضبط ميزانيتك!" },
};

export async function seedDefaultTemplates() {
  for (const item of DEFAULT_TEMPLATES) {
    const texts = {
      name: item.name,
      titleTemplate: item.ar.title,
      bodyTemplate: item.ar.body,
      titleTemplateAr: item.ar.title,
      bodyTemplateAr: item.ar.body,
      titleTemplateEn: item.en.title,
      bodyTemplateEn: item.en.body,
    };
    const [existing] = await db.select().from(notificationTemplates)
      .where(eq(notificationTemplates.eventType, item.eventType))
      .limit(1);
    if (!existing) {
      await db.insert(notificationTemplates).values({ eventType: item.eventType, ...texts, isActive: true });
      log.info({ event: "notifications.template.seeded", eventType: item.eventType }, "default template seeded");
      continue;
    }
    const previous = PREVIOUS_DEFAULTS[item.eventType];
    const storedTitle = existing.titleTemplateAr ?? existing.titleTemplate;
    const storedBody = existing.bodyTemplateAr ?? existing.bodyTemplate;
    if (previous && storedTitle === previous.title && storedBody === previous.body) {
      await db.update(notificationTemplates).set(texts).where(eq(notificationTemplates.id, existing.id));
      log.info({ event: "notifications.template.updated", eventType: item.eventType }, "default template text updated");
    }
  }
}

export async function checkAndTriggerSmartActivityNotifications() {
  try {
    await seedDefaultTemplates();
    const now = new Date();

    // 1. inactivity_reminder: streak >= minStreak, last activity was yesterday
    const inactivityTemplate = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventType, "inactivity_reminder"), eq(notificationTemplates.isActive, true)))
      .limit(1);

    if (inactivityTemplate.length > 0) {
      const template = inactivityTemplate[0];
      const segment = parseSegment(template.targetSegment);
      const minStreak = segment.minStreak !== undefined ? Number(segment.minStreak) : 2;

      const startOfToday = businessDayRange().start;

      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const thirtySixHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);

      const matchingOauth = await db.select({
        id: users.id,
        name: users.name,
        plan: users.plan,
        currentStreak: users.currentStreak
      })
      .from(users)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, users.id),
        eq(notificationLogs.userType, "oauth"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, startOfToday)
      ))
      .where(and(
        gte(users.currentStreak, minStreak),
        gte(users.lastStreakAt, thirtySixHoursAgo),
        lte(users.lastStreakAt, twelveHoursAgo),
        isNull(notificationLogs.id)
      )).limit(1000);

      const matchingLocal = await db.select({
        id: localUsers.id,
        name: localUsers.name,
        plan: localUsers.plan,
        currentStreak: localUsers.currentStreak
      })
      .from(localUsers)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, localUsers.id),
        eq(notificationLogs.userType, "local"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, startOfToday)
      ))
      .where(and(
        gte(localUsers.currentStreak, minStreak),
        gte(localUsers.lastStreakAt, thirtySixHoursAgo),
        lte(localUsers.lastStreakAt, twelveHoursAgo),
        isNull(notificationLogs.id)
      )).limit(1000);

      const targets = [
        ...matchingOauth.map(u => ({ ...u, type: "oauth" })),
        ...matchingLocal.map(u => ({ ...u, type: "local" }))
      ];

      await triggerTemplateNotificationsBatch(
        template,
        targets,
        (user) => ({ name: user.name || "المستخدم" }),
      );
    }

    // 2. pro_conversion_streak: user is free, currentStreak >= minStreak, last log was today/yesterday (diffHours < 36)
    const conversionTemplate = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventType, "pro_conversion_streak"), eq(notificationTemplates.isActive, true)))
      .limit(1);

    if (conversionTemplate.length > 0) {
      const template = conversionTemplate[0];
      const segment = parseSegment(template.targetSegment);
      const minStreak = segment.minStreak !== undefined ? Number(segment.minStreak) : 4;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const thirtySixHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);

      const matchingOauth = await db.select({
        id: users.id,
        name: users.name,
        plan: users.plan,
        currentStreak: users.currentStreak
      })
      .from(users)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, users.id),
        eq(notificationLogs.userType, "oauth"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, sevenDaysAgo)
      ))
      .where(and(
        eq(users.plan, "free"),
        gte(users.currentStreak, minStreak),
        gte(users.lastStreakAt, thirtySixHoursAgo),
        isNull(notificationLogs.id)
      )).limit(1000);

      const matchingLocal = await db.select({
        id: localUsers.id,
        name: localUsers.name,
        plan: localUsers.plan,
        currentStreak: localUsers.currentStreak
      })
      .from(localUsers)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, localUsers.id),
        eq(notificationLogs.userType, "local"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, sevenDaysAgo)
      ))
      .where(and(
        eq(localUsers.plan, "free"),
        gte(localUsers.currentStreak, minStreak),
        gte(localUsers.lastStreakAt, thirtySixHoursAgo),
        isNull(notificationLogs.id)
      )).limit(1000);

      const targets = [
        ...matchingOauth.map(u => ({ ...u, type: "oauth" })),
        ...matchingLocal.map(u => ({ ...u, type: "local" }))
      ];

      await triggerTemplateNotificationsBatch(
        template,
        targets,
        (user) => ({ currentStreak: String(user.currentStreak || 0) }),
      );
    }

    // 3. dormant_reactivation: completely inactive for inactivityDays (diffDays between inactivityDays and inactivityDays+1)
    const dormantTemplate = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventType, "dormant_reactivation"), eq(notificationTemplates.isActive, true)))
      .limit(1);

    if (dormantTemplate.length > 0) {
      const template = dormantTemplate[0];
      const segment = parseSegment(template.targetSegment);
      const inactivityDays = segment.inactivityDays !== undefined ? Number(segment.inactivityDays) : 7;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const inactivityMsStart = inactivityDays * 24 * 60 * 60 * 1000;
      const inactivityMsEnd = (inactivityDays + 1) * 24 * 60 * 60 * 1000;
      const startRange = new Date(now.getTime() - inactivityMsEnd);
      const endRange = new Date(now.getTime() - inactivityMsStart);

      const matchingOauth = await db.select({
        id: users.id,
        name: users.name,
        plan: users.plan,
        currentStreak: users.currentStreak
      })
      .from(users)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, users.id),
        eq(notificationLogs.userType, "oauth"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, sevenDaysAgo)
      ))
      .where(and(
        gte(users.lastStreakAt, startRange),
        lte(users.lastStreakAt, endRange),
        isNull(notificationLogs.id)
      )).limit(1000);

      const matchingLocal = await db.select({
        id: localUsers.id,
        name: localUsers.name,
        plan: localUsers.plan,
        currentStreak: localUsers.currentStreak
      })
      .from(localUsers)
      .leftJoin(notificationLogs, and(
        eq(notificationLogs.userId, localUsers.id),
        eq(notificationLogs.userType, "local"),
        eq(notificationLogs.templateId, template.id),
        gte(notificationLogs.sentAt, sevenDaysAgo)
      ))
      .where(and(
        gte(localUsers.lastStreakAt, startRange),
        lte(localUsers.lastStreakAt, endRange),
        isNull(notificationLogs.id)
      )).limit(1000);

      const targets = [
        ...matchingOauth.map(u => ({ ...u, type: "oauth" })),
        ...matchingLocal.map(u => ({ ...u, type: "local" }))
      ];

      await triggerTemplateNotificationsBatch(
        template,
        targets,
        (user) => ({ name: user.name || "المستخدم" }),
      );
    }
  } catch (error) {
    console.error("Error running smart activity notifications:", error);
  }
}
