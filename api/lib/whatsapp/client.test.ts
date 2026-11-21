import { describe, expect, it, vi } from "vitest";
import {
  WhatsAppApiError,
  businessNumber,
  isRetryable,
  sendTemplate,
  sendText,
  toWhatsAppNumber,
  whatsAppConfig,
  type WhatsAppCloudConfig,
} from "./client";
import { verificationMessage } from "./templates";

const config: WhatsAppCloudConfig = { accessToken: "test-token", phoneNumberId: "1234567890", wabaId: "999", apiVersion: "v23.0" };

function answering(status: number, body: unknown) {
  // Typed like fetch, so the calls it records carry the URL and the request options.
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("the WhatsApp configuration", () => {
  it("is missing until both the token and the number id are set", () => {
    expect(whatsAppConfig({ WHATSAPP_CLOUD_API_VERSION: "v23.0" })).toBeNull();
    expect(whatsAppConfig({ WHATSAPP_CLOUD_ACCESS_TOKEN: "t", WHATSAPP_CLOUD_API_VERSION: "v23.0" })).toBeNull();
    expect(
      whatsAppConfig({ WHATSAPP_CLOUD_ACCESS_TOKEN: " t ", WHATSAPP_CLOUD_PHONE_NUMBER_ID: "42", WHATSAPP_CLOUD_API_VERSION: "v24.0" }),
    ).toEqual({ accessToken: "t", phoneNumberId: "42", wabaId: undefined, apiVersion: "v24.0" });
  });
});

describe("numbers", () => {
  it("are sent as international digits", () => {
    expect(toWhatsAppNumber("01012345678")).toBe("201012345678");
    expect(toWhatsAppNumber("+20 101 234 5678")).toBe("201012345678");
    expect(toWhatsAppNumber("1012345678")).toBe("201012345678");
    expect(toWhatsAppNumber("201012345678")).toBe("201012345678");
  });
});

describe("sending", () => {
  it("posts a verification template with the code in the body and the copy button", async () => {
    const fetchImpl = answering(200, { messages: [{ id: "wamid.ABC" }] });
    await expect(sendTemplate(config, "01012345678", verificationMessage("482913"), fetchImpl)).resolves.toEqual({
      messageId: "wamid.ABC",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://graph.facebook.com/v23.0/1234567890/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "201012345678",
      type: "template",
      template: {
        name: "smartspend_verification",
        language: { code: "ar" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "482913" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
        ],
      },
    });
  });

  it("posts free text without a link preview", async () => {
    const fetchImpl = answering(200, { messages: [{ id: "wamid.T" }] });
    await sendText(config, "201012345678", "تمام", fetchImpl);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
      type: "text",
      text: { preview_url: false, body: "تمام" },
    });
  });

  it("tells a refusal that may pass later from one that never will", async () => {
    const limited = answering(400, { error: { code: 131056, message: "pair rate limit" } });
    const error = await sendText(config, "201012345678", "x", limited).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppApiError);
    expect(error).toMatchObject({ code: 131056, retryable: true });

    const badToken = answering(401, { error: { code: 190, message: "token expired" } });
    await expect(sendText(config, "201012345678", "x", badToken)).rejects.toMatchObject({ code: 190, retryable: false });

    const noWhatsApp = answering(400, { error: { code: 131026, message: "undeliverable" } });
    await expect(sendText(config, "201012345678", "x", noWhatsApp)).rejects.toMatchObject({ retryable: false });

    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(sendText(config, "201012345678", "x", down)).rejects.toMatchObject({ httpStatus: 0, retryable: true });
  });

  it("retries on throttling and server errors only", () => {
    expect(isRetryable(429, undefined)).toBe(true);
    expect(isRetryable(503, undefined)).toBe(true);
    expect(isRetryable(400, 130429)).toBe(true);
    expect(isRetryable(400, 132001)).toBe(false);
    expect(isRetryable(400, undefined)).toBe(false);
  });
});

describe("the business number", () => {
  it("reads its name, quality and limit for the admin console", async () => {
    const fetchImpl = answering(200, {
      display_phone_number: "+20 10 1234 5678",
      verified_name: "SmartSpend",
      quality_rating: "GREEN",
      messaging_limit_tier: "TIER_1K",
    });
    await expect(businessNumber(config, fetchImpl)).resolves.toEqual({
      displayPhoneNumber: "+20 10 1234 5678",
      digits: "201012345678",
      verifiedName: "SmartSpend",
      qualityRating: "GREEN",
      messagingLimitTier: "TIER_1K",
    });
  });
});
