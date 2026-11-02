/**
 * Meta WhatsApp Cloud API v21.0 Webhook Fixtures
 * Authoritative Source: Meta Cloud API Webhook Reference & PROJECT.md § Interface Contracts #3
 */

import crypto from "crypto";

export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "button";
  text?: {
    body: string;
  };
}

export interface WhatsAppMessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: {
      type: "user_initiated" | "business_initiated";
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: "CBP";
    category: "utility" | "marketing" | "service";
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

export interface WhatsAppWebhookChangeValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: {
      name: string;
    };
    wa_id: string;
  }>;
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppMessageStatus[];
}

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: WhatsAppWebhookChangeValue;
      field: "messages";
    }>;
  }>;
}

/**
 * Computes the X-Hub-Signature-256 header using SHA256 HMAC
 */
export function calculateWhatsAppSignature(payload: string | object, appSecret: string): string {
  const rawString = typeof payload === "string" ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawString);
  return `sha256=${hmac.digest("hex")}`;
}

export function createWhatsAppInboundWebhook(
  messageBody: string,
  options: {
    senderPhone?: string;
    messageId?: string;
    timestamp?: number;
    senderName?: string;
    wabaId?: string;
    phoneNumberId?: string;
  } = {}
): WhatsAppWebhookPayload {
  const senderPhone = options.senderPhone ?? "201012345678";
  const messageId = options.messageId ?? `wamid.HBgLMjAxMDEy${Math.random().toString(36).substring(2, 10)}`;
  const timestamp = String(Math.floor((options.timestamp ?? Date.now()) / 1000));
  const senderName = options.senderName ?? "أحمد مصطفى";
  const wabaId = options.wabaId ?? "WABA_SMARTSPEND_001";
  const phoneNumberId = options.phoneNumberId ?? "PHONE_ID_SMARTSPEND_001";

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: wabaId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "201000000000",
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: senderName },
                  wa_id: senderPhone,
                },
              ],
              messages: [
                {
                  from: senderPhone,
                  id: messageId,
                  timestamp,
                  type: "text",
                  text: { body: messageBody },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

export function createWhatsAppStatusWebhook(
  status: WhatsAppMessageStatus["status"],
  options: {
    messageId?: string;
    recipientPhone?: string;
    timestamp?: number;
    errorCode?: number;
    errorTitle?: string;
    wabaId?: string;
    phoneNumberId?: string;
  } = {}
): WhatsAppWebhookPayload {
  const recipientPhone = options.recipientPhone ?? "201012345678";
  const messageId = options.messageId ?? `wamid.HBgLMjAxMDEy${Math.random().toString(36).substring(2, 10)}`;
  const timestamp = String(Math.floor((options.timestamp ?? Date.now()) / 1000));
  const wabaId = options.wabaId ?? "WABA_SMARTSPEND_001";
  const phoneNumberId = options.phoneNumberId ?? "PHONE_ID_SMARTSPEND_001";

  const statusObj: WhatsAppMessageStatus = {
    id: messageId,
    status,
    timestamp,
    recipient_id: recipientPhone,
    conversation: {
      id: `conv_${messageId}`,
      origin: { type: "business_initiated" },
    },
    pricing: {
      billable: true,
      pricing_model: "CBP",
      category: "utility",
    },
    ...(options.errorCode
      ? {
          errors: [
            {
              code: options.errorCode,
              title: options.errorTitle ?? "Message delivery failed",
            },
          ],
        }
      : {}),
  };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: wabaId,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "201000000000",
                phone_number_id: phoneNumberId,
              },
              statuses: [statusObj],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

export const WHATSAPP_STOP_WORDS = ["إيقاف", "الغاء", "STOP", "stop", "إلغاء", "ايقاف"] as const;

export const WHATSAPP_FIXTURES = {
  optOutArabicEqaf: createWhatsAppInboundWebhook("إيقاف", {
    senderPhone: "201011112222",
    messageId: "wamid_optout_eqaf_01",
  }),
  optOutArabicElgha: createWhatsAppInboundWebhook("الغاء", {
    senderPhone: "201011112222",
    messageId: "wamid_optout_elgha_01",
  }),
  optOutEnglishStop: createWhatsAppInboundWebhook("STOP", {
    senderPhone: "201011112222",
    messageId: "wamid_optout_stop_01",
  }),
  optOutWithWhitespace: createWhatsAppInboundWebhook("   إيقاف   ", {
    senderPhone: "201011112222",
    messageId: "wamid_optout_ws_01",
  }),
  inboundGeneralQuestion: createWhatsAppInboundWebhook("السلام عليكم، عايز استفسر عن الاشتراك", {
    senderPhone: "201099998888",
    messageId: "wamid_general_msg_01",
  }),
  statusSent: createWhatsAppStatusWebhook("sent", {
    messageId: "wamid_tx_report_01",
    recipientPhone: "201055554444",
  }),
  statusDelivered: createWhatsAppStatusWebhook("delivered", {
    messageId: "wamid_tx_report_01",
    recipientPhone: "201055554444",
  }),
  statusRead: createWhatsAppStatusWebhook("read", {
    messageId: "wamid_tx_report_01",
    recipientPhone: "201055554444",
  }),
  statusFailedUndeliverable: createWhatsAppStatusWebhook("failed", {
    messageId: "wamid_tx_report_01",
    recipientPhone: "201055554444",
    errorCode: 131026,
    errorTitle: "Message undeliverable - User opted out or phone inactive",
  }),
};
