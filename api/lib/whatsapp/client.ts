/**
 * Meta's WhatsApp Cloud API (decision 0038): the few Graph API calls the product makes. It sends templates (the only
 * messages allowed outside the 24-hour window after the person last wrote to us) and free text inside that window,
 * reads the business number's state for the admin console, and lists and creates templates.
 *
 * Nothing here logs: callers log an event, an id and the last four digits of a number (golden rule 10), never a
 * message, a code or the token.
 */
import { env } from "../env";

export interface WhatsAppCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string;
  apiVersion: string;
}

/** The sending configuration, or null while the owner has not set the token and the number id. */
/** The settings it reads, named so tests can pass their own. */
type WhatsAppEnv = {
  WHATSAPP_CLOUD_ACCESS_TOKEN?: string;
  WHATSAPP_CLOUD_PHONE_NUMBER_ID?: string;
  WHATSAPP_CLOUD_WABA_ID?: string;
  WHATSAPP_CLOUD_API_VERSION?: string;
};

export function whatsAppConfig(source: WhatsAppEnv = env): WhatsAppCloudConfig | null {
  const accessToken = source.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const phoneNumberId = source.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    wabaId: source.WHATSAPP_CLOUD_WABA_ID?.trim() || undefined,
    apiVersion: source.WHATSAPP_CLOUD_API_VERSION ?? "v23.0",
  };
}

/** An Egyptian mobile number ("010…", "+20 10…", "2010…") as the international digits the API takes ("2010…"). */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `2${digits}`;
  if (digits.length === 10 && digits.startsWith("1")) return `20${digits}`;
  return digits;
}

/**
 * Errors Meta answers with. `retryable` says whether the same request may succeed later (a rate limit, a temporary
 * outage) or never will (a bad token, a number without WhatsApp, a template that does not exist).
 */
export class WhatsAppApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | undefined,
    readonly retryable: boolean,
    title: string,
  ) {
    super(`WhatsApp Cloud API ${httpStatus}${code ? ` (${code})` : ""}: ${title}`);
    this.name = "WhatsAppApiError";
  }
}

/** Meta's codes that mean "later": throughput, spam and pair rate limits, and its own temporary failures. */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);

export function isRetryable(httpStatus: number, code: number | undefined): boolean {
  if (code !== undefined && RETRYABLE_CODES.has(code)) return true;
  return httpStatus === 429 || httpStatus >= 500;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;

async function graph<T>(
  config: WhatsAppCloudConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fetchImpl: Fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${config.apiVersion}/${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // No answer at all: the network or a timeout, worth another try.
    throw new WhatsAppApiError(0, undefined, true, error instanceof Error ? error.name : "network");
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: number; message?: string } } & T;
  if (!response.ok || payload.error) {
    const code = typeof payload.error?.code === "number" ? payload.error.code : undefined;
    throw new WhatsAppApiError(response.status, code, isRetryable(response.status, code), payload.error?.message ?? "error");
  }
  return payload;
}

/** A parameter of a template's body or button; only text is used. */
export type TemplateParameter = { type: "text"; text: string };

export interface TemplateMessage {
  name: string;
  language: string;
  /** Body parameters in order ({{1}}, {{2}}, …). */
  body?: string[];
  /** Parameters of URL or copy-code buttons, by button index. */
  buttons?: { index: number; subType: "url" | "copy_code"; parameter: string }[];
}

function templateComponents(message: TemplateMessage) {
  const components: unknown[] = [];
  if (message.body?.length) {
    components.push({
      type: "body",
      parameters: message.body.map((text): TemplateParameter => ({ type: "text", text })),
    });
  }
  for (const button of message.buttons ?? []) {
    components.push({
      type: "button",
      sub_type: button.subType,
      index: String(button.index),
      parameters:
        button.subType === "copy_code"
          ? [{ type: "coupon_code", coupon_code: button.parameter }]
          : [{ type: "text", text: button.parameter }],
    });
  }
  return components;
}

