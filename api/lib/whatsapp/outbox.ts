/**
 * Every WhatsApp message we send is a row of `whatsapp_messages` (decision 0038), so nothing is lost on a restart,
 * any replica can send, and the admin sees what happened to each one.
 *
 * A verification code is sent in the request that asks for it and recorded without the code; everything else is
 * queued and sent by the protected job `whatsapp-outbox`, which retries what Meta says may work later. Status
 * webhooks then move a row forward (sent, delivered, read) or end it (failed). Messages people send us only open the
 * 24-hour window in which a free reply is allowed, or withdraw marketing consent; their text is never stored.
 */
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { localUsers, whatsappContacts, whatsappMessages } from "../../../db/schema";
import { getDb } from "../../queries/connection";
import { createLogger, phoneTail } from "../log";
import {
  sendTemplate,
  sendText,
  whatsAppConfig,
  WhatsAppApiError,
  type TemplateMessage,
  type WhatsAppCloudConfig,
} from "./client";
import { isOptOut, type DeliveryStatus, type WebhookEvent } from "./webhook";

const log = createLogger("whatsapp");

export type MessagePurpose = "verification" | "report" | "reminder" | "admin_direct" | "broadcast" | "reply";
export interface MessageOwner {
  userId: number;
  userType: "oauth" | "local";
}

/** Waits before the 2nd to 6th try; after the sixth a message has failed. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

/** When to try again after `attempts` tries, or null when there is no try left. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  const wait = RETRY_DELAYS_MS[attempts - 1];
  return wait === undefined ? null : new Date(now.getTime() + wait);
}

const ORDER: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };

/**
 * Whether a status webhook moves a row: forward only, since Meta may send them late or twice; a failure ends a
 * message that was not delivered yet.
 */
export function movesForward(current: string, incoming: DeliveryStatus): boolean {
  if (!(current in ORDER)) return false; // failed or cancelled: final
  if (incoming === "failed") return ORDER[current] < ORDER.delivered;
  return ORDER[incoming] > ORDER[current];
}

const affected = (result: unknown) => Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);

/** What a row keeps to send its template later: the body and button parameters, never a verification code. */
type StoredParams = Pick<TemplateMessage, "body" | "buttons">;

/** Queues a template for the job; returns the row's id. */
export async function enqueueMessage(input: {
  owner?: MessageOwner;
  to: string;
  purpose: Exclude<MessagePurpose, "verification" | "reply">;
  message: TemplateMessage;
  broadcastId?: number;
  notBefore?: Date;
}): Promise<number> {
  const params: StoredParams = { body: input.message.body, buttons: input.message.buttons };
  const [result] = await getDb().insert(whatsappMessages).values({
    userId: input.owner?.userId ?? null,
    userType: input.owner?.userType ?? null,
    recipient: input.to,
    purpose: input.purpose,
    templateName: input.message.name,
    language: input.message.language,
    params,
    status: "queued",
    broadcastId: input.broadcastId ?? null,
    nextAttemptAt: input.notBefore ?? null,
  });
  return Number((result as { insertId?: number }).insertId);
}

/**
 * Sends a template at once and records it. Used for verification codes, whose parameters (the code) are not stored.
 * Throws {@link WhatsAppApiError} when Meta refuses, or when WhatsApp is not configured.
 */
