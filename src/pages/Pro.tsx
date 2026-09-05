import { useState } from "react";
import { Link } from "react-router-dom";
import { usePro } from "../hooks/usePro";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Zap,
  Infinity as InfinityIcon,
  Download,
  Headphones,
  Sparkles,
  Check,
  X,
  Gift,
  Share2,
  Copy,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Pro() {
  const { myPlan, upgrade, cancel, checkout } = usePro();
  const [copied, setCopied] = useState(false);

  const referral = trpc.referral.myCode.useQuery();
  const applyCode = trpc.referral.applyCode.useMutation({
    onSuccess: () => toast.success("تم تطبيق الكود بنجاح! ✅"),
    onError: (e) => toast.error(e.message || "مش قادرين نطبق الكود ❌"),
  });
  const [inputCode, setInputCode] = useState("");

  const plan = myPlan.data;
  const tier = plan?.plan ?? "free";
  const isPaid = tier === "pro" || tier === "ultra";
  const isProTier = tier === "pro";
  const isUltraTier = tier === "ultra";
  const referralDiscount = referral.data?.discount;

  const features = [
    {
      icon: <InfinityIcon className="w-5 h-5" />,
      title: "المساعد الذكي",
      free: "10 طلبات/يوم",
      paidTitle: "استخدام AI غير محدود",
      pro: true,
    },
    {
      icon: <Download className="w-5 h-5" />,
      title: "تصدير Excel & CSV",
      free: false,
      pro: true,
      paidTitle: undefined,
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "تحليلات متقدمة",
      free: false,
      pro: true,
      paidTitle: undefined,
    },
    {
      icon: <Headphones className="w-5 h-5" />,
      title: "دعم أولوي",
      free: false,
      pro: true,
      paidTitle: undefined,
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "بدون إعلانات",
      free: false,
      pro: true,
      paidTitle: undefined,
    },
    {
      icon: <Crown className="w-5 h-5" />,
      title: "تبديل نماذج AI",
      free: false,
      pro: true,
    },
  ];

  const handleCopy = () => {
    if (referral.data?.code) {
      navigator.clipboard.writeText(referral.data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("تم نسخ الكود! ✅");
    }
  };

  const startCheckout = () => {
    checkout.mutate(
      { plan: "pro_monthly" },
      {
        onSuccess: (d) => {
          if (d.mode === "redirect" && d.redirectUrl) {
            window.location.href = d.redirectUrl;
            return;
          }
          if (d.mode === "unavailable") {
            toast.error(
              "الدفع الإلكتروني غير مفعّل على السيرفر. تواصل مع الدعم أو انتظر تفعيل Paymob.",
            );
            return;
          }
          upgrade.mutate(
            {
              plan: "pro_monthly",
              paymentMethod: "simulate",
              transactionId: "demo_" + Date.now(),
            },
            {
              onSuccess: () => {
                toast.success("تم تفعيل البرو بنجاح ✅");
                void myPlan.refetch();
              },
              onError: (e) =>
                toast.error(e.message || "حصلت مشكلة في الترقية ❌"),
            },
          );
        },
        onError: (e) => toast.error(e.message || "مش قادرين نبدأ الدفع ❌"),
      },
    );
  };

  const sub = plan?.subscription;
  const subEnd = sub?.endDate
    ? new Date(sub.endDate as string | Date).toLocaleDateString("ar-EG")
    : null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/pro" title="الخطط - SmartSpend AI" />

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4">
            {isPaid ? "خطتك ومزايا الاشتراك" : "اختار خطتك"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            حول تجربتك المالية للمستوى اللي بعده
          </p>
        </div>

        {isPaid && (
          <Card className="mb-8 gap-0 border-emerald-200 bg-emerald-50/80 py-0 dark:bg-emerald-950/30">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                  خطة {isUltraTier ? "Ultra" : "Pro"} مفعلة
                </p>
                <p className="text-sm text-muted-foreground">
                  {sub
                    ? `الحالة: ${sub.status === "active" ? "فعّال" : sub.status} — ينتهي: ${subEnd || "—"}`
                    : "مفعلة على حسابك وتشمل مزايا الخطة الأساسية"}
                </p>
              </div>
              <Badge className="w-fit bg-emerald-600">
                {isUltraTier ? "ULTRA" : "PRO"}
              </Badge>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-5 mb-10 md:grid-cols-3 md:gap-8 md:mb-12">
          <Card
            className={`relative ${isPaid ? "order-3" : "order-1"} md:order-1 ${!isPaid ? "border-primary ring-2 ring-primary/20" : ""}`}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-500" /> مجاني
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-6">
                0 ج.م
                <span className="text-sm text-muted-foreground font-normal">
                  /شهر
                </span>
              </p>
              <ul className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    {f.free ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-muted-foreground">{f.title}</span>
                    {typeof f.free === "string" && (
                      <Badge variant="secondary" className="me-auto">
                        {f.free}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              {!isPaid ? (
                <Button className="w-full" variant="outline" disabled>
                  خطتك الحالية
                </Button>
              ) : isUltraTier ? (
                <Button className="w-full" variant="outline" disabled>
                  الخطة الأساسية مشمولة
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => cancel.mutate()}
                >
                  إلغاء البرو
                </Button>
              )}
            </CardContent>
          </Card>

          <Card
            className={`relative ${isProTier ? "order-1" : "order-2"} md:order-2 ${isProTier ? "border-primary ring-2 ring-primary/20" : "border-yellow-500/50"}`}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold">
                <Crown className="w-3 h-3 ms-1" /> الأفضل قيمة
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-6 h-6 text-yellow-500" /> SmartSpend Pro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-6">
                99 ج.م
                <span className="text-sm text-muted-foreground font-normal">
                  /شهر
                </span>
              </p>
              <ul className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{f.paidTitle || f.title}</span>
                  </li>
                ))}
              </ul>
              {isUltraTier ? (
                <Button className="w-full" variant="outline" asChild>
                  <Link to="/ultra">ادخل مساحة ألترا</Link>
                </Button>
              ) : isProTier ? (
                <Button className="w-full" variant="outline" disabled>
                  <CheckCircle className="w-4 h-4 ms-2" /> مشترك حالياً
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400"
                  disabled={checkout.isPending || upgrade.isPending}
                  onClick={startCheckout}
                >
                  <Crown className="w-4 h-4 ms-2" />{" "}
                  {checkout.isPending || upgrade.isPending
                    ? "جاري المعالجة..."
                    : "اشترك دلوقتي"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Ultra Card */}
          <Card
            className={`relative ${isUltraTier ? "order-1" : "order-3"} md:order-3 ${isUltraTier ? "border-primary ring-2 ring-primary/20 bg-slate-950 text-white" : "border-slate-800 bg-slate-900 text-white"}`}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold">
                <Sparkles className="w-3 h-3 ms-1" /> أقصى أداء
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-cyan-400" /> Ultra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-6">
                250 ج.م
                <span className="text-sm text-slate-400 font-normal">/شهر</span>
              </p>
              <ul className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-cyan-400" />
                    <span>{f.paidTitle || f.title}</span>
                  </li>
                ))}
                <li className="flex items-center gap-3 text-sm text-cyan-300 font-medium">
                  <Check className="w-4 h-4 text-cyan-400" />
                  <span>دعم كامل لعائلتك</span>
                </li>
              </ul>
              {isUltraTier ? (
                <Button
                  className="w-full bg-slate-800 text-white hover:bg-slate-700"
                  disabled
                >
                  <CheckCircle className="w-4 h-4 ms-2" /> مشترك حالياً
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500"
                  asChild
                >
                  <Link to="/ultra">
                    <Sparkles className="w-4 h-4 ms-2" />
                    ترقية إلى Ultra
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

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
                  <code className="bg-muted px-4 py-2 rounded-lg font-mono text-lg">
                    {referral.data?.code || "..."}
                  </code>
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      if (referral.data?.code) {
                        void navigator.share({
                          title: "SmartSpend AI",
                          text:
                            referralDiscount != null
                              ? `استخدم كود ${referral.data.code} للحصول على خصم ${referralDiscount}% في SmartSpend!`
                              : `استخدم كود ${referral.data.code} في SmartSpend!`,
                        });
                      }
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  دعوة {referral.data?.completed ?? 0} من{" "}
                  {referral.data?.totalReferrals ?? 0} صديق
                  {referralDiscount != null && (
                    <span className="block mt-1 text-emerald-500 font-medium">
                      كودك يمنح خصم {referralDiscount}% لأصدقائك!
                    </span>
                  )}
                </p>
              </div>
              <div className="flex-1 w-full">
                <p className="text-sm text-muted-foreground mb-2">
                  {referralDiscount != null
                    ? `عندك كود إحالة؟ (احصل على خصم ${referralDiscount}%)`
                    : "عندك كود إحالة؟"}
                </p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background"
                    placeholder="اكتب الكود هنا"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                  />
                  <Button
                    onClick={() => applyCode.mutate({ code: inputCode })}
                    disabled={!inputCode}
                  >
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
