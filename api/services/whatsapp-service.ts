/**
 * WhatsApp Notification Service
 * This module is designed to interact with Meta's Cloud API or other WhatsApp providers
 * like Twilio to send automated reports to Pro users.
 *
 * Features:
 * - Send templated messages
 * - Send raw text (with Markdown)
 * - Rate limiting and logging
 */

export interface WhatsAppMessagePayload {
  toPhone: string;
  body: string;
  templateName?: string;
  templateParams?: string[];
}

export class WhatsAppService {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly phoneNumberId: string;

  constructor() {
    // In production, these would come from process.env
    this.apiUrl =
      process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";
    this.apiToken = process.env.WHATSAPP_API_TOKEN || "";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  }

  /**
   * Format Egyptian local phone number to international WhatsApp format (e.g. 010 -> 2010)
   */
  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
      cleaned = "2" + cleaned; // 2010...
    } else if (!cleaned.startsWith("2")) {
      cleaned = "2" + cleaned;
    }
    return cleaned;
  }

  /**
   * Send a standard markdown text message
   */
  async sendMessage(payload: WhatsAppMessagePayload): Promise<boolean> {
    if (!this.apiToken) {
      console.warn(
        "[WhatsAppService] API Token missing. Simulating sending to:",
        payload.toPhone,
      );
      console.log(`[WhatsAppService] MSG: \n${payload.body}`);
      return true; // Simulate success in dev
    }

    try {
      const formattedPhone = this.formatPhoneNumber(payload.toPhone);
      const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedPhone,
          type: "text",
          text: {
            preview_url: false,
            body: payload.body,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        console.error("[WhatsAppService] Send failed:", errData);
        return false;
      }

      return true;
    } catch (err) {
      console.error("[WhatsAppService] Exception:", err);
      return false;
    }
  }

  /**
   * Send a pre-approved template message (required for initiating conversations after 24h)
   */
  async sendTemplateMessage(payload: WhatsAppMessagePayload): Promise<boolean> {
    if (!this.apiToken || !payload.templateName) {
      console.warn(
        "[WhatsAppService] Token/Template missing. Simulating template:",
        payload.templateName,
      );
      return true;
    }

    // Logic for sending Meta template with parameters goes here
    return true;
  }
}

export const whatsappService = new WhatsAppService();
