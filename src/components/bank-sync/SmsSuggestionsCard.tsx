import { useState } from "react";
import { toast } from "sonner";
import { Check, MessageSquareText, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  defaultSubCategory,
  getCategoryAppearance,
  getCategoryOptionsForType,
} from "@/lib/financial-taxonomy";

/**
 * Bank messages that arrived after the plan's monthly limit. They were not recorded on
 * their own; each waits here to be saved with one tap or dismissed, instead of being lost
 * (docs/decisions/0009-bank-messages-over-the-limit.md). Nothing renders when none wait.
 */
export function SmsSuggestionsCard() {
  const utils = trpc.useUtils();
  const suggestions = trpc.profile.getSmsSuggestions.useQuery(undefined, { staleTime: 60_000 });
  const [chosen, setChosen] = useState<Record<number, string>>({});

  const refreshLedger = () => {
    void utils.profile.getSmsSuggestions.invalidate();
    void utils.expense.list.invalidate();
    void utils.expense.getMonthSummary.invalidate();
    void utils.expense.getMonthlyStats.invalidate();
  };

  const confirm = trpc.profile.confirmSmsSuggestion.useMutation({
    onSuccess: () => {
      toast.success("اتسجلت في دفترك");
      refreshLedger();
    },
    onError: (error) => {
      toast.error(error.message || "ماقدرناش نسجلها، جرّب تاني");
      void utils.profile.getSmsSuggestions.invalidate();
    },
  });
  const dismiss = trpc.profile.dismissSmsSuggestion.useMutation({
    onSuccess: () => void utils.profile.getSmsSuggestions.invalidate(),
  });

  // A card on Home must never take Home down: anything but a list renders nothing.
  const items = Array.isArray(suggestions.data) ? suggestions.data : [];
  if (items.length === 0) return null;
  const busy = confirm.isPending || dismiss.isPending;

  return (
    <Card className="border-amber-200 dark:border-amber-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-5 w-5 text-amber-600" />
          رسايل بنك مستنية تأكيدك
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          وصلت بعد ما رسايل باقتك للشهر ده خلصت، فماتسجلتش لوحدها. احفظ اللي عايزه بضغطة.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const category = chosen[item.id] ?? item.category;
          const incoming = item.type === "income" || item.direction === "incoming";
          const { color } = getCategoryAppearance(category);
          return (
            <div key={item.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      "font-bold",
                      incoming ? "text-emerald-600" : item.type === "transfer" ? "text-sky-600" : "text-rose-600",
                    )}
                  >
                    {incoming ? "+" : "-"}
                    {item.amount.toLocaleString("ar-EG")} جنيه
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(item.date).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <select
                  aria-label="الفئة"
                  value={category}
                  onChange={(event) => setChosen((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  className="h-9 max-w-[45%] rounded-lg border bg-white/50 px-2 text-xs dark:bg-black/20"
                  style={{ color }}
                >
                  {getCategoryOptionsForType(item.type, item.category).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() =>
                    confirm.mutate(
                      category === item.category
                        ? { id: item.id }
                        : { id: item.id, category, subCategory: defaultSubCategory(category), type: item.type },
                    )
                  }
                >
                  <Check className="me-1 h-4 w-4" />
                  احفظ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => dismiss.mutate({ id: item.id })}
                >
                  <X className="me-1 h-4 w-4" />
                  تجاهل
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
