import { router } from "./middleware";
import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { expenseRouter } from "./expense-router";
import { aiRouter } from "./ai-router";
import { analyticsRouter } from "./analytics-router";
import { adminRouter } from "./admin-router";
import { adminWhatsappRouter } from "./admin-whatsapp-router";
import { supportRouter } from "./support-router";
import { exportRouter } from "./export-router";
import { sessionRouter } from "./session-router";
import { proRouter } from "./pro-router";
import { adsRouter } from "./ads-router";
import { referralRouter } from "./referral-router";
import { seoRouter } from "./seo-router";
import { profileRouter } from "./profile-router";
import { walletRouter } from "./wallet-router";
import { imageRouter } from "./image-router";
import { goalsRouter } from "./goals-router";
import { webauthnRouter } from "./webauthn-router";
import { chatRouter } from "./chat-router";
import { businessRouter } from "./business-router";
import { budgetRouter } from "./budget-router";

export const appRouter = router({
  auth: authRouter,
  localAuth: localAuthRouter,
  expense: expenseRouter,
  ai: aiRouter,
  analytics: analyticsRouter,
  admin: adminRouter,
  adminWhatsapp: adminWhatsappRouter,
  support: supportRouter,
  export: exportRouter,
  session: sessionRouter,
  pro: proRouter,
  ads: adsRouter,
  referral: referralRouter,
  seo: seoRouter,
  profile: profileRouter,
  wallet: walletRouter,
  image: imageRouter,
  goals: goalsRouter,
  budget: budgetRouter,
  webauthn: webauthnRouter,
  chat: chatRouter,
  business: businessRouter,
});

export type AppRouter = typeof appRouter;
