import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target, Sparkles, Loader2 } from "lucide-react";

export function FinancialGoalsPanel() {
  const { data, refetch, isError, error } = trpc.goals.list.useQuery(undefined, { retry: 1 });
  const createMutation = trpc.goals.create.useMutation({ onSuccess: () => refetch() });
  const analyzeMutation = trpc.goals.analyze.useMutation({ onSuccess: () => refetch() });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const isPro = data?.isPro ?? false;

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate({ title: title.trim(), description: description.trim() || undefined });
    setTitle("");
    setDescription("");
  };

  return (
    <Card className="border-violet-200/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="w-5 h-5 text-violet-600" />
          أهداف مالية
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            {error?.message || "تعذّر تحميل الأهداف."}
            <span className="block mt-1 text-xs text-muted-foreground">
              إن استمر الخطأ شغّل: npm run db:push
            </span>
          </p>
        )}
        {data?.dbReady === false && !isError && (
          <p className="text-xs text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 p-3">
            جدول الأهداف غير موجود بعد. نفّذ <code className="font-mono">npm run db:push</code> ثم أعد تحميل الصفحة.
          </p>
        )}
        {!isPro && data?.proUpsell && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 p-3 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100">{data.proUpsell.title}</p>
            <ul className="mt-2 list-disc list-inside text-muted-foreground space-y-1">
              {data.proUpsell.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-medium text-amber-700">{data.proUpsell.cta}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="عنوان الهدف (مثال: ادخار لرحلة)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            placeholder={isPro ? "وصف تفصيلي (اختياري)" : "وصف قصير (Free: 120 حرف)"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={isPro ? 2000 : 120}
          />
          <Button onClick={handleCreate} disabled={createMutation.isPending || !title.trim()}>
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "إضافة"}
          </Button>
        </div>

        <div className="space-y-2">
          {(data?.goals || []).map((g) => (
            <div key={g.id} className="rounded-lg border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{g.title}</p>
                {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                {g.targetAmount && <p className="text-xs mt-1">هدف: {g.targetAmount} ج.م</p>}
              </div>
              {isPro && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 shrink-0"
                  onClick={() => analyzeMutation.mutate({ goalId: g.id })}
                  disabled={analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  تحليل Pro
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
