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
import { toast } from "sonner";
import { History, Shield, Smartphone, Globe, Clock, Power, ShieldAlert } from "lucide-react";

export function AdminAuditTab() {
  const utils = trpc.useUtils();
  const { data: sessions, isLoading, refetch } = trpc.admin.getActivityLog.useQuery({ limit: 100 });

  const revokeMutation = trpc.admin.revokeSession.useMutation({
    onSuccess: () => {
      toast.success("تم إنهاء الجلسة بنجاح 🔒");
      refetch();
    },
    onError: (err) => {
      toast.error(`حدث خطأ: ${err.message}`);
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل سجل الرقابة والجلسات...</div>;
  }

  const isExpired = (expiry: string) => {
    return new Date(expiry) < new Date();
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-700 dark:text-slate-350">
              <History className="w-5 h-5" />
              سجل الرقابة الأمنية والجلسات النشطة (Security Audit Logs)
            </CardTitle>
            <CardDescription dir="rtl">
              تدقيق ومراقبة كافة جلسات تسجيل الدخول النشطة في النظام، عناوين الـ IP، الأجهزة والمحافظ، وإنهاء الجلسات المشبوهة فوراً.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl">
            تحديث السجل
          </Button>
        </CardHeader>
        <CardContent className="p-0">
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
                {sessions?.map((session: any) => {
                  const expired = isExpired(session.expiresAt);
                  return (
                    <tr key={session.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-200 block">{session.userName}</span>
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
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
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
                          <span>{session.createdAt ? new Date(session.createdAt).toLocaleString("ar-EG") : "—"}</span>
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
        </CardContent>
      </Card>
    </div>
  );
}
