/**
 * Every amount the user said, and what happened to each one.
 *
 * The reconciliation this replaces had three defects, and all three lose money from the
 * user's ledger without telling anyone:
 *
 *   1. It compared amounts with `===` and `Array.includes` on floats. A 400 split three
 *      ways gives 133.33 + 133.33 + 133.34, and 0.1 + 0.2 is famously not 0.3, so
 *      arithmetic that was exactly right was reported as a mismatch.
 *   2. When several amounts went missing it asked about the FIRST and then `break`. Say
 *      three numbers, lose three, get asked about one.
 *   3. It had no concept of a split or a merge, so "٤٠٠ لمروان وعلاء" — correctly
 *      recorded as two items of 200 — looked exactly like a lost 400.
 *
 * Integer cents throughout. An amount of money is a count of the smallest unit, and
 * every comparison here is between integers, which removes the entire class of bug
 * rather than widening a tolerance until the symptoms stop.
 */

/** Cents, as an integer. Rounding once at the boundary is what keeps the rest exact. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export interface AmountAnchor {
  /** Integer cents. */
  cents: number;
  /** What the user actually said, for quoting back to them. */
  raw: number;
  /** Position in the utterance, so questions can be asked in the order spoken. */
  index: number;
}

export interface LedgerItem {
  amount: number;
}

export type AnchorOutcome =
  | { kind: "exact"; anchor: AmountAnchor; itemIndexes: number[] }
  | { kind: "split"; anchor: AmountAnchor; itemIndexes: number[] }
  | { kind: "unconsumed"; anchor: AmountAnchor };

export interface Reconciliation {
  outcomes: AnchorOutcome[];
  /** Anchors nothing accounts for — the amounts at risk of vanishing. */
  unconsumed: AmountAnchor[];
  /** Items whose amount the user never said. Hallucination, or a merge we misread. */
  unanchoredItemIndexes: number[];
  /** True when every anchor is accounted for and no item is unanchored. */
  balanced: boolean;
}

export function buildAnchors(amounts: number[]): AmountAnchor[] {
  return amounts.map((raw, index) => ({ cents: toCents(raw), raw, index }));
}

/**
 * Split amounts are the reason a naive comparison fails.
 *
 * Dividing 400 among three people cannot produce three equal integers, so the pipeline
 * emits 133.33, 133.33 and 133.34. Requiring an exact sum would reject that; allowing a
 * percentage tolerance would let genuinely wrong arithmetic through. One cent per item
 * is exactly the rounding error a split can introduce and nothing more.
 */
const SPLIT_ROUNDING_SLACK_CENTS = 1;

/**
 * Match every anchor to the item or items that consumed it.
 *
 * Exact matches are claimed first across all anchors before splits are considered:
 * otherwise a greedy split could swallow items that an exact match elsewhere needed,
 * and report a loss that only its own ordering created.
 */
export function reconcileAmounts(
  anchors: AmountAnchor[],
  items: LedgerItem[],
): Reconciliation {
  const itemCents = items.map((it) => toCents(Number(it.amount) || 0));
  const claimed = new Set<number>();
  const outcomes: AnchorOutcome[] = [];
  const resolved = new Set<number>();

  // Pass 1 — one item, one anchor.
  for (const anchor of anchors) {
    const idx = itemCents.findIndex((c, i) => !claimed.has(i) && c === anchor.cents);
    if (idx === -1) continue;
    claimed.add(idx);
    resolved.add(anchor.index);
    outcomes.push({ kind: "exact", anchor, itemIndexes: [idx] });
  }

  // Pass 2 — several items summing to one anchor, which is a correct split rather than
  // a loss. Only equal-ish shares qualify: three items of 133.33 are a split of 400,
  // while 300 + 100 landing on a 400 anchor is more likely two real transactions that
  // happen to add up, and calling that a split would hide a genuine extra amount.
  for (const anchor of anchors) {
    if (resolved.has(anchor.index)) continue;

    const free = itemCents
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => !claimed.has(i));
    if (free.length < 2) continue;

    for (let take = free.length; take >= 2; take--) {
      const candidate = free.slice(0, take);
      const sum = candidate.reduce((a, b) => a + b.c, 0);
      if (Math.abs(sum - anchor.cents) > SPLIT_ROUNDING_SLACK_CENTS * take) continue;

      const min = Math.min(...candidate.map((x) => x.c));
      const max = Math.max(...candidate.map((x) => x.c));
      if (max - min > SPLIT_ROUNDING_SLACK_CENTS) continue;

      candidate.forEach(({ i }) => claimed.add(i));
      resolved.add(anchor.index);
      outcomes.push({
        kind: "split",
        anchor,
        itemIndexes: candidate.map((x) => x.i),
      });
      break;
    }
  }

  const unconsumed = anchors.filter((a) => !resolved.has(a.index));
  for (const anchor of unconsumed) {
    outcomes.push({ kind: "unconsumed", anchor });
  }

  const unanchoredItemIndexes = itemCents
    .map((_, i) => i)
    .filter((i) => !claimed.has(i));

  return {
    outcomes,
    unconsumed,
    unanchoredItemIndexes,
    balanced: unconsumed.length === 0 && unanchoredItemIndexes.length === 0,
  };
}

/**
 * One question naming every amount we could not place, in the order the user said them.
 *
 * The previous code asked about the first and stopped, so a user who said three numbers
 * and lost all three was asked about one — and answering it did not recover the others.
 */
export function describeUnconsumed(unconsumed: AmountAnchor[]): string {
  if (unconsumed.length === 0) return "";

  const ordered = [...unconsumed].sort((a, b) => a.index - b.index);
  const amounts = ordered.map((a) => String(a.raw));

  if (amounts.length === 1) {
    return `ذكرت مبلغ ${amounts[0]} بس مش واضح راح فين. صرفته في إيه؟`;
  }
  const list = `${amounts.slice(0, -1).join(" و")} و${amounts[amounts.length - 1]}`;
  return `ذكرت مبالغ ${list} بس مش واضح راحوا فين. توضحهم؟`;
}
