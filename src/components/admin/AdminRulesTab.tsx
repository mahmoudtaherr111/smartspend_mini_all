import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Trash2, Search, Calendar, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

export function AdminRulesTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 20;

  const { data, isLoading, refetch } = trpc.admin.getLearnedRules.useQuery({
    page,
    limit,
  });

  const deleteMutation = trpc.admin.deleteLearnedRule.useMutation({
    onSuccess: () => {
      toast.success("تم إزالة القاعدة المكتسبة بنجاح ✅");
      refetch();
      setRuleToDelete(null);
    },
    onError: (err) => {
      toast.error(`فشل الحذف: ${err.message}`);
    },
  });

  const [ruleToDelete, setRuleToDelete] = useState<any | null>(null);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل القاموس والقواعد المكتسبة...</div>;
  }

  const rules = data?.rules || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Filter local search
  const filteredRules = rules.filter((r: any) => {
    const query = search.toLowerCase();
    return (
      !query ||
      r.word?.toLowerCase().includes(query) ||
      r.category?.toLowerCase().includes(query) ||
      r.subCategory?.toLowerCase().includes(query) ||
      r.userName?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-teal-700 dark:text-teal-400">
              <BookOpen className="w-5 h-5" />
              القاموس المكتسب الذاتي (AI Dictionary Rules)
            </CardTitle>
            <CardDescription dir="rtl">
              هذه الكلمات والتصنيفات يتعلمها المحرك تلقائياً (Muscle Memory) من تصحيحات المستخدمين لتسهيل وتذكر معالجاتهم المستقبلية.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="ابحث عن كلمة، تصنيف، مستخدم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pe-10 bg-white dark:bg-slate-950 rounded-xl"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-end">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <tr>
                  <th className="p-4 font-medium">الكلمة المكتسبة (المفردة)</th>
                  <th className="p-4 font-medium">التصنيف</th>
                  <th className="p-4 font-medium">التصنيف الفرعي</th>
                  <th className="p-4 font-medium">المستخدِم</th>
                  <th className="p-4 font-medium">تاريخ التعلم</th>
                  <th className="p-4 font-medium text-start">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRules.map((rule: any) => (
                  <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-4 font-bold text-slate-850 dark:text-slate-150">
                      "{rule.word}"
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary" className="bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-100">
                        {rule.category}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">
                        {rule.subCategory || "—"}
                      </Badge>
                    </td>
                    <td className="p-4 font-medium">
                      {rule.userName}
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">
                        {rule.userType}:{rule.userId}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-500 font-mono">
                      {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString("ar-EG") : "—"}
                    </td>
                    <td className="p-4 text-start">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRuleToDelete(rule)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredRules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      لا توجد قواعد مكتسبة مطابقة للبحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                صفحة {page} من {totalPages} (إجمالي {total} قاعدة)
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

      {/* DELETE CONFIRM DIALOG */}
      <Dialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
        <DialogContent className="max-w-sm p-6 rounded-3xl" dir="rtl">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-full">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                حذف الكلمة المكتسبة؟
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                هل تريد إزالة ربط الكلمة <span className="font-bold text-rose-600">"{ruleToDelete?.word}"</span> بتصنيف <span className="font-semibold text-slate-700 dark:text-slate-300">"{ruleToDelete?.category}"</span>؟
                سيضطر المحرك للتعرف على هذه الكلمة ديناميكياً مجدداً.
              </p>
            </div>
            <div className="flex gap-3 w-full pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setRuleToDelete(null)}
              >
                إلغاء
              </Button>
              <Button
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
                disabled={deleteMutation.isPending}
                onClick={() => ruleToDelete && deleteMutation.mutate({ id: ruleToDelete.id })}
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "حذف القاعدة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