export async function sendMessageNow(
  input: { owner?: MessageOwner; to: string; purpose: "verification"; message: TemplateMessage },
  config: WhatsAppCloudConfig | null = whatsAppConfig(),
  send: typeof sendTemplate = sendTemplate,
): Promise<{ id: number; messageId: string }> {
  if (!config) throw new WhatsAppApiError(0, undefined, false, "WhatsApp is not configured");
  const db = getDb();
  const [inserted] = await db.insert(whatsappMessages).values({
    userId: input.owner?.userId ?? null,
    userType: input.owner?.userType ?? null,
    recipient: input.to,
    purpose: input.purpose,
    templateName: input.message.name,
    language: input.message.language,
    params: null,
    status: "sending",
    attempts: 1,
  });
  const id = Number((inserted as { insertId?: number }).insertId);
  try {
    const { messageId } = await send(config, input.to, input.message);
    await db
      .update(whatsappMessages)
      .set({ status: "sent", metaMessageId: messageId, sentAt: new Date() })
      .where(eq(whatsappMessages.id, id));
    return { id, messageId };
  } catch (error) {
    const code = error instanceof WhatsAppApiError ? (error.code ?? null) : null;
    await db
      .update(whatsappMessages)
      .set({ status: "failed", errorCode: code, failedAt: new Date() })
      .where(eq(whatsappMessages.id, id));
    log.warn(
      { event: "whatsapp.send_failed", messageRowId: id, purpose: input.purpose, code, phone: phoneTail(input.to) },
      "A WhatsApp message was refused",
    );
    throw error;
  }
}

/** Sends the queued messages that are due, at most `limit`; the protected job calls it every minute. */
export async function processOutbox(
  options: { limit?: number; now?: Date } = {},
  config: WhatsAppCloudConfig | null = whatsAppConfig(),
  send: typeof sendTemplate = sendTemplate,
): Promise<{ sent: number; retrying: number; failed: number }> {
  const outcome = { sent: 0, retrying: 0, failed: 0 };
  if (!config) return outcome;
  const now = options.now ?? new Date();
  const db = getDb();
  const due = await db
    .select()
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.status, "queued"),
        or(isNull(whatsappMessages.nextAttemptAt), lte(whatsappMessages.nextAttemptAt, now)),
      ),
    )
    .orderBy(asc(whatsappMessages.id))
    .limit(options.limit ?? 50);

  for (const row of due) {
    // Claim it: only the run that moves it from queued sends it.
    const [claim] = await db
      .update(whatsappMessages)
      .set({ status: "sending", attempts: row.attempts + 1 })
      .where(and(eq(whatsappMessages.id, row.id), eq(whatsappMessages.status, "queued")));
    if (affected(claim) === 0 || !row.recipient || !row.templateName) continue;

    const params = (row.params ?? {}) as StoredParams;
    try {
      const { messageId } = await send(config, row.recipient, {
        name: row.templateName,
        language: row.language ?? "ar",
        body: params.body,
        buttons: params.buttons,
      });
      await db
        .update(whatsappMessages)
        .set({ status: "sent", metaMessageId: messageId, sentAt: new Date(), errorCode: null })
        .where(eq(whatsappMessages.id, row.id));
      outcome.sent += 1;
    } catch (error) {
      const retryable = error instanceof WhatsAppApiError && error.retryable;
      const code = error instanceof WhatsAppApiError ? (error.code ?? null) : null;
      const retryAt = retryable ? nextAttemptAt(row.attempts + 1, now) : null;
      await db
        .update(whatsappMessages)
        .set(
          retryAt
            ? { status: "queued", nextAttemptAt: retryAt, errorCode: code }
            : { status: "failed", failedAt: new Date(), errorCode: code },
        )
        .where(eq(whatsappMessages.id, row.id));
      if (retryAt) outcome.retrying += 1;
      else outcome.failed += 1;
      log.warn(
        { event: "whatsapp.outbox.send_failed", messageRowId: row.id, purpose: row.purpose, code, retrying: Boolean(retryAt) },
        "A queued WhatsApp message was refused",
      );
    }
  }
  return outcome;
}

/** Applies the status webhooks to the rows they name; rows we do not know are ignored. */
export async function applyStatus(event: Extract<WebhookEvent, { kind: "status" }>): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: whatsappMessages.id, status: whatsappMessages.status })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.metaMessageId, event.messageId))
    .limit(1);
  if (!row || !movesForward(row.status, event.status)) return false;
  const at = event.at;
  await db
    .update(whatsappMessages)
    .set({
      status: event.status,
      ...(event.status === "sent" ? { sentAt: at } : {}),
      ...(event.status === "delivered" ? { deliveredAt: at } : {}),
      ...(event.status === "read" ? { readAt: at } : {}),
      ...(event.status === "failed" ? { failedAt: at, errorCode: event.errorCode ?? null } : {}),
      ...(event.pricingCategory ? { pricingCategory: event.pricingCategory } : {}),
    })
    .where(eq(whatsappMessages.id, row.id));
  return true;
}

