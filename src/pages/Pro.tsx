import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePro } from "../hooks/usePro";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Crown, Zap, Infinity, Download, Headphones, Sparkles, 
  Check, X, Gift, Share2, Copy, CheckCircle 
} from "lucide-react";
import { toast } from "sonner";

export default function Pro() {
  const { user } = useAuth();
  const { myPlan, upgrade, cancel } = usePro();
  const [copied, setCopied] = useState(false);

  const referral = trpc.referral.myCode.useQuery();
  const applyCode = trpc.referral.applyCode.useMutation({
    onSuccess: () => toast.success("تم تطبيق الكود بنجاح!"),
    onError: (e) => toast.error(e.message),
  });
  const [inputCode, setInputCode] = useState("");

  const plan = myPlan.data;
  const isPro = plan?.plan === "pro";

  const features = [
    { icon: <Infinity className="w-5 h-5" />, title: "طلبات AI غير محدودة", free: "10/يوم", pro: true },
    { icon: <Download className="w-5 h-5" />, title: "تصدير Excel & CSV", free: false, pro: true },
    { icon: <Sparkles className="w-5 h-5" />, title: "تحليلات متقدمة", free: false, pro: true },
    { icon: <Headphones className="w-5 h-5" />, title: "دعم أولوي", free: false, pro: true },
    { icon: <Zap className="w-5 h-5" />, title: "بدون إعلانات", free: false, pro: true },
    { icon: <Crown className="w-5 h-5" />, title: "تبديل نماذج AI", free: false, pro: true },
  ];

  const handleCopy = () => {
    if (referral.data?.code) {
      navigator.clipboard.writeText(referral.data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("تم نسخ الكود!");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/pro" title="الخطط - SmartSpend AI" />

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">اختار خطتك</h1>
          <p className="text-muted-foreground text-lg">حول تجربتك المالية للمستوى اللي بعده</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Free Plan */}
          <Card className={`relative ${!isPro ? "border-primary ring-2 ring-primary/20" : ""}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-500" /> مجاني
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-6">0 ج.م<span className="text-sm text-muted- font-normal">/شهر</span></p>
              <ul className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    {f.free ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-400" />}
                    <span className="text-muted-foreground">{f.title}</span>
                    {typeof f.free === "string" && <Badge variant="secondary" className="mr-auto">{f.free}</Badge>}
                  </li>
                ))}
              </ul>
              {!isPro ? (
                <Button className="w-full" variant="outline" disabled>خطتك الحالية</Button>
              ) : (
                <Button className="w-full" variant="outline" onClick={() => cancel.mutate()}>إلغاء البرو</Button>
              )}
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className={`relative ${isPro ? "border-primary ring-2 ring-primary/20" : "border-yellow-500/50"}`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold">
                <Crown className="w-3 h-3 ml-1" /> الأفضل قيمة
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-6 h-6 text-yellow-500" /> برو
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-6">99 ج.م<span className="text-sm text-muted-foreground font-normal">/شهر</span></p>
              <ul className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{f.title}</span>
                  </li>
                ))}
              </ul>
              {isPro ? (
                <Button className="w-full" variant="outline" disabled>
                  <CheckCircle className="w-4 h-4 ml-2" /> مشترك حالياً
                </Button>
              ) : (
                <Button className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400"
                  onClick={() => upgrade.mutate({ plan: "pro_monthly", paymentMethod: "vodafone_cash", transactionId: "demo_" + Date.now() })}>
                  <Crown className="w-4 h-4 ml-2" /> اشترك دلوقتي
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Referral Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-pink-500" /> كود الإحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">كودك:</p>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-4 py-2 rounded-lg font-mono text-lg">{referral.data?.code || "..."}</code>
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => {
                    if (referral.data?.code) {
                      navigator.share({ title: "SmartSpend AI", text: `استخدم كود ${referral.data.code} في SmartSpend!` });
                    }
                  }}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  دعوة {referral.data?.completed ?? 0} من {referral.data?.totalReferrals ?? 0} صديق
                </p>
              </div>
              <div className="flex-1 w-full">
                <p className="text-sm text-muted-foreground mb-2">عندك كود إحالة؟</p>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    placeholder="اكتب الكود هنا"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                  />
                  <Button onClick={() => applyCode.mutate({ code: inputCode })} disabled={!inputCode}>
                    تطبيق
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
