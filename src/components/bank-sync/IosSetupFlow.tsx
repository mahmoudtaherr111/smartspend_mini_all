import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Smartphone,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  Save,
  MessageSquareText,
  Check,
  AlertCircle,
  KeyRound,
  ArrowRight,
  Clock,
  PlayCircle,
  ChevronRight,
  Apple,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { arEG } from "date-fns/locale";

const SHORTCUT_ICLOUD_LINK =
  "https://www.icloud.com/shortcuts/9a210238a50b48ddac17a8d546878927";

interface Props {
  onBack: () => void;
}

export function IosSetupFlow({ onBack }: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResetAt, setLastResetAt] = useState(0);
  const [keyword, setKeyword] = useState("EGP");
  const [isSavingKeyword, setIsSavingKeyword] = useState(false);

  const tokenQuery = trpc.profile.getWebhookToken.useQuery();
  const token = tokenQuery.data?.token || null;
  const hasLoaded = !tokenQuery.isLoading;

  const profileQuery = trpc.profile.getSmartProfile.useQuery(undefined, {
    staleTime: Infinity,
  });
  const logsQuery = trpc.profile.getSmsLogs.useQuery(undefined, {
    enabled: !!token,
    refetchInterval: 10000,
  });

  const updateProfileMutation = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الكلمة!");
      profileQuery.refetch();
    },
    onError: () => toast.error("حدث خطأ أثناء الحفظ."),
  });
  const generateTokenMutation = trpc.profile.generateWebhookToken.useMutation({
    onSuccess: () => tokenQuery.refetch(),
    onError: () => toast.error("فيه مشكلة في إنشاء الـ Token."),
  });

  useEffect(() => {
    const kw = profileQuery.data?.preferences?.smsTriggerKeyword;
    if (kw && typeof kw === "string") setKeyword(kw);
  }, [profileQuery.data]);

  const handleConnectIphone = async () => {
    setIsConnecting(true);
    try {
      let currentToken = token;
      if (!currentToken) {
        const res = await generateTokenMutation.mutateAsync();
        currentToken = res.token;
        await tokenQuery.refetch();
      }
      const configString = `${window.location.origin}/api/sms/ingest?token=${currentToken}`;
      await navigator.clipboard.writeText(configString);
      toast.success("✅ تم نسخ الإعدادات!", {
        description:
          "سيتم فتح تطبيق Shortcuts الآن، الصق الإعدادات عندما يُطلب منك.",
        duration: 8000,
      });
      setTimeout(() => {
        window.location.href = SHORTCUT_ICLOUD_LINK;
      }, 800);
    } catch {
      toast.error("يرجى إعطاء صلاحية النسخ للمتصفح");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success("تم نسخ الـ Token!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateToken = async () => {
    const now = Date.now();
    if (now - lastResetAt < 60000) {
      toast.error("انتظر دقيقة قبل طلب Token جديد.");
      return;
    }
    setIsGenerating(true);
    await generateTokenMutation.mutateAsync();
    setLastResetAt(now);
    toast.success("تم إنشاء Token جديد!");
    setIsGenerating(false);
  };

  const maskedToken = token
    ? token.slice(0, 12) +
      "•".repeat(Math.max(0, token.length - 16)) +
      token.slice(-4)
    : null;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-20 px-4">
      {/* Back + Header */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 end-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors mb-2"
          >
            <ChevronRight className="w-4 h-4" /> تغيير الجهاز
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <Apple className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">ربط الآيفون (iOS)</h1>
              <p className="text-slate-300 text-sm">
                3 خطوات بسيطة — مرة واحدة فقط
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-lg bg-white dark:bg-slate-900 overflow-hidden">
        <CardContent className="p-0">
          {/* Step 1 */}
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-bold text-lg">الرمز السري (Token)</h3>
                  <p className="text-xs text-muted-foreground">
                    رمز الربط الخاص بحسابك
                  </p>
                </div>
              </div>
              <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border flex flex-col sm:flex-row gap-3 items-center">
                <div className="flex-1 w-full flex items-center justify-between font-mono text-sm bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border shadow-sm overflow-hidden">
                  <span className="truncate ms-2 select-all">
                    {!hasLoaded
                      ? "جاري التحميل..."
                      : tokenVisible
                        ? token
                        : maskedToken || "لا يوجد Token"}
                  </span>
                  <div className="flex items-center shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setTokenVisible(!tokenVisible)}
                      className="h-7 w-7 text-slate-400"
                    >
                      {tokenVisible ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant={copied ? "default" : "ghost"}
                      onClick={handleCopyToken}
                      className={`h-7 w-7 ${copied ? "bg-emerald-500 text-white" : "text-slate-400"}`}
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateToken}
                  disabled={isGenerating || !hasLoaded}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto shrink-0 border-dashed"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ms-2 ${isGenerating ? "animate-spin" : ""}`}
                  />{" "}
                  تحديث الرمز
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-bold text-lg">تثبيت الاختصار</h3>
                  <p className="text-xs text-muted-foreground">
                    زر واحد لتجهيز كل شيء
                  </p>
                </div>
              </div>
              <div className="flex-1 w-full flex flex-col gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  اضغط الزر. سيتم نسخ رابط الإعدادات وفتح تطبيق{" "}
                  <strong>Shortcuts</strong>. اضغط{" "}
                  <strong>Set Up Shortcut</strong> ثم الصق ما نسخته.
                </p>
                <Button
                  onClick={handleConnectIphone}
                  disabled={isConnecting || !hasLoaded}
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg h-12 text-base font-bold"
                >
                  {isConnecting ? (
                    <RefreshCw className="w-5 h-5 ms-2 animate-spin" />
                  ) : (
                    <Smartphone className="w-5 h-5 ms-2" />
                  )}
                  Connect iPhone
                </Button>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 font-bold">
                3
              </div>
              <h3 className="font-bold text-lg">تشغيل التتبع الآلي</h3>
            </div>
            <div className="pe-11 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 max-w-md bg-white dark:bg-slate-950 p-4 rounded-xl border shadow-sm">
                <div className="flex-1 w-full space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    الكلمة المميزة لرسالة البنك
                  </label>
                  <p className="text-[10px] text-muted-foreground pb-1">
                    الكلمة التي تأتي في كل رسائل البنك (مثل: EGP)
                  </p>
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="EGP"
                    className="h-10 text-center font-bold tracking-widest bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <Button
                  onClick={async () => {
                    setIsSavingKeyword(true);
                    await updateProfileMutation.mutateAsync({
                      preferences: {
                        ...(profileQuery.data?.preferences || {}),
                        smsTriggerKeyword: keyword.trim(),
                      },
                    });
                    setIsSavingKeyword(false);
                  }}
                  disabled={isSavingKeyword || !keyword.trim()}
                  className="h-10 w-full sm:w-auto"
                >
                  {isSavingKeyword ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 ms-2" />
                  )}{" "}
                  حفظ الكلمة
                </Button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border relative overflow-hidden">
                <div className="absolute start-0 top-0 w-1 h-full bg-emerald-400" />
                <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside font-medium leading-relaxed">
                  <li>
                    افتح <strong>Shortcuts</strong> → تبويب{" "}
                    <strong>Automation</strong>
                  </li>
                  <li>
                    اضغط <strong>(+)</strong> واختر <strong>Message</strong>
                  </li>
                  <li>
                    اختر <strong>Run Immediately</strong>
                  </li>
                  <li>
                    في <strong>Message Contains</strong> اكتب:{" "}
                    <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 font-bold mx-1">
                      {keyword || "EGP"}
                    </span>
                  </li>
                  <li>
                    اضغط <strong>Next</strong> واختر اختصار{" "}
                    <strong>SmartSpend SMS</strong>
                  </li>
                </ol>
                <div className="mt-5 flex items-center gap-3 text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100/50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                  <div className="bg-emerald-500 text-white p-1.5 rounded-full shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  وبس كده! كل رسائلك البنكية ستُسجل تلقائياً 🎉
                </div>
                <div className="mt-4 text-center">
                  <a
                    href="#"
                    className="inline-flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400 font-semibold bg-sky-50 dark:bg-sky-900/20 px-4 py-2.5 rounded-full hover:bg-sky-100 transition-colors"
                  >
                    <PlayCircle className="w-5 h-5" /> فيديو توضيحي
                  </a>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      {token && (
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                سجل الرسائل الأخيرة
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => logsQuery.refetch()}
              disabled={logsQuery.isFetching}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ms-1.5 ${logsQuery.isFetching ? "animate-spin" : ""}`}
              />{" "}
              تحديث
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden">
            {logsQuery.isLoading ? (
              <div className="p-8 flex justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logsQuery.data?.length ? (
              <div className="p-8 text-center flex flex-col items-center gap-3 text-muted-foreground">
                <MessageSquareText className="w-8 h-8 opacity-30" />
                <p className="text-sm font-semibold">لا توجد رسائل بعد</p>
                <p className="text-xs opacity-70">
                  ستظهر رسائلك هنا بعد التفعيل.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[400px] overflow-auto">
                {logsQuery.data.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 text-sm flex gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="mt-1 shrink-0">
                      {log.status === "processed" ? (
                        <div className="bg-emerald-100 text-emerald-600 rounded-full p-1.5">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : log.status === "ignored" ? (
                        <div className="bg-amber-100 text-amber-600 rounded-full p-1.5">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="bg-slate-100 text-slate-500 rounded-full p-1.5">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex justify-between gap-2">
                        <p className="font-bold text-sm truncate">
                          {log.sender || "مرسل غير معروف"}
                        </p>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                          {format(
                            new Date(String(log.smsTimestamp || log.createdAt)),
                            "dd MMM, hh:mm a",
                            { locale: arEG },
                          )}
                        </span>
                      </div>
                      <p
                        className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2"
                        dir="auto"
                      >
                        {log.message}
                      </p>
                      {log.status === "processed" && (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                          تم التسجيل{" "}
                          {(log.metadata as any)?.amount
                            ? `(${(log.metadata as any).amount} EGP)`
                            : ""}
                        </span>
                      )}
                      {log.status === "ignored" && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 border border-slate-200">
                          تم التجاهل (
                          {(log.metadata as any)?.reason === "not_financial"
                            ? "ليست مالية"
                            : "غير مفهومة"}
                          )
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
