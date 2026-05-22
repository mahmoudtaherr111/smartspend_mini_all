# Production Launch Checklist

## Environment (required)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | MySQL 8+ |
| `JWT_SECRET` | Yes | Strong random |
| `GEMINI_API_KEY` | Yes | Classification + reports |
| `GOOGLE_CLIENT_ID/SECRET` | Yes | OAuth |
| `GOOGLE_REDIRECT_URI` | Yes | Must match Google console |
| `APP_URL` | Yes | Public HTTPS origin |
| `NODE_ENV` | Yes | `production` |
| `PAYMOB_*` | Yes for revenue | See below |
| `BILLING_SIMULATE` | **Must be unset or false** | Never `true` in prod |
| `PAYMOB_HMAC_SECRET` | Yes | Webhook verification |
| `TRUST_PROXY` | Yes if behind nginx | `true` |

Copy from [`.env.example`](../.env.example).

## Database

```bash
npm run db:push
# or npm run db:migrate
```

Tables required: `users`, `local_users`, `expenses`, `pro_subscriptions`, `support_tickets`, `financial_goals`, `classification_logs`, `user_analytics`, `system_settings`.

## Build & run

```bash
npm install
npm run build
NODE_ENV=production node dist/boot.js
```

Monorepo serves `dist/public` + API on `PORT` (default 3000).

## Paymob (revenue)

1. Create Paymob Accept integration (card iframe).
2. Set `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`.
3. Webhook URL: `https://YOUR_DOMAIN/api/webhooks/paymob`
4. Test card payment → verify `pro_subscriptions` row + user `plan=pro`.
5. Admin: `pro.listSubscriptions` or Admin founder metrics `activeProSubs`.

**Simulate billing:** only `NODE_ENV=development` or `BILLING_SIMULATE=true`. Production returns `mode: unavailable` without Paymob.

## Security

- [ ] HTTPS everywhere
- [ ] Cookies `Secure` in production (OAuth callback)
- [ ] No secrets in git
- [ ] Admin routes require `admin` / `moderator` role
- [ ] CORS: `APP_URL` + `FRONTEND_URL` in allowlist
- [ ] Rate limits: `ai-usage-policy` burst guard active
- [ ] Paymob HMAC verified on webhook

## Manual smoke (pre-launch)

| # | Flow | Pass |
|---|------|------|
| 1 | Register / login | |
| 2 | Add expense voice + text | |
| 3 | Free user hits daily AI limit → upgrade CTA | |
| 4 | Pro checkout Paymob (sandbox) | |
| 5 | Pro features: report export, goals | |
| 6 | Support ticket + admin respond + close | |
| 7 | PWA install (Android Chrome) | |
| 8 | Mobile: Home, Pro, Support | |
| 9 | Offline → offline.html shell | |

## Automated tests

```bash
npx vitest run
```

## Post-launch week 1

- Daily: `getFounderMetrics` — DAU, new Pro, open tickets, token sum
- Watch `classification_logs` for `pro_ai_primary` on trivial phrases (should decrease)
- Paymob dashboard vs `pro_subscriptions` reconciliation
- Gemini quota / cost alerts

## Known risks

- Paymob `extras` metadata must reach webhook (verify one real payment).
- `financial_goals` table must exist (`db:push`).
- Cold start: first embedding request loads descriptor cache (slow once).
