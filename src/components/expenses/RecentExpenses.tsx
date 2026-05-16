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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Wallet,
} from "lucide-react";

interface RecentExpensesProps {
  onRefresh?: () => void;
  limit?: number;
}

const categoryColors: Record<string, string> = {
  "أكل": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  "أكل وشرب": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  "مواصلات": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  "تسوق": "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200",
  "فواتير": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  "صحة": "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-200",
  "ترفيه": "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200",
  "تعليم": "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200",
  "ملابس": "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200",
  "إيجار": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
  "بنزين": "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200",
  "إنترنت": "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  "موبايل": "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200",
  "أهل وبيت": "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  "هدايا": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  "صيانة": "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-200",
  "اشتراكات": "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-200",
  "أخرى": "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
  "متنوعات": "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
};

function getTypeMeta(type: string | null | undefined) {
  if (type === "income") {
    return {
      label: "دخل",
      sign: "+",
      amountClass: "text-emerald-600",
      badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }
  if (type === "transfer") {
    return {
      label: "تحويل",
      sign: "",
      amountClass: "text-sky-600",
      badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
    };
  }
  if (type === "investment") {
    return {
      label: "استثمار",
      sign: "",
      amountClass: "text-amber-600",
      badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }
  return {
    label: "مصروف",
    sign: "-",
    amountClass: "text-rose-600",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  };
}

export function RecentExpenses({ onRefresh, limit = 10 }: RecentExpensesProps) {
  const [page, setPage] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { data, isLoading, refetch } = trpc.expense.list.useQuery({
    limit,
    offset: page * limit,
  });

  const deleteMutation = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المصروف بنجاح ✅");
      refetch();
      if (onRefresh) onRefresh();
      setPendingDeleteId(null);
    },
    onError: () => {
      toast.error("مش قادرين نكمل الحذف — جرّب تاني ❌");
    },
  });

  const totalPages = data ? Math.ceil(Number(data.total) / limit) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">جاري تحميل المصاريف...</CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Wallet className="w-10 h-10 text-muted-foreground/70" />
          </div>
          <div>
            <p className="font-medium text-foreground">ليس لديك مصاريف مسجّلة في هذه الصفحة</p>
            <p className="text-sm">سجّل أول مصروف أو دخل من تبويب «تسجيل العمليات».</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-500" />
              آخر العمليات
              <Badge variant="secondary">{Number(data.total)} عملية</Badge>
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
                onRequestDelete={(id) => setPendingDeleteId(id)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
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

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>متأكد من الحذف؟</AlertDialogTitle>
            <AlertDialogDescription>هتتمسح العملية من السجل ومش هتقدر ترجعها.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>رجوع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId != null) deleteMutation.mutate({ id: pendingDeleteId });
              }}
            >
              امسح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ExpenseItem({
  expense,
  onRequestDelete,
  isDeleting,
}: {
  expense: {
    id: number;
    amount: string;
    type: string;
    category: string;
    subCategory: string | null;
    description: string | null;
    rawText: string | null;
    source: string;
    date: string | Date;
  };
  onRequestDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const date = new Date(expense.date);
  const typeMeta = getTypeMeta(expense.type);
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
            <div className={cn("font-bold text-lg", typeMeta.amountClass)}>
              {typeMeta.sign}
              {Number(expense.amount).toFixed(0)} جنيه
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <Badge className={cn("border-0", typeMeta.badgeClass)}>{typeMeta.label}</Badge>
            <Badge className={cn("border-0", categoryColors[expense.category] || "bg-gray-100 dark:bg-gray-800")}>
              {expense.category}
            </Badge>
            {expense.subCategory && expense.subCategory !== "عام" && (
              <span className="text-[10px] text-muted-foreground px-1 bg-slate-100 dark:bg-slate-800 rounded">
                {expense.subCategory}
              </span>
            )}
          </div>
          <Dialog>
            <DialogTrigger
              aria-label="تفاصيل العملية"
              className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <MessageSquare className="w-4 h-4" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>تفاصيل العملية</DialogTitle>
              </DialogHeader>
              <div className="space-y-3" dir="rtl">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">المبلغ:</span>
                  <span className={cn("font-bold", typeMeta.amountClass)}>
                    {typeMeta.sign}
                    {Number(expense.amount).toFixed(2)} جنيه
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">النوع:</span>
                  <Badge className={cn("border-0", typeMeta.badgeClass)}>{typeMeta.label}</Badge>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">الفئة:</span>
                  <Badge className={categoryColors[expense.category] || "bg-gray-100 text-gray-700 dark:bg-gray-800"}>
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
          <Button variant="ghost" size="sm" onClick={() => onRequestDelete(expense.id)} disabled={isDeleting}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}
