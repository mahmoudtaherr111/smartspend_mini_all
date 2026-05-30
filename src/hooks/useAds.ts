import { trpc } from "../providers/trpc";

export function useAds() {
  const utils = trpc.useUtils();
  const ads = trpc.ads.list.useQuery({
    placement: "sidebar",
    userPlan: "free",
  });
  const clickAd = trpc.ads.click.useMutation({
    onSuccess: () => utils.ads.list.invalidate(),
  });

  return { ads, clickAd };
}
