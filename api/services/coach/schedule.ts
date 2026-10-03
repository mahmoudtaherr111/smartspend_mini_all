/**
 * The calendar of scheduled cashflows, as pure functions over Cairo day keys ("YYYY-MM-DD"): which due dates fall in
 * a window, what each one still owes after its settlements, and what money is free until the next payday. No
 * database here; `api/services/coach/cashflows.ts` loads the rows and calls these.
 *
 * Rules the tests hold:
 * - A monthly date past a short month's end falls on its last day (the 31st is the 30th in April, the 28th or 29th
 *   in February), and comes back to the 31st the next month. A yearly 29 February is the 28th in other years.
 * - A schedule with no start day has no dated occurrences: its date is unknown, and it is reported as such.
 * - A due date is paid, partly paid, due or overdue from its settlements; an unknown amount is paid by any settlement.
 * - The last due date before the schedule was added (within 45 days) is `unconfirmed` until the user links a payment
 *   or says it was paid: whether it was paid is unknown, so it is listed, never subtracted, never called overdue.
 *   Earlier ones are not tracked at all.
 * - Money is Decimal: sums of pounds never pick up floating-point pennies.
 */
import Decimal from "decimal.js";

export type Recurrence = "once" | "weekly" | "monthly" | "yearly";

export interface ScheduleRow {
  id: number;
  kind: string;
  direction: "in" | "out";
  title: string;
  /** Pounds, or null when unknown. */
  amount: string | number | null;
  recurrence: Recurrence;
  startDay: string | null;
  endDay: string | null;
  certainty: "confirmed" | "estimated";
  status: string;
  /**
   * The Cairo day the schedule was added. Due dates before it were never tracked: they are not owed, not overdue,
   * whatever the start day says. Null: tracked from the start day.
   */
  trackedFrom?: string | null;
  contactId?: number | null;
  contactName?: string | null;
}

export interface SettlementRow {
  cashflowId: number;
  dueDay: string;
  amount: string | number;
  expenseId: number | null;
}

export type DueStatus = "paid" | "partial" | "due" | "overdue" | "unconfirmed";

export interface Occurrence {
  cashflowId: number;
  contactId?: number | null;
  contactName?: string | null;
  title: string;
  kind: string;
  direction: "in" | "out";
  certainty: "confirmed" | "estimated";
  dueDay: string;
  amount: number | null;
  paid: number;
  /** What is still owed (or still to come in); null when the amount is unknown. */
  remaining: number | null;
  status: DueStatus;
}

const DAY_MS = 86_400_000;

/** Real calendar days only; a malformed stored anchor must never enter a recurrence loop. */
export function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d));
  return y >= 1000 && instant.getUTCFullYear() === y && instant.getUTCMonth() + 1 === m && instant.getUTCDate() === d;
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [a, b, c] = parts(from);
  const [x, y, z] = parts(to);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / DAY_MS);
}

/** The due day of the `index`-th month after the anchor, on the anchor's day or the month's last. */
function monthlyDue(anchor: string, index: number): string {
  const [y, m, d] = parts(anchor);
  const total = m - 1 + index;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return key(year, month, Math.min(d, daysInMonth(year, month)));
}

function yearlyDue(anchor: string, index: number): string {
  const [y, m, d] = parts(anchor);
  return key(y + index, m, Math.min(d, daysInMonth(y + index, m)));
}

