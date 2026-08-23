import { db } from "./queries/connection";
import { notificationTemplates, inAppNotifications, notificationLogs, pushSubscriptions, users, localUsers, userProfiles, expenses } from "../db/schema";
import { eq, and, or, lte, gte, sql, isNull, inArray } from "drizzle-orm";
import webpush from "web-push";
import { messaging, isFirebaseInitialized } from "./services/firebase";
import { env } from "./lib/env";

const appUrl = env.APP_URL || "http://localhost:3000";
const logoUrl = `${appUrl}/photos/white_mode_logo-removebg-preview.png`;

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
  notifications: Array<{
    sub: any;
    title: string;
    body: string;
    actionUrl: string;
  }>
) {
  if (notifications.length === 0) return;

  const fcmMessages: any[] = [];
  const legacyWebPushList: any[] = [];

  for (const item of notifications) {
    const { sub, title, body, actionUrl } = item;
    if (isFirebaseInitialized && messaging && sub.fcmToken) {
      fcmMessages.push({
        token: sub.fcmToken,
        notification: {
          title,
          body,
          imageUrl: logoUrl
        },
        data: {
          url: actionUrl,
        },
        webpush: {
          notification: {
            icon: logoUrl,
            badge: logoUrl,
          },
          fcmOptions: {
            link: actionUrl,
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            }
          }
        }
      });
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
            }, JSON.stringify({
              title: item.title,
              body: item.body,
              icon: logoUrl,
              badge: logoUrl,
              url: item.actionUrl
            }));
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
  actionUrl: string = "/"
) {
  if (targets.length === 0) return;

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
  for (const p of profiles) {
    let lang = "ar";
    try {
      if (p.preferences) {
        const prefs = typeof p.preferences === "string" ? JSON.parse(p.preferences) : p.preferences;
        if (prefs && prefs.language) lang = prefs.language;
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

      pushBatchList.push({
        sub,
        title,
        body,
        actionUrl
      });
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

try {
  webpush.setVapidDetails(
    "mailto:contact@smartspend.com",
    process.env.VAPID_PUBLIC_KEY || "BBtKP6w97Av5YT6NvKCh3EostLvYiXIHQqM-QGSMlMYRk8fJPalWo3dvXEcghrnlizV1selpCWTOjU4qTjIBb3o",
    process.env.VAPID_PRIVATE_KEY || "-31rwR0LxanvleE02FotUVGGx3mVno1YJtR7hTaNHrA"
  );
} catch (error) {
  console.warn("⚠️ Failed to set VAPID details for Web Push. Web Push fallback might not function:", error);
}

/**
 * Resolves preferred language for a user based on userProfiles preferences.
 * Defaults to "ar" (Arabic).
 */
export async function getUserLanguage(userId: number, userType: string): Promise<string> {
  try {
    const profile = await db.select({ preferences: userProfiles.preferences })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
      .limit(1);

    if (profile[0] && profile[0].preferences) {
      const prefs = typeof profile[0].preferences === "string" 
        ? JSON.parse(profile[0].preferences) 
        : profile[0].preferences;
      if (prefs && prefs.language) {
        return prefs.language; // "ar" or "en"
      }
    }
  } catch (error) {
    console.error("Failed to retrieve user language:", error);
  }
  return "ar"; // default fallback
}

/**
 * Universal helper to send a push notification to a device subscription.
 * Handles both modern FCM tokens (iOS/Android/Web) and legacy Web-Push endpoints.
 */
export async function sendPush(sub: any, title: string, body: string, actionUrl: string = "/"): Promise<boolean> {
  if (isFirebaseInitialized && messaging && sub.fcmToken) {
    try {
      await messaging.send({
        token: sub.fcmToken,
        notification: {
          title,
          body,
          imageUrl: logoUrl
        },
        data: {
          url: actionUrl,
        },
        webpush: {
          notification: {
            icon: logoUrl,
            badge: logoUrl,
          },
          fcmOptions: {
            link: actionUrl,
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            }
          }
        }
      });
      return true;
    } catch (err: any) {
      console.error("FCM push failed for token:", sub.fcmToken, err);
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
      }, JSON.stringify({
        title,
        body,
        icon: logoUrl,
        badge: logoUrl,
        url: actionUrl
      }));
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
             conds.push(sql`(SELECT count(*) FROM ${expenses} WHERE ${expenses.userId} = ${table.id} AND ${expenses.userType} = ${isOauth ? 'oauth' : 'local'}) >= ${segment.minUsage}`);
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

export async function triggerEventNotification(eventType: string, user: { id: number, type: string }, variables: Record<string, string>, actionUrl: string = "/") {
  const templates = await db.select().from(notificationTemplates)
    .where(and(eq(notificationTemplates.eventType, eventType), eq(notificationTemplates.isActive, true)));

  for (const template of templates) {
    const lang = await getUserLanguage(user.id, user.type);
    
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
       await sendPush(sub, title, body, actionUrl);
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
    // 1. Fetch user's profile monthly income budget
    const profile = await db.select({ monthlyIncome: userProfiles.monthlyIncome })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
      .limit(1);

    if (!profile[0] || !profile[0].monthlyIncome) return;
    const budgetLimit = parseFloat(profile[0].monthlyIncome);
    if (budgetLimit <= 0) return;

    // 2. Calculate sum of expenses for this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59, 999);

    const [{ totalSpent }] = await db.select({ totalSpent: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          gte(expenses.date, startOfMonth),
          lte(expenses.date, endOfMonth)
        )
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
            gte(notificationLogs.sentAt, startOfMonth),
            lte(notificationLogs.sentAt, endOfMonth)
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
          "/#budget"
        );
      }
    }
  } catch (error) {
    console.error("Error checking user budget limit:", error);
  }
}

export async function seedDefaultTemplates() {
  const defaults = [
    {
      name: "تنبيه تجاوز الميزانية",
      eventType: "budget_exceeded",
      titleTemplate: "تنبيه: لقد تجاوزت ميزانيتك المخططة! ⚠️",
      bodyTemplate: "إجمالي نفقاتك هذا الشهر {{totalSpent}} تخطى الحد المسموح به {{budgetLimit}} في ملفك الشخصي. اضغط لمراجعة إحصائياتك.",
      titleTemplateAr: "تنبيه: لقد تجاوزت ميزانيتك المخططة! ⚠️",
      bodyTemplateAr: "إجمالي نفقاتك هذا الشهر {{totalSpent}} تخطى الحد المسموح به {{budgetLimit}} في ملفك الشخصي. اضغط لمراجعة إحصائياتك.",
      titleTemplateEn: "Warning: Budget Exceeded! ⚠️",
      bodyTemplateEn: "Your total expenses this month {{totalSpent}} exceeded your planned budget of {{budgetLimit}}. Click to review your statistics."
    },
    {
      name: "تذكير عدم النشاط اليومي",
      eventType: "inactivity_reminder",
      titleTemplate: "أين اختفيت؟ 🎯",
      bodyTemplate: "لقد مرت فترة منذ آخر مرة سجلت فيها مصاريفك. حافظ على انضباطك المالي وسجل نفقاتك الآن!",
      titleTemplateAr: "أين اختفيت؟ 🎯",
      bodyTemplateAr: "لقد مرت فترة منذ آخر مرة سجلت فيها مصاريفك. حافظ على انضباطك المالي وسجل نفقاتك الآن!",
      titleTemplateEn: "Where have you been? 🎯",
      bodyTemplateEn: "It's been a while since you last logged your expenses. Keep up your financial discipline and log them now!"
    },
    {
      name: "تنبيه حماس الاستمرار (ترقية برو)",
      eventType: "pro_conversion_streak",
      titleTemplate: "أنت على مسار رائع! 🌟",
      bodyTemplate: "لقد سجلت مصاريفك لـ {{currentStreak}} أيام متتالية. اشترك في برو الآن للحصول على تقارير وتحليلات غير محدودة بخصم 30%!",
      titleTemplateAr: "أنت على مسار رائع! 🌟",
      bodyTemplateAr: "لقد سجلت مصاريفك لـ {{currentStreak}} أيام متتالية. اشترك في برو الآن للحصول على تقارير وتحليلات غير محدودة بخصم 30%!",
      titleTemplateEn: "You are on a roll! 🌟",
      bodyTemplateEn: "You have recorded your expenses for {{currentStreak}} consecutive days. Subscribe to Pro now for unlimited reports with 30% discount!"
    },
    {
      name: "تذكير المستخدم الغائب",
      eventType: "dormant_reactivation",
      titleTemplate: "افتقدناك في SmartSpend! 💙",
      bodyTemplate: "لقد مر أسبوع منذ آخر تسجيل لمصاريفك. العودة للتتبع ستساعدك على تحقيق أهدافك المالية وضبط ميزانيتك!",
      titleTemplateAr: "افتقدناك في SmartSpend! 💙",
      bodyTemplateAr: "لقد مر أسبوع منذ آخر تسجيل لمصاريفك. العودة للتتبع ستساعدك على تحقيق أهدافك المالية وضبط ميزانيتك!",
      titleTemplateEn: "We miss you at SmartSpend! 💙",
      bodyTemplateEn: "It's been a week since you last recorded your expenses. Getting back to tracking will help you reach your goals!"
    }
  ];

  for (const item of defaults) {
    const existing = await db.select().from(notificationTemplates)
      .where(eq(notificationTemplates.eventType, item.eventType))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(notificationTemplates).values({
        name: item.name,
        eventType: item.eventType,
        titleTemplate: item.titleTemplate,
        bodyTemplate: item.bodyTemplate,
        titleTemplateAr: item.titleTemplateAr,
        bodyTemplateAr: item.bodyTemplateAr,
        titleTemplateEn: item.titleTemplateEn,
        bodyTemplateEn: item.bodyTemplateEn,
        isActive: true
      });
      console.log(`[Notification Engine] Seeded default template for: ${item.eventType}`);
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

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

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
        "/"
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
        "/pro"
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
        "/"
      );
    }
  } catch (error) {
    console.error("Error running smart activity notifications:", error);
  }
}
