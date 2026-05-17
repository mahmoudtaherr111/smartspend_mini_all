/**
 * Financial Month Calculator
 * 
 * If a user has a fixed salary that drops on day X, their "financial month"
 * runs from day X of the current month to day X-1 of the next month.
 * 
 * Example: salary_day = 5
 *   Financial May = May 5 → June 4
 *   Financial June = June 5 → July 4
 * 
 * The calendar itself stays normal (1-30/31), but the AI and reports
 * understand that the budget cycle resets on salary day.
 */

export interface FinancialMonthRange {
  /** Start date of the financial month */
  start: Date;
  /** End date of the financial month (inclusive) */
  end: Date;
  /** The salary day (1-31) */
  salaryDay: number;
  /** Human-readable label in Arabic */
  label: string;
  /** Days elapsed since financial month start */
  daysElapsed: number;
  /** Total days in this financial month */
  daysTotal: number;
  /** Completion percentage (0-100) */
  progressPercent: number;
  /** true if less than 30% of financial month has passed */
  isEarlyMonth: boolean;
  /** true if more than 80% of financial month has passed */
  isLateMonth: boolean;
  /** Days remaining until next salary */
  daysUntilNextSalary: number;
}

const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "إبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * Clamp a salary day to a valid date for a given month.
 * e.g. salary_day=31 in February → 28 (or 29 in leap year)
 */
function clampDay(year: number, month: number, salaryDay: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(salaryDay, daysInMonth);
}

/**
 * Calculate the financial month range for a given calendar month + salary day.
 * 
 * @param calendarMonth - "YYYY-MM" format (e.g. "2025-05")
 * @param salaryDay - The day of month when salary drops (1-31)
 * @param referenceDate - Current date for progress calculations (defaults to now)
 */
export function getFinancialMonthRange(
  calendarMonth: string,
  salaryDay: number,
  referenceDate: Date = new Date()
): FinancialMonthRange {
  const [year, monthIdx] = calendarMonth.split("-").map(Number);
  // monthIdx is 1-based from the string, JS Date uses 0-based
  const month0 = monthIdx - 1;

  // Financial month START: salary day of the given calendar month
  const clampedStart = clampDay(year, month0, salaryDay);
  const start = new Date(year, month0, clampedStart, 0, 0, 0, 0);

  // Financial month END: day before salary day of the NEXT month
  const nextMonth0 = month0 + 1; // JS Date handles overflow (12 → next year Jan)
  const nextYear = nextMonth0 > 11 ? year + 1 : year;
  const nextMonth0Clamped = nextMonth0 > 11 ? 0 : nextMonth0;
  const clampedEnd = clampDay(nextYear, nextMonth0Clamped, salaryDay);
  const end = new Date(nextYear, nextMonth0Clamped, clampedEnd - 1, 23, 59, 59, 999);

  // If salary day is 1, the financial month IS the calendar month
  // end would be day 0 of next month = last day of current month
  if (salaryDay <= 1) {
    const lastDay = new Date(year, month0 + 1, 0).getDate();
    end.setFullYear(year);
    end.setMonth(month0);
    end.setDate(lastDay);
  }

  const daysTotal = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const daysElapsed = Math.max(0, Math.min(daysTotal,
    Math.round((referenceDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  ));
  const progressPercent = Math.round((daysElapsed / daysTotal) * 100);
  const daysUntilNextSalary = Math.max(0, daysTotal - daysElapsed);

  const startLabel = `${clampedStart} ${MONTH_NAMES_AR[month0]}`;
  const endLabel = salaryDay <= 1
    ? `${end.getDate()} ${MONTH_NAMES_AR[month0]}`
    : `${end.getDate()} ${MONTH_NAMES_AR[end.getMonth()]}`;

  return {
    start,
    end,
    salaryDay,
    label: `${startLabel} → ${endLabel}`,
    daysElapsed,
    daysTotal,
    progressPercent,
    isEarlyMonth: progressPercent < 30,
    isLateMonth: progressPercent > 80,
    daysUntilNextSalary,
  };
}

/**
 * Build a rich Arabic prompt section explaining the financial month context.
 * This is injected into the AI system prompt for reports and classification.
 */
export function buildFinancialMonthPrompt(
  salaryDay: number,
  calendarMonth: string,
  referenceDate: Date = new Date()
): string {
  const range = getFinancialMonthRange(calendarMonth, salaryDay, referenceDate);

  const lines = [
    `═══ الشهر المالي للمستخدم ═══`,
    `مرتب المستخدم بينزل يوم ${salaryDay} من كل شهر.`,
    `الفترة المالية الحالية: ${range.label}`,
    `مضى على الشهر المالي: ${range.daysElapsed} يوم من ${range.daysTotal} يوم (${range.progressPercent}%)`,
    `باقي على المرتب الجاي: ${range.daysUntilNextSalary} يوم`,
  ];

  if (range.isEarlyMonth) {
    lines.push(
      `⚠️ تنبيه مهم: المستخدم لسه في أول الشهر المالي (${range.progressPercent}% بس).`,
      `- لا تحكم على الأداء الشهري بشكل نهائي`,
      `- لا تقول "الشهر خلص" أو "ختام الشهر" لأن الشهر لسه في أوله`,
      `- ركز على البداية والتوقعات بناءً على أول أيام الشهر المالي`,
    );
  } else if (range.isLateMonth) {
    lines.push(
      `✅ المستخدم في آخر الشهر المالي (${range.progressPercent}%).`,
      `- ممكن تقدم ملخص شامل وتقييم للأداء الشهري`,
      `- قارن المصروفات بالدخل المعلن`,
      `- قدم نصائح للشهر المالي الجاي`,
    );
  } else {
    lines.push(
      `المستخدم في منتصف الشهر المالي تقريباً.`,
      `- ممكن تقدم تحليل مبدئي للاتجاهات`,
      `- قارن بمعدل الصرف اليومي المتوقع`,
    );
  }

  lines.push(
    ``,
    `تعليمة: حلل أداء المستخدم بناءً على نسبة الشهر المالي اللي مضت، مش التاريخ الميلادي.`,
    `لو المستخدم صرف 50% من دخله وعدى 50% من شهره المالي = أداء عادي.`,
    `لو صرف 50% من دخله وعدى 20% بس = إنذار مبكر.`,
  );

  return lines.join("\n");
}

/**
 * Get the date range for expenses query based on financial month.
 * Returns { startDate, endDate } that can be used in SQL WHERE clauses.
 */
export function getFinancialMonthDates(
  calendarMonth: string,
  salaryDay: number | null | undefined
): { startDate: Date; endDate: Date } {
  if (!salaryDay || salaryDay <= 1) {
    // No salary day or day 1 = normal calendar month
    const start = new Date(calendarMonth + "-01");
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { startDate: start, endDate: end };
  }

  const range = getFinancialMonthRange(calendarMonth, salaryDay);
  // endDate should be exclusive (day after the end date) for SQL queries
  const endDate = new Date(range.end);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(0, 0, 0, 0);

  return { startDate: range.start, endDate };
}
