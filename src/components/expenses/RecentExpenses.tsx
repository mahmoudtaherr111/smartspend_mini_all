import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  onRefresh: () => void;
}

const categoryColors: Record<string, string> = {
  "أكل": "bg-red-100 text-red-700",
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
};

export function RecentExpenses({ onRefresh }: RecentExpensesProps) {
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data, isLoading, refetch } = trpc.expense.list.useQuery({
    limit,
    offset: page * limit,
  });

  const deleteMutation = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المصروف.");
      refetch();
      onRefresh();
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

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

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
            <Badge variant="secondary">{data.total} مصروف</Badge>
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
    description: string | null;
    rawText: string;
    source: string;
    date: Date;
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
    <div className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-bold text-lg">{Number(expense.amount).toFixed(0)} جنيه</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={categoryColors[expense.category] || "bg-gray-100"}>
            <Tag className="w-3 h-3 ml-1" />
            {expense.category}
          </Badge>
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
                <div>
                  <span className="text-sm text-muted-foreground">المبلغ:</span>
                  <span className="font-bold mr-2">{Number(expense.amount).toFixed(2)} جنيه</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">الفئة:</span>
                  <Badge className={`mr-2 ${categoryColors[expense.category] || "bg-gray-100"}`}>
                    {expense.category}
                  </Badge>
                </div>
                {expense.description && (
                  <div>
                    <span className="text-sm text-muted-foreground">الوصف:</span>
                    <span className="mr-2">{expense.description}</span>
                  </div>
                )}
                <div>
                  <span className="text-sm text-muted-foreground">النص الأصلي:</span>
                  <p className="mr-2 text-sm bg-muted p-2 rounded">{expense.rawText}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">المصدر:</span>
                  <span className="mr-2">{expense.source === "voice" ? "صوتي" : "يدوي"}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">التاريخ:</span>
                  <span className="mr-2">{date.toLocaleString("ar-EG")}</span>
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
