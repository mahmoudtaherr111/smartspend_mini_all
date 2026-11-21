# 0038. WhatsApp goes through Meta's official Cloud API, every message through a persistent outbox

- Status: accepted; being built in steps. The foundation is in `api/lib/whatsapp/` (client, templates, webhook,
  outbox), the tables `whatsapp_messages` and `whatsapp_contacts`, the routes `GET` and `POST /api/webhooks/whatsapp`
  and the job `whatsapp-outbox`. Next: verification codes by template, then reports, reminders, the phone change and
  admin messages, then the removal of Baileys.
- Decided and recorded: 2026-10-29, by the owner (official API, paid per message) and from security known issue 4 of the
  notifications page.

## Context
WhatsApp was a WhatsApp Web client (Baileys) logged in by a QR code, with its session in a folder on one server's disk.
Broadcasts were bulk messages from an in-memory queue spaced by random pauses and varied wording to avoid a ban, without
checking that recipients agreed. Verification relied on the person sending a code to our number, matched to the
sender's number. Meta's platform now lets people hide their number behind a username (2026), so a webhook may carry a
business-scoped user id and no number.

## Decision
1. **Meta's Cloud API only.** Business-initiated messages are approved templates (authentication, utility, marketing);
   free text only inside the 24-hour window after the person last wrote to us. Keys live only in `.env`.
2. **Every outbound message is a row of `whatsapp_messages`** with its purpose, template, non-secret parameters and
   status, never its text or a code. Codes are sent in the request; the rest by a protected job with retries for what
   Meta says may pass later. Status webhooks move a row forward only.
3. **The webhook believes only signed bodies** (`X-Hub-Signature-256` with the app secret) and subscribes only with our
   verify token. It identifies people by Meta's user id first, their number second.
4. **Verification codes are sent to the person** in the authentication template, instead of the person sending one to
   us: delivery to the WhatsApp account of a number proves the number, whether or not it is hidden from us, and Android
   suggests the code on the keyboard.
5. **Consent per purpose** in `whatsapp_contacts`: reports, reminders and marketing each with when and where they were
   given; a stop word withdraws marketing at once. Marketing goes only to people who opted in.

## Consequences
- No ban risk from automation, no session on disk, any replica can send, and nothing is lost on a restart.
- Each message costs money (authentication and utility around $0.004, marketing around $0.065 in Egypt; Meta's rate
  card decides); the console will show spend and cap it.
- Until the owner sets the keys, nothing is sent through the Cloud API.
