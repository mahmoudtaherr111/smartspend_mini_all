/**
 * What the engine knows about the user for one reading, and the views of it that the prompt,
 * the guard and the policy each take.
 *
 * Everything here is pure: no database, no environment, no clock. `context.ts` loads the rows
 * and hands them to `assembleContext`; an evaluation script with no MySQL builds the same
 * context from its own fixtures. The engine imports only this file, so importing the engine
 * never opens a connection.
 *
 * The bounds are the scale contract (SPEC section 9): a reading's context never grows with a
 * user's history, whatever the user has stored.
 */
import { storedFiling, v2OfStored } from "./bridge";
import type { GuardContext } from "./guard";
import { foldForMatch } from "./numbers";
import type { PolicyFacts } from "./policy";
import type { PromptCommitment, PromptContext, PromptPerson, PromptVocabulary, PromptWallet } from "./prompt";

export const CONTEXT_LIMITS = {
  people: 30,
  commitments: 25,
  wallets: 10,
  vocabulary: 30,
  businessCategories: 40,
  /** How many of the latest ledger rows the "familiar" rule looks at. */
  familiarRows: 400,
  /** Saves of a pair, within those rows, that make it familiar. */
  familiarSaves: 2,
} as const;

/** A commitment as offered to the model, with what the reference stands for kept beside it. */
export interface ContextCommitment extends PromptCommitment {
  cashflowId: number;
}

export interface ResolvedCommitment {
  cashflowId: number;
  /** The open due date a payment of it would settle, when one is open. */
  dueDay: string | null;
}

export interface ReadingContext {
  /** Cairo business day `YYYY-MM-DD` and its weekday in English. */
  today: string;
  weekday: string;
  people: PromptPerson[];
  commitments: ContextCommitment[];
  /** `c1` → the commitment it names. Only references in here can reach a saved row. */
  commitmentRefs: ReadonlyMap<string, ResolvedCommitment>;
  wallets: PromptWallet[];
  /** `w1` → `user_wallets.id`. */
  walletRefs: ReadonlyMap<string, number>;
  vocabulary: PromptVocabulary[];
  /** Has the user saved this v2 category and subcategory (as its stored pair) at least twice lately? */
  isFamiliar: (category: string, sub: string) => boolean;
  /** Is this name, as said, one of the user's own people? */
  isKnownPerson: (name: string) => boolean;
  businessMode: boolean;
  /** The active business's own category names; empty outside business mode. */
  businessCategories: string[];
  /** Parts that failed to load and were left empty, for the trace. Never content. */
  degraded: string[];
}

// ─── The rows each part is built from ────────────────────────────────────────────

export interface ContactRow {
  name: string;
  relation?: string | null;
  aliases?: unknown;
  isSilenced?: boolean | null;
}

export interface CommitmentInput {
  cashflowId: number;
  title: string;
  kindLabel: string;
  /** What is due next, when known. */
  amount: number | null;
  /** The day it is due as the user sees it (after a move), or null when no date is open. */
  dueDay: string | null;
  /** The due date's own key, which a settlement is recorded under; defaults to `dueDay`. */
  settleDay?: string | null;
  person: string | null;
}

export interface WalletRow {
  id: number;
  name: string;
}

export interface VocabularyRow {
  phrase: string;
  /** As stored today: `contracts/categories.ts` names. */
  category: string;
  subCategory: string | null;
  /** Newest first is decided by this, across both sources. */
  at: number;
}

export interface FilingRow {
  category: string;
  subCategory: string | null;
}

export interface ContextParts {
  today: string;
  weekday: string;
  businessMode?: boolean;
  /** Most used first. */
  contacts?: ContactRow[];
  /** In any order: references are assigned here, earliest due first. */
  commitments?: CommitmentInput[];
  /** In the order the wallet screen shows them. */
  wallets?: WalletRow[];
  vocabulary?: VocabularyRow[];
  /** The user's latest ledger rows, newest first. */
  recentFilings?: FilingRow[];
  businessCategories?: string[];
  degraded?: string[];
}

