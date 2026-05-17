import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";

function labelFor(value: unknown, fallback = "غير محدد") {
  if (value === null || value === undefined || value === "") return fallback;
  const map: Record<string, string> = {
    stable: "مستقر",
    watch: "يحتاج متابعة",
    pressure: "ضغط مالي",
    planned: "مخطط",
    spiky: "صرف فجائي",
    emotional: "صرف عاطفي",
    concentrated: "متركز",
    balanced: "متوازن",
    impulsive: "مندفع",
    conservative: "محافظ",
    stressed: "مضغوط",
  };
  return map[String(value)] || String(value);
}

export function UserIntelligencePanel({ month }: { month: string }) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.profile.getSmartProfile.useQuery();
  const refresh = trpc.profile.refreshInferences.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث استنتاجات البروفايل.");
      utils.profile.getSmartProfile.invalidate();
      utils.expense.getMonthlyStats.invalidate({ month });
    },
    onError: (err) => toast.error(err.message || "تعذر تحديث الاستنتاجات"),
  });

  const inferred = profile?.aiInferredAttributes || {};
  const topCategories = Array.isArray(inferred.topSpendingCategories) ? inferred.topSpendingCategories.slice(0, 3) : [];
  const completion = profile?.profileCompleted ? "مكتمل" : "يحتاج بيانات";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-600" />
            ذكاء المستخدم
          </CardTitle>
          <Badge variant={profile?.profileCompleted ? "default" : "secondary"}>{completion}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري تحميل البروفايل...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-3">
                <ShieldCheck className="w-4 h-4 text-emerald-600 mb-2" />
                <p className="text-xs text-muted-foreground">الاستقرار</p>
                <p className="font-semibold">{labelFor(inferred.financialStability)}</p>
              </div>
              <div className="rounded-md border p-3">
                <Sparkles className="w-4 h-4 text-amber-600 mb-2" />
                <p className="text-xs text-muted-foreground">السلوك</p>
                <p className="font-semibold">{labelFor(inferred.spendingBehavior)}</p>
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                أكثر فئات الصرف
              </div>
              <div className="flex flex-wrap gap-2">
                {topCategories.length > 0 ? topCategories.map((category: any, i: number) => {
                  const name = typeof category === "string" ? category : category.name || "غير محدد";
                  const percent = typeof category === "object" && category.percent ? `${category.percent}%` : "";
                  return (
                    <Badge key={`${name}-${i}`} variant="outline">
                      {name} {percent}
                    </Badge>
                  );
                }) : (
                  <span className="text-xs text-muted-foreground">تظهر بعد تسجيل مصاريف كافية.</span>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => refresh.mutate({ month })}
              disabled={refresh.isPending}
            >
              <RefreshCw className={refresh.isPending ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
              تحديث الاستنتاجات
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
