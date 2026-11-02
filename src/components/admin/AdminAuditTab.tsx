import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  History,
  Shield,
  Smartphone,
  Globe,
  Clock,
  Power,
  ShieldCheck,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCw,
} from "lucide-react";

export function AdminAuditTab() {
  const [activeView, setActiveView] = useState<"audit" | "sessions">("audit");
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [targetIdFilter, setTargetIdFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const {
    data: auditData,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = trpc.admin.getAuditLogs.useQuery({
    action: actionFilter.trim() || undefined,
    targetType: targetTypeFilter.trim() || undefined,
    targetId: targetIdFilter.trim() || undefined,
    page,
    limit,
  });

  const {
    data: sessions,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = trpc.admin.getActivityLog.useQuery({ limit: 100 });

  const revokeMutation = trpc.admin.revokeSession.useMutation({
    onSuccess: () => {
      toast.success("تم إنهاء الجلسة بنجاح 🔒");
      refetchSessions();
      refetchAudit();
    },
    onError: (err) => {
      toast.error(`حدث خطأ: ${err.message}`);
    },
  });

  const isExpired = (expiry: string) => {
    return new Date(expiry) < new Date();
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes("DELETE") || action.includes("REVOKE")) {
      return "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-900";
    }
    if (action.includes("CREATE") || action.includes("ADD")) {
      return "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-900";
    }
    if (action.includes("UPDATE") || action.includes("SET")) {
      return "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900";
    }
    return "bg-indigo-500/10 text-indigo-600 border-indigo-200 dark:border-indigo-900";
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Segmented View Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/60 rounded-2xl w-fit border border-slate-200/60 dark:border-slate-700/50">
        <Button
          type="button"
          size="sm"
          variant={activeView === "audit" ? "default" : "ghost"}
          onClick={() => setActiveView("audit")}
          className={`rounded-xl gap-2 text-xs font-bold transition-all ${
            activeView === "audit"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/50"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          سجل التدقيق الإداري (Audit Trail)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeView === "sessions" ? "default" : "ghost"}
          onClick={() => setActiveView("sessions")}
          className={`rounded-xl gap-2 text-xs font-bold transition-all ${
            activeView === "sessions"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/50"
          }`}
        >
          <History className="w-4 h-4" />
          الجلسات النشطة (Active Sessions)
        </Button>
      </div>

      {activeView === "audit" ? (
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                سجل تدقيق العمليات الإدارية (Admin Audit Trail - GAP-36)
              </CardTitle>
              <CardDescription>
                سجل غير قابل للتعديل (Append-Only) يوثق كافة الإجراءات والعمليات الرقابية مع حماية تامة للخصوصية وبدون بيانات حساسة.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchAudit()}
              className="rounded-xl gap-2 shrink-0"
              disabled={auditLoading}
            >
              <RotateCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </CardHeader>

          {/* Filters Bar */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="تصفية حسب العملية (Action)..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="ps-9 text-xs rounded-xl bg-white dark:bg-slate-900"
              />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="نوع الهدف (user, setting, ad...)"
                value={targetTypeFilter}
                onChange={(e) => {
                  setTargetTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="ps-9 text-xs rounded-xl bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <Input
                placeholder="معرف الهدف (Target ID)..."
                value={targetIdFilter}
                onChange={(e) => {
                  setTargetIdFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs rounded-xl bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <CardContent className="p-0">
            {auditLoading ? (
              <div className="p-12 text-center text-slate-500 text-sm">جاري تحميل سجل التدقيق الإداري...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-end">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3.5 font-medium">الوقت والتاريخ</th>
                      <th className="p-3.5 font-medium">المسؤول المنفذ</th>
                      <th className="p-3.5 font-medium">العملية (Action)</th>
                      <th className="p-3.5 font-medium">الهدف (Target)</th>
                      <th className="p-3.5 font-medium max-w-xs">التفاصيل (Details)</th>
                      <th className="p-3.5 font-medium font-mono text-xs">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditData?.logs?.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="p-3.5 text-xs text-slate-500 font-mono whitespace-nowrap">
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString("ar-EG", {
                                dateStyle: "short",
                                timeStyle: "medium",
                              })
                            : "—"}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                {log.adminName}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {log.adminType}:{log.adminId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border ${getActionBadgeColor(
                              log.action,
                            )}`}
                          >
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-xs font-mono">
                          <span className="text-slate-600 dark:text-slate-300 font-bold">
                            {log.targetType}
                          </span>
                          <span className="text-slate-400 block text-[10px]">
                            {log.targetId}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-xs">
                          {log.details ? (
                            <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-lg overflow-x-auto max-h-16">
                              {JSON.stringify(log.details, null, 1)}
                            </pre>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {log.ipAddress || "127.0.0.1"}
                        </td>
                      </tr>
                    ))}
                    {(!auditData?.logs || auditData.logs.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-500">
                          لا توجد عمليات تدقيق مسجلة تطابق معايير البحث.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {auditData && auditData.total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <div>
                  إجمالي العمليات: <span className="font-bold font-mono">{auditData.total}</span> (صفحة {page} من{" "}
                  {Math.ceil(auditData.total / limit)})
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 w-8 p-0 rounded-lg"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * limit >= auditData.total}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 w-8 p-0 rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Sessions View */
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold">
                <History className="w-5 h-5 text-indigo-500" />
                سجل الرقابة الأمنية والجلسات النشطة (Active Sessions)
              </CardTitle>
              <CardDescription>
                تدقيق ومراقبة كافة جلسات تسجيل الدخول النشطة في النظام، عناوين الـ IP، الأجهزة، وإنهاء الجلسات المشبوهة فوراً.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSessions()}
              className="rounded-xl gap-2 shrink-0"
              disabled={sessionsLoading}
            >
              <RotateCw className={`w-3.5 h-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
              تحديث السجل
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {sessionsLoading ? (
              <div className="p-12 text-center text-slate-500 text-sm">جاري تحميل الجلسات النشطة...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-end">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                    <tr>
                      <th className="p-4 font-medium">المستخدِم</th>
                      <th className="p-4 font-medium">عنوان الـ IP (IP Address)</th>
                      <th className="p-4 font-medium max-w-sm">جهاز الاستخدام (User Agent)</th>
                      <th className="p-4 font-medium">حالة الجلسة</th>
                      <th className="p-4 font-medium">توقيت تسجيل الدخول</th>
                      <th className="p-4 font-medium text-start">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sessions?.map((session) => {
                      const expired = isExpired(session.expiresAt);
                      return (
                        <tr
                          key={session.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-indigo-500 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                  {session.userName}
                                </span>
                                <span className="text-[10px] text-slate-400 block uppercase font-mono mt-0.5 leading-none">
                                  {session.userType}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{session.ipAddress}</span>
                            </div>
                          </td>
                          <td className="p-4 max-w-sm">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                              <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate block text-xs" title={session.userAgent}>
                                {session.userAgent}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            {expired ? (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              >
                                منتهية الصلاحية
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600">
                                نشطة (Active)
                              </Badge>
                            )}
                          </td>
                          <td className="p-4 text-xs font-mono text-slate-500">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>
                                {session.createdAt
                                  ? new Date(session.createdAt).toLocaleString("ar-EG")
                                  : "—"}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-start">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={expired || revokeMutation.isPending}
                              onClick={() => revokeMutation.mutate({ sessionId: session.id })}
                              className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 rounded-xl"
                              title="إنهاء الجلسة وإخراج المستخدم"
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {(!sessions || sessions.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          لا توجد جلسات مسجلة في النظام.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
