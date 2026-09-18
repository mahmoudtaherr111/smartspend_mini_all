# Plans and payments

The Free, Pro and Ultra plans, buying Pro through Paymob's hosted checkout, the webhook that grants a plan, the daily
job that ends subscriptions, referral codes, and the Ultra members page.

- Facts generated from the code, with diagrams: [docs/atlas/systems/billing.md](../atlas/systems/billing.md)
- The same story for readers who do not read code: [docs/ar/systems/billing.md](../ar/systems/billing.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## Plans and what they gate
- The plan is a column of the user row (`plan`: `free`, `pro` or `ultra`), separate from `role` (golden rule 2).
- What can be bought is `contracts/plans.ts#BILLING_PLANS`: Pro monthly, Pro yearly and Ultra monthly, each with an
  exact amount in piastres, a duration and the plan it grants.
- The server gates features with `proProcedure` (Pro, Ultra or admin) and `ultraProcedure` (Ultra or admin) from
  `api/middleware.ts`; the web app mirrors them with `hasProAccess` in `src/hooks/useAuth.ts` and the route guards in
  `src/components/routing/PlanGates.tsx`. The plan-dependent limits of AI features are settings, described in
  [AI providers and usage limits](ai-platform.md) and the systems that use them.

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Plans screen | `src/pages/Pro.tsx#Pro`, `src/hooks/usePro.ts` | The current plan and its end date, the plan cards, checkout, cancelling, the referral code |
| Ultra page | `src/pages/UltraLounge.tsx` | A placeholder for Ultra members |
| Plan API | `api/pro-router.ts` | `pro.myPlan`, `pro.createCheckoutSession`, `pro.upgrade`, `pro.cancel`, `pro.listSubscriptions` |
| Paymob checkout | `api/lib/paymob.ts#createPaymobHostedCheckoutUrl` | The order, the payment key and the hosted checkout address |
| Webhook | the `/api/webhooks/paymob` route in `api/boot.ts` | Verifies Paymob's callback and grants the plan |
| Grant | `api/lib/subscription-service.ts#grantProSubscription` | One transaction: the subscription row, the user's plan, the session refresh |
| Expiry | `api/jobs/subscription-expiry-job.ts#runSubscriptionExpiryJob` | Ends subscriptions whose period is over |
| Referrals | `api/referral-router.ts` | The user's code, applying someone's code, the referral lists |

## Buying Pro, step by step
1. The Pro card's button calls `pro.createCheckoutSession` for `pro_monthly`.
2. When `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID` and `PAYMOB_IFRAME_ID` are set, `createPaymobHostedCheckoutUrl` gets
   an auth token, creates an order for the plan's exact amount and a payment key valid for an hour that carries the
   user id, user type and plan as extras, and returns the hosted checkout address; the screen redirects there.
3. Without Paymob, the answer is `simulate` in development or when `BILLING_SIMULATE=true`, and `unavailable`
   otherwise. On `simulate` the screen calls `pro.upgrade`, which grants the plan only when `BILLING_SIMULATE=true` and
   never in production.
4. Paymob calls `POST /api/webhooks/paymob`:
   - the log gets the transaction id, its success and pending flags, the amount and whether it was signed — never
     the payload, which carries the payer's card metadata and billing details (golden rule 10);
   - in production without `PAYMOB_HMAC_SECRET` the callback is refused;
   - with the secret, the `hmac` query value must equal the HMAC-SHA512 of Paymob's transaction fields, compared in
     constant time;
   - a successful transaction that is not pending must carry a valid user and plan in its extras and exactly the plan's
     amount, or it is refused; other callbacks are acknowledged and ignored.
5. `grantProSubscription`, in one transaction: a transaction id that was already recorded returns the earlier result;
   otherwise the new period starts at the end of a subscription that is still running, or now, and lasts a month or a
   year. It is stored as an active `pro_subscriptions` row, the user's plan is set, the auth version is bumped so
   cached sessions see the plan, and an upgrade event is recorded.

The journey is drawn as `flow_paymob_upgrade` in `docs/architecture/flows/paymob-upgrade.c4`.

## Ending and cancelling
- `pro.cancel` marks the user's active subscriptions `cancelled`; the plan stays until the end date.
- `daily-subscription-expiry` runs at 06:00 on replicas with `ENABLE_CRONS=true`: subscriptions that are active or
  cancelled and past their end date become `expired`, and a user without another running subscription goes back to
  Free, with the auth version bumped. One run handles up to 500 subscriptions.
- `pro.myPlan` also expires the latest subscription when it finds it past its end date, and returns the plan, the role,
  that subscription and a fixed list of paid features.

## Referral codes
- `referral.myCode` returns the user's code (created on first use and checked against users of the same kind and the
  discount codes), how many people used it, and the discount percentage in the `promo_code_discount` setting.
