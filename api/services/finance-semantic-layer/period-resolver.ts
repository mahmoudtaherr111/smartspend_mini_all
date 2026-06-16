import type {
  FinanceContext,
  FinancePeriodInput,
  FinancePeriodKind,
  ResolvedFinancePeriod,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampSalaryDay(value: number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(31, Math.floor(parsed)));
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseDateInput(value: Date | string | undefined, fallback: Date): Date {
  if (!value) return new Date(fallback);
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function clampDay(year: number, month0: number, day: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

function addMonths(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function currentFinancialMonthStart(referenceDate: Date, salaryDay: number): Date {
  if (salaryDay <= 1) {
    return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  }

  const year = referenceDate.getFullYear();
  const month0 = referenceDate.getMonth();
  const day = referenceDate.getDate();
  const startMonth0 = day >= salaryDay ? month0 : month0 - 1;
  const startDate = new Date(year, startMonth0, 1);
  const clamped = clampDay(startDate.getFullYear(), startDate.getMonth(), salaryDay);
  return new Date(startDate.getFullYear(), startDate.getMonth(), clamped, 0, 0, 0, 0);
}

function financialMonthRange(month: string, salaryDay: number): { startDate: Date; endDate: Date } {
  const [year, monthNumber] = month.split("-").map(Number);
  const month0 = (monthNumber || 1) - 1;

  if (salaryDay <= 1) {
    return {
      startDate: new Date(year, month0, 1, 0, 0, 0, 0),
      endDate: new Date(year, month0 + 1, 0, 23, 59, 59, 999),
    };
  }

  const startDay = clampDay(year, month0, salaryDay);
  const nextMonth = new Date(year, month0 + 1, 1);
  const nextStartDay = clampDay(nextMonth.getFullYear(), nextMonth.getMonth(), salaryDay);
  return {
    startDate: new Date(year, month0, startDay, 0, 0, 0, 0),
    endDate: new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextStartDay - 1, 23, 59, 59, 999),
  };
}

function weekStart(referenceDate: Date): Date {
  const date = startOfDay(referenceDate);
  const jsDay = date.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function buildResolved(
  kind: FinancePeriodKind,
  startDate: Date,
  endDate: Date,
  salaryDay: number,
  referenceDate: Date,
  isSalaryCycle: boolean,
): ResolvedFinancePeriod {
  const safeStart = startOfDay(startDate);
  const safeEnd = endOfDay(endDate);
  const daysTotal = Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime() + 1) / MS_PER_DAY));
  const elapsedEnd = referenceDate < safeStart ? safeStart : referenceDate > safeEnd ? safeEnd : referenceDate;
  const daysElapsed = Math.max(1, Math.min(daysTotal, Math.ceil((endOfDay(elapsedEnd).getTime() - safeStart.getTime() + 1) / MS_PER_DAY)));
  const startKey = localDateKey(safeStart);
  const endKey = localDateKey(safeEnd);
  const label =
    kind === "today"
      ? "اليوم"
      : kind === "yesterday"
        ? "أمس"
        : kind === "current_week"
          ? "الأسبوع الحالي"
          : kind === "current_month"
            ? "الشهر الحالي"
            : kind === "previous_month"
              ? "الشهر السابق"
              : kind === "salary_cycle"
                ? "دورة المرتب الحالية"
                : startKey === endKey
                  ? startKey
                  : `${startKey}..${endKey}`;

  return {
    kind,
    key: `${kind}:${startKey}:${endKey}:salary_${salaryDay}`,
    label,
    startDate: safeStart,
    endDate: safeEnd,
    salaryDay,
    daysElapsed,
    daysTotal,
    isSalaryCycle,
  };
}

export function resolveFinancePeriod(
  input: FinancePeriodInput = {},
  context: Pick<FinanceContext, "salaryDay" | "referenceDate"> = {},
): ResolvedFinancePeriod {
  const referenceDate = context.referenceDate ? new Date(context.referenceDate) : new Date();
  const salaryDay = clampSalaryDay(context.salaryDay);
  const period = input.period ?? "current_month";

  if (period === "today") {
    return buildResolved(period, referenceDate, referenceDate, salaryDay, referenceDate, false);
  }

  if (period === "yesterday") {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() - 1);
    return buildResolved(period, date, date, salaryDay, referenceDate, false);
  }

  if (period === "current_week") {
    const start = weekStart(referenceDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return buildResolved(period, start, end, salaryDay, referenceDate, false);
  }

  if (period === "custom") {
    const start = parseDateInput(input.startDate, referenceDate);
    const end = parseDateInput(input.endDate, start);
    return buildResolved(period, start, end, salaryDay, referenceDate, false);
  }

  if (period === "previous_month") {
    const currentStart = currentFinancialMonthStart(referenceDate, salaryDay);
    const previousStart = addMonths(currentStart, -1);
    const range = financialMonthRange(monthKey(previousStart), salaryDay);
    return buildResolved(period, range.startDate, range.endDate, salaryDay, referenceDate, salaryDay > 1);
  }

  if (period === "salary_cycle" || period === "current_month") {
    const month = input.month ?? monthKey(currentFinancialMonthStart(referenceDate, salaryDay));
    const range = financialMonthRange(month, salaryDay);
    return buildResolved(period, range.startDate, range.endDate, salaryDay, referenceDate, salaryDay > 1);
  }

  const month = input.month ?? monthKey(referenceDate);
  const range = financialMonthRange(month, salaryDay);
  return buildResolved(period, range.startDate, range.endDate, salaryDay, referenceDate, salaryDay > 1);
}

export const financePeriodTestUtils = {
  startOfDay,
  endOfDay,
  monthKey,
  localDateKey,
  currentFinancialMonthStart,
};
