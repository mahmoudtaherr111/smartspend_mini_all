import { useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const egp = (value: number) => `${Math.round(value).toLocaleString("ar-EG")} ج`;

type Plan = {
  id: number;
  title: string;
  keyword: string;
  monthlyAmount: number;
  totalInstallments: number;
  paid: number;
  remaining: number;
  remainingAmount: number;
  done: boolean;
};

/**
 * «فاضل كام قسط»: each installment plan the user follows, counted from the installments
 * they record ("دفعت قسط فاليو 800") after adding it, plus the ones paid before.
 */
export function InstallmentsPanel() {
  const utils = trpc.useUtils();
  const plansQuery = trpc.expense.listInstallmentPlans.useQuery(undefined, { staleTime: 60_000 });
  const plans: Plan[] = Array.isArray(plansQuery.data) ? plansQuery.data : [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", keyword: "", monthlyAmount: "", totalInstallments: "", paidBefore: "0" });

  const create = trpc.expense.createInstallmentPlan.useMutation({
    onSuccess: () => {
      setAdding(false);
      setForm({ title: "", keyword: "", monthlyAmount: "", totalInstallments: "", paidBefore: "0" });
      void utils.expense.listInstallmentPlans.invalidate();
      toast.success("القسط اتضاف");
    },
    onError: (error) => toast.error(error.message || "ماقدرناش نضيف القسط، جرّب تاني"),
  });
  const remove = trpc.expense.deleteInstallmentPlan.useMutation({
    onSuccess: () => void utils.expense.listInstallmentPlans.invalidate(),
  });

  const submit = () => {
    const monthlyAmount = Number(form.monthlyAmount);
    const totalInstallments = Number(form.totalInstallments);
    const paidBefore = Number(form.paidBefore || 0);
    if (!form.title.trim() || !monthlyAmount || !totalInstallments) {
      toast.error("اكتب اسم القسط وقيمته وعدد الأقساط");
      return;
    }
    create.mutate({
      title: form.title.trim(),
      keyword: (form.keyword || form.title).trim(),
      monthlyAmount,
      totalInstallments,
      paidBefore,
    });
  };

  return (
    <Card id="installments">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-violet-600" />
          الأقساط
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setAdding((open) => !open)} aria-label="ضيف قسط">
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="space-y-2 rounded-lg border p-3">
            <Input placeholder="اسم القسط (مثلاً: الموبايل فاليو)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="كلمة بتكتبها لما تدفعه (مثلاً: فاليو)" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input inputMode="decimal" placeholder="القسط كام" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
              <Input inputMode="numeric" placeholder="كام قسط" value={form.totalInstallments} onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })} />
              <Input inputMode="numeric" placeholder="دفعت كام" value={form.paidBefore} onChange={(e) => setForm({ ...form, paidBefore: e.target.value })} />
            </div>
            <Button size="sm" className="w-full" onClick={submit} disabled={create.isPending}>
              احفظ
            </Button>
          </div>
        )}
        {plans.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground">
            عندك قسط؟ ضيفه بالـ + وكل ما تسجّل «دفعت قسط فاليو 800» هنعدّه ونقولك فاضل كام.
          </p>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="space-y-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{plan.title}</span>
                <button
                  type="button"
                  className="text-muted-foreground"
                  aria-label={`امسح ${plan.title}`}
                  onClick={() => remove.mutate({ id: plan.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-violet-500" style={{ width: `${(plan.paid / plan.totalInstallments) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {plan.done
                  ? "خلّصت الأقساط كلها 🎉"
                  : `فاضل ${plan.remaining.toLocaleString("ar-EG")} قسط من ${plan.totalInstallments.toLocaleString("ar-EG")} · ${egp(plan.remainingAmount)}`}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
