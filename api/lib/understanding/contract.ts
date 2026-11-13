/**
 * The reading contract: what a model is asked to return for one sentence, and the only door
 * its reply comes through.
 *
 * The model understands the sentence; nothing here trusts it. `parseReply` accepts any
 * JSON-ish value and returns a `Reading` whose every field has a known type and a known
 * vocabulary, or null when there is nothing usable (the caller treats that as a provider
 * failure and asks the next route). Whether the reading is TRUE is the guard's job
 * (`guard.ts`); this file only makes it well-formed.
 *
 * Output tokens cost several times what input tokens do, so the reply is as short as it can be
 * read: one- and two-letter keys, a field left out when it has nothing to say, and `q` left out
 * (or "*") when the event is the whole sentence. No field is nullable, which Gemini's response
 * schema, OpenAI-style JSON Schema and Anthropic's output format do not agree on. The parser
 * also reads the long names, so a model that spells a key out is still understood.
 *
 * Why: docs/decisions/0052-understanding-engine.md.
 */
import { MOVEMENT_KINDS, type MovementKind } from "../../../contracts/ledger-movement";
import { TAXONOMY_CATEGORY_IDS } from "../../../contracts/taxonomy";
import { arabicIndicToAscii } from "../arabic-number-parser";
import type { StructuredSchema } from "../llm-router";

/** Bump when the reply's shape or the meaning of a field changes; stored with every reading. */
export const READING_CONTRACT_VERSION = "2";

export const FLOWS = ["out", "in"] as const;
export type Flow = (typeof FLOWS)[number];

export const PERSON_ROLES = ["none", "to", "from", "for", "with"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/** What the model itself is unsure of. "none" means it is sure. */
export const DOUBTS = ["none", "amount", "flow", "kind", "category", "purpose", "person", "commitment", "date", "split"] as const;
export type Doubt = (typeof DOUBTS)[number];

export const IGNORED_REASONS = ["negated", "planned", "question", "chatter", "instruction", "already_counted"] as const;
export type IgnoredReason = (typeof IGNORED_REASONS)[number];

export const NUMBER_ROLES = ["quantity", "date", "time", "label", "name", "phone", "percent", "count", "total", "unit_price"] as const;
export type NumberRole = (typeof NUMBER_ROLES)[number];

export const ASK_ABOUT = ["none", "amount", "purpose", "person", "commitment", "flow"] as const;
export type AskAbout = (typeof ASK_ABOUT)[number];

export interface ReadEvent {
  /** The user's own words for this event. */
  quote: string;
  /** Positive, in pounds. 0 when the model returned none (the guard turns that into a question). */
  amount: number;
  kind: MovementKind;
  flow: Flow;
  /** Taxonomy ids. Not yet checked against the taxonomy: the guard does that. */
  category: string;
  sub: string;
  /** A few of the user's words naming the thing: the row's description. */
  what: string;
  /** The person as said, or "". */
  person: string;
  personRole: PersonRole;
  /** What the person is to the user when the sentence says so («ابني», «صاحبي», «جاري»), as one word; else "". */
  personRelation: string;
  /** A reference from the context (`c1`), or "". */
  commitment: string;
  /** Instalments of the commitment this pays; 0 when the sentence does not say. */
  installments: number;
  /** A reference from the context (`w1`), or "". */
  wallet: string;
  /** `YYYY-MM-DD` when the sentence names a day other than today, else "". */
  date: string;
  doubt: Doubt;
}

export interface Reading {
  events: ReadEvent[];
  ignored: Array<{ quote: string; why: IgnoredReason }>;
  numbers: Array<{ text: string; role: NumberRole }>;
  /** One question in Egyptian Arabic when a required fact is missing, else "". */
  ask: string;
  askAbout: AskAbout;
}

export interface ParsedReply {
  reading: Reading;
  /** Repairs and drops, for the trace. Never shown to the user. */
  problems: string[];
}

/** A reply with more events than this is not a sentence a person dictated; the rest is dropped and reported. */
export const MAX_EVENTS = 20;

const STRING = (extra: Record<string, unknown> = {}) => ({ type: "string", ...extra });
const ENUM = (values: readonly string[]) => ({ type: "string", format: "enum", enum: [...values] });

/** In the shape `executeLlmChain` passes to every protocol (`toGeminiSchema` / `toJsonSchema`). */
export const READING_SCHEMA: StructuredSchema = {
  type: "object",
  properties: {
    e: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q: STRING(),
          a: { type: "number" },
          k: ENUM(MOVEMENT_KINDS),
          f: ENUM(FLOWS),
          c: ENUM(TAXONOMY_CATEGORY_IDS),
          s: STRING(),
          w: STRING(),
          p: STRING(),
          pr: ENUM(PERSON_ROLES),
          pl: STRING(),
          cm: STRING(),
          i: { type: "integer" },
          wl: STRING(),
          d: STRING(),
          db: ENUM(DOUBTS),
        },
        required: ["a", "k", "f", "c", "s"],
      },
    },
    x: {
      type: "array",
      items: { type: "object", properties: { q: STRING(), y: ENUM(IGNORED_REASONS) }, required: ["q", "y"] },
    },
    n: {
      type: "array",
      items: { type: "object", properties: { t: STRING(), r: ENUM(NUMBER_ROLES) }, required: ["t", "r"] },
    },
    ask: STRING(),
    about: ENUM(ASK_ABOUT),
  },
  required: ["e"],
};

// ─── Reading a reply ────────────────────────────────────────────────────────────

const TEXT_LIMIT = 300;

function text(value: unknown, limit = TEXT_LIMIT): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

