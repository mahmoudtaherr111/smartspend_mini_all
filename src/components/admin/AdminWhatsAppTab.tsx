import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  Users,
  RefreshCw,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  Server,
  Layers,
  } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminWhatsAppTab() {
  const [directPhone, setDirectPhone] = useState("");
  const [directMessage, setDirectMessage] = useState("");
  const [logFilter, setLogFilter] = useState<string | undefined>(undefined);

  // Queries
  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = trpc.adminWhatsapp.getStatus.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    refetch: refetchSettings,
  } = trpc.adminWhatsapp.getSettings.useQuery();

  const {
    data: templatesData,
    isLoading: isTemplatesLoading,
    refetch: refetchTemplates,
  } = trpc.adminWhatsapp.getTemplates.useQuery();

  const {
    data: outboxLogs,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = trpc.adminWhatsapp.getOutboxLog.useQuery(
    logFilter ? { limit: 50, status: logFilter as any } : { limit: 50 },
    { refetchInterval: 10000 },
  );

  // Mutations
  const updateSettings = trpc.adminWhatsapp.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث إعدادات الواتساب بنجاح");
      refetchSettings();
    },
    onError: (err) => toast.error(err.message),
  });

  const syncTemplates = trpc.adminWhatsapp.syncTemplates.useMutation({
    onSuccess: () => {
      toast.success("تمت مزامنة القوالب مع Meta بنجاح");
      refetchTemplates();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendDirect = trpc.adminWhatsapp.sendDirectMessage.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setDirectPhone("");
      setDirectMessage("");
      refetchLogs();
    },
    onError: (err) => toast.error(err.message),
  });

  const isConfigured = Boolean(statusData?.configured);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-emerald-500" />
            منصة WhatsApp Cloud API الرسمية
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            إدارة الرسائل المعتمدة رسمياً عبر Meta Graph API v21.0، سجل الصندوق والامتثال القانوني.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchStatus();
              refetchSettings();
              refetchTemplates();
              refetchLogs();
            }}
            className="rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </Button>
          {isConfigured ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 text-sm py-1.5 px-4 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Meta Cloud API مفعل
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-sm py-1.5 px-4 rounded-full flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              بانتظار ضبط مفاتيح Cloud API
            </Badge>
          )}
        </div>
      </div>

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Cloud API Config */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-500" />
              إصدار Meta Graph API
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isStatusLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-100">
                  {statusData?.apiVersion || "v21.0"}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                  Phone ID: {statusData?.phoneNumberId || "غير محدد"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Business Account Profile */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-500" />
              رقم الأعمال المعتمد
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isStatusLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : statusData?.business ? (
              <div>
                <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-100 dir-ltr text-right">
                  {statusData.business.displayPhoneNumber}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs px-2 py-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    {statusData.business.verifiedName}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    جودة: {statusData.business.qualityRating}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                  {isConfigured ? "SmartSpend Business" : "غير مربوط"}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isConfigured ? "يعمل بالسحابة بدون جلسات QR محلي" : "اضبط المتغيرات بالبيئة"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Consent Metrics */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              الموافقات والاشتراكات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isStatusLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {statusData?.consent?.total ?? 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                  <span className="text-emerald-600">تقارير: {statusData?.consent?.reports ?? 0}</span>
                  <span>•</span>
                  <span className="text-blue-600">تسويق: {statusData?.consent?.marketing ?? 0}</span>
                  <span>•</span>
                  <span className="text-rose-600">إلغاء: {statusData?.consent?.optedOut ?? 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Today Outbox Metrics */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-500" />
              تسليمات اليوم (توقيت القاهرة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isStatusLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {statusData?.todayMetrics?.total ?? 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                  <span className="text-emerald-600">تم: {(statusData?.todayMetrics?.delivered ?? 0) + (statusData?.todayMetrics?.sent ?? 0)}</span>
                  <span>•</span>
                  <span className="text-amber-600">طابور: {statusData?.todayMetrics?.queued ?? 0}</span>
                  <span>•</span>
                  <span className="text-rose-600">فشل: {statusData?.todayMetrics?.failed ?? 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings & Security Card */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              إعدادات الإرسال والامتثال
            </CardTitle>
            <CardDescription>
              التحكم في قنوات الإرسال طبقاً للقانون 151 لسنة 2020
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSettingsLoading ? (
              <Skeleton className="h-32 w-full rounded-2xl" />
            ) : (
              <>
                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                      توثيق أرقام الهواتف (OTP)
                    </p>
                    <p className="text-xs text-slate-500">
                      إرسال كود التحقق الرسمي عبر قالب Meta
                    </p>
                  </div>
                  <Switch
                    checked={settingsData?.otpEnabled ?? false}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ otpEnabled: checked })
                    }
                    disabled={updateSettings.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                      تقارير المصروفات الشهرية
                    </p>
                    <p className="text-xs text-slate-500">
                      إرسال ملخص الشهر للموافقين فقط
                    </p>
                  </div>
                  <Switch
                    checked={settingsData?.reportsEnabled ?? true}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ reportsEnabled: checked })
                    }
                    disabled={updateSettings.isPending}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                      إيقاف الحملات التسويقية
                    </p>
                    <p className="text-xs text-slate-500">
                      تجميد إرسال أي قوالب عروض جماعية
                    </p>
                  </div>
                  <Switch
                    checked={settingsData?.marketingPaused ?? false}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ marketingPaused: checked })
                    }
                    disabled={updateSettings.isPending}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Official Templates Catalog Card */}
        <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                قوالب Meta المعتمدة (Approved Templates)
              </CardTitle>
              <CardDescription>
                القوالب المسجلة لدى Meta للإرسال خارج نافذة الـ 24 ساعة
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncTemplates.mutate()}
              disabled={syncTemplates.isPending || !isConfigured}
              className="rounded-xl flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncTemplates.isPending ? "animate-spin" : ""}`}
              />
              مزامنة مع Meta
            </Button>
          </CardHeader>
          <CardContent>
            {isTemplatesLoading ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : templatesData && templatesData.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {templatesData.map((tmpl) => (
                  <div
                    key={tmpl.name}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-sm">
                        {tmpl.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        التصنيف: {tmpl.category} • اللغة: ar
                      </div>
                    </div>
                    <Badge
                      className={
                        tmpl.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : tmpl.status === "SUBMITTED"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }
                    >
                      {tmpl.status === "APPROVED"
                        ? "معتمد (Approved)"
                        : tmpl.status === "SUBMITTED"
                          ? "قيد المراجعة"
                          : "محلي (Local)"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">
                لا توجد قوالب معروضة حالياً.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Direct Messaging Protected Card */}
      <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-500" />
            مراسلة مباشرة لمستخدم (Direct Support Reply)
          </CardTitle>
          <CardDescription>
            متاح فقط للمستخدمين الذين تواصلوا معنا خلال آخر 24 ساعة (Meta Customer Service Window)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                رقم الهاتف (صيغة دولية مثال: 201012345678)
              </label>
              <Input
                placeholder="201012345678"
                value={directPhone}
                onChange={(e) => setDirectPhone(e.target.value)}
                className="rounded-xl font-mono dir-ltr text-right"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                نص الرسالة
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="اكتب ردك المباشر للمستخدم هنا..."
                  value={directMessage}
                  onChange={(e) => setDirectMessage(e.target.value)}
                  className="rounded-xl flex-1"
                />
                <Button
                  onClick={() =>
                    sendDirect.mutate({
                      phone: directPhone,
                      text: directMessage,
                    })
                  }
                  disabled={
                    sendDirect.isPending || !directPhone || !directMessage || !isConfigured
                  }
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
                >
                  <Send
                    className={`w-4 h-4 ${sendDirect.isPending ? "animate-spin" : ""}`}
                  />
                  إرسال
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outbox Audit & Delivery Logs */}
      <Card className="rounded-3xl border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-500" />
              سجل صندوق الإرسال وحالات التسليم (Outbox Logs)
            </CardTitle>
            <CardDescription>
              متابعة الرسائل الصادرة وحالات Webhook من Meta (الأرقام مقنّعة لحماية الخصوصية)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={logFilter || ""}
              onChange={(e) => setLogFilter(e.target.value || undefined)}
              className="text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-slate-700 dark:text-slate-300"
            >
              <option value="">جميع الحالات</option>
              <option value="queued">في الانتظار (Queued)</option>
              <option value="sending">قيد الإرسال (Sending)</option>
              <option value="sent">تم الإرسال (Sent)</option>
              <option value="delivered">تم التسليم (Delivered)</option>
              <option value="read">تمت القراءة (Read)</option>
              <option value="failed">فشل (Failed)</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchLogs()}
              className="rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLogsLoading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : outboxLogs && outboxLogs.length > 0 ? (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-950/50">
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">المستلم</TableHead>
                    <TableHead className="text-right">الغرض</TableHead>
                    <TableHead className="text-right">القالب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">المحاولات</TableHead>
                    <TableHead className="text-right">التوقيت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outboxLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs text-slate-400">
                        {row.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium dir-ltr text-right">
                        {row.recipient || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.purpose}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.templateName || "نص مباشر"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.status === "delivered" || row.status === "read"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : row.status === "sent"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                : row.status === "failed"
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.attempts}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleTimeString("ar-EG", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">
              لا توجد رسائل مسجلة في صندوق الإرسال حالياً.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
