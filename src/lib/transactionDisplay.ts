export type TransactionDirection = "incoming" | "outgoing";

export interface TransactionDisplayMeta {
  isTransfer: boolean;
  isIncome: boolean;
  isExpense: boolean;
  isInvestment: boolean;
  direction: TransactionDirection;
  label: string;
  sign: "+" | "-" | "";
  amountClass: string;
  badgeClass: string;
}

/**
 * Single source of truth for formatting transaction types, directions,
 * signs, labels, and badges across the entire application (Lists, Calendar, Charts).
 */
export function getTransactionDisplayMeta(input: {
  type?: string | null;
  category?: string | null;
  parsedMetadata?: unknown;
  direction?: string | null;
}): TransactionDisplayMeta {
  const rawType = (input.type || "expense").toLowerCase();
  const category = input.category || "";
  const isTransfer = category === "تحويل" || rawType === "transfer";
  const isInvestment = rawType === "investment";

  const metaObj =
    input.parsedMetadata && typeof input.parsedMetadata === "object"
      ? (input.parsedMetadata as Record<string, any>)
      : null;

  // Check direction from top-level or parsedMetadata
  const explicitDirection =
    input.direction ||
    metaObj?.direction ||
    (rawType === "income" ? "incoming" : rawType === "expense" ? "outgoing" : null);

  const direction: TransactionDirection =
    explicitDirection === "incoming" ? "incoming" : "outgoing";

  if (isTransfer) {
    const isIncoming = direction === "incoming";
    return {
      isTransfer: true,
      isIncome: isIncoming,
      isExpense: !isIncoming,
      isInvestment: false,
      direction,
      label: isIncoming ? "اتحولي ↙️" : "حولت ↗️",
      sign: isIncoming ? "+" : "-",
      amountClass: isIncoming
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-sky-600 dark:text-sky-400",
      badgeClass: isIncoming
        ? "bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-bold"
        : "bg-sky-50 text-sky-700 border border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 font-bold",
    };
  }

  if (rawType === "income") {
    return {
      isTransfer: false,
      isIncome: true,
      isExpense: false,
      isInvestment: false,
      direction: "incoming",
      label: "دخل",
      sign: "+",
      amountClass: "text-emerald-600 dark:text-emerald-400",
      badgeClass:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }

  if (isInvestment) {
    return {
      isTransfer: false,
      isIncome: false,
      isExpense: false,
      isInvestment: true,
      direction: "outgoing",
      label: "استثمار",
      sign: "-",
      amountClass: "text-amber-600 dark:text-amber-400",
      badgeClass:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }

  // Default: expense
  return {
    isTransfer: false,
    isIncome: false,
    isExpense: true,
    isInvestment: false,
    direction: "outgoing",
    label: "مصروف",
    sign: "-",
    amountClass: "text-rose-600 dark:text-rose-400",
    badgeClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  };
}
