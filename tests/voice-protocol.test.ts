import { describe, expect, it } from "vitest";
import { parseVoiceClientMessage, VOICE_TEXT_MAX_LENGTH } from "../contracts/voice-protocol";

const ticket = "tkt_0123456789abcdef";

describe("parseVoiceClientMessage", () => {
  it("accepts a new call's hello with a ticket", () => {
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, ticket, codecs: ["pcm16"], client: "android" })))
      .toEqual({ type: "hello", v: 2, ticket, codecs: ["pcm16"], client: "android" });
  });

  it("accepts a reconnect's hello with a resume token instead of a ticket", () => {
    const resume = { callId: "vc_0123456789abcdef", token: "rt_0123456789abcdef" };
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, resume, codecs: [], client: "ios" })))
      .toEqual({ type: "hello", v: 2, resume, codecs: ["pcm16"], client: "ios" });
  });

  it("refuses a hello with neither, a wrong version or a malformed id", () => {
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, codecs: ["pcm16"] }))).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 1, ticket }))).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, ticket: "short" }))).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, ticket: "bad ticket with spaces!!" }))).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, resume: { callId: "x" } }))).toBeNull();
  });

  it("drops unknown codecs and defaults an unknown platform to web", () => {
    expect(parseVoiceClientMessage(JSON.stringify({ type: "hello", v: 2, ticket, codecs: ["opus", "pcm16"], client: "tv" })))
      .toMatchObject({ codecs: ["pcm16"], client: "web" });
  });

  it("accepts the control messages and trims typed text", () => {
    expect(parseVoiceClientMessage('{"type":"speech_end"}')).toEqual({ type: "speech_end" });
    expect(parseVoiceClientMessage('{"type":"end"}')).toEqual({ type: "end" });
    expect(parseVoiceClientMessage(JSON.stringify({ type: "text", text: "  صرفت كام النهارده؟ " })))
      .toEqual({ type: "text", text: "صرفت كام النهارده؟" });
    expect(parseVoiceClientMessage(JSON.stringify({ type: "confirm", draftId: "dr_0123456789ab" })))
      .toEqual({ type: "confirm", draftId: "dr_0123456789ab" });
    expect(parseVoiceClientMessage('{"type":"ping","t":12}')).toEqual({ type: "ping", t: 12 });
  });

  it("refuses empty or oversized text, junk and unknown types", () => {
    expect(parseVoiceClientMessage(JSON.stringify({ type: "text", text: "   " }))).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "text", text: "ا".repeat(VOICE_TEXT_MAX_LENGTH + 1) }))).toBeNull();
    expect(parseVoiceClientMessage("not json")).toBeNull();
    expect(parseVoiceClientMessage("[1,2]")).toBeNull();
    expect(parseVoiceClientMessage('{"type":"exec","cmd":"x"}')).toBeNull();
    expect(parseVoiceClientMessage(JSON.stringify({ type: "cancel", draftId: 5 }))).toBeNull();
  });
});
