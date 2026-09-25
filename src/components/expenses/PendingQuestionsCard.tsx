import { useState } from "react";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { announceSaved } from "@/lib/saved-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Entries that stopped at a question ("مين أحمد؟") and were never answered. They used to
 * stay unrecorded and never show again; here each one waits for an answer, which saves
 * it, or a dismissal. Nothing renders when none wait.
 */
export function PendingQuestionsCard() {
  const utils = trpc.useUtils();
  const pending = trpc.expense.getPendingClarifications.useQuery(undefined, { staleTime: 60_000 });
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const refresh = () => {
    void utils.expense.getPendingClarifications.invalidate();
    void utils.expense.list.invalidate();
    void utils.expense.getMonthSummary.invalidate();
    void utils.expense.getMonthlyStats.invalidate();
  };
  const remove = trpc.expense.delete.useMutation();
  const answer = trpc.expense.answerClarification.useMutation({
    onSuccess: (result) => {
      if (result?.needsClarification) toast.success("تمام، فاضل سؤال كمان");
      else
        announceSaved(Array.isArray(result?.saved) ? result.saved : [], (ids) =>
          Promise.all(ids.map((id) => remove.mutateAsync({ id }))).finally(refresh),
        );
      refresh();
    },
    onError: (error) => {
      toast.error(error.message || "ماقدرناش نسجلها، جرّب تاني");
      refresh();
    },
  });
  const dismiss = trpc.expense.dismissClarification.useMutation({ onSuccess: refresh });

  // A card on Home must never take Home down: anything but a list renders nothing.
  const items = Array.isArray(pending.data) ? pending.data : [];
  if (items.length === 0) return null;
  const busy = answer.isPending || dismiss.isPending;

  return (
    <Card className="border-sky-200 dark:border-sky-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-5 w-5 text-sky-600" />
          محتاج ردك
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">عمليات وقفت عند سؤال ولسه ماتسجلتش.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <form
            key={item.id}
            className="space-y-2 rounded-lg border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const text = (answers[item.id] ?? "").trim();
              if (text) answer.mutate({ clarificationId: item.id, answer: text });
            }}
          >
            <p className="truncate text-xs text-muted-foreground">«{item.originalText}»</p>
            <p className="text-sm font-medium">{item.question}</p>
            <div className="flex gap-2">
              <Input
                aria-label="ردك"
                value={answers[item.id] ?? ""}
                maxLength={200}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [item.id]: event.target.value }))}
                className="h-9"
              />
              <Button type="submit" size="sm" disabled={busy || !(answers[item.id] ?? "").trim()}>
                رد
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => dismiss.mutate({ clarificationId: item.id })}
              >
                شيلها
              </Button>
            </div>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
