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

const providerMeta: Record<string, { nameAr: string; classes: string; icon: string; brandColor: string }> = {
  VodafoneCash: {
    nameAr: "فودافون كاش",
    classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50",
    icon: "🔴",
    brandColor: "#e60000"
  },
  InstaPay: {
    nameAr: "انستا باي",
    classes: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900/50",
    icon: "⚡",
    brandColor: "#6c5ce7"
  },
  CIB: {
    nameAr: "بنك CIB",
    classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50",
    icon: "🔷",
    brandColor: "#004b87"
  },
  NBE: {
    nameAr: "البنك الأهلي",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
    icon: "🟢",
    brandColor: "#006c35"
  },
  BanqueMisr: {
    nameAr: "بنك مصر",
    classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
    icon: "🔶",
    brandColor: "#d4af37"
  },
  QNB: {
    nameAr: "بنك QNB",
    classes: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900/50",
    icon: "🟪",
    brandColor: "#4b0082"
  },
  EtisalatCash: {
    nameAr: "اتصالات كاش",
    classes: "bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-950/30 dark:text-lime-300 dark:border-lime-900/50",
    icon: "🟢",
    brandColor: "#74b9ff"
  },
  OrangeMoney: {
    nameAr: "أورنج كاش",
    classes: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900/50",
    icon: "🟠",
    brandColor: "#ff793f"
  },
  WEPay: {
    nameAr: "وي باي",
    classes: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900/50",
    icon: "🟣",
    brandColor: "#800080"
  },
  ApplePay: {
    nameAr: "أبل باي",
    classes: "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
    icon: "🍎",
    brandColor: "#2d3436"
  },
  ValU: {
    nameAr: "ڤاليو",
    classes: "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-200 dark:border-yellow-900/50",
    icon: "✨",
    brandColor: "#ffeaa7"
  },
  Fawry: {
    nameAr: "فوري",
    classes: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-900/50",
    icon: "🔵",
    brandColor: "#0984e3"
  },
  Meeza: {
    nameAr: "ميزة",
    classes: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/50",
    icon: "💳",
    brandColor: "#00cec9"
  },
};

export function getProviderMeta(provider: string | null | undefined) {
  if (!provider) {
    return {
      nameAr: "حساب إلكتروني",
      classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800",
      icon: "📱",
      brandColor: "#7f8c8d"
    };
  }
  const meta = providerMeta[provider];
  if (meta) return meta;
  return {
    nameAr: provider,
    classes: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800",
    icon: "📱",
    brandColor: "#7f8c8d"
  };
}

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
      <Card className="border-dashed border-2 bg-slate-50/50 dark:bg-slate-900/50">
        <CardContent className="p-10 text-center text-muted-foreground space-y-6">
          <div className="relative mx-auto w-32 h-32 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center animate-in zoom-in duration-500">
            <Wallet className="w-16 h-16 text-emerald-500 animate-bounce" style={{ animationDuration: "3s" }} />
            <div className="absolute top-0 right-0 w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-700/50 flex items-center justify-center -translate-y-2 translate-x-2 animate-pulse">
              <span className="text-amber-700 dark:text-amber-200 text-lg">💡</span>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">يلا نبدأ الرحلة! 🚀</h3>
            <p className="text-sm max-w-sm mx-auto">
              مفيش مصاريف متسجلة هنا لسه. دوس على أيقونة المايك وسجل أول مصروف بصوتك في ثواني!
            </p>
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
    parsedMetadata?: {
      sms_id?: string | null;
      provider?: string | null;
      direction?: "incoming" | "outgoing" | null;
      sms_category?: string | null;
      confidence?: number | null;
      fee?: number | null;
      balance_after?: number | null;
      parsed_by?: string | null;
    } | any;
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

  const isSms = expense.source === "sms";

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
            {isSms ? (
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={cn("border text-[10px] py-0 px-2 rounded flex items-center gap-1 shadow-sm font-medium", getProviderMeta(expense.parsedMetadata?.provider).classes)}>
                  <span>{getProviderMeta(expense.parsedMetadata?.provider).icon}</span>
                  <span>{getProviderMeta(expense.parsedMetadata?.provider).nameAr}</span>
                </Badge>
                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-indigo-50/50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-300 border-indigo-100 dark:border-indigo-900/40 rounded font-normal">
                  مزامنة تلقائية 📱
                </Badge>
              </div>
            ) : (
              <Badge className={cn("border-0", typeMeta.badgeClass)}>{typeMeta.label}</Badge>
            )}
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground border shadow-sm bg-white dark:bg-slate-800"
            >
              <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>تفاصيل العملية</DialogTitle>
              </DialogHeader>
              <div className="space-y-3" dir="rtl">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">المبلغ:</span>
                  <span className={cn("font-bold text-base", typeMeta.amountClass)}>
                    {typeMeta.sign}
                    {Number(expense.amount).toFixed(2)} جنيه
                  </span>
                </div>
                {isSms && expense.parsedMetadata?.provider && (
                  <div className="flex justify-between border-b pb-2 items-center">
                    <span className="text-sm text-muted-foreground">مقدم الخدمة:</span>
                    <Badge variant="outline" className={cn("border text-xs py-0.5 px-2 rounded-full flex items-center gap-1 font-medium", getProviderMeta(expense.parsedMetadata.provider).classes)}>
                      <span>{getProviderMeta(expense.parsedMetadata.provider).icon}</span>
                      <span>{getProviderMeta(expense.parsedMetadata.provider).nameAr}</span>
                    </Badge>
                  </div>
                )}
                {isSms && typeof expense.parsedMetadata?.fee === "number" && expense.parsedMetadata.fee > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">رسوم الخدمة:</span>
                    <span className="text-sm font-semibold text-rose-500">{expense.parsedMetadata.fee.toFixed(2)} جنيه 💸</span>
                  </div>
                )}
                {isSms && typeof expense.parsedMetadata?.balance_after === "number" && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">الرصيد بعد العملية:</span>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{expense.parsedMetadata.balance_after.toLocaleString("ar-EG")} جنيه 💰</span>
                  </div>
                )}
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
                    <span className="text-sm text-muted-foreground block mb-1">النص الأصلي للرسالة:</span>
                    <p className="text-xs bg-muted p-2 rounded break-words leading-relaxed select-all border font-mono whitespace-pre-wrap">{expense.rawText}</p>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>المصدر: {expense.source === "sms" ? "مزامنة بنكية (SMS) 📱" : expense.source === "voice" ? "صوتي 🎤" : expense.source === "ai_parsed" ? "نصي (AI) 🤖" : "يدوي ✍️"}</span>
                  <span>{date.toLocaleString("ar-EG")}</span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" className="h-11 w-11 p-0 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onRequestDelete(expense.id)} disabled={isDeleting}>
            <Trash2 className="w-5 h-5 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}
