import { useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ExpenseChartProps {
  categoryData: any[];
  subCategoryData?: any[];
  hourTrend?: any[];
  dayOfWeekTrend?: any[];
  dayTrend?: any[];
  items?: any[];
}

const COLORS = [
  "#10b981", // emerald-500
  "#3b82f6", // blue-500
  "#f43f5e", // rose-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
  "#6366f1", // indigo-500
  "#94a3b8", // slate-400 (for others)
];

export function ExpenseChart({ categoryData, subCategoryData = [], hourTrend = [], dayOfWeekTrend = [], dayTrend = [], items = [] }: ExpenseChartProps) {
  const [activeTab, setActiveTab] = useState("categories");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all">الفئات</TabsTrigger>
          <TabsTrigger value="subcategories" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all">التفاصيل</TabsTrigger>
          <TabsTrigger value="days" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all">الأيام</TabsTrigger>
          <TabsTrigger value="hours" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all">الوقت</TabsTrigger>
          <TabsTrigger value="trend" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm transition-all">الدخل والمصروف</TabsTrigger>
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
                >
                  {processedCategoryData.map((entry, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.name === "أخرى" ? COLORS[9] : COLORS[index % (COLORS.length - 1)]} 
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
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
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
                          fill={COLORS[index % (COLORS.length - 1)]} 
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

          <TabsContent value="days" className="m-0">
            <ResponsiveContainer width="100%" height={320}>
              <div dir="ltr" style={{ width: '100%', height: '100%' }}>
                <BarChart data={dayOfWeekTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: "currentColor" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value.toLocaleString()} ج.م`, "المبلغ"]} 
                    cursor={{ fill: "var(--tw-colors-slate-100)", opacity: 0.1 }} 
                    contentStyle={{ direction: "rtl", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} 
                  />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={32} />
                </BarChart>
              </div>
            </ResponsiveContainer>
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
    </div>
  );
}
