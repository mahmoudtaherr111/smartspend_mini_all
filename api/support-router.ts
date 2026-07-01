import { z } from "zod";
import {
  router,
  authedProcedure,
  moderatorProcedure,
  adminProcedure,
} from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import { supportTickets, users, localUsers } from "../db/schema";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";

export const supportRouter = router({
  // ─── Create Ticket ───
  create: authedProcedure
    .input(
      z.object({
        subject: z.string().min(3).max(255),
        message: z.string().min(10),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        contactPhone: z.string().min(10).max(20).optional(),
        contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const phone = input.contactPhone?.trim();
      const email = input.contactEmail?.trim();
      const messageBody =
        phone || email
          ? [
              "[بيانات التواصل]",
              phone ? `هاتف: ${phone}` : null,
              email ? `إيميل: ${email}` : null,
              "",
              input.message.trim(),
            ]
              .filter(Boolean)
              .join("\n")
          : input.message.trim();

      const result = await db.insert(supportTickets).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        subject: input.subject,
        message: messageBody,
        priority: input.priority,
        status: "open",
      });
      return { success: true, ticketId: Number(result[0].insertId) };
    }),

  // ─── List My Tickets ───
  listMine: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.userId, ctx.user.id),
          eq(supportTickets.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(supportTickets.createdAt));
  }),

  // ─── Get Ticket Details ───
  getById: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const ticket = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      if (!ticket[0]) throw new TRPCError({ code: "NOT_FOUND", message: "التذكرة غير موجودة" });
      // Allow if owner or moderator/admin
      if (
        ticket[0].userId !== ctx.user.id ||
        ticket[0].userType !== ctx.user.type
      ) {
        if (ctx.user.role !== "moderator" && ctx.user.role !== "admin") {
          throw new Error("غير مصرح");
        }
      }
      return ticket[0];
    }),

  // ─── List All Tickets (Moderator+) ───
  listAll: moderatorProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          priority: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { status, priority, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;

      const filters = [];
      if (status) filters.push(eq(supportTickets.status, status));
      if (priority) filters.push(eq(supportTickets.priority, priority));

      const list = await db
        .select()
        .from(supportTickets)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(supportTickets.createdAt))
        .limit(limit)
        .offset(offset);

      const enriched = await Promise.all(
        list.map(async (t) => {
          let name = "مجهول";
          let avatarUrl = "";
          if (t.userType === "oauth") {
            const u = await db
              .select({ name: users.name, avatar: users.avatar })
              .from(users)
              .where(eq(users.id, t.userId))
              .limit(1);
            if (u[0]) {
              name = u[0].name;
              avatarUrl = u[0].avatar || "";
            }
          } else {
            const u = await db
              .select({ name: localUsers.name })
              .from(localUsers)
              .where(eq(localUsers.id, t.userId))
              .limit(1);
            if (u[0]) name = u[0].name;
          }
          return { ...t, userName: name, userAvatar: avatarUrl };
        }),
      );

      const oauthIds = [...new Set(list.filter((t) => t.userType === "oauth").map((t) => t.userId))];
      const localIds = [...new Set(list.filter((t) => t.userType === "local").map((t) => t.userId))];

      const nameMap = new Map<string, { name: string; avatar: string }>();
      if (oauthIds.length > 0) {
        const oauthRows = await db
          .select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users)
          .where(inArray(users.id, oauthIds));
        for (const r of oauthRows) nameMap.set(`oauth:${r.id}`, { name: r.name, avatar: r.avatar || "" });
      }
      if (localIds.length > 0) {
        const localRows = await db
          .select({ id: localUsers.id, name: localUsers.name })
          .from(localUsers)
          .where(inArray(localUsers.id, localIds));
        for (const r of localRows) nameMap.set(`local:${r.id}`, { name: r.name, avatar: "" });
      }

      const enrichedList = list.map((t) => {
        const info = nameMap.get(`${t.userType}:${t.userId}`);
        return { ...t, userName: info?.name || "مجهول", userAvatar: info?.avatar || "" };
      });

      const total = await db.select({ count: count() }).from(supportTickets);
      return { list: enrichedList, total: total[0]?.count ?? 0, page, limit };
    }),

  // ─── Respond to Ticket ───
  respond: moderatorProcedure
    .input(
      z.object({
        id: z.number(),
        response: z.string().min(1),
        status: z
          .enum(["open", "in_progress", "resolved", "closed"])
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const updates: any = {
        response: input.response,
        respondedAt: new Date(),
      };
      if (input.status) updates.status = input.status;
      await db
        .update(supportTickets)
        .set(updates)
        .where(eq(supportTickets.id, input.id));
      return { success: true, message: "تم الرد على التذكرة" };
    }),

  // ─── Assign Ticket ───
  assign: adminProcedure
    .input(
      z.object({
        id: z.number(),
        moderatorId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .update(supportTickets)
        .set({ assignedTo: input.moderatorId, status: "in_progress" })
        .where(eq(supportTickets.id, input.id));
      return { success: true, message: "تم تعيين التذكرة" };
    }),

  // ─── Close Ticket ───
  close: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      if (!ticket[0]) throw new TRPCError({ code: "NOT_FOUND", message: "غير موجود" });
      if (
        ticket[0].userId !== ctx.user.id ||
        ticket[0].userType !== ctx.user.type
      ) {
        if (ctx.user.role !== "moderator" && ctx.user.role !== "admin") {
          throw new Error("غير مصرح");
        }
      }
      await db
        .update(supportTickets)
        .set({ status: "closed" })
        .where(eq(supportTickets.id, input.id));
      return { success: true };
    }),
});
