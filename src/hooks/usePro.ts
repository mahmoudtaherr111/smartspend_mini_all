import { trpc } from "../providers/trpc";

export function usePro() {
  const utils = trpc.useUtils();
  const myPlan = trpc.pro.myPlan.useQuery();
  const upgrade = trpc.pro.upgrade.useMutation({ onSuccess: () => utils.pro.myPlan.invalidate() });
  const cancel = trpc.pro.cancel.useMutation({ onSuccess: () => utils.pro.myPlan.invalidate() });

  return { myPlan, upgrade, cancel };
}
