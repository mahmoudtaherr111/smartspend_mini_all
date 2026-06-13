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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Search, Clock, Smartphone, User, ChevronLeft, ChevronRight } from "lucide-react";

export function AdminRawSmsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const limit = 20;

  const { data, isLoading } = trpc.admin.getRawSmsLogs.useQuery({
    page,
    limit,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل سجلات الـ SMS الخام...</div>;
  }

  const logs = data?.list || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600">معالجة ناجحة</Badge>;
      case "ignored":
        return <Badge variant="secondary">مهملة (مستبعدة)</Badge>;
      case "error":
        return <Badge variant="destructive">فشل المعالجة</Badge>;
      default:
        return <Badge variant="outline">قيد الانتظار</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-violet-700 dark:text-violet-400">
              <FileText className="w-5 h-5" />
              سجل الرسائل النصية الخام (Raw SMS Events Audit)
            </CardTitle>
            <CardDescription dir="rtl">
              مراقبة كافة الرسائل النصية الخام المستلمة وتتبع نجاح معالجة محتوى الرسائل البنكية ومحافظ الهاتف وتصنيفها التلقائي.
            </CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] bg-white dark:bg-slate-950">
                <SelectValue placeholder="تصفية حسب الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل (جميع الرسائل)</SelectItem>
                <SelectItem value="processed">معالجة ناجحة</SelectItem>
                <SelectItem value="ignored">مهملة (غير مالية)</SelectItem>
                <SelectItem value="error">فشل المعالجة</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-end">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <tr>
                  <th className="p-4 font-medium">المرسل (Sender)</th>
                  <th className="p-4 font-medium max-w-sm">نص الرسالة الخام (Message)</th>
                  <th className="p-4 font-medium">المستخدِم</th>
                  <th className="p-4 font-medium">الحالة</th>
                  <th className="p-4 font-medium">تاريخ استلام الرسالة</th>
                  <th className="p-4 font-medium">وقت التسجيل بالسيرفر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-mono">{log.sender}</span>
                      </div>
                    </td>
                    <td className="p-4 max-w-sm">
                      <p className="text-slate-700 dark:text-slate-300 font-mono text-xs whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/50">
                        {log.message}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="font-medium text-slate-800 dark:text-slate-200 block">{log.userName}</span>
                          <span className="text-[10px] text-slate-400 block uppercase font-mono leading-none mt-0.5">
                            {log.userType}:{log.userId}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="p-4 text-xs font-mono text-slate-500">
                      {log.smsTimestamp || "—"}
                    </td>
                    <td className="p-4 text-xs font-mono text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{log.createdAt ? new Date(log.createdAt).toLocaleString("ar-EG") : "—"}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      لا توجد رسائل نصية خام مسجلة حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-mono">
                صفحة {page} من {totalPages} (إجمالي {total} سجل)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-xl gap-1"
                >
                  <ChevronRight className="w-4 h-4" /> السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-xl gap-1"
                >
                  التالي <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