/** Sends a template; the answer's id (wamid) is what status webhooks name later. */
export async function sendTemplate(
  config: WhatsAppCloudConfig,
  to: string,
  message: TemplateMessage,
  fetchImpl: Fetch = fetch,
): Promise<{ messageId: string }> {
  const answer = await graph<{ messages?: { id: string }[] }>(
    config,
    `${config.phoneNumberId}/messages`,
    {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWhatsAppNumber(to),
        type: "template",
        template: { name: message.name, language: { code: message.language }, components: templateComponents(message) },
      },
    },
    fetchImpl,
  );
  const messageId = answer.messages?.[0]?.id;
  if (!messageId) throw new WhatsAppApiError(200, undefined, false, "no message id");
  return { messageId };
}

/** Free text, allowed only inside the 24-hour window after the person last wrote to us. */
export async function sendText(
  config: WhatsAppCloudConfig,
  to: string,
  text: string,
  fetchImpl: Fetch = fetch,
): Promise<{ messageId: string }> {
  const answer = await graph<{ messages?: { id: string }[] }>(
    config,
    `${config.phoneNumberId}/messages`,
    {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWhatsAppNumber(to),
        type: "text",
        text: { preview_url: false, body: text },
      },
    },
    fetchImpl,
  );
  const messageId = answer.messages?.[0]?.id;
  if (!messageId) throw new WhatsAppApiError(200, undefined, false, "no message id");
  return { messageId };
}

export interface BusinessNumber {
  /** As Meta shows it, for example "+20 10 1234 5678". */
  displayPhoneNumber: string;
  /** The international digits, for a wa.me link. */
  digits: string;
  verifiedName: string;
  /** GREEN, YELLOW, RED or UNKNOWN. */
  qualityRating: string;
  /** For example TIER_1K, or undefined before Meta assigns one. */
  messagingLimitTier?: string;
}

/** The business number's name, quality and messaging limit, for the admin console. */
export async function businessNumber(config: WhatsAppCloudConfig, fetchImpl: Fetch = fetch): Promise<BusinessNumber> {
  const answer = await graph<{
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    messaging_limit_tier?: string;
  }>(
    config,
    `${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    { method: "GET" },
    fetchImpl,
  );
  const display = answer.display_phone_number ?? "";
  return {
    displayPhoneNumber: display,
    digits: display.replace(/\D/g, ""),
    verifiedName: answer.verified_name ?? "",
    qualityRating: answer.quality_rating ?? "UNKNOWN",
    messagingLimitTier: answer.messaging_limit_tier,
  };
}

export interface RemoteTemplate {
  name: string;
  language: string;
  category: string;
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED. */
  status: string;
}

/** The business account's templates with their approval state; needs the WABA id. */
export async function listTemplates(config: WhatsAppCloudConfig, fetchImpl: Fetch = fetch): Promise<RemoteTemplate[]> {
  if (!config.wabaId) throw new WhatsAppApiError(0, undefined, false, "WHATSAPP_CLOUD_WABA_ID is not set");
  const answer = await graph<{ data?: { name: string; language: string; category: string; status: string }[] }>(
    config,
    `${config.wabaId}/message_templates?fields=name,language,category,status&limit=200`,
    { method: "GET" },
    fetchImpl,
  );
  return (answer.data ?? []).map(({ name, language, category, status }) => ({ name, language, category, status }));
}

/** Submits a template for Meta's review; the definition is the Graph API's own shape. */
export async function createTemplate(
  config: WhatsAppCloudConfig,
  definition: Record<string, unknown>,
  fetchImpl: Fetch = fetch,
): Promise<{ id: string; status: string }> {
  if (!config.wabaId) throw new WhatsAppApiError(0, undefined, false, "WHATSAPP_CLOUD_WABA_ID is not set");
  const answer = await graph<{ id?: string; status?: string }>(
    config,
    `${config.wabaId}/message_templates`,
    { method: "POST", body: definition },
    fetchImpl,
  );
  return { id: answer.id ?? "", status: answer.status ?? "PENDING" };
}
