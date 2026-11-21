/**
 * A labelled evaluation set for the understanding engine, read and checked before anything runs.
 *
 * A label that names a category the taxonomy does not have, or a kind the category does not
 * allow, would score every engine as wrong on that case and nobody would notice: the set is
 * validated against `contracts/taxonomy.ts` on load and refused with every problem listed.
 *
 * Format (see `dev-set.json`):
 *   { name, note, cases: [{ id, text, expect, events: [{ amount, kind, flow, category, sub,
 *     alt?, person?, date? }], context? }] }
 */
import { readFileSync } from "node:fs";
import { MOVEMENT_KINDS, type MovementKind } from "../../../contracts/ledger-movement";
import { categoryAllowsKind, taxonomyCategory, taxonomySub } from "../../../contracts/taxonomy";

export const EXPECTATIONS = ["clear", "doubt", "ask", "none"] as const;
export type Expectation = (typeof EXPECTATIONS)[number];

export type GoldFlow = "out" | "in";

export interface GoldEvent {
  amount: number;
  kind: MovementKind;
  flow: GoldFlow;
  category: string;
  sub: string;
  /** Other (category, sub) pairs that are also right for this event. */
  alt?: Array<[string, string]>;
  person?: string;
  /** `offset:-1` (days from today), `day:5` (day of the current month) or `YYYY-MM-DD`. */
  date?: string;
}

/**
 * What a case knows about its user. References are not written here: the engine's own rules
 * assign them (`c1` is the earliest due commitment, `w1` the first wallet), as in production.
 */
export interface CaseContext {
  people?: Array<{ name: string; relation?: string }>;
  commitments?: Array<{ title: string; kindLabel: string; amount?: number | null; dueDay?: string | null; person?: string | null }>;
  wallets?: Array<{ name: string }>;
}

export interface EvalCase {
  id: string;
  text: string;
  expect: Expectation;
  events: GoldEvent[];
  context?: CaseContext;
}

export interface EvalSet {
  name: string;
  note: string;
  cases: EvalCase[];
}

export class InvalidSetError extends Error {
  constructor(readonly problems: string[]) {
    super(`Evaluation set refused, ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    this.name = "InvalidSetError";
  }
}

/** Flows a kind forces, as the guard enforces them; a label that breaks one is a broken label. */
const FORCED_FLOW: Partial<Record<MovementKind, GoldFlow>> = { spending: "out", income: "in", refund: "in", card_payment: "out" };

const CASE_KEYS = new Set(["id", "text", "expect", "events", "context"]);
const EVENT_KEYS = new Set(["amount", "kind", "flow", "category", "sub", "alt", "person", "date"]);
const CONTEXT_KEYS = new Set(["people", "commitments", "wallets"]);
const DATE_FORM = /^(?:offset:-?\d{1,3}|day:\d{1,2}|\d{4}-\d{2}-\d{2})$/;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function checkDate(value: unknown, at: string, problems: string[]): void {
  if (typeof value !== "string" || !DATE_FORM.test(value)) {
    problems.push(`${at}: date must be "offset:-N", "day:N" or YYYY-MM-DD`);
    return;
  }
  if (value.startsWith("day:")) {
    const day = Number(value.slice(4));
    if (day < 1 || day > 31) problems.push(`${at}: day must be 1..31`);
  } else if (!value.includes(":") && !isRealIsoDate(value)) {
    problems.push(`${at}: ${value} is not a real date`);
  } else if (value.startsWith("offset:") && Number(value.slice(7)) > 0) {
    problems.push(`${at}: a date offset cannot be in the future`);
  }
}

function checkEvent(raw: unknown, at: string, problems: string[], warnings: string[]): void {
  if (!isObject(raw)) {
    problems.push(`${at}: not an object`);
    return;
  }
  for (const key of Object.keys(raw)) if (!EVENT_KEYS.has(key)) problems.push(`${at}: unknown field "${key}"`);
  if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0) problems.push(`${at}: amount must be a positive number`);
  const kind = raw.kind as MovementKind;
  const kindOk = (MOVEMENT_KINDS as readonly string[]).includes(String(raw.kind));
  if (!kindOk) problems.push(`${at}: unknown kind "${String(raw.kind)}"`);
  if (raw.flow !== "out" && raw.flow !== "in") problems.push(`${at}: flow must be "out" or "in"`);
  else if (kindOk && FORCED_FLOW[kind] && FORCED_FLOW[kind] !== raw.flow) problems.push(`${at}: kind ${kind} cannot have flow ${raw.flow}`);

  const pairs: Array<[unknown, unknown, string, boolean]> = [[raw.category, raw.sub, at, false]];
  if (raw.alt !== undefined) {
    if (!Array.isArray(raw.alt)) problems.push(`${at}: alt must be a list of [category, sub] pairs`);
    else
      raw.alt.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) problems.push(`${at} alt ${index + 1}: must be [category, sub]`);
        else pairs.push([pair[0], pair[1], `${at} alt ${index + 1}`, true]);
      });
  }
  for (const [category, sub, where, isAlt] of pairs) {
    if (!taxonomyCategory(String(category))) {
      problems.push(`${where}: unknown category "${String(category)}"`);
      continue;
    }
    if (!taxonomySub(String(category), String(sub))) problems.push(`${where}: "${String(sub)}" is not a sub of ${String(category)}`);
    if (kindOk && !categoryAllowsKind(String(category), kind)) {
      // An alternative from another group carries its own bound kind (scored by `score.ts`); the gold pair may not.
      const message = `${where}: category ${String(category)} does not allow kind ${kind}`;
      if (isAlt) warnings.push(`${message} (accepted as an alternative reading with that category's own kind)`);
      else problems.push(message);
    }
  }
  if (raw.person !== undefined && !isText(raw.person)) problems.push(`${at}: person must be non-empty text when present`);
  if (raw.date !== undefined) checkDate(raw.date, at, problems);
}

function checkContext(raw: unknown, at: string, problems: string[]): void {
  if (!isObject(raw)) {
    problems.push(`${at}: context must be an object`);
    return;
  }
  for (const key of Object.keys(raw)) if (!CONTEXT_KEYS.has(key)) problems.push(`${at}: unknown context field "${key}"`);
  const list = (key: string, check: (row: Record<string, unknown>, where: string) => void) => {
    const value = raw[key];
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      problems.push(`${at}: context.${key} must be a list`);
      return;
    }
    value.forEach((row, index) => {
      const where = `${at} context.${key}[${index}]`;
      if (!isObject(row)) problems.push(`${where}: not an object`);
      else check(row, where);
    });
  };
  list("people", (row, where) => {
    if (!isText(row.name)) problems.push(`${where}: name is required`);
  });
  list("commitments", (row, where) => {
    if (!isText(row.title)) problems.push(`${where}: title is required`);
    if (!isText(row.kindLabel)) problems.push(`${where}: kindLabel is required`);
    if (row.dueDay !== undefined && row.dueDay !== null && (typeof row.dueDay !== "string" || !isRealIsoDate(row.dueDay))) problems.push(`${where}: dueDay must be YYYY-MM-DD`);
  });
  list("wallets", (row, where) => {
    if (!isText(row.name)) problems.push(`${where}: name is required`);
  });
}

