import { businessDateKey } from "./lib/app-time";
import { aiSwitchesOff } from "./lib/feature-switches";
import { getSystemSettings } from "./lib/settings-cache";
import { publicProcedure, router } from "./middleware";

export const appConfigRouter = router({
  // What a client needs before anyone signs in: the oldest build the server still works with, where to update, and
  // what an admin stopped. It holds nothing about a person, so it is public.
  get: publicProcedure.query(async () => {
    const settings = await getSystemSettings();
    return {
      minVersion: {
        android: settings.mobile_min_version_android ?? "",
        ios: settings.mobile_min_version_ios ?? "",
      },
      storeUrl: {
        android: settings.mobile_store_url_android ?? "",
        ios: settings.mobile_store_url_ios ?? "",
      },
      aiOff: aiSwitchesOff(settings),
      // The Cairo day, so no client works out a ledger month from its own clock (golden rule 6).
      today: businessDateKey(),
    };
  }),
});
