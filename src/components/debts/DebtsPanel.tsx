import { HandCoins } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Balance = { contactId: number | null; name: string; balance: number; count: number };

/**
 * "ليك وعليك": who owes the user and whom the user owes, from the loans they recorded
 * ("سلفت احمد 500"، "احمد رجعلي 200"، "استلفت من خالي 1000"). Nothing renders without loans.
 */
export function DebtsPanel() {
  const debts = trpc.expense.getDebtBalances.useQuery(undefined, { staleTime: 60_000 });
  const balances: Balance[] = Array.isArray(debts.data?.balances) ? debts.data.balances : [];
  const gam3eya = debts.data?.gam3eya;
  const hasGam3eya = Boolean(gam3eya && (gam3eya.paid > 0 || gam3eya.received > 0));
  if (balances.length === 0 && !hasGam3eya) return null;
  const owedToYou = Number(debts.data?.owedToYou) || 0;
  const youOwe = Number(debts.data?.youOwe) || 0;

  return (
    <Card id="debts">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="h-5 w-5 text-sky-600" />
          ليك وعليك
        </CardTitle>
        <div className="flex gap-4 text-xs">
          <span className="text-emerald-600">ليك: {owedToYou.toLocaleString("ar-EG")} ج</span>
          <span className="text-rose-600">عليك: {youOwe.toLocaleString("ar-EG")} ج</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {balances.map((entry) => (
          <div
            key={entry.contactId ?? entry.name}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
          >
            <span className="font-medium">{entry.name}</span>
            <span className={cn("font-bold", entry.balance > 0 ? "text-emerald-600" : "text-rose-600")}>
              {entry.balance > 0 ? "ليك عنده " : "عليك له "}
              {Math.abs(entry.balance).toLocaleString("ar-EG")} ج
            </span>
          </div>
        ))}
        {hasGam3eya && gam3eya && (
          <div className="rounded-lg border border-sky-200 px-3 py-2 text-sm dark:border-sky-900/50">
            <p className="font-medium">الجمعية</p>
            <p className="text-xs text-muted-foreground">
              دفعت {gam3eya.paid.toLocaleString("ar-EG")} ج ({gam3eya.installments} قسط) · قبضت{" "}
              {gam3eya.received.toLocaleString("ar-EG")} ج
            </p>
            <p className={cn("text-xs font-bold", gam3eya.held >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {gam3eya.held >= 0
                ? `ليك فيها ${gam3eya.held.toLocaleString("ar-EG")} ج`
                : `قبضت قبل ما تدفع ${Math.abs(gam3eya.held).toLocaleString("ar-EG")} ج، فاضل عليك تدفعهم`}
            </p>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          محسوبة من السلف اللي سجلتها. سجّل «احمد رجعلي 200» أو «رجعت لخالي 500» والرقم يتظبط.
        </p>
      </CardContent>
    </Card>
  );
}
