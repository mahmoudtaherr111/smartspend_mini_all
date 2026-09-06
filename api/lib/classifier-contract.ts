/**
 * What we ask the model for, and what we accept back.
 *
 * The old contract asked the model for six things and was wrong about five of them.
 * Measured on the live benchmark, against the same 87 cases:
 *
 *   | field                 | who is better     | measured                        |
 *   | :-------------------- | :---------------- | :------------------------------ |
 *   | decomposed_sentences  | US, overwhelming  | local 100% vs model 0% exact    |
 *   | amount                | US                | 96.8% deterministic             |
 *   | type (direction)      | US                | 96.3% deterministic             |
 *   | confidence            | US                | model self-rating off by +34.1  |
 *   | reasoning             | nobody            | no consumer anywhere in the repo|
 *   | main_category         | THE MODEL         | the one genuinely hard call     |
 *
 * So the model is now asked for one thing: the category of a clause we could not
 * categorise ourselves. Everything else is removed from the schema, which is stronger
 * than instructing against it — a field that does not exist cannot be filled in wrongly.
 *
 * That kills four failure modes structurally rather than by asking nicely:
 *   - it cannot re-segment: there is no sentence field and the reply is indexed
 *   - it cannot invent an amount: there is no amount field
 *   - it cannot invent a category: `category` is an enum of the 26 real ids
 *   - it cannot inflate confidence: there is no confidence field
 */
import { SchemaType } from "@google/generative-ai";
import { CATEGORIES, exactCategoryId, getSubcategoriesFor } from "./category-registry";
import { z } from "zod";

/** The 26 real category ids. English, because they are identifiers, not display text. */
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export interface CategoryDecision {
  /** 1-based index of the clause this answers, matching the numbered prompt. */
  i: number;
  /** One of CATEGORY_IDS. */
  category: string;
  /** Taxonomy/business subcategory. Person identity is resolved locally by the merger. */
  sub?: string;
  /** Legacy reply compatibility only; never promoted to a trusted identity. */
  person?: string | null;
  /** An abstention cannot change financial facts or clear a local review blocker. */
  issue?: "ambiguous" | "conflict";
}

export interface ClassifierReply {
  items: CategoryDecision[];
}

/**
 * The response schema, in the shape both protocols understand.
 *
 * `enum` on `category` is the load-bearing part: it is what makes an invented category
 * impossible on Gemini rather than merely discouraged. Providers that ignore
 * `response_format` are caught by `validateClassifierReply` instead — which is why that
 * function is the real guarantee and this is the optimisation.
 */
export const CATEGORY_CLASSIFIER_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          i: { type: SchemaType.INTEGER },
          category: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...CATEGORY_IDS],
          },
          sub: { type: SchemaType.STRING },
          issue: { type: SchemaType.STRING, enum: ["ambiguous", "conflict"] },
        },
        required: ["i", "category"],
      },
    },
  },
  required: ["items"],
} as const;

export interface ValidationResult {
  items: CategoryDecision[];
  /** Every reason a returned item was dropped or repaired, for the trace. */
  problems: string[];
}

const categoryReplyRow = z.object({
  i: z.number().int().positive(),
  category: z.string().trim().min(1).max(100),
  sub: z.string().trim().max(120).optional(),
  person: z.string().trim().max(120).nullable().optional(),
  issue: z.enum(["ambiguous", "conflict"]).optional(),
});

/**
 * The real guard.
 *
 * NVIDIA strips `response_format` on a 400 and answers anyway; Groq honours
 * `json_object` but not `json_schema`; only Gemini enforces the enum. So structure is
 * something we verify, never something we are entitled to assume — and the router
 * reports `degradedSchema` precisely so this can be strict about it.
 *
 * Repairs what is repairable (a model naming a category in Arabic instead of by id) and
 * drops what is not (an index for a clause that does not exist). Dropping is safe here
 * in a way it never was before: a dropped item means one clause keeps its local answer,
 * not that a transaction disappears, because the amounts were never the model's to give.
 */
