import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { ExpenseInputLimits } from "@contracts/constants";
import {
  defaultSubCategory,
  getCategoryOptionsForType,
  getSubCategoryOptions,
} from "@/lib/financial-taxonomy";

export interface EditableExpense {
  id: number;
  amount: string | number;
  type: string;
  category: string;
  subCategory: string | null;
  description: string | null;
  date: string | Date;
}

const TYPE_OPTIONS = [
  { value: "expense", label: "مصروف" },
  { value: "refund", label: "مرتجع" },
  { value: "income", label: "دخل" },
  { value: "transfer", label: "تحويل" },
  { value: "investment", label: "استثمار" },
] as const;
/** What the dialog offers: the four kinds, and a refund (an expense whose money came back). */
type ExpenseType = (typeof TYPE_OPTIONS)[number]["value"];

/** A refund is stored as a negative expense (ledgerAmount on the server). */
function kindOf(expense: { type: string; amount: string | number }): ExpenseType {
  if (expense.type === "expense" && Number(expense.amount) < 0) return "refund";
  return (expense.type as ExpenseType) || "expense";
}

/** The day of an instant on this device, as the date input shows it (YYYY-MM-DD). */
function dayOf(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA");
}

/**
 * Edits a saved item: amount, kind, category, date and description. A changed category
 * is also a lesson: `expense.update` records it as the user's correction, so the same
 * sentence is filed their way next time. Mount it only while open, so each opening starts
 * from the saved values.
 */
export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSaved,
}: {
  expense: EditableExpense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const originalKind = kindOf(expense);
  const originalAmount = Math.abs(Number(expense.amount));
  const [amount, setAmount] = useState(String(originalAmount));
  const [type, setType] = useState<ExpenseType>(originalKind);
  const [category, setCategory] = useState(expense.category);
  const [subCategory, setSubCategory] = useState(expense.subCategory || "عام");
  const [day, setDay] = useState(dayOf(expense.date));
  const [description, setDescription] = useState(expense.description ?? "");

  const update = trpc.expense.update.useMutation({
    onSuccess: () => {
      toast.success("اتعدلت");
      void utils.expense.list.invalidate();
      void utils.expense.getMonthSummary.invalidate();
      void utils.expense.getMonthlyStats.invalidate();
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message || "ماقدرناش نحفظ التعديل، جرّب تاني"),
  });

  const save = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > ExpenseInputLimits.amountMax) {
      toast.error("اكتب مبلغ أكبر من صفر");
      return;
    }
    // Only what changed is sent, so an untouched date keeps its time of day.
    const changes: Parameters<typeof update.mutate>[0] = { id: expense.id };
    if (value !== originalAmount) changes.amount = value;
    if (type !== originalKind) {
      const storedType = type === "refund" ? "expense" : type;
      if (storedType !== expense.type) changes.type = storedType;
      changes.refund = type === "refund";
    }
    if (category !== expense.category) changes.category = category;
    if (subCategory !== (expense.subCategory || "عام") || changes.category) changes.subCategory = subCategory;
    if (day !== dayOf(expense.date)) changes.date = new Date(`${day}T12:00:00`).toISOString();
    if (description !== (expense.description ?? "")) changes.description = description.slice(0, ExpenseInputLimits.descriptionMax);
    if (Object.keys(changes).length === 1) {
      onOpenChange(false);
      return;
    }
    update.mutate(changes);
  };

  const categories = getCategoryOptionsForType(type === "refund" ? "expense" : type, category);

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent dir="rtl">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>تعديل العملية</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            لو غيّرت الفئة، التطبيق هيفتكر اختيارك للجمل اللي شبهها.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`edit-amount-${expense.id}`}>المبلغ</Label>
            <Input
              id={`edit-amount-${expense.id}`}
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-type-${expense.id}`}>النوع</Label>
            <select
              id={`edit-type-${expense.id}`}
              value={type}
              onChange={(event) => {
                const nextType = event.target.value as ExpenseType;
                setType(nextType);
                const options = getCategoryOptionsForType(nextType === "refund" ? "expense" : nextType);
                if (!options.includes(category)) {
                  setCategory(options[0]);
                  setSubCategory(defaultSubCategory(options[0]));
                }
              }}
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-category-${expense.id}`}>الفئة</Label>
            <select
              id={`edit-category-${expense.id}`}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setSubCategory(defaultSubCategory(event.target.value));
              }}
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-sub-${expense.id}`}>الفئة الفرعية</Label>
            <select
              id={`edit-sub-${expense.id}`}
              value={subCategory}
              onChange={(event) => setSubCategory(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            >
              {[...new Set([subCategory, ...getSubCategoryOptions(category)])].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-day-${expense.id}`}>التاريخ</Label>
            <Input
              id={`edit-day-${expense.id}`}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-description-${expense.id}`}>الوصف</Label>
            <Input
              id={`edit-description-${expense.id}`}
              value={description}
              maxLength={ExpenseInputLimits.descriptionMax}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <AdaptiveDialogFooter className="flex-row gap-2 sm:gap-0">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            رجوع
          </Button>
          <Button className="flex-1" disabled={update.isPending} onClick={save}>
            {update.isPending ? "بنحفظ..." : "احفظ التعديل"}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
