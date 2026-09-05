import { z } from "zod";
import {
  router,
  authedProcedure,
  adminProcedure,
  proProcedure,
} from "./middleware";
import { wrapReportAsPrintableHtml } from "./services/pro-report-engine";
import { db } from "./queries/connection";
import { expenses, users, localUsers } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

export const exportRouter = router({
  // ─── Export My Expenses ───
  myExpenses: authedProcedure
    .input(
      z.object({
        format: z.enum(["json", "csv", "xlsx"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        type: z.enum(["income", "expense", "all"]).default("all"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [
        eq(expenses.userId, ctx.user.id),
        eq(expenses.userType, ctx.user.type),
      ];

      if (input.startDate)
        conditions.push(gte(expenses.date, new Date(input.startDate)));
      if (input.endDate)
        conditions.push(lte(expenses.date, new Date(input.endDate)));
      if (input.type !== "all") conditions.push(eq(expenses.type, input.type));

      const data = await db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .limit(10000);
      const formatted = data.map((e) => ({
        التاريخ: e.date.toISOString().split("T")[0],
        النوع: e.type === "income" ? "دخل" : "مصروف",
        المبلغ: e.amount,
        الفئة: e.category,
        الوصف: e.description,
        المصدر: e.source === "voice" ? "صوت" : "يدوي",
      }));

      if (input.format === "json") {
        return {
          format: "json",
          data: formatted,
          filename: `expenses_${ctx.user.id}.json`,
        };
      }

      const ws = XLSX.utils.json_to_sheet(formatted);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "المصاريف");

      if (input.format === "csv") {
        const csv = XLSX.utils.sheet_to_csv(ws);
        return {
          format: "csv",
          data: csv,
          filename: `expenses_${ctx.user.id}.csv`,
        };
      }

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      return {
        format: "xlsx",
        data: buf.toString("base64"),
        filename: `expenses_${ctx.user.id}.xlsx`,
      };
    }),

  monthlyReportHtml: proProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        insightsJson: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let report: Record<string, unknown> = {};
      try {
        report = JSON.parse(input.insightsJson);
      } catch {
        report = { response_text: input.insightsJson };
      }
      const html = wrapReportAsPrintableHtml(
        report,
        input.month,
        ctx.user.name,
      );
      return {
        format: "html",
        filename: `smartspend-report-${input.month}.html`,
        data: html,
      };
    }),

  // ─── Export All Users (Admin only) ───
  allUsers: adminProcedure
    .input(z.object({ format: z.enum(["json", "csv", "xlsx"]) }))
    .mutation(async ({ input }) => {
      const oauthUsers = await db
        .select({
          name: users.name,
          email: users.email,
          role: users.role,
          plan: users.plan,
          lastSignInAt: users.lastSignInAt,
        })
        .from(users)
        .limit(5000);

      const localUsersList = await db
        .select({
          name: localUsers.name,
          phone: localUsers.phone,
          email: localUsers.email,
          role: localUsers.role,
          plan: localUsers.plan,
          lastSignInAt: localUsers.lastSignInAt,
        })
        .from(localUsers)
        .limit(5000);

      const formatted = [
        ...oauthUsers.map((u) => ({
          النوع: "OAuth",
          الاسم: u.name,
          الايميل: u.email || "",
          الدور: u.role,
          الخطة: u.plan,
          "آخر دخول": u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : "",
        })),
        ...localUsersList.map((u) => ({
          النوع: "Local",
          الاسم: u.name,
          التليفون: u.phone,
          الايميل: u.email || "",
          الدور: u.role,
          الخطة: u.plan,
          "آخر دخول": u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : "",
        })),
      ];

      if (input.format === "json") {
        return {
          format: "json",
          data: formatted,
          filename: "users_export.json",
        };
      }

      const ws = XLSX.utils.json_to_sheet(formatted);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "المستخدمين");

      if (input.format === "csv") {
        return {
          format: "csv",
          data: XLSX.utils.sheet_to_csv(ws),
          filename: "users_export.csv",
        };
      }

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      return {
        format: "xlsx",
        data: buf.toString("base64"),
        filename: "users_export.xlsx",
      };
    }),
});
