import { z } from "zod";
import {
  router,
  authedProcedure,
  adminProcedure,
  proReportProcedure,
} from "./middleware";
import { wrapReportAsPrintableHtml } from "./services/pro-report-engine";
import { db } from "./queries/connection";
import { expenses, users, localUsers } from "../db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { businessDateKey, parseBusinessInstant } from "./lib/app-time";
import ExcelJS from "exceljs";

export const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) by prepending a single quote (')
 * to strings that begin with formula trigger characters (=, +, -, @, \t, \r).
 * Normal text, numbers, and booleans are preserved as-is.
 */
export function sanitizeSpreadsheetField<T>(value: T): T | string {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;

  const str = String(value);
  if (str.length === 0) return str;

  const firstChar = str.charAt(0);
  if (FORMULA_TRIGGERS.includes(firstChar)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Helper: Generate CSV string with RFC 4180 escaping and formula sanitization.
 */
export function generateCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const val = sanitizeSpreadsheetField(row[header]);
        const str = val === null || val === undefined ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [headerLine, ...lines].join("\r\n");
}

/**
 * Helper: Build ExcelJS Workbook buffer with native Arabic RTL support and formula sanitization.
 */
export async function generateExcelBuffer(
  sheetName: string,
  rows: Record<string, unknown>[],
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SmartSpend AI";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }],
  });

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length * 3, 16),
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    for (const row of rows) {
      const sanitizedRow: Record<string, unknown> = {};
      for (const key of headers) {
        sanitizedRow[key] = sanitizeSpreadsheetField(row[key]);
      }
      worksheet.addRow(sanitizedRow);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

const TYPE_LABELS: Record<string, string> = {
  income: "دخل",
  expense: "مصروف",
  transfer: "تحويل",
  investment: "استثمار",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "يدوي",
  ai_parsed: "مكتوب",
  voice: "صوت",
  image: "إيصال",
  sms: "رسالة بنك",
};

/**
 * One exported row. The day is Cairo's (golden rule 6), a transfer or an investment is named as such rather than as
 * spending, a refund (an expense saved negative, decision 0010) is named مرتجع with its signed amount so a column sum
 * is still the net, and every source keeps its own name.
 */
export function exportRow(e: {
  date: Date;
  type: string;
  amount: string | number;
  category: string;
  subCategory?: string | null;
  description?: string | null;
  source?: string | null;
}): Record<string, string | number> {
  const amount = Number(e.amount);
  return {
    التاريخ: businessDateKey(e.date),
    النوع: e.type === "expense" && amount < 0 ? "مرتجع" : (TYPE_LABELS[e.type] ?? e.type),
    المبلغ: amount,
    الفئة: e.category,
    "الفئة الفرعية": e.subCategory || "",
    الوصف: e.description || "",
    المصدر: SOURCE_LABELS[e.source ?? "manual"] ?? e.source ?? "",
  };
}

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
        conditions.push(gte(expenses.date, parseBusinessInstant(input.startDate)));
      if (input.endDate)
        conditions.push(lte(expenses.date, parseBusinessInstant(input.endDate)));
      if (input.type !== "all") conditions.push(eq(expenses.type, input.type));

      const data = await db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.date))
        .limit(10000);
      const formatted = data.map(exportRow);

      if (input.format === "json") {
        return {
          format: "json" as const,
          data: formatted,
          filename: `expenses_${ctx.user.id}.json`,
        };
      }

      if (input.format === "csv") {
        return {
          format: "csv" as const,
          data: generateCsv(formatted),
          filename: `expenses_${ctx.user.id}.csv`,
        };
      }

      const base64Data = await generateExcelBuffer("المصاريف", formatted);
      return {
        format: "xlsx" as const,
        data: base64Data,
        filename: `expenses_${ctx.user.id}.xlsx`,
      };
    }),

  monthlyReportHtml: proReportProcedure
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
          format: "json" as const,
          data: formatted,
          filename: "users_export.json",
        };
      }

      if (input.format === "csv") {
        return {
          format: "csv" as const,
          data: generateCsv(formatted),
          filename: "users_export.csv",
        };
      }

      const base64Data = await generateExcelBuffer("المستخدمين", formatted);
      return {
        format: "xlsx" as const,
        data: base64Data,
        filename: "users_export.xlsx",
      };
    }),
});
