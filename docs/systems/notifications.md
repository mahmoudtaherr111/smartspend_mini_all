# Notifications and WhatsApp

How the app reaches people outside the screen they are on: push notifications to browsers and phones, the bell of
in-app notifications, notifications sent on a schedule or when something happens (a budget passed, a streak, a quiet
week), and the WhatsApp service that verifies phone numbers, sends messages and runs admin broadcasts.

- Facts generated from the code, with diagrams: [docs/atlas/systems/notifications.md](../atlas/systems/notifications.md)
- The same story for readers who do not read code: [docs/ar/systems/notifications.md](../ar/systems/notifications.md)
- Folder rules while editing: `api/AGENTS.md`, `src/AGENTS.md`

## The pieces
| Piece | Where | What it does |
| --- | --- | --- |
| Engine | `api/notification-engine.ts` | Templates, scheduled and event notifications, the activity checks, the budget alert, push delivery |
| Firebase | `api/services/firebase.ts` | Firebase Cloud Messaging for tokens from Android, iOS and browsers |
| Push subscriptions | `profile.savePushSubscription` in `api/profile-router.ts`, `src/hooks/usePushNotifications.ts`, `src/components/notifications/PushNotificationPrompt.tsx` | Asking for permission and saving the device's token or Web Push subscription |
| Bell | `src/components/NotificationBell.tsx`, `profile.getInAppNotifications`, `profile.markInAppNotificationRead` | The latest in-app notifications, and marking one read |
| WhatsApp service | `api/services/whatsapp-service.ts#whatsappService` | A WhatsApp Web client (Baileys) with its session on disk; sends messages and reads verification codes |
| Verification state | `api/services/otp-cache.ts` | Codes, request limits and the blocklist of senders, in process memory |
| WhatsApp admin | `api/admin-whatsapp-router.ts`, `src/components/admin/AdminWhatsAppTab.tsx` | Status and QR code, start and stop, direct messages, broadcasts, the verification switch |
| Templates admin | the notification procedures of `api/admin-router.ts`, `src/components/admin/NotificationsTab.tsx` | Creating, scheduling and switching templates, running the activity check at once, logs and device statistics; see [admin](admin.md) |

## Delivering a notification
- `sendPush` (one device) and `sendPushBatch` (many) send through Firebase Cloud Messaging when the subscription has a
  token and Firebase is configured (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), and through
  Web Push with the `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` keys otherwise. A single send deletes a token Firebase
  reports as unregistered, and Web Push deletes a subscription reported gone; batches pace themselves, Firebase in large
  chunks with a pause and Web Push a few devices at a time.
- A template has an Arabic and an English title and body with `{{variables}}`; the text follows `preferences.language`
  in the user's profile and falls back to Arabic.
- A templated notification is also stored in `in_app_notifications` for the bell and logged in `notification_logs`.

