import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown } from "lucide-react";
import { trpc } from "@/providers/trpc";

import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { RecentExpenses } from "@/components/expenses/RecentExpenses";
import { MonthlyStats } from "@/components/dashboard/MonthlyStats";
import { ExpenseChart } from "@/components/dashboard/ExpenseChart";
import { AIInsights } from "@/components/insights/AIInsights";
import { OnboardingCard } from "@/components/OnboardingCard";

export default function Home() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "record");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSearchParams({ tab: val });
  };

  
  
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Fetch real stats
  const { data: stats } = trpc.expense.getMonthlyStats.useQuery({ month: currentMonth });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">أهلاً، {user?.name} 👋</h1>
          <p className="text-muted-foreground text-sm">إليك ملخص مصروفاتك</p>
        </div>
        <div className="flex gap-2">
          <Card className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
              <span className="font-bold">{(stats?.totalIncome || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ج.م</span>
            </div>
          </Card>
          <Card className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border-red-200">
            <div className="flex items-center gap-2 text-red-600">
              <TrendingDown className="w-4 h-4" />
              <span className="font-bold">{(stats?.totalExpense || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ج.م</span>
            </div>
          </Card>
        </div>
      </div>

      <OnboardingCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="record">تسجيل</TabsTrigger>
              <TabsTrigger value="stats">إحصائيات</TabsTrigger>
              <TabsTrigger value="ai">تحليل AI</TabsTrigger>
            </TabsList>

            <TabsContent value="record" className="space-y-6 mt-4">
              <ExpenseForm />
              <RecentExpenses limit={5} />
            </TabsContent>

            <TabsContent value="stats" className="mt-4 space-y-6">
              <MonthlyStats 
                total={stats?.totalExpense || 0}
                count={stats?.count || 0}
                dailyAverage={stats?.dailyAverage || 0}
                previousMonthTotal={0} // Can be fetched separately if needed
              />
              <Card className="border-0 shadow-xl">
                <CardHeader>
                  <CardTitle>تحليل الفئات</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExpenseChart 
                    categoryData={stats?.categoryBreakdown || []}
                    subCategoryData={stats?.subCategoryBreakdown || []}
                    hourTrend={stats?.hourTrend || []}
                    dayOfWeekTrend={stats?.dayOfWeekTrend || []}
                    dayTrend={stats?.dayTrend || []}
                    items={stats?.items || []}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <AIInsights month={currentMonth} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar area for widgets */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">نصيحة اليوم</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                استخدم التسجيل الصوتي أو اكتب بالعامية عشان تسجل مصاريفك بسرعة. الذكاء الاصطناعي هيفهمك ويصنف المصروف تلقائي!
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
