import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Smartphone, Copy, RefreshCw, Eye, EyeOff, CheckCircle, Info, Download, Zap, Link as LinkIcon, Save, MessageSquareText, Check, AlertCircle } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { arEG } from "date-fns/locale";

export function SmsWebhookSettings() {
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Keyword state
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
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const updateProfileMutation = trpc.profile.updateSmartProfile.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الكلمة المميزة بنجاح!");
      profileQuery.refetch();
    },
    onError: () => {
      toast.error("حدث خطأ أثناء الحفظ.");
    }
  });

  // Sync keyword from profile
  useEffect(() => {
    if (profileQuery.data?.preferences?.smsTriggerKeyword) {
      setKeyword(profileQuery.data.preferences.smsTriggerKeyword);
    }
  }, [profileQuery.data]);

  const handleSaveKeyword = async () => {
    if (!keyword.trim()) return;
    setIsSavingKeyword(true);
    await updateProfileMutation.mutateAsync({
      preferences: {
        ...(profileQuery.data?.preferences || {}),
        smsTriggerKeyword: keyword.trim()
      }
    });
    setIsSavingKeyword(false);
  };

  const generateMutation = trpc.profile.generateWebhookToken.useMutation({
    onSuccess: () => {
      tokenQuery.refetch();
      toast.success("تم إنشاء Token جديد بنجاح!");
    },
    onError: () => toast.error("فيه مشكلة في إنشاء الـ Token، جرب تاني."),
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateMutation.mutateAsync();
    setIsGenerating(false);
  };

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success("تم نسخ الـ Token!");
    setTimeout(() => setCopied(false), 2000);
  };

  const maskedToken = token
    ? token.slice(0, 12) + "•".repeat(Math.max(0, token.length - 16)) + token.slice(-4)
    : null;

  return (
    <Card className="border-dashed border-sky-300 dark:border-sky-800 bg-linear-to-br from-sky-50/50 to-transparent dark:from-sky-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-sky-700 dark:text-sky-300">
          <Smartphone className="w-5 h-5" />
          ربط الآيفون التلقائي (iOS Shortcut)
        </CardTitle>
        <CardDescription>
          بضغطة واحدة، اربط حسابك عشان أي رسالة من البنك تتسجل كمصروف أو دخل تلقائياً.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* 1. Token Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 font-bold text-xs">1</div>
            <h3 className="text-sm font-semibold">انسخ الـ Token الخاص بيك</h3>
          </div>

          {!hasLoaded ? (
            <div className="h-10 bg-muted animate-pulse rounded-lg ml-8" />
          ) : (
            <div className="ml-8 space-y-3">
              {token ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-xs bg-muted rounded-lg px-3 py-2.5 truncate select-all border shadow-sm">
                    {tokenVisible ? token : maskedToken}
                  </div>
                  <Button size="icon" variant="outline" onClick={() => setTokenVisible(!tokenVisible)} className="shrink-0">
                    {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant={copied ? "default" : "outline"}
                    onClick={handleCopy}
                    className={`shrink-0 ${copied ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                  >
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <Info className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-200 flex-1">
                    لازم تعمل Token الأول عشان تقدر تربط الآيفون بتاعك.
                  </p>
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    size="sm"
                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ml-2 ${isGenerating ? "animate-spin" : ""}`} />
                    إنشاء Token
                  </Button>
                </div>
              )}

              {token && (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-8"
                >
                  <RefreshCw className={`w-3 h-3 ml-1.5 ${isGenerating ? "animate-spin" : ""}`} />
                  إنشاء Token جديد (سيلغي القديم)
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 2. Download Shortcut Section */}
        {token && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 font-bold text-xs">2</div>
              <h3 className="text-sm font-semibold">ثبّت الـ Shortcut الجاهز</h3>
            </div>
            <div className="ml-8 p-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 text-sm">
              <p className="text-muted-foreground text-xs leading-relaxed">
                اضغط على الزرار اللي تحت عشان تفتح رابط الـ Shortcut الجاهز.
                أول ما يفتح في تطبيق Shortcuts، اضغط <strong className="text-foreground">Set Up Shortcut</strong>،
                وبعدين <strong>اعمل Paste للـ Token</strong> اللي نسخته في الخطوة الأولى.
              </p>
              <Button
                onClick={() => window.open("https://www.icloud.com/shortcuts/c3fbc31dbd6e41cc94fa25b0a9480675", "_blank")}
                className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20"
              >
                <Download className="w-4 h-4 ml-2" />
                Connect iPhone
              </Button>
            </div>
          </div>
        )}

        {/* 3. Automation Setup Section */}
        {token && (
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 font-bold text-xs">3</div>
              <h3 className="text-sm font-semibold">شغّل الأتمتة التلقائية (Automation)</h3>
            </div>

            <div className="ml-8 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2 max-w-sm">
                <div className="flex-1 space-y-1.5 w-full">
                  <label className="text-xs font-medium text-muted-foreground">
                    الكلمة المميزة لرسالة البنك (مثال: EGP أو البنك الأهلي)
                  </label>
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="EGP"
                    className="h-9"
                  />
                </div>
                <Button
                  onClick={handleSaveKeyword}
                  disabled={isSavingKeyword || !keyword.trim() || keyword.trim() === profileQuery.data?.preferences?.smsTriggerKeyword}
                  variant="secondary"
                  size="sm"
                  className="h-9 w-full sm:w-auto"
                >
                  {isSavingKeyword ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                  حفظ
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm">
                <ol className="space-y-3 text-muted-foreground list-decimal list-inside leading-relaxed text-xs sm:text-sm">
                  <li>افتح تطبيق <strong>Shortcuts</strong> واختار تاب <strong>Automation</strong> من تحت.</li>
                  <li>اضغط <strong>+</strong> واختار <strong>Message</strong>.</li>
                  <li>في خانة <strong>Message Contains</strong>، اكتب الكلمة اللي حفظتها: <span className="inline-flex px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 font-bold ml-1">{keyword || "EGP"}</span></li>
                  <li>اختار <strong>Run Immediately</strong> (عشان يشتغل بدون ما يسألك).</li>
                  <li>اضغط <strong>Next</strong>، واختار الـ Shortcut الجاهز اللي نزلته (مثلاً: SmartSpend SMS).</li>
                </ol>
                <div className="mt-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900">
                  <Zap className="w-4 h-4" />
                  كده تمام! أي رسالة فيها الكلمة دي هتتسجل في حسابك فوراً.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SMS Logs Section */}
        {token && (
          <div className="space-y-3 pt-4 border-t border-dashed border-sky-200 dark:border-sky-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <h3 className="text-sm font-semibold">سجل الرسائل المستلمة</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => logsQuery.refetch()}
                disabled={logsQuery.isFetching}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {logsQuery.isLoading ? (
                <div className="p-6 flex justify-center">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : logsQuery.data?.length === 0 ? (
                <div className="p-6 text-center flex flex-col items-center gap-2 text-muted-foreground">
                  <MessageSquareText className="w-8 h-8 opacity-20" />
                  <p className="text-sm">لم يتم استلام أي رسائل حتى الآن.</p>
                  <p className="text-xs opacity-70">عندما يعمل الـ Shortcut، ستظهر الرسائل هنا تلقائياً.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[300px] overflow-auto">
                  {logsQuery.data?.map((log) => (
                    <div key={log.id} className="p-3 text-sm flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="mt-0.5 shrink-0">
                        {log.status === "processed" ? (
                          <div className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full p-1">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : log.status === "ignored" ? (
                          <div className="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-full p-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full p-1">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-medium text-xs truncate">
                            {log.sender || "مرسل غير معروف"}
                          </p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.smsTimestamp || log.createdAt), "dd MMM, hh:mm a", { locale: arEG })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed" dir="auto">
                          {log.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {log.status === "processed" && (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20">
                              تم التسجيل {(log.metadata as any)?.amount ? `(${(log.metadata as any).amount})` : ''}
                            </span>
                          )}
                          {log.status === "ignored" && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-500/20">
                              تم التجاهل ({(log.metadata as any)?.reason === 'not_financial' ? 'ليست مالية' : 'غير مفهومة'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
