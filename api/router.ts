import { router } from "./middleware";
import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { expenseRouter } from "./expense-router";
import { aiRouter } from "./ai-router";
import { analyticsRouter } from "./analytics-router";
import { adminRouter } from "./admin-router";
import { supportRouter } from "./support-router";
import { exportRouter } from "./export-router";
import { sessionRouter } from "./session-router";
import { proRouter } from "./pro-router";
import { adsRouter } from "./ads-router";
import { referralRouter } from "./referral-router";
import { seoRouter } from "./seo-router";

export const appRouter = router({
  auth: authRouter,
  localAuth: localAuthRouter,
  expense: expenseRouter,
  ai: aiRouter,
  analytics: analyticsRouter,
  admin: adminRouter,
  support: supportRouter,
  export: exportRouter,
  session: sessionRouter,
  pro: proRouter,
  ads: adsRouter,
  referral: referralRouter,
  seo: seoRouter,
});

export type AppRouter = typeof appRouter;
