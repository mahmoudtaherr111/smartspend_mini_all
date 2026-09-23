import { businessDateKey, startOfBusinessDay } from "../../lib/app-time";
import type {
  FinanceContext,
  FinancePeriodInput,
  FinancePeriodKind,
  ResolvedFinancePeriod,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A day of the business calendar (Cairo by default, golden rule 6). Arithmetic happens on these calendar
 * values; only the final boundaries become instants, so a server running in UTC still answers "today" for
 * the user's today.
 */
interface CalendarDay {
  year: number;
  month0: number;
  day: number;
}

function clampSalaryDay(value: number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(31, Math.floor(parsed)));
}

function calendarDay(year: number, month0: number, day: number): CalendarDay {
  const normalized = new Date(Date.UTC(year, month0, day));
  return {
    year: normalized.getUTCFullYear(),
    month0: normalized.getUTCMonth(),
    day: normalized.getUTCDate(),
  };
}

function businessDayOf(value: Date): CalendarDay {
  const [year, month, day] = businessDateKey(value).split("-").map(Number);
  return { year, month0: month - 1, day };
}

function addDays(value: CalendarDay, offset: number): CalendarDay {
  return calendarDay(value.year, value.month0, value.day + offset);
}

function dayNumber(value: CalendarDay): number {
  return Date.UTC(value.year, value.month0, value.day) / MS_PER_DAY;
}

function dayKey(value: CalendarDay): string {
  return [
    value.year,
    String(value.month0 + 1).padStart(2, "0"),
    String(value.day).padStart(2, "0"),
  ].join("-");
}

function monthKey(value: CalendarDay): string {
  return dayKey(value).slice(0, 7);
}

// A boundary is computed a few times per request for the same handful of days.
const BOUNDARY_CACHE = new Map<string, Date>();

function startInstant(value: CalendarDay): Date {
  const key = dayKey(value);
  const cached = BOUNDARY_CACHE.get(key);
  if (cached) return new Date(cached);
  // Noon UTC lies inside the intended calendar day for every deployment timezone (see app-time).
  const start = startOfBusinessDay(new Date(Date.UTC(value.year, value.month0, value.day, 12)));
  if (BOUNDARY_CACHE.size > 1024) BOUNDARY_CACHE.clear();
  BOUNDARY_CACHE.set(key, start);
  return new Date(start);
}

function endInstant(value: CalendarDay): Date {
  return new Date(startInstant(addDays(value, 1)).getTime() - 1);
}

/** "YYYY-MM-DD" is a business calendar day as written; anything else is an instant placed in that calendar. */
function parseDayInput(value: Date | string | undefined, fallback: CalendarDay): CalendarDay {
  if (!value) return fallback;
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return calendarDay(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : businessDayOf(date);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function clampDay(year: number, month0: number, day: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

function addMonths(value: CalendarDay, offset: number): CalendarDay {
  return calendarDay(value.year, value.month0 + offset, 1);
}

function currentFinancialMonthStart(today: CalendarDay, salaryDay: number): CalendarDay {
  if (salaryDay <= 1) {
    return calendarDay(today.year, today.month0, 1);
  }

  const startMonth = today.day >= salaryDay
    ? calendarDay(today.year, today.month0, 1)
    : calendarDay(today.year, today.month0 - 1, 1);
  return calendarDay(
    startMonth.year,
    startMonth.month0,
    clampDay(startMonth.year, startMonth.month0, salaryDay),
  );
}

function financialMonthRange(month: string, salaryDay: number): { start: CalendarDay; end: CalendarDay } {
  const [year, monthNumber] = month.split("-").map(Number);
  const month0 = (monthNumber || 1) - 1;

  if (salaryDay <= 1) {
    return {
      start: calendarDay(year, month0, 1),
      end: calendarDay(year, month0, daysInMonth(year, month0)),
    };
  }

  const next = calendarDay(year, month0 + 1, 1);
  return {
    start: calendarDay(year, month0, clampDay(year, month0, salaryDay)),
    end: addDays(calendarDay(next.year, next.month0, clampDay(next.year, next.month0, salaryDay)), -1),
  };
}

function weekStart(today: CalendarDay): CalendarDay {
  const weekday = new Date(Date.UTC(today.year, today.month0, today.day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(today, mondayOffset);
}

function buildResolved(
  kind: FinancePeriodKind,
  start: CalendarDay,
  end: CalendarDay,
  salaryDay: number,
  today: CalendarDay,
  isSalaryCycle: boolean,
): ResolvedFinancePeriod {
  const [first, last] = dayNumber(start) <= dayNumber(end) ? [start, end] : [end, start];
  const daysTotal = Math.max(1, dayNumber(last) - dayNumber(first) + 1);
  const elapsedDay = Math.min(Math.max(dayNumber(today), dayNumber(first)), dayNumber(last));
  const daysElapsed = Math.max(1, Math.min(daysTotal, elapsedDay - dayNumber(first) + 1));
  const startKey = dayKey(first);
  const endKey = dayKey(last);
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
    startDate: startInstant(first),
    endDate: endInstant(last),
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
  const today = businessDayOf(referenceDate);
  const salaryDay = clampSalaryDay(context.salaryDay);
  const period = input.period ?? "current_month";

  if (period === "today") {
    return buildResolved(period, today, today, salaryDay, today, false);
  }

  if (period === "yesterday") {
    const yesterday = addDays(today, -1);
    return buildResolved(period, yesterday, yesterday, salaryDay, today, false);
  }

  if (period === "current_week") {
    const start = weekStart(today);
    return buildResolved(period, start, addDays(start, 6), salaryDay, today, false);
  }

  if (period === "custom") {
    const start = parseDayInput(input.startDate, today);
    const end = parseDayInput(input.endDate, start);
    return buildResolved(period, start, end, salaryDay, today, false);
  }

  if (period === "previous_month") {
    const previousStart = addMonths(currentFinancialMonthStart(today, salaryDay), -1);
    const range = financialMonthRange(monthKey(previousStart), salaryDay);
    return buildResolved(period, range.start, range.end, salaryDay, today, salaryDay > 1);
  }

  if (period === "salary_cycle" || period === "current_month") {
    const month = input.month ?? monthKey(currentFinancialMonthStart(today, salaryDay));
    const range = financialMonthRange(month, salaryDay);
    return buildResolved(period, range.start, range.end, salaryDay, today, salaryDay > 1);
  }

  const month = input.month ?? monthKey(today);
  const range = financialMonthRange(month, salaryDay);
  return buildResolved(period, range.start, range.end, salaryDay, today, salaryDay > 1);
}

export const financePeriodTestUtils = {
  businessDayOf,
  dayKey,
  monthKey,
  currentFinancialMonthStart,
};
