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
  if (balances.length === 0) return null;
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
        <p className="text-[11px] text-muted-foreground">
          محسوبة من السلف اللي سجلتها. سجّل «احمد رجعلي 200» أو «رجعت لخالي 500» والرقم يتظبط.
        </p>
      </CardContent>
    </Card>
  );
}