export interface SetCheck {
  /** Anything here refuses the set. */
  problems: string[];
  /** Labels that load but that the author should look at. */
  warnings: string[];
}

/** Every problem of a parsed set; `problems` is empty when it can be scored. */
export function validateSet(raw: unknown): SetCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!isObject(raw)) return { problems: ["the set is not a JSON object"], warnings };
  if (!isText(raw.name)) problems.push("name must be non-empty text");
  else if (!/^[A-Za-z0-9_.-]{1,40}$/.test(raw.name)) problems.push("name must be 1-40 of A-Z a-z 0-9 _ . - (it names the output folder)");
  if (raw.note !== undefined && typeof raw.note !== "string") problems.push("note must be text");
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    problems.push("cases must be a non-empty list");
    return { problems, warnings };
  }
  const ids = new Set<string>();
  raw.cases.forEach((item, index) => {
    const at = isObject(item) && isText(item.id) ? item.id : `case #${index + 1}`;
    if (!isObject(item)) {
      problems.push(`${at}: not an object`);
      return;
    }
    for (const key of Object.keys(item)) if (!CASE_KEYS.has(key)) problems.push(`${at}: unknown field "${key}"`);
    if (!isText(item.id)) problems.push(`${at}: id must be non-empty text`);
    else if (!/^[A-Za-z0-9_-]{1,24}$/.test(item.id)) problems.push(`${at}: id must be 1-24 of A-Z a-z 0-9 _ -`);
    else if (ids.has(item.id)) problems.push(`${at}: duplicate id`);
    else ids.add(item.id);
    if (!isText(item.text)) problems.push(`${at}: text must be non-empty`);
    if (!(EXPECTATIONS as readonly string[]).includes(String(item.expect))) problems.push(`${at}: expect must be one of ${EXPECTATIONS.join(", ")}`);
    if (!Array.isArray(item.events)) {
      problems.push(`${at}: events must be a list`);
    } else {
      if (item.expect === "clear" && item.events.length === 0) problems.push(`${at}: a clear case needs at least one event`);
      if ((item.expect === "ask" || item.expect === "none") && item.events.length > 0) problems.push(`${at}: an ${item.expect} case has no events`);
      item.events.forEach((event, eventIndex) => checkEvent(event, `${at} event ${eventIndex + 1}`, problems, warnings));
    }
    if (item.context !== undefined) checkContext(item.context, at, problems);
  });
  return { problems, warnings };
}

/** A parsed set, or `InvalidSetError` listing everything wrong with it. */
export function parseSet(raw: unknown): EvalSet & { warnings: string[] } {
  const { problems, warnings } = validateSet(raw);
  if (problems.length > 0) throw new InvalidSetError(problems);
  const body = raw as Record<string, unknown>;
  return { name: String(body.name), note: String(body.note ?? ""), cases: body.cases as EvalCase[], warnings };
}

export function loadSet(path: string): EvalSet & { warnings: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new InvalidSetError([`cannot read ${path} as JSON: ${(error as Error).message}`]);
  }
  return parseSet(raw);
}

/** Days added to a `YYYY-MM-DD` calendar day. Pure calendar arithmetic, no clock and no zone. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

/** A gold date as a calendar day, given the Cairo business day the case ran on; "" for none. */
export function resolveGoldDate(date: string | undefined, today: string): string {
  if (!date) return "";
  if (date.startsWith("offset:")) return shiftDay(today, Number(date.slice(7)));
  if (date.startsWith("day:")) return `${today.slice(0, 8)}${String(Number(date.slice(4))).padStart(2, "0")}`;
  return date;
}
