/**
 * Loads what the engine knows about one user for one reading.
 *
 * Every part is one bounded, indexed query (commitments are two round trips: the rows, then
 * their schedule details and payments together), every query is filtered on the user's
 * identity pair, and the parts run in parallel. A part that fails is left empty and logged
 * with its name and the user's ids: a reading with less context is still a reading, and the
 * guard and the policy only ever push an answer toward being shown when they know less.
 *
 * The rows become a context in `reading-context.ts`, which is pure; this file is the only
 * one of the engine's that touches the database.
 */
import { and, desc, eq, gte, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import {
  businessCategories as businessCategoriesTable,
  cashflowSettlements,
  expenses,
  scheduledCashflows,
  userBusinesses,
  userContacts,
  userCorrectionRules,
  userDictionaries,
  userWallets,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { toScheduleRow, withScheduleDetails, type CoachUser } from "../../services/coach/cashflows";
import { addDays, occurrences } from "../../services/coach/schedule";
import { businessDateKey, businessWeekday } from "../app-time";
import { createLogger } from "../log";
import {
  assembleContext,
  CONTEXT_LIMITS,
  type CommitmentInput,
  type ContactRow,
  type FilingRow,
  type ReadingContext,
  type VocabularyRow,
  type WalletRow,
} from "./reading-context";

export {
  assembleContext,
  CONTEXT_LIMITS,
  familiarPairs,
  personMatcher,
  toGuardContext,
  toPolicyFacts,
  toPromptContext,
} from "./reading-context";
export type {
  CommitmentInput,
  ContactRow,
  ContextCommitment,
  ContextParts,
  FilingRow,
  ReadingContext,
  ResolvedCommitment,
  VocabularyRow,
  WalletRow,
} from "./reading-context";

const log = createLogger("understanding.context");

export interface ReadingUser {
  id: number;
  type: "oauth" | "local";
}

/** Contacts read for recognising a name; the prompt shows only the first `CONTEXT_LIMITS.people` of them. */
const CONTACTS_FOR_MATCHING = 200;
/** Active commitments read before the earliest-due ones are chosen for the prompt. */
const COMMITMENT_ROWS = 100;
/** Payments read for those commitments' open dates. */
const SETTLEMENT_ROWS = 2000;
/** Each vocabulary source reads a few more than it can show, since some pairs do not translate. */
const VOCABULARY_ROWS = 40;
/** How far back an unpaid date still counts as "what is due next", and how far ahead one is looked for. */
const DUE_BACK_DAYS = 45;
const DUE_AHEAD_DAYS = 40;
/** The open dates are computed from this far back, so an undated debt from last year is still found. */
const SCHEDULE_BACK_DAYS = 400;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** A commitment's kind in one Arabic word, as the model sees it next to the title. Display text, not meaning. */
const KIND_LABELS: Record<string, string> = {
  rent: "إيجار", bill: "فاتورة", subscription: "اشتراك", school: "مدرسة", university: "جامعة", lessons: "دروس",
  installment: "قسط", loan: "قرض", property: "قسط", card: "كارت", debt: "دين", gam3eya: "جمعية", salary: "مرتب",
  freelance: "شغل", other: "التزام",
};

/** The identity pair every query here is filtered on (golden rule 1). */
const owns = (table: { userId: AnyMySqlColumn; userType: AnyMySqlColumn }, user: CoachUser): SQL =>
  and(eq(table.userId, user.userId), eq(table.userType, user.userType))!;

// ─── One loader per part ─────────────────────────────────────────────────────────

/** Most used first. Silenced people stay in, for recognising a name; `assembleContext` keeps them out of the prompt. */
export async function loadContactRows(user: CoachUser): Promise<ContactRow[]> {
  // contacts_user_idx (user_id, user_type)
  return db
    .select({ name: userContacts.name, relation: userContacts.relation, aliases: userContacts.aliases, isSilenced: userContacts.isSilenced })
    .from(userContacts)
    .where(owns(userContacts, user))
    .orderBy(desc(userContacts.transactionCount), desc(userContacts.id))
    .limit(CONTACTS_FOR_MATCHING);
}

/**
 * Active commitments with what each has due next: the earliest open date from a little in the
 * past (an overdue payment is what a person is most likely paying) to a little ahead, or the
 * open date of a debt that has none. The schedule engine computes the dates exactly as the
 * commitments screen does. Outside business mode, a business's own commitments are left out.
 */
export async function loadCommitmentInputs(user: CoachUser, today: string, businessMode: boolean): Promise<CommitmentInput[]> {
  // scheduled_cashflows_user_idx (user_id, user_type, status)
  const rows = await db
    .select()
    .from(scheduledCashflows)
    .where(and(
      owns(scheduledCashflows, user),
      eq(scheduledCashflows.status, "active"),
      ...(businessMode ? [] : [isNull(scheduledCashflows.businessId)]),
    ))
    .orderBy(desc(scheduledCashflows.id))
    .limit(COMMITMENT_ROWS);
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const from = addDays(today, -SCHEDULE_BACK_DAYS);
  const contactIds = [...new Set(rows.flatMap((row) => [row.contactId, row.beneficiaryContactId]).filter((id): id is number => !!id))];
  const [detailed, settled, contacts] = await Promise.all([
    withScheduleDetails(user, rows.map((row) => toScheduleRow(row))),
    // cashflow_settlements_user_idx (user_id, user_type, cashflow_id, due_day)
    db
      .select({ cashflowId: cashflowSettlements.cashflowId, dueDay: cashflowSettlements.dueDay, amount: cashflowSettlements.amount, expenseId: cashflowSettlements.expenseId })
      .from(cashflowSettlements)
      .where(and(owns(cashflowSettlements, user), inArray(cashflowSettlements.cashflowId, ids), gte(cashflowSettlements.dueDay, from)))
      .limit(SETTLEMENT_ROWS),
    contactIds.length
      ? db
        .select({ id: userContacts.id, name: userContacts.name })
        .from(userContacts)
        .where(and(owns(userContacts, user), inArray(userContacts.id, contactIds)))
        .limit(contactIds.length)
      : Promise.resolve([]),
  ]);

  const nameOf = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const open = occurrences(detailed, settled, from, addDays(today, DUE_AHEAD_DAYS), today)
    .filter((item) => item.status !== "paid" && item.status !== "skipped")
    .filter((item) => item.undated || (item.effectiveDay ?? item.dueDay) >= addDays(today, -DUE_BACK_DAYS));
  const nextOf = new Map<number, (typeof open)[number]>();
  for (const item of open) if (!nextOf.has(item.cashflowId)) nextOf.set(item.cashflowId, item);

  return rows.map((row): CommitmentInput => {
    const next = nextOf.get(row.id);
    const stated = row.amount === null ? null : Number(row.amount);
    const personId = row.contactId ?? row.beneficiaryContactId;
    return {
      cashflowId: row.id,
      title: row.title,
      kindLabel: KIND_LABELS[row.kind] ?? KIND_LABELS.other,
      amount: next ? next.remaining ?? next.amount : Number.isFinite(stated) && stated! > 0 ? stated : null,
      dueDay: next && !next.undated ? next.effectiveDay ?? next.dueDay : null,
      settleDay: next ? next.dueDay : null,
      person: personId ? nameOf.get(personId) ?? null : null,
    };
  });
}

/** In the order the wallet screen shows them. Only the name leaves the server, never the card digits. */
export async function loadWalletRows(user: CoachUser): Promise<WalletRow[]> {
  // wallets_user_idx (user_id, user_type)
  return db
    .select({ id: userWallets.id, name: userWallets.name })
    .from(userWallets)
    .where(owns(userWallets, user))
    .orderBy(userWallets.createdAt, userWallets.id)
    .limit(CONTEXT_LIMITS.wallets);
}

export async function loadCorrectionRows(user: CoachUser): Promise<VocabularyRow[]> {
  // ucr_user_active_idx (user_id, user_type, is_active); its implicit id suffix serves the order
  const rows = await db
    .select({ pattern: userCorrectionRules.pattern, category: userCorrectionRules.category, subCategory: userCorrectionRules.subCategory, createdAt: userCorrectionRules.createdAt })
    .from(userCorrectionRules)
    .where(and(owns(userCorrectionRules, user), eq(userCorrectionRules.isActive, true)))
    .orderBy(desc(userCorrectionRules.id))
    .limit(VOCABULARY_ROWS);
  return rows.map((row) => ({ phrase: row.pattern, category: row.category, subCategory: row.subCategory, at: timeOf(row.createdAt) }));
}

export async function loadDictionaryRows(user: CoachUser): Promise<VocabularyRow[]> {
  // user_dict_word_unique (user_id, user_type, word)
  const rows = await db
    .select({ word: userDictionaries.word, category: userDictionaries.category, subCategory: userDictionaries.subCategory, createdAt: userDictionaries.createdAt })
    .from(userDictionaries)
    .where(owns(userDictionaries, user))
    .orderBy(desc(userDictionaries.id))
    .limit(VOCABULARY_ROWS);
  return rows.map((row) => ({ phrase: row.word, category: row.category, subCategory: row.subCategory, at: timeOf(row.createdAt) }));
}

/**
 * The stored pairs of the user's latest ledger rows, newest first. Ordered by date so the
 * index is read in its own order and the query stops after the limit, whatever the user's
 * history holds. Outside business mode only personal rows count.
 */
export async function loadRecentFilings(user: CoachUser, businessMode: boolean): Promise<FilingRow[]> {
  // personal: expenses_covering_rollup_idx (user_id, user_type, business_id, date, …, category, sub_category);
  // business mode: expenses_user_date_idx (user_id, user_type, date)
  return db
    .select({ category: expenses.category, subCategory: expenses.subCategory })
    .from(expenses)
    .where(and(owns(expenses, user), ...(businessMode ? [] : [isNull(expenses.businessId)])))
    .orderBy(desc(expenses.date))
    .limit(CONTEXT_LIMITS.familiarRows);
}

/** The active business's own category names, the way the business screen names them. */
export async function loadBusinessCategoryNames(user: CoachUser): Promise<string[]> {
  // business_user_idx (user_id, user_type)
  const [business] = await db
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(and(owns(userBusinesses, user), eq(userBusinesses.isActive, true)))
    .orderBy(desc(userBusinesses.id))
    .limit(1);
  if (!business) return [];
  // business_cat_active_idx (business_id, is_active); the business was checked as the user's above
  const rows = await db
    .select({ name: businessCategoriesTable.name, nameAr: businessCategoriesTable.nameAr })
    .from(businessCategoriesTable)
    .where(and(eq(businessCategoriesTable.businessId, business.id), eq(businessCategoriesTable.isActive, true)))
    .limit(CONTEXT_LIMITS.businessCategories);
  return rows.map((row) => row.nameAr || row.name).filter(Boolean);
}

function timeOf(value: Date | string | null | undefined): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

// ─── The whole context ───────────────────────────────────────────────────────────

export async function loadReadingContext(
  user: ReadingUser,
  options: { businessMode?: boolean; now?: Date } = {},
): Promise<ReadingContext> {
  const now = options.now ?? new Date();
  const today = businessDateKey(now);
  const weekday = WEEKDAYS[businessWeekday(now)];
  const businessMode = Boolean(options.businessMode);
  const owner: CoachUser = { userId: user.id, userType: user.type };
  const degraded: string[] = [];

  const part = async <T>(name: string, load: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await load();
    } catch (err) {
      degraded.push(name);
      log.warn({ err, event: "understanding.context_part_failed", part: name, userId: user.id, userType: user.type }, "A reading context part failed to load");
      return [];
    }
  };

  const [contacts, commitments, wallets, corrections, dictionary, recentFilings, businessCategories] = await Promise.all([
    part("contacts", () => loadContactRows(owner)),
    part("commitments", () => loadCommitmentInputs(owner, today, businessMode)),
    part("wallets", () => loadWalletRows(owner)),
    part("corrections", () => loadCorrectionRows(owner)),
    part("dictionary", () => loadDictionaryRows(owner)),
    part("familiar", () => loadRecentFilings(owner, businessMode)),
    businessMode ? part("business", () => loadBusinessCategoryNames(owner)) : Promise.resolve([] as string[]),
  ]);

  return assembleContext({
    today,
    weekday,
    businessMode,
    contacts,
    commitments,
    wallets,
    vocabulary: [...corrections, ...dictionary],
    recentFilings,
    businessCategories,
    degraded: degraded.sort(),
  });
}
