import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { CAPTURE_WALLET_KINDS } from "@contracts/capture";
import { Button } from "@/components/ui/button";

const LABELS = { unknown: "مش محدد", cash: "نقدي أو محفظة إلكترونية", bank: "حساب بنكي", debit: "بطاقة خصم مباشر", credit: "بطاقة ائتمان" } as const;
export function WalletBalanceKind({ walletId }: { walletId: number }) {
  const utils = trpc.useUtils();
  const status = trpc.capture.status.useQuery(undefined, { staleTime: 60_000 });
  const enabled = status.data?.walletTypesEnabled === true;
  const kind = trpc.capture.walletKind.useQuery({ walletId }, { enabled });
  const update = trpc.capture.setWalletKind.useMutation({
    onSuccess: () => { void utils.capture.walletKind.invalidate({ walletId }); void utils.wallet.invalidate(); void utils.coach.overview.invalidate(); },
    onError: () => toast.error("ماقدرناش نحفظ نوع الرصيد، جرّب تاني"),
  });
  if (!enabled) return null;
  return <div className="space-y-2 text-sm">
    <label className="block">نوع الرصيد<select className="mt-1 w-full rounded-md border bg-background p-2" value={kind.data ?? "unknown"} disabled={kind.isLoading || update.isPending} onChange={(event) => {
      const value = CAPTURE_WALLET_KINDS.find((item) => item === event.target.value);
      if (value) update.mutate({ walletId, kind: value });
    }}>{CAPTURE_WALLET_KINDS.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">متاح الائتمان مش فلوس نقدية. تحديد النوع بيخلّي الرصيد وحساب المتاح أدق.</p>
    {kind.isError && <Button size="sm" variant="outline" onClick={() => void kind.refetch()}>جرّب تحميل النوع تاني</Button>}
  </div>;
}
