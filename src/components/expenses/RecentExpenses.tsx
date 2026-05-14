import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Receipt,
  Trash2,
  RefreshCw,
  Calendar,
  Tag,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface RecentExpensesProps {
  onRefresh?: () => void;
  limit?: number;
}

const categoryColors: Record<string, string> = {
  "أكل": "bg-red-100 text-red-700",
  "أكل وشرب": "bg-red-100 text-red-700",
  "مواصلات": "bg-blue-100 text-blue-700",
  "تسوق": "bg-green-100 text-green-700",
  "فواتير": "bg-amber-100 text-amber-700",
  "صحة": "bg-pink-100 text-pink-700",
  "ترفيه": "bg-purple-100 text-purple-700",
  "تعليم": "bg-cyan-100 text-cyan-700",
  "ملابس": "bg-orange-100 text-orange-700",
  "إيجار": "bg-indigo-100 text-indigo-700",
  "بنزين": "bg-gray-100 text-gray-700",
  "إنترنت": "bg-sky-100 text-sky-700",
  "موبايل": "bg-teal-100 text-teal-700",
  "أهل وبيت": "bg-rose-100 text-rose-700",
  "هدايا": "bg-emerald-100 text-emerald-700",
  "صيانة": "bg-yellow-100 text-yellow-700",
  "اشتراكات": "bg-lime-100 text-lime-700",
  "أخرى": "bg-slate-100 text-slate-700",
  "متنوعات": "bg-slate-100 text-slate-700",
};

export function RecentExpenses({ onRefresh, limit = 10 }: RecentExpensesProps) {
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch } = trpc.expense.list.useQuery({
    limit,
    offset: page * limit,
  });

  const deleteMutation = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المصروف.");
      refetch();
      if (onRefresh) onRefresh();
    },
    onError: () => {
      toast.error("فيه مشكلة في الحذف.");
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("متأكد إنك عايز تمسح المصروف ده؟")) {
      deleteMutation.mutate({ id });
    }
  };

  const totalPages = data ? Math.ceil(Number(data.total) / limit) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          جاري تحميل المصاريف...
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>مفيش مصاريف مسجلة لسه.</p>
          <p className="text-sm">سجل أول مصروفك!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-500" />
            آخر المصاريف
            <Badge variant="secondary">{Number(data.total)} مصروف</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.items.map((expense) => (
            <ExpenseItem
              key={expense.id}
              expense={expense}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronUp className="w-4 h-4" />
              السابق
            </Button>
            <span className="text-sm text-muted-foreground">
              صفحة {page + 1} من {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              التالي
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseItem({
  expense,
  onDelete,
  isDeleting,
}: {
  expense: {
    id: number;
    amount: string;
    category: string;
    subCategory: string | null;
    description: string | null;
    rawText: string | null;
    source: string;
    date: string | Date;
  };
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const date = new Date(expense.date);
  const dateStr = date.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="border rounded-lg p-3 hover:bg-muted/50 transition-colors shadow-sm bg-white dark:bg-slate-900/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-bold text-lg">{Number(expense.amount).toFixed(0)} جنيه</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <Badge className={cn("border-0", categoryColors[expense.category] || "bg-gray-100")}>
              {expense.category}
            </Badge>
            {expense.subCategory && expense.subCategory !== "عام" && (
              <span className="text-[10px] text-muted-foreground px-1 bg-slate-100 dark:bg-slate-800 rounded">
                {expense.subCategory}
              </span>
            )}
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <MessageSquare className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>تفاصيل المصروف</DialogTitle>
              </DialogHeader>
              <div className="space-y-3" dir="rtl">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">المبلغ:</span>
                  <span className="font-bold">{Number(expense.amount).toFixed(2)} جنيه</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">الفئة:</span>
                  <Badge className={categoryColors[expense.category] || "bg-gray-100 text-gray-700"}>
                    {expense.category}
                  </Badge>
                </div>
                {expense.subCategory && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">الفئة الفرعية:</span>
                    <span className="font-medium">{expense.subCategory}</span>
                  </div>
                )}
                {expense.description && expense.description !== "?" && (
                  <div className="border-b pb-2">
                    <span className="text-sm text-muted-foreground block mb-1">الوصف:</span>
                    <span className="text-sm">{expense.description}</span>
                  </div>
                )}
                {expense.rawText && expense.rawText !== "?" && (
                  <div className="border-b pb-2">
                    <span className="text-sm text-muted-foreground block mb-1">النص الأصلي:</span>
                    <p className="text-xs bg-muted p-2 rounded">{expense.rawText}</p>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>المصدر: {expense.source === "voice" ? "صوتي" : expense.source === "ai_parsed" ? "نصي (AI)" : "يدوي"}</span>
                  <span>{date.toLocaleString("ar-EG")}</span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(expense.id)}
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}
