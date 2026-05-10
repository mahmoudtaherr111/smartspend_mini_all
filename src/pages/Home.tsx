import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Mic, Send, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState("record");

  // Mock data for demo
  const stats = {
    totalExpense: 3250,
    totalIncome: 5000,
    netBalance: 1750,
    dailyAverage: 108,
  };

  const handleParse = () => {
    if (!text.trim()) {
      toast.error("اكتب حاجة الأول!");
      return;
    }
    toast.success("تم التحليل! (Demo mode)");
    setText("");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">أهلاً، {user?.name} 👋</h1>
          <p className="text-muted-foreground text-sm">إليك ملخص يومك</p>
        </div>
        <div className="flex gap-2">
          <Card className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
              <span className="font-bold">{stats.totalIncome} ج</span>
            </div>
          </Card>
          <Card className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border-red-200">
            <div className="flex items-center gap-2 text-red-600">
              <TrendingDown className="w-4 h-4" />
              <span className="font-bold">{stats.totalExpense} ج</span>
            </div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12">
          <TabsTrigger value="record">تسجيل</TabsTrigger>
          <TabsTrigger value="stats">إحصائيات</TabsTrigger>
          <TabsTrigger value="ai">تحليل AI</TabsTrigger>
          <TabsTrigger value="yearly">سنوي</TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="space-y-4 mt-4">
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-500" />
                سجل مصروفك بالعامية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="مثال: خدت 500 جنيه مرتب وصرفت 200 أكل و50 مواصلات"
                  className="h-14 pr-12 text-lg"
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onMouseDown={() => setIsRecording(true)}
                  onMouseUp={() => setIsRecording(false)}
                  onTouchStart={() => setIsRecording(true)}
                  onTouchEnd={() => setIsRecording(false)}
                >
                  <Mic className={cn("w-5 h-5", isRecording ? "text-red-500 animate-pulse" : "text-gray-400")} />
                </button>
              </div>
              <Button 
                onClick={handleParse}
                className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg"
              >
                <Send className="w-4 h-4 mr-2" />
                حلل المصروفات
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                اضغط مطولاً على المايك للتسجيل الصوتي
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>إحصائيات الشهر</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "إجمالي الدخل", value: stats.totalIncome, color: "text-emerald-600" },
                  { label: "إجمالي الصرف", value: stats.totalExpense, color: "text-red-600" },
                  { label: "الرصيد", value: stats.netBalance, color: "text-blue-600" },
                  { label: "متوسط يومي", value: stats.dailyAverage, color: "text-amber-600" },
                ].map((item) => (
                  <div key={item.label} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
                    <p className={`text-2xl font-bold ${item.color}`}>{item.value} ج</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>تحليل الذكاء الاصطناعي</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                <p className="text-lg leading-relaxed">
                  📊 <strong>ملخص الشهر:</strong> صرفك الشهر ده أقل من الشهر اللي فات بـ 15%. ده كويس جداً! 
                  <br /><br />
                  💡 <strong>نصيحة:</strong> حاول توفر 20% من دخلك كل شهر. لو كملت كده هتوفر 4200 جنيه في السنة!
                  <br /><br />
                  ⚠️ <strong>تنبيه:</strong> صرفك على الأكل زاد شوية. ممكن تجرب تطبخ في البيت أكتر؟
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yearly" className="mt-4">
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>إحصائيات السنة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">هيتم إضافة الرسوم البيانية في المرحلة التالية</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