/** Every due day of a schedule in [from, to], both included. */
export function dueDays(row: Pick<ScheduleRow, "recurrence" | "startDay" | "endDay">, from: string, to: string): string[] {
  if (!row.startDay || !isCalendarDay(row.startDay) || !isCalendarDay(from) || !isCalendarDay(to) || (row.endDay && !isCalendarDay(row.endDay)) || to < from) return [];
  const last = row.endDay && row.endDay < to ? row.endDay : to;
  const out: string[] = [];
  const push = (day: string) => {
    if (day >= from && day <= last && day >= row.startDay!) out.push(day);
  };
  switch (row.recurrence) {
    case "once":
      push(row.startDay);
      break;
    case "weekly": {
      const skip = Math.max(0, Math.floor(daysBetween(row.startDay, from) / 7));
      for (let day = addDays(row.startDay, skip * 7); day <= last; day = addDays(day, 7)) push(day);
      break;
    }
    case "monthly": {
      const [sy, sm] = parts(row.startDay);
      const [fy, fm] = parts(from);
      const start = Math.max(0, (fy - sy) * 12 + (fm - sm) - 1);
      for (let index = start; ; index += 1) {
        const day = monthlyDue(row.startDay, index);
        if (day > last) break;
        push(day);
      }
      break;
    }
    case "yearly": {
      const start = Math.max(0, parts(from)[0] - parts(row.startDay)[0] - 1);
      for (let index = start; ; index += 1) {
        const day = yearlyDue(row.startDay, index);
        if (day > last) break;
        push(day);
      }
      break;
    }
  }
  return out;
}

const money = (value: string | number | null | undefined): Decimal | null =>
  value === null || value === undefined || value === "" ? null : new Decimal(value);

/** The due dates of the active schedules in [from, to], each with what was paid toward it and its status. */
export function occurrences(
  rows: ScheduleRow[],
  settlements: SettlementRow[],
  from: string,
  to: string,
  today: string,
): Occurrence[] {
  const paidBy = new Map<string, Decimal>();
  for (const settlement of settlements) {
    const id = `${settlement.cashflowId}:${settlement.dueDay}`;
    paidBy.set(id, (paidBy.get(id) ?? new Decimal(0)).plus(settlement.amount));
  }
  const out: Occurrence[] = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    // Of the dates before the schedule was added, only the latest (within 45 days) is asked about.
    const lastBefore = row.trackedFrom
      ? dueDays(row, addDays(row.trackedFrom, -45), addDays(row.trackedFrom, -1)).at(-1) ?? null
      : null;
    for (const dueDay of dueDays(row, from, to)) {
      const untracked = Boolean(row.trackedFrom && dueDay < row.trackedFrom && !paidBy.has(`${row.id}:${dueDay}`));
      if (untracked && dueDay !== lastBefore) continue;
      const amount = money(row.amount);
      const paid = paidBy.get(`${row.id}:${dueDay}`) ?? new Decimal(0);
      const remaining = amount ? Decimal.max(0, amount.minus(paid)) : null;
      const settled = amount ? remaining!.isZero() : paid.gt(0);
      const status: DueStatus = untracked
        ? "unconfirmed"
        : settled ? "paid" : paid.gt(0) ? "partial" : dueDay < today ? "overdue" : "due";
      out.push({
        cashflowId: row.id,
        contactId: row.contactId ?? null,
        contactName: row.contactName ?? null,
        title: row.title,
        kind: row.kind,
        direction: row.direction,
        certainty: row.certainty,
        dueDay,
        amount: amount ? amount.toNumber() : null,
        paid: paid.toNumber(),
        remaining: remaining ? remaining.toNumber() : null,
        status,
      });
    }
  }
  return out.sort((a, b) => a.dueDay.localeCompare(b.dueDay) || a.cashflowId - b.cashflowId);
}

/**
 * The next day the salary arrives after today, from the profile's salary day, on the month's last day when the month
 * is shorter. On payday itself the next one is next month's.
 */
export function nextPayday(today: string, salaryDay: number | null | undefined): string | null {
  if (!salaryDay || salaryDay < 1 || salaryDay > 31) return null;
  const [y, m] = parts(today);
  const thisMonth = key(y, m, Math.min(salaryDay, daysInMonth(y, m)));
  if (thisMonth > today) return thisMonth;
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return key(ny, nm, Math.min(salaryDay, daysInMonth(ny, nm)));
}