/** "none", "null", "-" and friends mean nothing was given. */
function reference(value: unknown): string {
  const raw = text(value, 12).toLowerCase();
  return /^[cw]\d{1,3}$/.test(raw) ? raw : "";
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): { value: T; repaired: boolean } {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if ((allowed as readonly string[]).includes(raw)) return { value: raw as T, repaired: false };
  return { value: fallback, repaired: raw !== "" };
}

/** A number however the model wrote it: 320, "320", "٣٢٠", "1,500", "320 جنيه". */
export function toAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== "string") return 0;
  const match = arabicIndicToAscii(value).replace(/[,،٬](?=\d{3}(?:\D|$))/g, "").match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isoDate(value: unknown): { value: string; repaired: boolean } {
  const raw = text(value, 20);
  if (!raw || /^(none|null|today)$/i.test(raw)) return { value: "", repaired: false };
  const match = arabicIndicToAscii(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { value: "", repaired: true };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? { value: `${match[1]}-${match[2]}-${match[3]}`, repaired: false } : { value: "", repaired: true };
}

/** The event's quote, or the whole sentence when the reply left it out or wrote "*". */
function quoteOf(value: unknown, sentence: string): string {
  const quote = text(value);
  return quote && quote !== "*" ? quote : text(sentence);
}

function field(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) if (row[name] !== undefined && row[name] !== null) return row[name];
  return undefined;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

/** The first JSON object in a model's text: fenced, prefixed with prose, or bare. */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/<(thought|thinking|think)>[\s\S]*?<\/\1>/gi, "");
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : cleaned).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * A model's reply as a `Reading`, or null when it holds nothing usable.
 *
 * Repairs what has one obvious meaning (a number written as text, an enum in another case,
 * a reference written as "none") and reports it; never invents a value: an event whose kind
 * is not a kind is dropped, not guessed.
 */
/** `sentence` stands in for an event's quote when the reply leaves it out or writes "*": the event is the whole sentence. */
export function parseReply(raw: unknown, sentence = ""): ParsedReply | null {
  const value = typeof raw === "string" ? extractJson(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const eventRows = field(body, "e", "events");
  const ignoredRows = field(body, "x", "ignored");
  if (!Array.isArray(eventRows) && typeof body.ask !== "string" && !Array.isArray(ignoredRows)) return null;

  const problems: string[] = [];
  const events: ReadEvent[] = [];
  const rawEvents = rows(eventRows);
  if (rawEvents.length > MAX_EVENTS) problems.push(`dropped ${rawEvents.length - MAX_EVENTS} events over the limit`);

  rawEvents.slice(0, MAX_EVENTS).forEach((row, index) => {
    const at = `event ${index + 1}`;
    const kind = oneOf<MovementKind>(field(row, "k", "kind"), MOVEMENT_KINDS, "spending");
    if (kind.repaired) {
      problems.push(`${at}: dropped, unknown kind`);
      return;
    }
    const flow = oneOf<Flow>(field(row, "f", "flow"), FLOWS, "out");
    if (flow.repaired || field(row, "f", "flow") === undefined) {
      problems.push(`${at}: dropped, unknown flow`);
      return;
    }
    const personRole = oneOf<PersonRole>(field(row, "pr", "person_role", "personRole"), PERSON_ROLES, "none");
    const doubt = oneOf<Doubt>(field(row, "db", "doubt"), DOUBTS, "none");
    // An unreadable doubt is still a doubt: the model tried to say something.
    if (doubt.repaired) problems.push(`${at}: unknown doubt read as category`);
    const date = isoDate(field(row, "d", "date"));
    if (date.repaired) problems.push(`${at}: unreadable date`);
    const installments = Number(field(row, "i", "installments"));
    const person = text(field(row, "p", "person"), 60);

    events.push({
      quote: quoteOf(field(row, "q", "quote"), sentence),
      amount: toAmount(field(row, "a", "amount")),
      kind: kind.value,
      flow: flow.value,
      category: text(field(row, "c", "category"), 40).toLowerCase(),
      sub: text(field(row, "s", "sub", "subcategory"), 40).toLowerCase(),
      what: text(field(row, "w", "what", "description"), 80),
      person: /^(none|null|-)$/i.test(person) ? "" : person,
      personRole: person ? personRole.value : "none",
      personRelation: person ? text(field(row, "pl", "person_relation", "personRelation"), 30).replace(/^(none|null|-)$/i, "") : "",
      commitment: reference(field(row, "cm", "commitment")),
      installments: Number.isInteger(installments) && installments > 0 && installments <= 60 ? installments : 0,
      wallet: reference(field(row, "wl", "wallet")),
      date: date.value,
      doubt: doubt.repaired ? "category" : date.repaired && doubt.value === "none" ? "date" : doubt.value,
    });
  });

  const ignored = rows(ignoredRows)
    .map((row) => ({ quote: text(field(row, "q", "quote")), why: oneOf<IgnoredReason>(field(row, "y", "why", "reason"), IGNORED_REASONS, "chatter").value }))
    .filter((row) => row.quote)
    .slice(0, MAX_EVENTS);

  const numbers = rows(field(body, "n", "numbers"))
    .map((row) => ({ text: text(field(row, "t", "text", "value"), 40), role: oneOf<NumberRole>(field(row, "r", "role"), NUMBER_ROLES, "label").value }))
    .filter((row) => row.text)
    .slice(0, 40);

  const ask = text(body.ask, 200);
  const askAbout = oneOf<AskAbout>(field(body, "about", "ask_about", "askAbout"), ASK_ABOUT, "none");

  return {
    reading: {
      events,
      ignored,
      numbers,
      ask: /^(none|null|-)$/i.test(ask) ? "" : ask,
      askAbout: ask ? (askAbout.value === "none" ? "purpose" : askAbout.value) : "none",
    },
    problems,
  };
}
