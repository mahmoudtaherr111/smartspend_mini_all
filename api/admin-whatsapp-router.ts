import { z } from "zod";
import { router, adminProcedure } from "./middleware";
import { whatsappService } from "./services/whatsapp-service";
import { db } from "./queries/connection";
import { localUsers, systemSettings, users } from "../db/schema";
import { isNotNull, and, ne, eq } from "drizzle-orm";

// A simple in-memory queue for broadcasting
let broadcastQueue: { phone: string; text: string }[] = [];
let isBroadcasting = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = (min: number, max: number) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
};

function applySpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  return text.replace(spintaxRegex, (match, optionsString) => {
    const options = optionsString.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

async function processBroadcastQueue() {
  if (isBroadcasting) return;
  isBroadcasting = true;

  while (broadcastQueue.length > 0) {
    const job = broadcastQueue.shift();
    if (job) {
      try {
        const finalMessage = applySpintax(job.text);
        await whatsappService.sendMessage(job.phone, finalMessage);
        console.log(`[WhatsApp Broadcast] Sent message to ${job.phone}`);
      } catch (err) {
        console.error(
          `[WhatsApp Broadcast] Failed to send message to ${job.phone}:`,
          err
        );
      }
      // Wait a random delay between 2 to 4 minutes (120s to 240s) to simulate real human behavior and prevent bans
      if (broadcastQueue.length > 0) {
        await randomDelay(120000, 240000);
      }
    }
  }

  isBroadcasting = false;
}

export const adminWhatsappRouter = router({
  getStatus: adminProcedure.query(async () => {
    const statusInfo = whatsappService.getStatus();
    return {
      status: statusInfo.status,
      qrCode: statusInfo.qrCode,
      queueLength: broadcastQueue.length,
      isBroadcasting,
      phoneNumber: statusInfo.phoneNumber,
    };
  }),

  startService: adminProcedure.mutation(async () => {
    await whatsappService.start();
    return { success: true, message: "جاري تشغيل الخدمة..." };
  }),

  stopService: adminProcedure.mutation(async () => {
    await whatsappService.stop();
    return { success: true, message: "تم إيقاف الخدمة" };
  }),

  getSettings: adminProcedure.query(async () => {
    const setting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, "whatsapp_otp_enabled"),
    });
    return { otpEnabled: setting?.value === "true" };
  }),

  toggleOtpVerification: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const existing = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "whatsapp_otp_enabled"),
      });

      if (existing) {
        await db.update(systemSettings)
          .set({ value: input.enabled ? "true" : "false" })
          .where(eq(systemSettings.key, "whatsapp_otp_enabled"));
      } else {
        await db.insert(systemSettings).values({
          key: "whatsapp_otp_enabled",
          value: input.enabled ? "true" : "false",
        });
      }
      return { success: true };
    }),

  sendDirectMessage: adminProcedure
    .input(
      z.object({
        phone: z.string().min(8),
        text: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await whatsappService.sendMessage(input.phone, input.text);
        return { success: true, message: "تم إرسال الرسالة بنجاح" };
      } catch (err: any) {
        throw new Error(err.message || "فشل إرسال الرسالة");
      }
    }),

  getUsers: adminProcedure.query(async () => {
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

    const usersCombined = [
      ...localList.map(u => ({ ...u, userType: "local" as const })),
      ...oauthList.map(u => ({ ...u, phone: null, userType: "oauth" as const }))
    ];

    return usersCombined;
  }),

  broadcastMessage: adminProcedure
    .input(
      z.object({
        text: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const users = await db
        .select({
          phone: localUsers.phone,
        })
        .from(localUsers)
        .where(and(isNotNull(localUsers.phone), ne(localUsers.phone, "")));

      if (users.length === 0) {
        throw new Error("لا يوجد مستخدمين بأرقام هواتف مسجلة");
      }

      // Add to queue
      for (const u of users) {
        if (u.phone) {
          broadcastQueue.push({ phone: u.phone, text: input.text });
        }
      }

      // Start processing if not already
      processBroadcastQueue();

      return {
        success: true,
        message: `تمت إضافة ${users.length} رسالة إلى الطابور وجاري الإرسال ببطء.`,
      };
    }),
    
  clearQueue: adminProcedure.mutation(async () => {
    const cleared = broadcastQueue.length;
    broadcastQueue = [];
    return {
      success: true,
      message: `تم تفريغ الطابور (إلغاء ${cleared} رسالة).`
    };
  })
});