- `referral.applyCode` records that the caller joined through someone's code: once per user, with a unique index
  guarding races, and never with one's own code. Phone users can also enter a code when they register.
- `referral.myReferrals` and the admin `referral.listAll` list referrals.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Prices, durations and what a plan grants | `contracts/plans.ts` | `api/lib/billing-plans.test.ts` |
| The plans screen | `src/pages/Pro.tsx` | |
| Checkout | `api/lib/paymob.ts`, `pro.createCheckoutSession` in `api/pro-router.ts` | |
| Webhook verification | the Paymob route in `api/boot.ts` | |
| What a payment grants | `api/lib/subscription-service.ts` | |
| When plans end | `api/jobs/subscription-expiry-job.ts` and its schedule in `api/boot.ts` | |
| A feature only paying users get | `proProcedure` or `ultraProcedure` on the procedure, and `ProFeatureRoute` or `UltraFeatureRoute` on the screen | |

## Rules for changes here
1. A plan is granted only by `grantProSubscription`, from a verified webhook or the development simulation.
2. Prices live in `contracts/plans.ts`, and the webhook accepts only the exact amount.
3. Compare `plan` with plan names and `role` with roles, never across (golden rule 2, checked by
   `tests/knowledge/architecture.test.ts`).
4. Plan writes go through `setPlan` in `api/lib/access-control.ts` — with the caller's transaction when the
   plan must commit with something else, as the grant does — so the cached session never keeps a plan the
   row no longer has (`tests/knowledge/architecture.test.ts`).

## Tests
`api/lib/billing-plans.test.ts` covers the plan contract.

## Known issues
Checked against the code; each one names where it lives.
1. **Gap.** Ultra cannot be bought: the Ultra card links to `/ultra`, a placeholder page that `src/App.tsx` guards only with a
   sign-in, not with `UltraFeatureRoute`; no procedure uses `ultraProcedure`; and the yearly Pro plan has no screen.
2. **Gap.** The referral discount is only shown: checkout always charges the plan's full price, nothing rewards the referrer,
   and the discount codes admins create in `discount_codes` are never applied.
3. **Gap.** Nothing renews a subscription, since each Paymob payment is a one-time charge; `pro.cancel` only changes the status
   the plans screen shows, and there is no refund path.
4. **Bug.** The feature list on the plans screen and in `pro.myPlan` is fixed text that does not match the app: ten AI requests a
   day for Free (the chat's limit is `chatbot_daily_limit_free`, 20 by default), spreadsheet export (no screen calls
   `export.myExpenses`) and switching AI models.
5. **Security.** Outside production without `PAYMOB_HMAC_SECRET`, the webhook accepts unsigned callbacks and grants plans
   from them.
6. **Debt.** In development without `BILLING_SIMULATE=true`, checkout answers `simulate` but `pro.upgrade` refuses it.
7. **Debt.** No test covers the webhook's verification, the grant, the expiry job or referrals.

## Related systems
- [Accounts, sign-in and security](accounts.md): the user rows that carry the plan, and the auth version.
- [Admin console, support and growth tools](admin.md): subscriptions, plans and discount codes in the admin console.
- [AI providers and usage limits](ai-platform.md): the plan-dependent AI limits.
- [Server platform and data](platform.md): the Hono app that hosts the webhook, and the job scheduler.
- [Web and mobile app shell](web-app.md): the More page and the route guards.
