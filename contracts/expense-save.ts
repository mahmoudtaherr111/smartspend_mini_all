/**
 * What a parsed item carries into a save, for every channel that saves one (the expense form, the live call).
 * The parser (`ai.parseExpense`) returns the direction and the person beside the category; `expense.batchCreate`
 * stores a refund negative in its category and links the person to a contact only when both are passed on. A
 * channel that drops them saves a refund as new spending (docs/decisions/0010-refunds-net-their-category.md).
 */

export type SaveDirection = "incoming" | "outgoing";

/**
 * The direction saved with an item: a transfer's (a loan, a gam3eya) when the parser found one, and "incoming"
 * for an expense whose money came back (a refund). Anything else has none.
 */
export function directionToSave(item: { type?: unknown; direction?: unknown }): SaveDirection | undefined {
  if (item.type === "transfer") {
    return item.direction === "incoming" || item.direction === "outgoing" ? item.direction : undefined;
  }
  return item.type === "expense" && item.direction === "incoming" ? "incoming" : undefined;
}

/**
 * The person the parser found beside the purpose ("مصاريف مدرسة ابني" is تعليم for ابني), which the save links to a
 * contact. Both the name and the relationship are needed; either alone is not passed on.
 */
export function personToSave(item: {
  person_mentioned?: unknown;
  person_relationship?: unknown;
}): { personName?: string; personRelationship?: string } {
  const name = typeof item.person_mentioned === "string" ? item.person_mentioned.trim().slice(0, 60) : "";
  const relationship = typeof item.person_relationship === "string" ? item.person_relationship.trim().slice(0, 40) : "";
  return name && relationship ? { personName: name, personRelationship: relationship } : {};
}

/** True for an expense whose money came back: its amount is subtracted from its category, never added. */
export function isRefund(item: { type?: unknown; direction?: unknown }): boolean {
  return item.type === "expense" && item.direction === "incoming";
}