// ─── People ──────────────────────────────────────────────────────────────────────

/** A stripped form shorter than this is too likely to be another word. */
const MIN_STRIPPED = 3;

/** Arabic attaches «و», «ل», «لل» and «ال» to the word they belong to: «لأحمد» is «أحمد». */
function wordForms(word: string): string[] {
  const forms = new Set([word]);
  const bases = word.startsWith("و") && word.length - 1 >= MIN_STRIPPED ? [word, word.slice(1)] : [word];
  for (const base of bases) {
    forms.add(base);
    for (const prefix of ["لل", "ال", "ل"]) {
      if (base.startsWith(prefix) && base.length - prefix.length >= MIN_STRIPPED) {
        forms.add(base.slice(prefix.length));
        break;
      }
    }
  }
  return [...forms];
}

/** A name as the keys it may be matched by: the whole name and its first word, each with or without a prefix. */
function nameKeys(raw: string): string[] {
  const folded = foldForMatch(raw);
  if (folded.length < 2) return [];
  const [first, ...rest] = folded.split(" ");
  const keys = new Set<string>([folded]);
  for (const form of wordForms(first)) {
    keys.add([form, ...rest].join(" "));
    if (form.length >= 2) keys.add(form);
  }
  return [...keys];
}

function aliasesOf(value: unknown): string[] {
  const list = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * A matcher over the user's people: their names, their aliases and the first word of each, as
 * folded text. A name said in the sentence matches when it, or its first word, is one of those,
 * with or without a leading «و», «ل», «لل» or «ال» on either side.
 */
export function personMatcher(contacts: readonly ContactRow[]): (name: string) => boolean {
  const known = new Set<string>();
  for (const contact of contacts) {
    for (const raw of [contact.name, ...aliasesOf(contact.aliases)]) nameKeys(String(raw ?? "")).forEach((key) => known.add(key));
  }
  return (name: string) => known.size > 0 && nameKeys(name).some((key) => known.has(key));
}

// ─── Ledger familiarity ──────────────────────────────────────────────────────────

const storedKey = (category: string, subCategory: string | null | undefined) => `${category}|${subCategory || "عام"}`;

/** The stored pairs saved at least `CONTEXT_LIMITS.familiarSaves` times in the given rows. */
export function familiarPairs(rows: readonly FilingRow[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const row of rows.slice(0, CONTEXT_LIMITS.familiarRows)) {
    const key = storedKey(row.category, row.subCategory);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= CONTEXT_LIMITS.familiarSaves).map(([key]) => key));
}

// ─── Assembly ────────────────────────────────────────────────────────────────────

/** Earliest due first, then the commitment's id: the same commitments always get the same references. */
function byDueThenId(a: CommitmentInput, b: CommitmentInput): number {
  if (a.dueDay && b.dueDay && a.dueDay !== b.dueDay) return a.dueDay < b.dueDay ? -1 : 1;
  if (a.dueDay && !b.dueDay) return -1;
  if (!a.dueDay && b.dueDay) return 1;
  return a.cashflowId - b.cashflowId;
}

function vocabularyOf(rows: readonly VocabularyRow[]): PromptVocabulary[] {
  const seen = new Set<string>();
  const out: PromptVocabulary[] = [];
  for (const row of [...rows].sort((a, b) => b.at - a.at)) {
    const phrase = String(row.phrase ?? "").trim();
    const folded = foldForMatch(phrase);
    if (!folded || seen.has(folded)) continue;
    const v2 = v2OfStored(row.category, row.subCategory);
    if (!v2) continue;
    seen.add(folded);
    out.push({ phrase, category: v2.category, sub: v2.sub });
    if (out.length >= CONTEXT_LIMITS.vocabulary) break;
  }
  return out;
}

