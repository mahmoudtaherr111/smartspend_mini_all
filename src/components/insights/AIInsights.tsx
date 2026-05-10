import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle2,
  Zap,
  BarChart3,
} from "lucide-react";

interface AIInsightsProps {
  month: string;
}

export function AIInsights({ month }: AIInsightsProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [compareMonth, setCompareMonth] = useState(() => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data, isLoading, refetch } = trpc.ai.generateMonthlyInsights.useQuery(
    { month },
    { enabled: !!month }
  );

  const { data: compareData, isLoading: compareLoading } = trpc.ai.compareMonths.useQuery(
    { month1: month, month2: compareMonth },
    { enabled: showComparison }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
          <p className="text-muted-foreground">جاري تحليل بياناتك بالذكاء الاصطناعي...</p>
          <p className="text-xs text-muted-foreground mt-1">ده ممكن ياخد شوية وقت</p>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
          <p>فيه مشكلة في التحليل.</p>
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            جرب تاني
          </Button>
        </CardContent>
      </Card>
    );
  }

  const insights = data.insights || [];
  const report = data.report as {
    summary?: string;
    spendingType?: string;
    biggestWin?: string;
    biggestConcern?: string;
    actionPlan?: string[];
  } | null;

  const spendingTypeColors: Record<string, string> = {
    "المحافظ": "bg-green-100 text-green-700",
    "المستهلك": "bg-red-100 text-red-700",
    "المتوازن": "bg-blue-100 text-blue-700",
    "المنفلت": "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-4">
      {/* Report Card */}
      {report && (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-5 h-5 text-amber-500" />
              التقرير الشهري
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.summary && (
              <p className="text-sm leading-relaxed">{report.summary}</p>
            )}
            {report.spendingType && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">نوع الشخص المالي:</span>
                <Badge className={spendingTypeColors[report.spendingType] || "bg-gray-100"}>
                  {report.spendingType}
                </Badge>
              </div>
            )}
            {report.biggestWin && (
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                <div>
                  <span className="font-medium">أحسن حاجة:</span> {report.biggestWin}
                </div>
              </div>
            )}
            {report.biggestConcern && (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <span className="font-medium">نقطة الانتباه:</span> {report.biggestConcern}
                </div>
              </div>
            )}
            {report.actionPlan && report.actionPlan.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="w-4 h-4 text-blue-500" />
                  خطة التحسن:
                </div>
                <div className="space-y-1">
                  {report.actionPlan.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm mr-4">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold shrink-0">
                        {i + 1}
                      </span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Insights List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            ملاحظات ونصائح
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Month Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            مقارنة بين الشهور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <span className="text-sm">قارن بشهر:</span>
            <input
              type="month"
              value={compareMonth}
              onChange={(e) => setCompareMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <Button
              size="sm"
              onClick={() => setShowComparison(true)}
              disabled={compareMonth === month}
            >
              قارن
            </Button>
          </div>

          {showComparison && compareData?.success && compareData.comparison && (
            <div className="space-y-3 p-3 bg-purple-50 rounded-lg">
              <p className="text-sm font-medium">{compareData.comparison.comparison}</p>
              {compareData.comparison.biggestChange && (
                <div className="flex items-start gap-2 text-sm">
                  <TrendingDown className="w-4 h-4 text-purple-500 mt-0.5" />
                  {compareData.comparison.biggestChange}
                </div>
              )}
              {compareData.comparison.recommendation && (
                <p className="text-sm text-muted-foreground">
                  {compareData.comparison.recommendation}
                </p>
              )}
            </div>
          )}

          {compareLoading && (
            <div className="text-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
