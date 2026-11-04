/** Shared financial meaning. Ledger direction, economic kind and inclusion in totals are separate decisions. */
export const MOVEMENT_KINDS = ["spending", "income", "personal_transfer", "loan", "gam3eya", "own_transfer", "cash_transfer", "card_payment", "investment", "refund"] as const;
export type MovementKind = typeof MOVEMENT_KINDS[number];
export interface FinancialMovement {
  version: 1;
  kind: MovementKind;
  movement: "in" | "out";
  excluded: boolean;
  counterWalletId?: number;
}
export interface MovementRow {
  type?: string | null;
  amount?: number | string | { toString(): string } | null;
  category?: string | null;
  subCategory?: string | null;
  parsedMetadata?: unknown;
  direction?: string | null;
}
const EXCLUDED = new Set<MovementKind>(["own_transfer", "cash_transfer", "card_payment", "investment"]);
export function financialMovement(row: MovementRow): FinancialMovement | null {
  const metadata = row.parsedMetadata && typeof row.parsedMetadata === "object" ? row.parsedMetadata as Record<string, unknown> : {};
  const value = metadata.financial;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !MOVEMENT_KINDS.includes(item.kind as MovementKind) || (item.movement !== "in" && item.movement !== "out")) return null;
  const kind = item.kind as MovementKind;
  return { version: 1, kind, movement: item.movement, excluded: EXCLUDED.has(kind),
    ...(typeof item.counterWalletId === "number" && Number.isSafeInteger(item.counterWalletId) && item.counterWalletId > 0 ? { counterWalletId: item.counterWalletId } : {}) };
}

export function movementOf(row: MovementRow): "in" | "out" | null {
  if (row.type === "income") return "in";
  if (row.type === "expense") return Number(row.amount ?? 0) < 0 ? "in" : "out";
  const metadata = row.parsedMetadata && typeof row.parsedMetadata === "object" ? row.parsedMetadata as Record<string, unknown> : {};
  const direction = row.direction ?? metadata.direction;
  if (direction === "incoming" || direction === "in") return "in";
  if (direction === "outgoing" || direction === "out") return "out";
  return financialMovement(row)?.movement ?? null;
}

export function countsInTotals(row: MovementRow): boolean {
  if (row.type !== "income" && row.type !== "expense") return false;
  return !financialMovement(row)?.excluded;
}

/** The totals bucket is shared by rollups and direct readers; it is not the displayed row type. */
export function financialBucket(row: MovementRow): "income" | "expense" | "transfer" | "investment" | "unknown" {
  const financial = financialMovement(row);
  if (financial?.excluded) return financial.kind === "investment" ? "investment" : "transfer";
  return row.type === "income" || row.type === "expense" || row.type === "transfer" || row.type === "investment" ? row.type : "unknown";
}

function inferredKind(row: MovementRow): MovementKind {
  const metadata = row.parsedMetadata && typeof row.parsedMetadata === "object" ? row.parsedMetadata as Record<string, unknown> : {};
  const captured = metadata.capture as { kind?: string } | undefined;
  if (row.type === "expense" && Number(row.amount ?? 0) < 0) return "refund";
  if (row.subCategory === "دين/سلفة") return "loan";
  if (row.subCategory === "جمعية") return "gam3eya";
  if (captured?.kind === "card_payment") return "card_payment";
  if (["atm_withdrawal", "cash_out", "cash_in", "cash_deposit"].includes(captured?.kind ?? "")) return "cash_transfer";
  if (["سحب ATM", "تحويل نقدي", "كاش", "سحب نقدي / ATM"].includes(row.subCategory ?? "")) return "cash_transfer";
  if (["بين حساباتي", "بين حساباتك", "تحويل بين الحسابات"].includes(row.subCategory ?? "")) return "own_transfer";
  if (row.type === "investment") return "investment";
  if (row.type === "transfer" || row.category === "تحويل") return "personal_transfer";
  return row.type === "income" ? "income" : "spending";
}

/** Legacy rows with no direction remain unresolved; callers must report them, never guess a migration. */
export function normalizeFinancialMovement(row: MovementRow, explicitKind?: MovementKind): { type: "income" | "expense"; financial: FinancialMovement } | null {
  if (!["income", "expense", "transfer", "investment"].includes(row.type ?? "")) return null;
  const metadata = row.parsedMetadata && typeof row.parsedMetadata === "object" ? row.parsedMetadata as Record<string, unknown> : {};
  const direction = row.direction ?? metadata.direction;
  const movement = direction === "incoming" || direction === "in" ? "in" : direction === "outgoing" || direction === "out" ? "out" : movementOf(row);
  if (!movement) return null;
  const previous = financialMovement(row);
  const previousKind = previous && !["spending", "income"].includes(previous.kind) && !(previous.kind === "refund" && row.type === "income") ? previous.kind : undefined;
  const kind = explicitKind ?? previousKind ?? (row.type === "expense" && movement === "in" ? "refund" : inferredKind(row));
  if ((kind === "income" || kind === "refund") && movement !== "in") return null;
  if (kind === "spending" && movement !== "out") return null;
  const refund = kind === "refund";
  return { type: refund ? "expense" : movement === "in" ? "income" : "expense",
    financial: { version: 1, kind, movement, excluded: EXCLUDED.has(kind), ...(EXCLUDED.has(kind) && previous?.counterWalletId ? { counterWalletId: previous.counterWalletId } : {}) } };
}