export interface CashPosition {
  today: string;
  /** The day the window ends (exclusive): the next payday, or the first of next month when there is none. */
  until: string;
  untilIsPayday: boolean;
  wallets: { total: number; count: number; oldestObservedDay: string | null; unknownAge: number };
  /** Payments due before `until` that are not paid yet (known amounts). */
  duesKnown: number;
  duesUnknownAmount: Occurrence[];
  /** Due dates from before the schedule was added, not known to be paid or not: to ask about, not subtracted. */
  duesUnconfirmed: Occurrence[];
  /** Schedules with no known date: they may fall in the window; not subtracted. */
  undated: Array<{ title: string; amount: number | null; direction: "in" | "out" }>;
  incomeConfirmed: number;
  incomeEstimated: number;
  /** Wallets minus what is due: what the records say is free, before any income. */
  freeBeforeIncome: number;
  /** Plus the income the user confirmed will come before `until`. */
  freeWithConfirmedIncome: number;
  days: number;
  occurrences: Occurrence[];
}

/**
 * What is free to spend until the next payday, from what the records hold: the wallets as last recorded, minus
 * what is due and not yet paid; confirmed income apart, estimated income apart again. Nothing unknown is counted
 * as zero: an unknown amount or date is listed, not subtracted.
 */
export function cashPosition(input: {
  today: string;
  salaryDay: number | null | undefined;
  wallets: Array<{ balance: string | number | null; observedAt: Date | null }>;
  rows: ScheduleRow[];
  settlements: SettlementRow[];
}): CashPosition {
  const payday = nextPayday(input.today, input.salaryDay);
  const [y, m] = parts(input.today);
  const until = payday ?? (m === 12 ? key(y + 1, 1, 1) : key(y, m + 1, 1));
  const window = occurrences(input.rows, input.settlements, input.today, addDays(until, -1), input.today)
    // Overdue ones before today are still owed; include them too.
    .concat(occurrences(input.rows, input.settlements, addDays(input.today, -45), addDays(input.today, -1), input.today)
      .filter((occurrence) => occurrence.status === "overdue" || occurrence.status === "partial" || occurrence.status === "unconfirmed"));
  const open = (occurrence: Occurrence) => occurrence.status !== "paid" && occurrence.status !== "unconfirmed";
  const out = window.filter((occurrence) => occurrence.direction === "out" && open(occurrence));
  const incoming = window.filter((occurrence) => occurrence.direction === "in" && open(occurrence));
  const sum = (list: Occurrence[]) => list.reduce((total, occurrence) => total.plus(occurrence.remaining ?? 0), new Decimal(0));
  const walletTotal = input.wallets.reduce((total, wallet) => total.plus(wallet.balance ?? 0), new Decimal(0));
  const observed = input.wallets.flatMap((wallet) => (wallet.observedAt ? [wallet.observedAt.toISOString().slice(0, 10)] : [])).sort();
  const dues = sum(out.filter((occurrence) => occurrence.remaining !== null));
  const confirmed = sum(incoming.filter((occurrence) => occurrence.certainty === "confirmed"));
  const estimated = sum(incoming.filter((occurrence) => occurrence.certainty === "estimated"));
  const free = walletTotal.minus(dues);
  return {
    today: input.today,
    until,
    untilIsPayday: Boolean(payday),
    wallets: {
      total: walletTotal.toNumber(),
      count: input.wallets.length,
      oldestObservedDay: observed[0] ?? null,
      unknownAge: input.wallets.filter((wallet) => !wallet.observedAt).length,
    },
    duesKnown: dues.toNumber(),
    duesUnknownAmount: out.filter((occurrence) => occurrence.remaining === null),
    duesUnconfirmed: window.filter((occurrence) => occurrence.status === "unconfirmed"),
    undated: input.rows
      .filter((row) => row.status === "active" && !row.startDay)
      .map((row) => ({ title: row.title, amount: money(row.amount)?.toNumber() ?? null, direction: row.direction })),
    incomeConfirmed: confirmed.toNumber(),
    incomeEstimated: estimated.toNumber(),
    freeBeforeIncome: free.toNumber(),
    freeWithConfirmedIncome: free.plus(confirmed).toNumber(),
    days: Math.max(1, daysBetween(input.today, until)),
    occurrences: window,
  };
}
