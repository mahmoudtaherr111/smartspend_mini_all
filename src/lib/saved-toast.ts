import { toast } from "sonner";

/** One saved item, as the server returns it after a save. */
export interface SavedEntryView {
  id: number;
  amount: number;
  category: string;
  subCategory?: string | null;
  direction?: "incoming" | "outgoing" | null;
}

/** "300 ج · تسوق/أحذية" for one item, "3 عمليات · 850 ج" for several. */
export function savedSummary(entries: SavedEntryView[]): string {
  if (entries.length === 1) {
    const [first] = entries;
    const sub = first.subCategory && first.subCategory !== "عام" ? `/${first.subCategory}` : "";
    const refund = first.direction === "incoming" ? " (مرتجع)" : "";
    return `${first.amount.toLocaleString("ar-EG")} ج · ${first.category}${sub}${refund}`;
  }
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return `${entries.length} عمليات · ${total.toLocaleString("ar-EG")} ج`;
}

/**
 * Says what was saved and offers to take it back. `undo` deletes the given ids; the caller
 * refreshes its lists afterwards.
 */
export function announceSaved(
  entries: SavedEntryView[],
  undo: (ids: number[]) => Promise<unknown>,
  prefix = "اتسجلت",
): void {
  if (entries.length === 0) {
    toast.success(prefix);
    return;
  }
  const ids = entries.map((entry) => entry.id).filter((id) => id > 0);
  toast.success(`${prefix}: ${savedSummary(entries)}`, {
    duration: 7000,
    action:
      ids.length > 0
        ? {
            label: "تراجع",
            onClick: () => {
              void undo(ids)
                .then(() => toast.success("اترجعت"))
                .catch(() => toast.error("ماقدرناش نرجعها، امسحها من القايمة"));
            },
          }
        : undefined,
  });
}
