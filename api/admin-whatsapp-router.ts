import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "./middleware";
import { getDb } from "./queries/connection";
import { localUsers, systemSettings, users, whatsappContacts, whatsappMessages } from "../db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { logAdminAction } from "./lib/admin-audit";
import { createLogger, phoneTail } from "./lib/log";
import {
  businessNumber,
  createTemplate,
  listTemplates,
  sendText,
  whatsAppConfig,
  type BusinessNumber,
} from "./lib/whatsapp/client";
import { PRODUCT_TEMPLATES } from "./lib/whatsapp/templates";
import { enqueueMessage } from "./lib/whatsapp/outbox";
import { getSystemSettings, invalidateSettingsCache } from "./lib/settings-cache";
import { startOfBusinessDay } from "./lib/app-time";

const log = createLogger("admin-whatsapp");

function localNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}

export const adminWhatsappRouter = router({
  getStatus: adminProcedure.query(async () => {
    const config = whatsAppConfig();
    let business: BusinessNumber | null = null;

    if (config) {
      try {
        business = await businessNumber(config);
      } catch (err) {
        log.warn({ err }, "Could not fetch business number from Meta Graph API");
      }
    }

    const db = getDb();

    // Audience & Consent metrics
    const [consentRow] = await db
      .select({
        total: sql<number>`count(*)`,
        reports: sql<number>`sum(case when ${whatsappContacts.reportsConsent} = 1 then 1 else 0 end)`,
        reminders: sql<number>`sum(case when ${whatsappContacts.remindersConsent} = 1 then 1 else 0 end)`,
        marketing: sql<number>`sum(case when ${whatsappContacts.marketingConsent} = 1 then 1 else 0 end)`,
        optedOut: sql<number>`sum(case when ${whatsappContacts.optedOutAt} is not null then 1 else 0 end)`,
      })
      .from(whatsappContacts);

    // Cairo business day start for today's outbox counters
    const startOfToday = startOfBusinessDay();
    const [metricsRow] = await db
      .select({
        total: sql<number>`count(*)`,
        queued: sql<number>`sum(case when ${whatsappMessages.status} = 'queued' then 1 else 0 end)`,
        sending: sql<number>`sum(case when ${whatsappMessages.status} = 'sending' then 1 else 0 end)`,
        sent: sql<number>`sum(case when ${whatsappMessages.status} = 'sent' then 1 else 0 end)`,
        delivered: sql<number>`sum(case when ${whatsappMessages.status} = 'delivered' then 1 else 0 end)`,
        read: sql<number>`sum(case when ${whatsappMessages.status} = 'read' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${whatsappMessages.status} = 'failed' then 1 else 0 end)`,
      })
      .from(whatsappMessages)
      .where(sql`${whatsappMessages.createdAt} >= ${startOfToday}`);

    return {
      configured: config !== null,
      phoneNumberId: config?.phoneNumberId ?? null,
      apiVersion: config?.apiVersion ?? "v21.0",
      business,
      consent: {
        total: Number(consentRow?.total ?? 0),
        reports: Number(consentRow?.reports ?? 0),
        reminders: Number(consentRow?.reminders ?? 0),
        marketing: Number(consentRow?.marketing ?? 0),
        optedOut: Number(consentRow?.optedOut ?? 0),
      },
      todayMetrics: {
        total: Number(metricsRow?.total ?? 0),
        queued: Number(metricsRow?.queued ?? 0),
        sending: Number(metricsRow?.sending ?? 0),
        sent: Number(metricsRow?.sent ?? 0),
        delivered: Number(metricsRow?.delivered ?? 0),
        read: Number(metricsRow?.read ?? 0),
        failed: Number(metricsRow?.failed ?? 0),
      },
    };
  }),

  getTemplates: adminProcedure.query(async () => {
    const config = whatsAppConfig();
    let remoteTemplates: Array<{ name: string; status: string; category: string; language: string }> = [];

    if (config && config.wabaId) {
      try {
        remoteTemplates = await listTemplates(config);
      } catch (err) {
        log.warn({ err }, "Could not fetch remote templates from Meta");
      }
    }

    return PRODUCT_TEMPLATES.map((t) => {
      const remote = remoteTemplates.find((r) => r.name === t.name);
      return {
        name: t.name,
        category: t.category,
        status: remote?.status ?? "LOCAL_ONLY",
        definition: t.definition,
      };
    });
  }),

  syncTemplates: adminProcedure.mutation(async () => {
    const config = whatsAppConfig();
    if (!config) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "WhatsApp Cloud API is not configured",
      });
    }

    const results: Array<{ name: string; status: string; error?: string }> = [];
    for (const template of PRODUCT_TEMPLATES) {
      try {
        await createTemplate(config, template.definition);
        results.push({ name: template.name, status: "SUBMITTED" });
      } catch (err: any) {
        results.push({ name: template.name, status: "ERROR", error: err.message });
      }
    }
    return { success: true, results };
  }),

  getSettings: adminProcedure.query(async () => {
    const settings = await getSystemSettings();
    return {
      otpEnabled: settings["whatsapp_otp_enabled"] === "true",
      reportsEnabled: settings["whatsapp_reports_enabled"] !== "false",
      marketingPaused: settings["whatsapp_marketing_paused"] === "true",
    };
  }),

  toggleOtpVerification: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await getDb()
        .insert(systemSettings)
        .values({
          key: "whatsapp_otp_enabled",
          value: input.enabled ? "true" : "false",
        })
        .onDuplicateKeyUpdate({
          set: { value: input.enabled ? "true" : "false" },
        });
      invalidateSettingsCache();
      await logAdminAction(ctx, {
        action: "TOGGLE_WHATSAPP_OTP",
        targetType: "whatsapp_setting",
        targetId: "whatsapp_otp_enabled",
        details: { enabled: input.enabled },
      });
      return { success: true };
    }),

  updateSettings: adminProcedure
    .input(
      z.object({
        otpEnabled: z.boolean().optional(),
        reportsEnabled: z.boolean().optional(),
        marketingPaused: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const entries: [string, string | undefined][] = [
        ["whatsapp_otp_enabled", input.otpEnabled !== undefined ? String(input.otpEnabled) : undefined],
        ["whatsapp_reports_enabled", input.reportsEnabled !== undefined ? String(input.reportsEnabled) : undefined],
        ["whatsapp_marketing_paused", input.marketingPaused !== undefined ? String(input.marketingPaused) : undefined],
      ];

      for (const [key, value] of entries) {
        if (value === undefined) continue;
        await db
          .insert(systemSettings)
          .values({ key, value })
          .onDuplicateKeyUpdate({ set: { value } });
      }
      invalidateSettingsCache();
      await logAdminAction(ctx, {
        action: "UPDATE_WHATSAPP_SETTINGS",
        targetType: "whatsapp_setting",
        targetId: "settings",
        details: {
          otpEnabled: input.otpEnabled,
          reportsEnabled: input.reportsEnabled,
          marketingPaused: input.marketingPaused,
        },
      });
      return { success: true };
    }),

  sendDirectMessage: adminProcedure
    .input(
      z.object({
        phone: z.string().min(8),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const config = whatsAppConfig();
      if (!config) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "WhatsApp Cloud API is not configured",
        });
      }

      const db = getDb();
      const local = localNumber(input.phone);
      const [account] = await db
        .select({ id: localUsers.id })
        .from(localUsers)
        .where(eq(localUsers.phone, local))
        .limit(1);

      let lastInboundAt: Date | null = null;
      if (account) {
        const [contact] = await db
          .select({ lastInboundAt: whatsappContacts.lastInboundAt })
          .from(whatsappContacts)
          .where(and(eq(whatsappContacts.userId, account.id), eq(whatsappContacts.userType, "local")))
          .limit(1);
        lastInboundAt = contact?.lastInboundAt ?? null;
      }

      const now = Date.now();
      const isWindowOpen = lastInboundAt && now - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;

      if (!isWindowOpen) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "نافذة الـ 24 ساعة للرد الحر مغلقة للمستلم. تفرض سياسة Meta استخدام قالب معتمد (Template Message) خارج هذه النافذة.",
        });
      }

      try {
        const { messageId } = await sendText(config, input.phone, input.text);
        await db.insert(whatsappMessages).values({
          userId: account?.id ?? null,
          userType: account ? "local" : null,
          recipient: input.phone,
          purpose: "admin_direct",
          status: "sent",
          attempts: 1,
          metaMessageId: messageId,
          sentAt: new Date(),
        });
        await logAdminAction(ctx, {
          action: "SEND_WHATSAPP_DIRECT",
          targetType: "whatsapp_message",
          targetId: messageId,
          details: { recipient: `***${phoneTail(input.phone)}` },
        });
        return { success: true, message: "تم إرسال الرسالة بنجاح", messageId };
      } catch (err: any) {
        log.error({ err, phone: phoneTail(input.phone) }, "Direct WhatsApp message failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "فشل إرسال الرسالة",
        });
      }
    }),

  broadcastTemplate: adminProcedure
    .input(
      z.object({
        templateName: z.string().min(1),
        parameters: z.array(z.string()).default([]),
        userFilter: z.enum(["all_opted_in", "reports_opted_in", "marketing_opted_in"]).default("marketing_opted_in"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const condition =
        input.userFilter === "reports_opted_in"
          ? and(eq(whatsappContacts.reportsConsent, true), isNull(whatsappContacts.optedOutAt))
          : and(eq(whatsappContacts.marketingConsent, true), isNull(whatsappContacts.optedOutAt));

      const contacts = await db
        .select({
          userId: whatsappContacts.userId,
          userType: whatsappContacts.userType,
        })
        .from(whatsappContacts)
        .where(condition);

      if (contacts.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "لا يوجد مستخدمين مؤهلين وموافقين على الاستلام بهذا التصنيف",
        });
      }

      // Batch fetch local phone numbers in a single query with inArray to eliminate N+1 queries
      const localContactUserIds = contacts.filter((c) => c.userType === "local").map((c) => c.userId);
      const localPhoneMap = new Map<number, string>();
      if (localContactUserIds.length > 0) {
        const localRows = await db
          .select({ id: localUsers.id, phone: localUsers.phone })
          .from(localUsers)
          .where(inArray(localUsers.id, localContactUserIds));
        for (const row of localRows) {
          if (row.phone) localPhoneMap.set(row.id, row.phone);
        }
      }

      let enqueuedCount = 0;
      for (const c of contacts) {
        const phone = c.userType === "local" ? localPhoneMap.get(c.userId) ?? null : null;
        if (!phone) continue;

        const outcome = await enqueueMessage({
          owner: { userId: c.userId, userType: c.userType as "local" | "oauth" },
          to: phone,
          purpose: "broadcast",
          message: {
            name: input.templateName,
            language: "ar",
            body: input.parameters,
          },
        });
        if (outcome.enqueued) enqueuedCount++;
      }

      await logAdminAction(ctx, {
        action: "BROADCAST_WHATSAPP_TEMPLATE",
        targetType: "whatsapp_template",
        targetId: input.templateName,
        details: {
          userFilter: input.userFilter,
          enqueuedCount,
        },
      });

      return {
        success: true,
        enqueuedCount,
        message: `تمت إضافة ${enqueuedCount} رسالة إلى صندوق الإرسال بنجاح.`,
      };
    }),

  getOutboxLog: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          status: z.enum(["queued", "sending", "sent", "delivered", "read", "failed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50;
      const db = getDb();

      const condition = input?.status ? eq(whatsappMessages.status, input.status) : undefined;
      const query = db
        .select({
          id: whatsappMessages.id,
          recipient: whatsappMessages.recipient,
          purpose: whatsappMessages.purpose,
          templateName: whatsappMessages.templateName,
          status: whatsappMessages.status,
          attempts: whatsappMessages.attempts,
          errorCode: whatsappMessages.errorCode,
          metaMessageId: whatsappMessages.metaMessageId,
          sentAt: whatsappMessages.sentAt,
          deliveredAt: whatsappMessages.deliveredAt,
          readAt: whatsappMessages.readAt,
          failedAt: whatsappMessages.failedAt,
          createdAt: whatsappMessages.createdAt,
        })
        .from(whatsappMessages);

      const rows = condition
        ? await query.where(condition).orderBy(desc(whatsappMessages.id)).limit(limit)
        : await query.orderBy(desc(whatsappMessages.id)).limit(limit);

      return rows.map((r) => ({
        ...r,
        recipient: r.recipient ? `***${phoneTail(r.recipient)}` : null,
      }));
    }),

  getUsers: adminProcedure.query(async () => {
    const db = getDb();
    const localList = await db
      .select({
        id: localUsers.id,
        name: localUsers.name,
        phone: localUsers.phone,
        email: localUsers.email,
        plan: localUsers.plan,
      })
      .from(localUsers);

    const oauthList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        plan: users.plan,
      })
      .from(users);

    return [
      ...localList.map((u) => ({ ...u, userType: "local" as const })),
      ...oauthList.map((u) => ({ ...u, phone: null, userType: "oauth" as const })),
    ];
  }),

  // Stubs for deprecated legacy socket actions to ensure backward compatibility
  startService: adminProcedure.mutation(async () => {
    return { success: true, message: "تم الانتقال إلى WhatsApp Cloud API الرسمي؛ الخدمة تعمل تلقائياً عبر السحابة." };
  }),

  stopService: adminProcedure.mutation(async () => {
    return { success: true, message: "خدمة WhatsApp Cloud API مدارة سحابياً ولا تتطلب تشغيل أو إيقاف محلي." };
  }),

  broadcastMessage: adminProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "تم إيقاف الإرسال العشوائي القديم. يرجى استخدام القوالب المعتمدة رسمياً عبر broadcastTemplate.",
      });
    }),

  clearQueue: adminProcedure.mutation(async () => {
    return { success: true, message: "صندوق الإرسال السحابي يدار تلقائياً." };
  }),
});
