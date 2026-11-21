/**
 * What Meta sends to `/api/webhooks/whatsapp` (decision 0038). A GET subscribes the URL once, with our verify token;
 * every POST is signed with the app secret (`X-Hub-Signature-256`, HMAC-SHA256 of the raw body) and carries status
 * changes of messages we sent and messages people send us.
 *
 * People can hide their number behind a WhatsApp username (2026): an incoming message then names a business-scoped
 * user id and may have no phone number, so nothing here assumes one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The `hub.challenge` to echo when Meta subscribes with our token, or null to refuse. */
export function subscriptionChallenge(
  query: { mode?: string; token?: string; challenge?: string },
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken || query.mode !== "subscribe" || !query.challenge || !query.token) return null;
  return sameText(query.token, verifyToken) ? query.challenge : null;
}

/** Whether the body was signed with our app secret. Without a secret nothing is believed. */
export function hasValidSignature(rawBody: string, header: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return sameText(header, expected);
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type WebhookEvent =
  | {
      kind: "status";
      messageId: string;
      status: DeliveryStatus;
      at: Date;
      errorCode?: number;
      pricingCategory?: string;
    }
  | {
      kind: "inbound";
      messageId: string;
      at: Date;
      /** International digits, when the person's number is visible to us. */
      phone?: string;
      /** Meta's business-scoped user id, when present. */
      bsuid?: string;
      /** Text of a text message or a button reply. Kept in memory only, never stored or logged. */
      text?: string;
    };

const STATUSES = new Set<DeliveryStatus>(["sent", "delivered", "read", "failed"]);

function instant(seconds: unknown): Date {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000) : new Date();
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The events of one webhook body, in order. Unknown shapes are skipped, never thrown on. */
export function parseWebhook(body: unknown): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return events;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { field?: string; value?: Record<string, unknown> })?.value;
      if ((change as { field?: string })?.field !== "messages" || !value) continue;

      for (const raw of Array.isArray(value.statuses) ? value.statuses : []) {
        const status = raw as Record<string, unknown>;
        const messageId = str(status.id);
        const kind = str(status.status) as DeliveryStatus | undefined;
        if (!messageId || !kind || !STATUSES.has(kind)) continue;
        const errors = Array.isArray(status.errors) ? (status.errors as { code?: unknown }[]) : [];
        const errorCode = typeof errors[0]?.code === "number" ? errors[0].code : undefined;
        const pricing = status.pricing as { category?: unknown } | undefined;
        events.push({
          kind: "status",
          messageId,
          status: kind,
          at: instant(status.timestamp),
          ...(errorCode === undefined ? {} : { errorCode }),
          ...(str(pricing?.category) ? { pricingCategory: str(pricing?.category) } : {}),
        });
      }

      const contacts = Array.isArray(value.contacts) ? (value.contacts as Record<string, unknown>[]) : [];
      for (const raw of Array.isArray(value.messages) ? value.messages : []) {
        const message = raw as Record<string, unknown>;
        const messageId = str(message.id);
        if (!messageId) continue;
        const from = str(message.from);
        const bsuid = str(message.from_user_id) ?? str(message.user_id) ?? str(contacts[0]?.user_id);
        // `from` is the number unless the person hides it, in which case it may be absent or the user id itself.
        const phone = from && /^\d{8,15}$/.test(from) ? from : str(contacts[0]?.wa_id);
        const text =
          str((message.text as { body?: unknown })?.body) ??
          str((message.button as { text?: unknown })?.text) ??
          str((message.interactive as { button_reply?: { title?: unknown } })?.button_reply?.title);
        events.push({
          kind: "inbound",
          messageId,
          at: instant(message.timestamp),
          ...(phone ? { phone } : {}),
          ...(bsuid ? { bsuid } : {}),
          ...(text ? { text } : {}),
        });
      }
    }
  }
  return events;
}

/** Words that withdraw marketing consent when sent alone: Arabic and English, any case, around spaces. */
const OPT_OUT_WORDS = new Set(["ايقاف", "إيقاف", "وقف", "الغاء", "إلغاء", "الغاء الاشتراك", "إلغاء الاشتراك", "stop", "unsubscribe"]);

export function isOptOut(text: string | undefined): boolean {
  if (!text) return false;
  return OPT_OUT_WORDS.has(text.trim().toLowerCase().replace(/\s+/g, " "));
}
