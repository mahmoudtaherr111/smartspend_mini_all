import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Smartphone,
  RefreshCw,
  Check,
  Download,
  Bell,
  Link2,
  ChevronRight,
  Shield,
  Zap,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/providers/trpc";

interface Props {
  onBack: () => void;
}

// APK served directly from our own server (public/downloads/)
const APK_URL = "/downloads/smartspend-sync.apk";

export function AndroidSetupFlow({ onBack }: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deepLinkFired, setDeepLinkFired] = useState(false);

  const tokenQuery = trpc.profile.getWebhookToken.useQuery();
  const hasLoaded = !tokenQuery.isLoading;

  // ── Step 1: Download APK ──────────────────────────────────────────────────
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = APK_URL;
    a.download = "SmartSpend-Sync.apk";
    a.click();
    toast.info("🚀 جاري تحميل التطبيق…", {
      description: "بعد التثبيت، ارجع هنا واضغط 'ربط التطبيق'.",
      duration: 7000,
    });
  };

  // ── Step 2: Connect via backend deep-link ─────────────────────────────────
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // Ask the backend for the signed deep link (token auto-created if missing)
      const res = await fetch("/api/sms/android-connect", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || ""}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "فشل الاتصال بالسيرفر");
      }

      const data: { deepLink: string; ingestUrl: string } = await res.json();

      // Fire the deep link — opens the installed APK automatically
      window.location.href = data.deepLink;
      setDeepLinkFired(true);

      // After 2.5s (if user is still on page = app likely not installed yet)
      setTimeout(() => {
        setIsConnecting(false);
        setConnected(true);
        toast.success("✅ تم إرسال بيانات الربط للتطبيق!", {
          description: "افتح التطبيق وفعّل صلاحية الإشعارات لتكتمل العملية.",
          duration: 9000,
        });
      }, 2500);
    } catch (err: any) {
      setIsConnecting(false);
      toast.error(err?.message || "حدث خطأ. تأكد من تسجيل الدخول.", {
        duration: 6000,
      });
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-20 px-4">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 end-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white transition-colors mb-2"
          >
            <ChevronRight className="w-4 h-4" /> تغيير الجهاز
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 shadow-inner">
              <Smartphone className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">ربط الأندرويد</h1>
              <p className="text-emerald-200 text-sm mt-0.5">
                3 خطوات — كل شيء تلقائي بعدها 🚀
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Steps Card ── */}
      <Card className="border-0 shadow-lg bg-white dark:bg-slate-900 overflow-hidden">
        <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
          {/* ── STEP 1: Download APK ── */}
          <div className="p-6 sm:p-8 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                <Download className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                    الخطوة 1
                  </span>
                  <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">
                    حمّل تطبيق SmartSpend Sync
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  تطبيق صغير جداً — وظيفته الوحيدة إرسال إشعارات البنك لحسابك
                  تلقائياً. لا يحتاج أي بيانات بنكية.
                </p>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { i: Shield, t: "آمن 100%" },
                    { i: Zap, t: "5 MB فقط" },
                    { i: CheckCircle2, t: "بدون إعلانات" },
                  ].map(({ i: Icon, t }) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm"
                    >
                      <Icon className="w-3.5 h-3.5 text-emerald-500" />
                      {t}
                    </span>
                  ))}
                </div>

                <Button
                  id="android-download-apk"
                  onClick={handleDownload}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 h-12 px-6 font-bold text-base"
                >
                  <Download className="w-5 h-5 ms-2" /> تحميل SmartSpend Sync
                </Button>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong>💡 بعد التحميل:</strong> لو ظهرت رسالة "مصادر غير
                    معروفة" — اضغط <strong>الإعدادات</strong>، فعّل الخيار، ثم
                    ارجع وثبّت التطبيق. هذا طبيعي جداً.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── STEP 2: Connect (Deep Link) ── */}
          <div className="p-6 sm:p-8 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                    الخطوة 2
                  </span>
                  <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">
                    اربط التطبيق بحسابك
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  اضغط الزر — سيفتح التطبيق تلقائياً ويتعرّف على حسابك.{" "}
                  <strong>لا نسخ ولا لصق على الإطلاق.</strong>
                </p>

                <Button
                  id="android-connect-btn"
                  onClick={handleConnect}
                  disabled={isConnecting || !hasLoaded}
                  className={`h-12 px-6 font-bold text-base shadow-lg transition-all ${
                    connected
                      ? "bg-emerald-500 hover:bg-emerald-500 text-white shadow-emerald-500/25 cursor-default"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-emerald-500/25"
                  }`}
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-5 h-5 ms-2 animate-spin" /> جاري
                      الفتح…
                    </>
                  ) : connected ? (
                    <>
                      <Check className="w-5 h-5 ms-2" /> تم الربط ✅
                    </>
                  ) : (
                    <>
                      <Link2 className="w-5 h-5 ms-2" /> ربط التطبيق بحسابي
                    </>
                  )}
                </Button>

                {connected && (
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                      ✅ تم! التطبيق استلم بياناتك. الآن أكمل الخطوة الأخيرة
                      لتفعيل الإشعارات.
                    </p>
                  </div>
                )}

                {deepLinkFired && !connected && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    لو التطبيق ما فتحش تلقائياً → تأكد من تثبيته أولاً ثم اضغط
                    الزر مرة ثانية.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── STEP 3: Notification Permission ── */}
          <div className="p-6 sm:p-8 bg-purple-50/50 dark:bg-purple-950/20">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/30">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-purple-600 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
                    الخطوة 3
                  </span>
                  <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">
                    فعّل قراءة الإشعارات
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  التطبيق يطلب صلاحية واحدة فقط:{" "}
                  <strong>قراءة الإشعارات</strong>. اضغط موافق — وانتهى كل شيء!
                </p>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    داخل التطبيق خطوة بخطوة
                  </p>
                  {[
                    "يفتح التطبيق شاشة تطلب منك تفعيل الإشعارات",
                    "اضغط على «السماح بالوصول للإشعارات»",
                    "ابحث عن SmartSpend Sync وفعّل المفتاح",
                    "ارجع للتطبيق — ستجد مؤشراً أخضر «متصل» ✅",
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {s}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Done Banner ── */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white flex items-center gap-4 shadow-lg shadow-emerald-500/20">
        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div>
          <h3 className="font-extrabold text-lg">🎉 بعد الخطوات الثلاث:</h3>
          <p className="text-emerald-100 text-sm mt-1 leading-relaxed">
            كل رسالة من CIB، NBE، InstaPay، Vodafone Cash أو أي بنك مصري
            ستُسجَّل تلقائياً في SmartSpend — حتى لو الشاشة مقفولة!
          </p>
        </div>
      </div>

      {/* ── Supported Banks ── */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-500 text-center mb-3 uppercase tracking-widest">
          البنوك والمحافظ المدعومة
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold">
          {[
            "CIB",
            "NBE",
            "Banque Misr",
            "QNB",
            "HSBC",
            "Alex Bank",
            "Faisal Bank",
            "Arab Bank",
            "InstaPay",
            "Vodafone Cash",
            "Orange Money",
            "Fawry",
            "Etisalat Cash",
          ].map((p) => (
            <span
              key={p}
              className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
