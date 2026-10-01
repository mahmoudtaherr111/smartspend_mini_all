/**
 * What a remembered thing is about. A memory with a slot ("income.payday", "goal:phone", "refusal:food_budget") is the
 * current value of that slot: a newer statement replaces the older one instead of piling up beside it, and the call
 * can say how old it is. Refusals and follow-ups expire on their own, so a "no" from a month ago stops blocking an
 * offer and a promise to come back to something does not linger. Slots live in `ai_memory_items.metadata` (`slot`,
 * `day`, `validUntil`); memories without one keep working as before.
 *
 * The registry is closed on purpose: a model may only use these names, so two phrasings of the same fact meet in one
 * slot. Keys and topics are ASCII; what the user said stays in the memory's Arabic content.
 */

export type SlotKind = "profile" | "preference" | "goal" | "refusal" | "followup" | "life";

interface SlotRule {
  kind: SlotKind;
  /** How long a memory in this slot stays true without being said again; null for as long as it is not replaced. */
  validDays: number | null;
}

/** One value each: the person's situation and how they like to be spoken to. */
const FIXED: Record<string, SlotRule> = {
  "income.payday": { kind: "profile", validDays: null },
  "income.monthly": { kind: "profile", validDays: 365 },
  "income.side": { kind: "profile", validDays: 180 },
  "work.type": { kind: "profile", validDays: 365 },
  "housing.rent": { kind: "profile", validDays: 365 },
  "family.support": { kind: "profile", validDays: 365 },
  "money.priority": { kind: "profile", validDays: 180 },
  "preference.detail": { kind: "preference", validDays: null },
  "preference.numbers": { kind: "preference", validDays: null },
  "preference.address": { kind: "preference", validDays: null },
};

/** One value per topic: "goal:phone", "refusal:food_budget", "followup:installment_amount", "life:moving". */
const TOPICAL: Record<string, SlotRule> = {
  goal: { kind: "goal", validDays: 365 },
  refusal: { kind: "refusal", validDays: 30 },
  followup: { kind: "followup", validDays: 21 },
  life: { kind: "life", validDays: 120 },
};

export const SLOT_NAMES = [...Object.keys(FIXED), ...Object.keys(TOPICAL).map((kind) => `${kind}:<topic>`)];

/** A slot the registry knows, normalized, with its rule; null for anything else. */
export function readSlot(raw: unknown): { slot: string; kind: SlotKind; validDays: number | null } | null {
  if (typeof raw !== "string") return null;
  const slot = raw.trim().toLowerCase();
  const fixed = FIXED[slot];
  if (fixed) return { slot, ...fixed };
  const match = slot.match(/^([a-z]+):([a-z][a-z0-9_]{1,39})$/);
  const topical = match ? TOPICAL[match[1]] : undefined;
  return topical ? { slot, ...topical } : null;
}

/** When a memory in this slot, said on `observed`, stops being true on its own; null when it does not. */
export function slotExpiry(slot: string, observed: Date): Date | null {
  const rule = readSlot(slot);
  if (!rule || rule.validDays === null) return null;
  return new Date(observed.getTime() + rule.validDays * 86_400_000);
}

/** The slot, day and expiry a memory row carries in its metadata, read defensively. */
export function slotMeta(metadata: unknown): { slot: string | null; day: string | null; validUntil: Date | null } {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const slot = readSlot(meta.slot)?.slot ?? null;
  const day = typeof meta.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.day) ? meta.day : null;
  const until = typeof meta.validUntil === "string" ? new Date(meta.validUntil) : null;
  return { slot, day, validUntil: until && !Number.isNaN(until.getTime()) ? until : null };
}
