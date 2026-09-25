import { useState } from "react";
import { toast } from "sonner";
import { PiggyBank, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getCategoryOptionsForType } from "@/lib/financial-taxonomy";

const ALL = "__all__";

/**
 * The user's budgets: a monthly limit, for one category or for all spending, with what was
 * spent in the current cycle. The server warns once at the alert threshold (80% by
 * default) and once past the limit.
 */
export function BudgetsPanel() {
  const utils = trpc.useUtils();
  const budgets = trpc.budget.list.useQuery(undefined, { staleTime: 60_000 });
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<string>(ALL);
  const [limit, setLimit] = useState("");

  const refresh = () => void utils.budget.list.invalidate();
  const create = trpc.budget.create.useMutation({
    onSuccess: () => {
      toast.success("الميزانية اتعملت");
      setAdding(false);
      setLimit("");
      setCategory(ALL);
      refresh();
    },
    onError: (error) => toast.error(error.message || "ماقدرناش نعمل الميزانية"),
  });
  const remove = trpc.budget.delete.useMutation({ onSuccess: refresh });

  const items = Array.isArray(budgets.data?.budgets) ? budgets.data.budgets : [];

  const submit = () => {
    const value = Number(limit);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("اكتب حد أكبر من صفر");
      return;
    }
    create.mutate({
      title: category === ALL ? "كل المصاريف" : category,
      category: category === ALL ? undefined : category,
      monthlyLimit: value,
    });
  };

  return (
    <Card id="budget">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank className="h-5 w-5 text-emerald-600" />
          ميزانياتك
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding((open) => !open)}>
          <Plus className="me-1 h-4 w-4" />
          ميزانية
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="flex flex-wrap gap-2 rounded-lg border p-3">
            <select
              aria-label="الفئة"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
            >
              <option value={ALL}>كل المصاريف</option>
              {getCategoryOptionsForType("expense").map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              aria-label="الحد في الشهر"
              type="number"
              inputMode="decimal"
              placeholder="الحد في الشهر"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="h-9 w-32"
            />
            <Button size="sm" disabled={create.isPending} onClick={submit}>
              احفظ
            </Button>
          </div>
        )}
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            حط حد شهري لفئة (زي الأكل أو الخروجات) وهنبهك لما توصل 80% ولما تعدّيه.
          </p>
        )}
        {items.map((budget) => {
          const percentage = Math.min(100, budget.percentage);
          return (
            <div key={budget.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{budget.title}</span>
                <span
                  className={cn(
                    "text-xs",
                    budget.isExceeded ? "text-rose-600" : budget.isNearLimit ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {budget.currentSpent.toLocaleString("ar-EG")} / {Number(budget.monthlyLimit).toLocaleString("ar-EG")} ج
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="امسح الميزانية"
                  className="h-8 w-8"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ budgetId: budget.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Progress
                value={percentage}
                className={cn(budget.isExceeded && "[&>div]:bg-rose-500", !budget.isExceeded && budget.isNearLimit && "[&>div]:bg-amber-500")}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
