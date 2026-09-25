/**
 * "ليك وعليك": what each person owes the user, and what the user owes them, from the loans
 * already in the ledger. A loan is a transfer under تحويل/دين/سلفة with a direction:
 * money that went out (lent, or a debt repaid) raises what the person owes the user, money
 * that came in (borrowed, or a loan repaid to the user) lowers it. The balance per person is
 * outgoing minus incoming: positive means they owe the user, negative that the user owes them.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../queries/connection";
import { expenses, userContacts } from "../../db/schema";

export const LOAN_CATEGORY = "تحويل";
export const LOAN_SUBCATEGORY = "دين/سلفة";
export const GAM3EYA_SUBCATEGORY = "جمعية";

export interface Gam3eyaStanding {
  /** Installments paid into the gam3eya. */
  paid: number;
  /** Payouts taken from it. */
  received: number;
  /** Paid minus received: what the gam3eya still holds for the user (negative once they took more). */
  held: number;
  installments: number;
}

/** Pure: what a user put into their gam3eya and what they took out, from its transfers. */
export function gam3eyaStanding(rows: Array<{ amount: string | number; direction: string | null }>): Gam3eyaStanding {
  let paid = 0;
  let received = 0;
  let installments = 0;
  for (const row of rows) {
    const amount = Math.abs(Number(row.amount)) || 0;
    if (row.direction === "outgoing") {
      paid += amount;
      installments += 1;
    } else if (row.direction === "incoming") {
      received += amount;
    }
  }
  return { paid, received, held: Math.round((paid - received) * 100) / 100, installments };
}

/** The user's gam3eya standing across all its recorded payments and payouts. */
export async function getGam3eyaStanding(userId: number, userType: string): Promise<Gam3eyaStanding> {
  const rows = await db
    .select({ amount: expenses.amount, parsedMetadata: expenses.parsedMetadata })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.userType, userType),
        eq(expenses.type, "transfer"),
        eq(expenses.category, LOAN_CATEGORY),
        eq(expenses.subCategory, GAM3EYA_SUBCATEGORY),
        eq(expenses.status, "confirmed"),
      ),
    )
    .limit(5000);
  return gam3eyaStanding(
    rows.map((row) => ({
      amount: row.amount,
      direction: ((row.parsedMetadata ?? {}) as { direction?: string }).direction ?? null,
    })),
  );
}

export interface LoanRow {
  amount: string | number;
  contactId: number | null;
  contactName: string | null;
  description: string | null;
  direction: string | null;
  date: Date;
}

export interface DebtBalance {
  /** The contact's id, or null when the loan names nobody the app knows. */
  contactId: number | null;
  name: string;
  /** Positive: the person owes the user. Negative: the user owes the person. */
  balance: number;
  lent: number;
  received: number;
  lastDate: Date;
  count: number;
}

/** Pure: per-person balances from loan rows, settled ones (balance 0) left out. */
export function debtBalances(rows: LoanRow[]): DebtBalance[] {
  const byPerson = new Map<string, DebtBalance>();
  for (const row of rows) {
    const direction = row.direction === "incoming" ? "incoming" : row.direction === "outgoing" ? "outgoing" : null;
    if (!direction) continue;
    const name = row.contactName?.trim() || "من غير اسم";
    const key = row.contactId ? `c:${row.contactId}` : `n:${name}`;
    const amount = Math.abs(Number(row.amount)) || 0;
    const entry = byPerson.get(key) ?? {
      contactId: row.contactId,
      name,
      balance: 0,
      lent: 0,
      received: 0,
      lastDate: row.date,
      count: 0,
    };
    if (direction === "outgoing") entry.lent += amount;
    else entry.received += amount;
    entry.balance = Math.round((entry.lent - entry.received) * 100) / 100;
    if (row.date > entry.lastDate) entry.lastDate = row.date;
    entry.count += 1;
    byPerson.set(key, entry);
  }
  return [...byPerson.values()]
    .filter((entry) => entry.balance !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

/** Every open balance of the user, from all their loans. */
export async function listDebtBalances(userId: number, userType: string): Promise<DebtBalance[]> {
  const rows = await db
    .select({
      amount: expenses.amount,
      contactId: expenses.contactId,
      contactName: userContacts.name,
      description: expenses.description,
      parsedMetadata: expenses.parsedMetadata,
      date: expenses.date,
    })
    .from(expenses)
    .leftJoin(
      userContacts,
      and(
        eq(userContacts.id, expenses.contactId),
        eq(userContacts.userId, userId),
        eq(userContacts.userType, userType),
      ),
    )
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.userType, userType),
        eq(expenses.type, "transfer"),
        eq(expenses.category, LOAN_CATEGORY),
        eq(expenses.subCategory, LOAN_SUBCATEGORY),
        eq(expenses.status, "confirmed"),
      ),
    )
    .limit(5000);
  return debtBalances(
    rows.map((row) => ({
      amount: row.amount,
      contactId: row.contactId,
      contactName: row.contactName,
      description: row.description,
      direction: ((row.parsedMetadata ?? {}) as { direction?: string }).direction ?? null,
      date: row.date,
    })),
  );
}
