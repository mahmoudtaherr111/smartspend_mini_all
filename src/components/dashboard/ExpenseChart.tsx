import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getCategoryColor } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
} from "lucide-react";
import { getProviderMeta } from "../expenses/RecentExpenses";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ExpenseChartProps {
  categoryData: any[];
  subCategoryData?: any[];
  hourTrend?: any[];
  dayOfWeekTrend?: any[];
  dayTrend?: any[];
  items?: any[];
  familyBreakdown?: any[];
}

// Colors are now handled by getCategoryColor in utils.ts

export function ExpenseChart({
  categoryData,
  subCategoryData = [],
  hourTrend = [],
  dayOfWeekTrend = [],
  dayTrend = [],
  items = [],
  familyBreakdown = [],
}: ExpenseChartProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Wallet States
  const [showBalances, setShowBalances] = useState<Record<string, boolean>>({});
  const [selectedProviderWallet, setSelectedProviderWallet] = useState<
    string | null
  >(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // 1. Filter electronic transactions
  const electronicItems = items.filter((item) => {
    if (typeof item.parsedMetadata === "string") {
      try {
        item.parsedMetadata = JSON.parse(item.parsedMetadata);
      } catch (e) {
        item.parsedMetadata = {};
      }
    }
    if (
      item.source === "sms" ||
      (item.parsedMetadata && item.parsedMetadata.provider)
    )
      return true;
    const eKeywords = [
      "فيزا",
      "انستاباي",
      "انستا باي",
      "فودافون كاش",
      "تحويل",
      "بنك",
      "كريدت",
      "بطاقة",
    ];
    const txt =
      `${item.category || ""} ${item.subCategory || ""} ${item.description || ""} ${item.rawText || ""}`.toLowerCase();
    return eKeywords.some((k) => txt.includes(k));
  });

  // Assign a provider name if missing for manual/AI items
  electronicItems.forEach((item) => {
    if (!item.parsedMetadata) item.parsedMetadata = {};
    if (!item.parsedMetadata.provider) {
      const txt =
        `${item.category || ""} ${item.subCategory || ""} ${item.description || ""} ${item.rawText || ""}`.toLowerCase();
      if (txt.includes("فودافون"))
        item.parsedMetadata.provider = "VodafoneCash";
      else if (txt.includes("انستا")) item.parsedMetadata.provider = "InstaPay";
      else if (
        txt.includes("فيزا") ||
        txt.includes("كريدت") ||
        txt.includes("بطاقة")
      )
        item.parsedMetadata.provider = "Visa";
      else item.parsedMetadata.provider = "BankTransfer";
    }
  });

  // 2. Process electronic stats on-the-fly
  const electronicStats: Record<
    string,
    {
      provider: string;
      spent: number;
      received: number;
      lastBalance: number | null;
      lastActiveDate: Date | null;
      count: number;
      transactions: any[];
    }
  > = {};

  electronicItems.forEach((item) => {
    const metadata = item.parsedMetadata || {};
    const providerName = metadata.provider || "Unknown";

    if (!electronicStats[providerName]) {
      electronicStats[providerName] = {
        provider: providerName,
        spent: 0,
        received: 0,
        lastBalance: null,
        lastActiveDate: null,
        count: 0,
        transactions: [],
      };
    }

    const stat = electronicStats[providerName];
    const amount = Number(item.amount) || 0;

    if (item.type === "income") {
      stat.received += amount;
    } else if (item.type === "expense") {
      stat.spent += amount;
    }

    stat.count += 1;
    stat.transactions.push(item);

    const itemDate = new Date(item.date);
    if (!stat.lastActiveDate || itemDate > stat.lastActiveDate) {
      stat.lastActiveDate = itemDate;
      if (typeof metadata.balance_after === "number") {
        stat.lastBalance = metadata.balance_after;
      }
    }
  });

  // Sort transactions within each provider by date descending
  Object.values(electronicStats).forEach((stat) => {
    stat.transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  });

  // 3. Outgoing expenses split by provider for Donut Chart
  const donutData = Object.values(electronicStats)
    .filter((s) => s.spent > 0)
    .map((s) => ({
      name: getProviderMeta(s.provider).nameAr,
      value: s.spent,
      provider: s.provider,
      count: s.transactions.filter((t) => t.type === "expense").length,
    }));

  const processCategoryData = () => {
    if (!categoryData || categoryData.length === 0) return [];
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    const result: any[] = [];
    let othersValue = 0;

    categoryData.forEach((item) => {
      const percentage = (item.value / total) * 100;
      if (percentage < 2.5 && categoryData.length > 5) {
        othersValue += item.value;
      } else {
        result.push(item);
      }
    });

    if (othersValue > 0) {
      result.push({ name: "أخرى", value: othersValue });
    }

    return result.sort((a, b) => b.value - a.value);
  };

  const processedCategoryData = processCategoryData();
  const totalExpense = categoryData.reduce(
    (sum, item) => sum + (Number(item.value) || 0),
    0,
  );
  const processedSubCategoryData = [...subCategoryData].sort(
    (a, b) => b.value - a.value,
  );

  if (!categoryData || categoryData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        مفيش بيانات للشهر ده
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-100/50 dark:bg-slate-800/50 rounded-xl p-1">
          <TabsTrigger
            value="categories"
            className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm whitespace-nowrap"
          >
            الفئات
          </TabsTrigger>
          <TabsTrigger
            value="family"
            className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm whitespace-nowrap"
          >
            العائلة
          </TabsTrigger>
          <TabsTrigger
            value="electronic"
            className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm whitespace-nowrap"
          >
            إلكترونية
          </TabsTrigger>
          <TabsTrigger
            value="budget"
            className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm whitespace-nowrap"
          >
            الميزانية
          </TabsTrigger>
        </TabsList>

        <div className="pt-6 animate-in fade-in zoom-in-95 duration-500">
          <TabsContent value="categories" className="m-0 space-y-6">
            <div className="relative w-full max-w-md mx-auto h-[320px] sm:h-[380px] my-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius={135}
                    innerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="transparent"
                    animationDuration={1500}
                    animationBegin={0}
                  >
                    {processedCategoryData.map((entry, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getCategoryColor(entry.name, index)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          if (entry.name !== "أخرى") {
                            setSelectedCategory(entry.name);
                            setSelectedSubCategory(null);
                            setIsModalOpen(true);
                          }
                        }}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    wrapperStyle={{ pointerEvents: "none", zIndex: 50 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        return (
                          <div
                            className="bg-zinc-950/95 backdrop-blur-lg p-3 border border-zinc-800/80 rounded-xl shadow-2xl flex flex-col gap-1 text-right text-zinc-100 min-w-[140px] transform -translate-y-2 pointer-events-none"
                            dir="rtl"
                          >
                            <span className="text-zinc-400 text-xs font-semibold mb-1 border-b border-zinc-800/50 pb-1">
                              {data.name}
                            </span>
                            <span className="font-bold text-[15px] text-white">
                              {Number(data.value).toLocaleString()} ج.م
                            </span>
                            {data.payload.count && (
                              <span className="text-zinc-500 text-xs mt-1">
                                {data.payload.count} عمليات
                              </span>
                            )}
                            {data.payload.avg && (
                              <span className="text-zinc-500 text-xs">
                                متوسط {Number(data.payload.avg).toLocaleString()} ج
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                    cursor={{fill: "transparent"}}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground font-medium">
                  إجمالي المصروفات
                </span>
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {totalExpense.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            {/* Custom Premium Interactive Legend List */}
            <div className="mt-6 space-y-3 max-w-md mx-auto" dir="rtl">
              {processedCategoryData.map((entry, index: number) => {
                const color = getCategoryColor(entry.name, index);
                const percentage =
                  totalExpense > 0 ? (entry.value / totalExpense) * 100 : 0;
                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (entry.name !== "أخرى") {
                        setSelectedCategory(entry.name);
                        setSelectedSubCategory(null);
                        setIsModalOpen(true);
                      }
                    }}
                    className={cn(
                      "group flex flex-col gap-2 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all cursor-pointer shadow-sm",
                      entry.name === "أخرى" &&
                        "cursor-default hover:bg-white/50 dark:hover:bg-slate-900/30",
                    )}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {entry.name}
                        </span>
                        {entry.count !== undefined && (
                          <span className="text-xs text-muted-foreground font-normal">
                            ({entry.count}{" "}
                            {entry.count >= 3 && entry.count <= 10
                              ? "عمليات"
                              : "عملية"}
                            )
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-extrabold text-foreground">
                          {entry.value.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium mr-1">
                          ج.م
                        </span>
                        <span className="text-xs text-muted-foreground mr-1.5 font-semibold">
                          ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    {/* Sleek Percentage Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="family" className="m-0">
            {familyBreakdown.length > 0 ? (
              <div className="space-y-4 max-h-[320px] overflow-y-auto pl-2">
                {familyBreakdown.map((person, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-900/50 border rounded-xl p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex justify-between items-center border-b pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                          {person.person.substring(0, 1)}
                        </div>
                        <span className="font-bold text-base">
                          {person.person}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-bold",
                          person.netBalance > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : person.netBalance < 0
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {person.netBalance > 0
                          ? `ليك ${person.netBalance.toLocaleString()} ج`
                          : person.netBalance < 0
                            ? `عليك ${Math.abs(person.netBalance).toLocaleString()} ج`
                            : "خالصين"}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg flex flex-col items-center">
                        <span className="text-muted-foreground text-[10px]">
                          دفعتهوله
                        </span>
                        <span className="font-semibold text-rose-500">
                          {person.spent.toLocaleString()} ج
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg flex flex-col items-center">
                        <span className="text-muted-foreground text-[10px]">
                          أخدته منه
                        </span>
                        <span className="font-semibold text-emerald-500">
                          {person.received.toLocaleString()} ج
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm space-y-2">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-full">
                  <span className="text-2xl">👨‍👩‍👧‍👦</span>
                </div>
                <p>مفيش معاملات عائلية متسجلة الشهر ده</p>
                <p className="text-xs text-center max-w-[250px]">
                  سجل معاملات بأسماء أشخاص عشان تتابع حساباتهم معاك هنا
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="electronic" className="m-0 space-y-6">
            {electronicItems.length > 0 ? (
              <div className="space-y-6">
                {/* 1. Header with overall Electronic Cash Flow Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-indigo-50/60 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-950/40 border border-indigo-100/60 dark:border-indigo-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      إجمالي المنصرف الإلكتروني
                    </span>
                    <span className="text-xl md:text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-2">
                      -
                      {Object.values(electronicStats)
                        .reduce((sum, s) => sum + s.spent, 0)
                        .toLocaleString()}{" "}
                      ج.م
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50/60 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-950/40 border border-emerald-100/60 dark:border-emerald-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      إجمالي الوارد الإلكتروني
                    </span>
                    <span className="text-xl md:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-2">
                      +
                      {Object.values(electronicStats)
                        .reduce((sum, s) => sum + s.received, 0)
                        .toLocaleString()}{" "}
                      ج.م
                    </span>
                  </div>
                  <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-purple-50/60 to-purple-100/30 dark:from-purple-950/20 dark:to-purple-950/40 border border-purple-100/60 dark:border-purple-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                      الحسابات الإلكترونية النشطة
                    </span>
                    <span className="text-xl md:text-2xl font-bold text-purple-700 dark:text-purple-300 mt-2">
                      {Object.keys(electronicStats).length} حسابات
                    </span>
                  </div>
                </div>

                {/* 2. Donut Chart and Active Wallet Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Recharts Donut Chart */}
                  <div className="lg:col-span-5 bg-white dark:bg-slate-900/40 border rounded-2xl p-4 shadow-sm">
                    <h4 className="text-sm font-bold text-foreground mb-4 text-center">
                      توزيع النفقات الإلكترونية حسب الحساب 📊
                    </h4>
                    {donutData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="transparent"
                            animationDuration={1500}
                          >
                            {donutData.map((entry, idx) => (
                              <Cell
                                key={`cell-${idx}`}
                                fill={
                                  getProviderMeta(entry.provider).brandColor
                                }
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            wrapperStyle={{ pointerEvents: "none", zIndex: 50 }}
                            formatter={(value: number, name: string) => [
                              `${value.toLocaleString()} ج.م`,
                              name,
                            ]}
                            contentStyle={{
                              direction: "rtl",
                              borderRadius: "12px",
                              border: "none",
                              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ fontSize: "11px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">
                        لا توجد نفقات إلكترونية صادرة هذا الشهر
                      </div>
                    )}
                  </div>

                  {/* Right Column: Grid of Active Wallet Cards */}
                  <div className="lg:col-span-7 space-y-4">
                    <h4 className="text-sm font-bold text-foreground text-right mb-2">
                      الحسابات والمحافظ الإلكترونية النشطة 💳
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.values(electronicStats).map((stat) => {
                        const providerInfo = getProviderMeta(stat.provider);
                        const isBalanceVisible = !!showBalances[stat.provider];
                        return (
                          <div
                            key={stat.provider}
                            className="bg-white/50 dark:bg-slate-900/30 backdrop-blur-md border border-slate-100 dark:border-slate-800/80 shadow-md rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg flex flex-col justify-between"
                            style={{
                              borderRight: `4px solid ${providerInfo.brandColor}`,
                            }}
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 mb-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">
                                  {providerInfo.icon}
                                </span>
                                <span className="font-bold text-sm text-foreground">
                                  {providerInfo.nameAr}
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  setShowBalances((prev) => ({
                                    ...prev,
                                    [stat.provider]: !prev[stat.provider],
                                  }))
                                }
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title={
                                  isBalanceVisible
                                    ? "إخفاء الرصيد"
                                    : "إظهار الرصيد"
                                }
                              >
                                {isBalanceVisible ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            <div
                              className="space-y-2 mb-4 text-right"
                              dir="rtl"
                            >
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground flex items-center gap-0.5">
                                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />{" "}
                                  الوارد:
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  +{stat.received.toLocaleString()} ج.م
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground flex items-center gap-0.5">
                                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />{" "}
                                  الصادر:
                                </span>
                                <span className="font-semibold text-rose-600 dark:text-rose-400">
                                  -{stat.spent.toLocaleString()} ج.م
                                </span>
                              </div>
                            </div>

                            <div className="mt-auto border-t border-slate-100 dark:border-slate-800/60 pt-3 flex items-center justify-between">
                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground block">
                                  آخر رصيد معروف
                                </span>
                                <span className="text-sm font-bold text-foreground">
                                  {stat.lastBalance !== null
                                    ? isBalanceVisible
                                      ? `${stat.lastBalance.toLocaleString()} ج.م`
                                      : "••••••"
                                    : "غير متوفر"}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedProviderWallet(stat.provider);
                                  setIsWalletModalOpen(true);
                                }}
                                className="text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-1 px-2.5 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <span>عرض العمليات</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-dashed border-2 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl space-y-4 max-w-lg mx-auto">
                <div className="relative w-24 h-24 rounded-full bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center">
                  <CreditCard className="w-12 h-12 text-indigo-500 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-foreground">
                    مفيش معاملات إلكترونية لسه! 💳📱
                  </h3>
                  <p className="text-xs max-w-sm leading-relaxed">
                    النظام جاهز تماماً لاستقبال وقراءة أي رسالة SMS بنكية أو
                    إشعار فودافون كاش/انستا باي من تليفونك وتصنيفها تلقائياً
                    بالمليم هنا!
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="budget" className="m-0 space-y-4">
            {(() => {
              const totalExp = items
                .filter((i) => i.type === "expense")
                .reduce((sum, item) => sum + Number(item.amount), 0);
              const totalInc = items
                .filter((i) => i.type === "income")
                .reduce((sum, item) => sum + Number(item.amount), 0);
              const budgetLimit = totalInc > 0 ? totalInc : 10000;
              const budgetPercentage = Math.min(
                100,
                Math.round((totalExp / budgetLimit) * 100),
              );
              const isOverBudget = totalExp > budgetLimit;
              const remaining = isOverBudget ? 0 : budgetLimit - totalExp;

              return (
                <div className="bg-white dark:bg-slate-900/40 rounded-2xl p-6 border shadow-sm space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="font-bold text-lg mb-1">
                        الميزانية الشهرية
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        تتبع مصاريفك مقارنة بدخلك
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-foreground block">
                        {totalExp.toLocaleString()} ج
                      </span>
                      <span className="text-sm text-muted-foreground">
                        من {budgetLimit.toLocaleString()} ج
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{budgetPercentage}% مستخدم</span>
                      <span
                        className={
                          isOverBudget ? "text-rose-500" : "text-emerald-500"
                        }
                      >
                        {isOverBudget
                          ? "تخطيت الميزانية!"
                          : `متبقي ${remaining.toLocaleString()} ج`}
                      </span>
                    </div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className={cn(
                          "h-full transition-all duration-1000 rounded-full",
                          isOverBudget
                            ? "bg-rose-500"
                            : budgetPercentage > 80
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                        style={{ width: `${budgetPercentage}%` }}
                      />
                    </div>
                  </div>

                  {totalInc === 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-3 rounded-lg text-sm flex items-center gap-2">
                      <span>💡</span>
                      <span>
                        سجل دخلك الشهري عشان الميزانية تحسب صح (دلوقتي محسوبة
                        على أساس 10,000 ج.م كافتراضي).
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[80vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-xl">
              تفاصيل الفئة: {selectedCategory || selectedSubCategory}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[350px] overflow-y-auto pr-1 pl-1 space-y-4 py-2 mt-4"
            dir="rtl"
          >
            {(() => {
              const filteredItems = items
                .filter(
                  (i) =>
                    i.type === "expense" &&
                    (selectedCategory
                      ? i.category === selectedCategory
                      : i.subCategory === selectedSubCategory),
                )
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
                );

              if (filteredItems.length === 0) {
                return (
                  <p className="text-center text-muted-foreground py-8">
                    لا يوجد تفاصيل إضافية
                  </p>
                );
              }

              // If a category is selected, group by subCategory
              if (selectedCategory) {
                const grouped = filteredItems.reduce(
                  (acc, item) => {
                    const sub =
                      item.subCategory && item.subCategory !== "عام"
                        ? item.subCategory
                        : "أخرى";
                    if (!acc[sub]) acc[sub] = { total: 0, items: [] };
                    acc[sub].total += Number(item.amount);
                    acc[sub].items.push(item);
                    return acc;
                  },
                  {} as Record<string, { total: number; items: any[] }>,
                );

                return (
                  Object.entries(grouped) as [
                    string,
                    { total: number; items: any[] },
                  ][]
                )
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([subName, data], idx) => (
                    <div key={idx} className="space-y-3 min-w-0">
                      <div className="flex items-center justify-between border-b pb-2 gap-4 min-w-0">
                        <h4 className="font-bold text-sm text-indigo-600 dark:text-indigo-400 truncate flex-1 min-w-0">
                          {subName}
                        </h4>
                        <span className="font-bold text-sm flex-shrink-0">
                          {data.total.toLocaleString("en-US")} ج.م
                        </span>
                      </div>
                      <div className="space-y-2 min-w-0">
                        {data.items.map((item: any, iIdx: number) => (
                          <div
                            key={iIdx}
                            className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 gap-4 min-w-0"
                          >
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium text-xs truncate">
                                {item.description || item.category}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {format(new Date(item.date), "dd MMM yyyy", {
                                  locale: ar,
                                })}
                              </span>
                            </div>
                            <div className="font-bold text-xs text-red-500">
                              {Number(item.amount).toLocaleString("en-US", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}{" "}
                              ج.م
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
              }

              // Fallback for subCategory click
              return filteredItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">
                      {item.description || item.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(item.date), "dd MMM yyyy", {
                        locale: ar,
                      })}
                    </span>
                  </div>
                  <div className="font-bold whitespace-nowrap text-red-500">
                    {Number(item.amount).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}{" "}
                    ج.م
                  </div>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Specific Transactions Modal */}
      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[80vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <span>
                {selectedProviderWallet
                  ? getProviderMeta(selectedProviderWallet).icon
                  : "💳"}
              </span>
              <span>
                معاملات:{" "}
                {selectedProviderWallet
                  ? getProviderMeta(selectedProviderWallet).nameAr
                  : "الحساب البنكي"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {selectedProviderWallet &&
              electronicStats[selectedProviderWallet]?.transactions.map(
                (item, idx) => {
                  const date = new Date(item.date);
                  const isIncome = item.type === "income";
                  return (
                    <div
                      key={idx}
                      className="border rounded-xl p-3 bg-white dark:bg-slate-900/40 shadow-sm flex items-center justify-between gap-3 border-slate-100 dark:border-slate-800"
                    >
                      <div className="text-right">
                        <span className="font-semibold text-sm block text-foreground">
                          {item.description || item.category}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <Badge className="py-0 px-1.5 text-[9px] border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {item.category}
                          </Badge>
                          <span>
                            {date.toLocaleDateString("ar-EG", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={cn(
                            "font-bold text-base",
                            isIncome
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {isIncome ? "+" : "-"}
                          {Number(item.amount).toLocaleString("ar-EG")} ج.م
                        </span>
                        {typeof item.parsedMetadata?.balance_after ===
                          "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            الرصيد:{" "}
                            {item.parsedMetadata.balance_after.toLocaleString(
                              "ar-EG",
                            )}
                            ج
                          </span>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            {selectedProviderWallet &&
              electronicStats[selectedProviderWallet]?.transactions.length ===
                0 && (
                <p className="text-center text-muted-foreground py-8">
                  لا توجد معاملات مسجلة
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