export function validateClassifierReply(
  raw: unknown,
  clauseCount: number,
): ValidationResult {
  const problems: string[] = [];
  const out: CategoryDecision[] = [];

  const rawItems = (raw as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) {
    return { items: [], problems: ["reply had no items array"] };
  }

  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const entry of rawItems) {
    const parsed = categoryReplyRow.safeParse(entry);
    if (!parsed.success) {
      problems.push("dropped malformed classifier item");
      continue;
    }
    const row = parsed.data;
    const i = row.i;

    if (!Number.isInteger(i) || i < 1 || i > clauseCount) {
      problems.push(`dropped item with out-of-range index ${String(row.i)}`);
      continue;
    }
    if (seen.has(i)) {
      duplicates.add(i);
      problems.push(`dropped conflicting duplicate answers for clause ${i}`);
      continue;
    }
    seen.add(i);

    const claimed = String(row.category ?? "").trim();
    if (!claimed) {
      problems.push(`dropped item ${i}: no category`);
      continue;
    }

    // A model that ignored the enum often still names a real category, just in Arabic
    // or with different spacing. Resolving THAT is a repair. Resolving anything else is
    // a guess, and `canonicalCategoryId` — which this used to call — guesses by
    // substring: it answered "transport" for the invented category "business", because
    // "bus" is a transport alias, and the wrong category was then recorded as the
    // model's answer. Exact aliases only; everything else is dropped and the clause
    // keeps its local answer.
    const id = CATEGORY_IDS.includes(claimed) ? claimed : exactCategoryId(claimed);
    if (!id || !CATEGORY_IDS.includes(id)) {
      problems.push(`dropped item ${i}: "${claimed}" is not a category`);
      continue;
    }
    if (id !== claimed) {
      problems.push(`repaired item ${i}: "${claimed}" -> "${id}"`);
    }

    out.push({
      i,
      category: id,
      ...(row.issue ? { issue: row.issue } : {}),
      sub: typeof row.sub === "string" && row.sub.trim() ? row.sub.trim() : undefined,
      person:
        typeof row.person === "string" && row.person.trim() ? row.person.trim() : null,
    });
  }

  const items = out.filter((item) => !duplicates.has(item.i)).sort((a, b) => a.i - b.i);
  for (let i = 1; i <= clauseCount; i++) {
    if (!items.some((item) => item.i === i)) problems.push(`missing answer for clause ${i}`);
  }
  return { items, problems };
}

/**
 * The full taxonomy, every category and subcategory.
 *
 * Measured at 674 tokens. The machinery it replaces (`category-scorer.ts`, four scoring
 * signals, a co-occurrence map and a hard cap of 10) existed to trim that to about 300 —
 * and in doing so hid 15 of the 26 categories from the model, so an answer outside the
 * surviving 11 was unreachable. It also produced a prompt that contradicted itself: the
 * worked examples used أكل وشرب, استثمار and سكن, none of which survived the filter.
 *
 * 374 tokens is not worth a category the model is structurally unable to choose.
 */
export function buildFullTaxonomy(): string {
  return CATEGORIES.map((c) => {
    const subs = ["العائلة", "أصدقاء", "موظفين"].includes(c.name_ar)
      ? "العلاقة والهوية يتحقق منهما التطبيق"
      : c.subcategories.map((s) => s.name_ar).join(",");
    return `${c.id}=${c.name_ar}:${subs}`;
  }).join("\n");
}

/** Resolves the model's free-text `sub` against the category it chose. */
export function resolveSubcategory(categoryId: string, sub: string | undefined): string {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return "عام";
  if (["العائلة", "أصدقاء", "موظفين"].includes(category.name_ar)) {
    // A person's name belongs here verbatim; it is not a taxonomy value to match.
    return sub || "عام";
  }
  if (!sub) return "عام";

  const options = getSubcategoriesFor(category.name_ar);
  const exact = options.find((s) => s.name_ar === sub);
  if (exact) return exact.name_ar;

  return "عام";
}