## What sends notifications
| Trigger | When | Who gets it |
| --- | --- | --- |
| `budget_near_limit`, `budget_category_exceeded`, from `checkUserBudgetExceeded` | after an item is saved, typed or from a bank message | a user with budgets: once per budget cycle when a budget reaches its alert threshold, and once when it passes its limit ([Money](money.md#budgets)) |
| `budget_exceeded`, from `checkUserBudgetExceeded` | after an item is saved ([Recording spending](expense-capture.md)) | a user without budgets whose spending in this Cairo calendar month passed the monthly income in the profile; once a month |
| `manual_scheduled` templates, from `processScheduledNotifications` in the job `scheduled-notifications` | every minute, for active templates whose send time has passed | one user, or every user filtered by plan and a minimum number of transactions; the template is then switched off |
| `inactivity_reminder`, from `checkAndTriggerSmartActivityNotifications` in the job `smart-activity-notifications` | daily at 20:00 | users with a streak of at least 2 whose last recorded day was 12 to 36 hours ago; once a day |
| `pro_conversion_streak` | the same run | Free users with a streak of at least 4 who recorded in the last 36 hours; once a week |
| `dormant_reactivation` | the same run | users whose last recorded day was 7 to 8 days ago; once a week |
| The passkey suggestion, `profile.sendBiometricPromptNotification` | when the app suggests a passkey | once per user, in the bell only |
| Admin pushes, `admin.sendPushNotification` | on demand, though no screen calls it | everyone, Free users, paying users or one user; push only |

The thresholds of the activity checks can be changed in a template's segment (`minStreak`, `inactivityDays`). The four
default templates are created when their event type has none, by the job `seed-default-templates` at boot on replicas
with `ENABLE_CRONS=true`, and again before the scheduled and activity runs.

## Push in the browser
- A prompt asks for permission eight seconds after the app opens while permission is undecided, and at most once a week
  after it is dismissed; Settings has the same button.
- With the web Firebase configuration (`VITE_FIREBASE_*`), the browser gets a Firebase token; otherwise it subscribes to
  Web Push with `VITE_VAPID_PUBLIC_KEY`. `profile.savePushSubscription` stores the token or subscription with the
  device type, and moves an existing one to the user who is signed in.
- The bell fetches the latest 50 in-app notifications every minute; opening one marks it read and follows its link.

## WhatsApp
- The service is WhatsApp Web through Baileys, logged in by scanning a QR code shown in the admin console. Its session
  lives in `whatsapp_auth_info/` on the server's disk. At boot it starts only when `ENABLE_WHATSAPP=true` and a saved
  session exists; otherwise an admin starts it. A dropped connection reconnects after a few seconds, and a logout deletes
  the session.
- `sendMessage` refuses when the service is not connected or the number has no WhatsApp, shows typing for a moment, and
  sends. The WhatsApp monthly report of [insights](insights.md), the phone-change codes of [accounts](accounts.md) and
  admin messages go through it.
- An incoming message that contains a code (`SS-` and six digits) goes to `receiveVerificationCode`: the open challenges
  with that code are read from `whatsapp_otp_codes` (`api/services/phone-challenge.ts`), and the one whose number, or
  saved WhatsApp LID, is the sender's is marked verified, with a `challenge:<id>` event for the `/api/sse/otp` stream in
  this process. A code from any other number verifies nothing, tells the watching page `wrong_sender` without either
  number, and is counted: three block the sender for 15 minutes, in memory, since the service runs in one process. The
  sign-up flow around it is in [accounts](accounts.md).
- Admin broadcasts (`adminWhatsapp.broadcastMessage`) queue one message per phone user in process memory and send them
  one at a time, with a random pause of two to four minutes and a random choice between the `{a|b}` alternatives written
  in the text.

## Where to change what
| To change | Edit | Check with |
| --- | --- | --- |
| Default templates and their texts | `seedDefaultTemplates` in `api/notification-engine.ts`, or the templates tab of the admin console | |
| Who the activity notifications reach | `checkAndTriggerSmartActivityNotifications` and the template's segment | |
| Delivery | `sendPush` and `sendPushBatch` in `api/notification-engine.ts`, `api/services/firebase.ts` | |
| Asking for push permission | `src/components/notifications/PushNotificationPrompt.tsx`, `src/hooks/usePushNotifications.ts` | |
| The bell | `src/components/NotificationBell.tsx` | |
| The WhatsApp connection and sending | `api/services/whatsapp-service.ts` | |
| Broadcasts | `api/admin-whatsapp-router.ts` | |

## Rules for changes here
1. Send through a template with `triggerEventNotification` or the batch sender, so the notification reaches the bell,
   the log and every device.
2. Never log message text, codes or phone numbers (golden rule 10): the WhatsApp service, the code blocklist and
   broadcasts log a number as its last four digits and never a code or a message, and a failed push logs the
   subscription's id, never the device token.
3. Anything sent to many users is paced and runs as a scheduled job, which holds a lock on one replica.
4. The WhatsApp session belongs to one process: never start it on more than one replica.

## Tests
`api/services/whatsapp-service.receive.test.ts` covers the handling of incoming verification codes; nothing else in
this system has a test.

## Known issues
Checked against the code; each one names where it lives.
1. **Debt.** Nothing tests notification delivery, the templates, the activity checks or the WhatsApp connection and its
   sending.
2. **Bug.** The admin console always shows WhatsApp verification as off: `adminWhatsapp.getSettings` returns a fixed "temporarily
   disabled" answer, while `adminWhatsapp.toggleOtpVerification` still changes the `whatsapp_otp_enabled` setting that
   registration reads.
3. **Bug.** The permission prompt promises weekly follow-ups, daily voice reminders and alerts for unusual spending; the
   server sends none of those, and the reminder reaches only users with a streak whose last recorded day was 12 to 36
   hours ago.
4. **Bug.** The default Pro upsell promises a 30% discount that checkout never gives ([billing](billing.md)).
5. **Bug.** When `VITE_VAPID_PUBLIC_KEY` is missing, the browser subscribes with a public key written in
   `src/hooks/usePushNotifications.ts`, and those subscriptions receive nothing unless the server's keys match.
   `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are read from `process.env` instead of `api/lib/env.ts` (golden rule 8).
6. **Security.** WhatsApp broadcasts are automated bulk messages through an unofficial client, spaced by random pauses and varied
   wording, which risks a ban of the number; the queue lives in process memory and is lost on restart, and nothing
   checks that recipients agreed.
7. **Debt.** The WhatsApp session is a folder on one server's disk, lost with the container and not shareable between replicas.
8. **Gap.** Push cannot be turned off from the app, a device cannot be removed, the bell has no "mark all read" or clearing, and
   nothing prunes `in_app_notifications` or `notification_logs` apart from account deletion.
9. **Bug.** The activity checks run at 20:00 server time, not Cairo time, and each takes at most 1000 users per account table a
   day; a scheduled template that fails half-way stays active and is sent again from the start on the next minute.

## Related systems
- [Accounts, sign-in and security](accounts.md): phone verification and the passkey suggestion.
- [Money](money.md) and [Recording spending](expense-capture.md): the budget alert after a save.
- [Reports, insights and the smart profile](insights.md): the WhatsApp monthly report.
- [Plans and payments](billing.md): the Pro upsell.
- [Admin console, support and growth tools](admin.md): templates and the WhatsApp tab.
- [Server platform and data](platform.md): the job scheduler and its lock.