/** "2010…" → "010…", the way phone accounts store their numbers. */
function localNumber(international: string): string {
  return international.startsWith("20") && international.length === 12 ? `0${international.slice(2)}` : international;
}

/** The account a person who wrote to us belongs to: by Meta's user id first, then by a phone account's number. */
async function ownerOfSender(event: Extract<WebhookEvent, { kind: "inbound" }>): Promise<MessageOwner | null> {
  const db = getDb();
  if (event.bsuid) {
    const [known] = await db
      .select({ userId: whatsappContacts.userId, userType: whatsappContacts.userType })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.bsuid, event.bsuid))
      .limit(1);
    if (known) return { userId: known.userId, userType: known.userType as MessageOwner["userType"] };
  }
  if (event.phone) {
    const [account] = await db
      .select({ id: localUsers.id })
      .from(localUsers)
      .where(eq(localUsers.phone, localNumber(event.phone)))
      .limit(1);
    if (account) return { userId: account.id, userType: "local" };
  }
  return null;
}

export const OPT_OUT_REPLY =
  "تمام، مش هتوصلك رسايل عروض تاني على واتساب. التقارير والتذكيرات اللي إنت مفعّلها شغالة زي ما هي، وتقدر تغيّرها من الإعدادات في التطبيق.";

/**
 * A message someone sent us: opens the 24-hour window for their account and, when it is a stop word, withdraws
 * marketing consent and confirms it (a free reply, inside the window). Returns what was done, for the log.
 */
export async function recordInbound(
  event: Extract<WebhookEvent, { kind: "inbound" }>,
  config: WhatsAppCloudConfig | null = whatsAppConfig(),
  reply: typeof sendText = sendText,
): Promise<{ known: boolean; optedOut: boolean }> {
  const owner = await ownerOfSender(event);
  const optedOut = isOptOut(event.text);
  if (owner) {
    const db = getDb();
    const now = new Date();
    await db
      .insert(whatsappContacts)
      .values({
        userId: owner.userId,
        userType: owner.userType,
        bsuid: event.bsuid ?? null,
        lastInboundAt: event.at,
        ...(optedOut ? { marketingConsent: false, optedOutAt: now, marketingConsentSource: "reply" } : {}),
      })
      .onDuplicateKeyUpdate({
        set: {
          lastInboundAt: event.at,
          updatedAt: now,
          ...(event.bsuid ? { bsuid: event.bsuid } : {}),
          ...(optedOut ? { marketingConsent: false, optedOutAt: now, marketingConsentSource: "reply" } : {}),
        },
      });
  }
  if (optedOut && config && event.phone) {
    try {
      const { messageId } = await reply(config, event.phone, OPT_OUT_REPLY);
      await getDb().insert(whatsappMessages).values({
        userId: owner?.userId ?? null,
        userType: owner?.userType ?? null,
        recipient: event.phone,
        purpose: "reply",
        status: "sent",
        attempts: 1,
        metaMessageId: messageId,
        sentAt: new Date(),
      });
    } catch (error) {
      log.warn(
        { err: error, event: "whatsapp.opt_out_reply_failed", phone: phoneTail(event.phone) },
        "Could not confirm an opt-out",
      );
    }
  }
  return { known: Boolean(owner), optedOut };
}

/** Handles one signed webhook body's events in order; one bad event never stops the others. */
export async function handleWebhookEvents(events: WebhookEvent[]): Promise<void> {
  for (const event of events) {
    try {
      if (event.kind === "status") await applyStatus(event);
      else {
        const { known, optedOut } = await recordInbound(event);
        log.info({ event: "whatsapp.inbound", known, optedOut }, "A message reached the business number");
      }
    } catch (error) {
      log.error({ err: error, event: "whatsapp.webhook_event_failed", kind: event.kind }, "A WhatsApp webhook event failed");
    }
  }
}
