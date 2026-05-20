import { useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getCategoryColor } from "@/lib/utils";
import { Eye, EyeOff, CreditCard, ArrowUpRight, ArrowDownLeft, Wallet } from "lucide-react";
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
}

// Colors are now handled by getCategoryColor in utils.ts


export function ExpenseChart({ categoryData, subCategoryData = [], hourTrend = [], dayOfWeekTrend = [], dayTrend = [], items = [] }: ExpenseChartProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Wallet States
  const [showBalances, setShowBalances] = useState<Record<string, boolean>>({});
  const [selectedProviderWallet, setSelectedProviderWallet] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // 1. Filter electronic transactions
  const electronicItems = items.filter((item) => {
    if (item.source === "sms" || (item.parsedMetadata && item.parsedMetadata.provider)) return true;
    const eKeywords = ["فيزا", "انستاباي", "انستا باي", "فودافون كاش", "تحويل", "بنك", "كريدت", "بطاقة"];
    const txt = `${item.category || ""} ${item.subCategory || ""} ${item.description || ""} ${item.rawText || ""}`.toLowerCase();
    return eKeywords.some((k) => txt.includes(k));
  });

  // Assign a provider name if missing for manual/AI items
  electronicItems.forEach((item) => {
    if (!item.parsedMetadata) item.parsedMetadata = {};
    if (!item.parsedMetadata.provider) {
      const txt = `${item.category || ""} ${item.subCategory || ""} ${item.description || ""} ${item.rawText || ""}`.toLowerCase();
      if (txt.includes("فودافون")) item.parsedMetadata.provider = "VodafoneCash";
      else if (txt.includes("انستا")) item.parsedMetadata.provider = "InstaPay";
      else if (txt.includes("فيزا") || txt.includes("كريدت") || txt.includes("بطاقة")) item.parsedMetadata.provider = "Visa";
      else item.parsedMetadata.provider = "BankTransfer";
    }
  });

  // 2. Process electronic stats on-the-fly
  const electronicStats: Record<string, { provider: string; spent: number; received: number; lastBalance: number | null; lastActiveDate: Date | null; count: number; transactions: any[] }> = {};

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
        transactions: []
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
    stat.transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // 3. Outgoing expenses split by provider for Donut Chart
  const donutData = Object.values(electronicStats)
    .filter((s) => s.spent > 0)
    .map((s) => ({
      name: getProviderMeta(s.provider).nameAr,
      value: s.spent,
      provider: s.provider,
      count: s.transactions.filter(t => t.type === "expense").length
    }));

  const processCategoryData = () => {
    if (!categoryData || categoryData.length === 0) return [];
    const total = categoryData.reduce((sum, item) => sum + item.value, 0);
    const result: any[] = [];
    let othersValue = 0;
    
    categoryData.forEach(item => {
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
  const processedSubCategoryData = [...subCategoryData].sort((a, b) => b.value - a.value);

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
        <TabsList className="grid w-full grid-cols-5 h-12 bg-slate-100/50 dark:bg-slate-800/50 rounded-xl p-1">
          <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm">الفئات</TabsTrigger>
          <TabsTrigger value="subcategories" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm">التفاصيل</TabsTrigger>
          <TabsTrigger value="electronic" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm">مصاريف إلكترونية</TabsTrigger>
          <TabsTrigger value="hours" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm">الوقت</TabsTrigger>
          <TabsTrigger value="trend" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all text-xs sm:text-sm">الدخل والمصروف</TabsTrigger>
        </TabsList>

        <div className="pt-6 animate-in fade-in zoom-in-95 duration-500">
          <TabsContent value="categories" className="m-0">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={processedCategoryData}
                  cx="50%" cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                  outerRadius={100}
                  innerRadius={60}
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
                  formatter={(value: number, name: string, props: any) => {
                    const payload = props.payload;
                    return [
                      <div key={name} className="flex flex-col gap-1 text-xs">
                        <span className="font-bold">{value.toLocaleString()} ج.م</span>
                        {payload.count && <span className="text-slate-500">{payload.count} عمليات</span>}
                        {payload.avg && <span className="text-slate-500">متوسط {payload.avg.toLocaleString()} ج</span>}
                      </div>, 
                      "التفاصيل"
                    ];
                  }} 
                  contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} 
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ animation: 'fade-in 1.5s ease-out both', animationDelay: '0.5s' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="subcategories" className="m-0">
            {subCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <div dir="ltr" style={{ width: '100%', height: '100%' }}>
                  <BarChart data={processedSubCategoryData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "currentColor" }} width={90} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      formatter={(value: number, name: string, props: any) => {
                        const payload = props.payload;
                        return [
                          <div key={name} className="flex flex-col gap-1 text-xs">
                            <span className="font-bold">{value.toLocaleString()} ج.م</span>
                            {payload.count && <span className="text-slate-500">{payload.count} عمليات</span>}
                            {payload.avg && <span className="text-slate-500">متوسط {payload.avg.toLocaleString()} ج</span>}
                          </div>, 
                          "التفاصيل"
                        ];
                      }} 
                      contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                      cursor={{ fill: "var(--tw-colors-slate-100)", opacity: 0.1 }}
                    />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={24}>
                      {processedSubCategoryData.slice(0, 10).map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getCategoryColor(entry.name, index)} 
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            setSelectedSubCategory(entry.name);
                            setSelectedCategory(null);
                            setIsModalOpen(true);
                          }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </div>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm space-y-2">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-full">
                  <span className="text-2xl">📊</span>
                </div>
                <p>سجل فئات فرعية عشان تشوف تفاصيل أكتر هنا</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="electronic" className="m-0 space-y-6">
            {electronicItems.length > 0 ? (
              <div className="space-y-6">
                {/* 1. Header with overall Electronic Cash Flow Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-indigo-50/60 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-950/40 border border-indigo-100/60 dark:border-indigo-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">إجمالي المنصرف الإلكتروني</span>
                    <span className="text-xl md:text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-2">
                      -{Object.values(electronicStats).reduce((sum, s) => sum + s.spent, 0).toLocaleString()} ج.م
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50/60 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-950/40 border border-emerald-100/60 dark:border-emerald-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">إجمالي الوارد الإلكتروني</span>
                    <span className="text-xl md:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-2">
                      +{Object.values(electronicStats).reduce((sum, s) => sum + s.received, 0).toLocaleString()} ج.م
                    </span>
                  </div>
                  <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-purple-50/60 to-purple-100/30 dark:from-purple-950/20 dark:to-purple-950/40 border border-purple-100/60 dark:border-purple-900/50 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">الحسابات الإلكترونية النشطة</span>
                    <span className="text-xl md:text-2xl font-bold text-purple-700 dark:text-purple-300 mt-2">
                      {Object.keys(electronicStats).length} حسابات
                    </span>
                  </div>
                </div>

                {/* 2. Donut Chart and Active Wallet Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Recharts Donut Chart */}
                  <div className="lg:col-span-5 bg-white dark:bg-slate-900/40 border rounded-2xl p-4 shadow-sm">
                    <h4 className="text-sm font-bold text-foreground mb-4 text-center">توزيع النفقات الإلكترونية حسب الحساب 📊</h4>
                    {donutData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%" cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="transparent"
                            animationDuration={1500}
                          >
                            {donutData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={getProviderMeta(entry.provider).brandColor} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: number, name: string) => [`${value.toLocaleString()} ج.م`, name]}
                            contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                          />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
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
                    <h4 className="text-sm font-bold text-foreground text-right mb-2">الحسابات والمحافظ الإلكترونية النشطة 💳</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.values(electronicStats).map((stat) => {
                        const providerInfo = getProviderMeta(stat.provider);
                        const isBalanceVisible = !!showBalances[stat.provider];
                        return (
                          <div
                            key={stat.provider}
                            className="bg-white/50 dark:bg-slate-900/30 backdrop-blur-md border border-slate-100 dark:border-slate-800/80 shadow-md rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg flex flex-col justify-between"
                            style={{ borderRight: `4px solid ${providerInfo.brandColor}` }}
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 mb-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{providerInfo.icon}</span>
                                <span className="font-bold text-sm text-foreground">{providerInfo.nameAr}</span>
                              </div>
                              <button
                                onClick={() => setShowBalances(prev => ({ ...prev, [stat.provider]: !prev[stat.provider] }))}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title={isBalanceVisible ? "إخفاء الرصيد" : "إظهار الرصيد"}
                              >
                                {isBalanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>

                            <div className="space-y-2 mb-4 text-right" dir="rtl">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground flex items-center gap-0.5"><ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" /> الوارد:</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{stat.received.toLocaleString()} ج.م</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground flex items-center gap-0.5"><ArrowUpRight className="w-3.5 h-3.5 text-rose-500" /> الصادر:</span>
                                <span className="font-semibold text-rose-600 dark:text-rose-400">-{stat.spent.toLocaleString()} ج.م</span>
                              </div>
                            </div>

                            <div className="mt-auto border-t border-slate-100 dark:border-slate-800/60 pt-3 flex items-center justify-between">
                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground block">آخر رصيد معروف</span>
                                <span className="text-sm font-bold text-foreground">
                                  {stat.lastBalance !== null ? (
                                    isBalanceVisible ? (
                                      `${stat.lastBalance.toLocaleString()} ج.م`
                                    ) : (
                                      "••••••"
                                    )
                                  ) : (
                                    "غير متوفر"
                                  )}
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
                  <h3 className="text-base font-bold text-foreground">مفيش معاملات إلكترونية لسه! 💳📱</h3>
                  <p className="text-xs max-w-sm leading-relaxed">
                    النظام جاهز تماماً لاستقبال وقراءة أي رسالة SMS بنكية أو إشعار فودافون كاش/انستا باي من تليفونك وتصنيفها تلقائياً بالمليم هنا!
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="hours" className="m-0">
            <ResponsiveContainer width="100%" height={320}>
              <div dir="ltr" style={{ width: '100%', height: '100%' }}>
                <BarChart data={hourTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(val) => `${val}:00`} tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value.toLocaleString()} ج.م`, "المبلغ"]} 
                    labelFormatter={(val) => `الساعة ${val}:00`} 
                    cursor={{ fill: "var(--tw-colors-slate-100)", opacity: 0.1 }} 
                    contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Bar dataKey="amount" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={24} />
                </BarChart>
              </div>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="trend" className="m-0">
            <ResponsiveContainer width="100%" height={320}>
              <div dir="ltr" style={{ width: '100%', height: '100%' }}>
                <LineChart data={dayTrend} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} ج.م`, 
                      name === 'amount' ? "المصروف" : "الدخل"
                    ]} 
                    contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    name="amount"
                    stroke="#f43f5e" 
                    strokeWidth={4} 
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} 
                    activeDot={{ r: 7, strokeWidth: 0, fill: "#f43f5e" }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="income" 
                    name="income"
                    stroke="#10b981" 
                    strokeWidth={4} 
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} 
                    activeDot={{ r: 7, strokeWidth: 0, fill: "#10b981" }} 
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" payload={[
                    { value: "الدخل", type: "circle", color: "#10b981" },
                    { value: "المصروف", type: "circle", color: "#f43f5e" }
                  ]} />
                </LineChart>
              </div>
            </ResponsiveContainer>
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              تفاصيل الفئة: {selectedCategory || selectedSubCategory}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {items
              .filter(i => i.type === "expense" && (selectedCategory ? i.category === selectedCategory : i.subCategory === selectedSubCategory))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{item.description || item.category}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(item.date), "dd MMM yyyy", { locale: ar })}</span>
                  </div>
                  <div className="font-bold whitespace-nowrap text-red-500">
                    {Number(item.amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ج.م
                  </div>
                </div>
            ))}
            {items.filter(i => i.type === "expense" && (selectedCategory ? i.category === selectedCategory : i.subCategory === selectedSubCategory)).length === 0 && (
              <p className="text-center text-muted-foreground py-8">لا يوجد تفاصيل إضافية</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Specific Transactions Modal */}
      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <span>{selectedProviderWallet ? getProviderMeta(selectedProviderWallet).icon : "💳"}</span>
              <span>معاملات: {selectedProviderWallet ? getProviderMeta(selectedProviderWallet).nameAr : "الحساب البنكي"}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {selectedProviderWallet && electronicStats[selectedProviderWallet]?.transactions.map((item, idx) => {
              const date = new Date(item.date);
              const isIncome = item.type === "income";
              return (
                <div key={idx} className="border rounded-xl p-3 bg-white dark:bg-slate-900/40 shadow-sm flex items-center justify-between gap-3 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <span className="font-semibold text-sm block text-foreground">{item.description || item.category}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                      <Badge className="py-0 px-1.5 text-[9px] border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.category}</Badge>
                      <span>{date.toLocaleDateString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("font-bold text-base", isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                      {isIncome ? "+" : "-"}
                      {Number(item.amount).toLocaleString("ar-EG")} ج.م
                    </span>
                    {typeof item.parsedMetadata?.balance_after === "number" && (
                      <span className="text-[10px] text-muted-foreground">الرصيد: {item.parsedMetadata.balance_after.toLocaleString("ar-EG")}ج</span>
                    )}
                  </div>
                </div>
              );
            })}
            {selectedProviderWallet && electronicStats[selectedProviderWallet]?.transactions.length === 0 && (
              <p className="text-center text-muted-foreground py-8">لا توجد معاملات مسجلة</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