export function assembleContext(parts: ContextParts): ReadingContext {
  const contacts = parts.contacts ?? [];
  const people = contacts
    .filter((contact) => !contact.isSilenced && String(contact.name ?? "").trim())
    .slice(0, CONTEXT_LIMITS.people)
    .map((contact): PromptPerson => (contact.relation?.trim()
      ? { name: contact.name.trim(), relation: contact.relation.trim() }
      : { name: contact.name.trim() }));

  const commitmentRefs = new Map<string, ResolvedCommitment>();
  const commitments = [...(parts.commitments ?? [])]
    .sort(byDueThenId)
    .slice(0, CONTEXT_LIMITS.commitments)
    .map((item, index): ContextCommitment => {
      const ref = `c${index + 1}`;
      commitmentRefs.set(ref, { cashflowId: item.cashflowId, dueDay: item.settleDay ?? item.dueDay });
      return {
        ref,
        cashflowId: item.cashflowId,
        title: item.title,
        kindLabel: item.kindLabel,
        amount: item.amount,
        dueDay: item.dueDay,
        person: item.person,
      };
    });

  const walletRefs = new Map<string, number>();
  const wallets = (parts.wallets ?? [])
    .filter((wallet) => String(wallet.name ?? "").trim())
    .slice(0, CONTEXT_LIMITS.wallets)
    .map((wallet, index): PromptWallet => {
      const ref = `w${index + 1}`;
      walletRefs.set(ref, wallet.id);
      return { ref, name: wallet.name.trim() };
    });

  const familiar = familiarPairs(parts.recentFilings ?? []);
  const businessMode = Boolean(parts.businessMode);
  const businessCategories = businessMode
    ? [...new Set((parts.businessCategories ?? []).map((name) => String(name ?? "").trim()).filter(Boolean))].slice(0, CONTEXT_LIMITS.businessCategories)
    : [];

  return {
    today: parts.today,
    weekday: parts.weekday,
    people,
    commitments,
    commitmentRefs,
    wallets,
    walletRefs,
    vocabulary: vocabularyOf(parts.vocabulary ?? []),
    isFamiliar: (category, sub) => {
      const stored = storedFiling(category, sub);
      return familiar.has(storedKey(stored.category, stored.subCategory));
    },
    isKnownPerson: personMatcher(contacts),
    businessMode,
    businessCategories,
    degraded: [...(parts.degraded ?? [])],
  };
}

// ─── Views ───────────────────────────────────────────────────────────────────────

export function toPromptContext(ctx: ReadingContext): PromptContext {
  return {
    today: ctx.today,
    weekday: ctx.weekday,
    people: ctx.people,
    // The model sees references only; the ids stay on the server.
    commitments: ctx.commitments.map((item) => ({
      ref: item.ref, title: item.title, kindLabel: item.kindLabel, amount: item.amount, dueDay: item.dueDay, person: item.person,
    })),
    wallets: ctx.wallets,
    vocabulary: ctx.vocabulary,
    businessCategories: ctx.businessMode ? ctx.businessCategories : [],
  };
}

export const DEFAULT_MAX_AMOUNT = 10_000_000;
export const DEFAULT_MAX_DAYS_BACK = 366;

/** A positive number from a setting, or the fallback when it is missing or not one. */
export function numberSetting(settings: Record<string, string> | undefined, name: string, fallback: number): number {
  const value = Number(settings?.[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function toGuardContext(ctx: ReadingContext, settings: Record<string, string> = {}): GuardContext {
  return {
    commitmentRefs: new Set(ctx.commitmentRefs.keys()),
    walletRefs: new Set(ctx.walletRefs.keys()),
    today: ctx.today,
    maxAmount: numberSetting(settings, "understanding_max_amount", DEFAULT_MAX_AMOUNT),
    maxDaysBack: Math.floor(numberSetting(settings, "understanding_max_days_back", DEFAULT_MAX_DAYS_BACK)),
  };
}

export function toPolicyFacts(ctx: ReadingContext): PolicyFacts {
  return { isFamiliar: ctx.isFamiliar, isKnownPerson: ctx.isKnownPerson };
}
