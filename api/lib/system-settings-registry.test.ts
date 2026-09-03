import { describe, it, expect } from "vitest";
import {
  SETTINGS,
  SETTING_KEYS,
  SECRET_KEYS,
  isMaskedValue,
  maskSecretValue,
  maskSettingsForClient,
  settingDefaults,
} from "./system-settings-registry";

describe("system settings registry", () => {
  it("declares every key exactly once", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("makes every key the admin UI can edit actually saveable", () => {
    // The eight that were renderable and silently discarded on save. An admin typed a
    // key, saw a success toast, and NVIDIA kept using the environment variable.
    for (const key of [
      "nvidia_api_key",
      "chatbot_api_key",
      "chatbot_base_url",
      "chatbot_model",
      "chatbot_max_history",
      "rag_api_key",
      "rag_model",
      "enable_rag",
    ]) {
      expect(SETTING_KEYS.has(key), `${key} must be saveable`).toBe(true);
    }
  });

  it("treats the defaults and the allowlist as the same list", () => {
    // The drift this file exists to prevent: a key with a default that cannot be saved,
    // or a key that can be saved but is never returned.
    expect(new Set(Object.keys(settingDefaults()))).toEqual(new Set([...SETTING_KEYS]));
  });

  it("classifies every credential-shaped key as a secret", () => {
    for (const { key } of SETTINGS) {
      if (/api_key/.test(key)) {
        expect(SECRET_KEYS.has(key), `${key} looks like a credential`).toBe(true);
      }
    }
  });

  it("shows enough of a secret to identify it and no more", () => {
    const masked = maskSecretValue("AIzaSyD-abcdefghijklmnop9XYZ");
    expect(masked).not.toContain("AIzaSyD");
    expect(masked.endsWith("9XYZ")).toBe(true);
    // An unset key stays visibly unset rather than looking configured.
    expect(maskSecretValue("")).toBe("");
    // A short value gives away nothing at all.
    expect(maskSecretValue("abc")).not.toContain("abc");
  });

  it("never sends a secret to the client in cleartext", () => {
    const out = maskSettingsForClient({
      ai_api_key: "AIzaSy-real-production-key",
      groq_api_key: "gsk_live_secret",
      ai_model_free: "gemini-3.1-flash-lite",
    });

    expect(out.ai_api_key).not.toContain("real-production-key");
    expect(out.groq_api_key).not.toContain("live_secret");
    // Non-secrets are untouched — the admin still needs to read and edit them.
    expect(out.ai_model_free).toBe("gemini-3.1-flash-lite");
  });

  it("recognises its own mask coming back, so an untouched form cannot erase a key", () => {
    // The failure this prevents: mask the response, the admin edits one unrelated
    // field, saves the whole form, and every API key on the system becomes "••••••••".
    const masked = maskSecretValue("AIzaSy-real-production-key");
    expect(isMaskedValue(masked)).toBe(true);
    expect(isMaskedValue("AIzaSy-a-genuinely-new-key")).toBe(false);
    expect(isMaskedValue("")).toBe(false);
  });

  it("resolves environment-derived defaults at call time, not import time", () => {
    const defaults = settingDefaults();
    expect(typeof defaults.ai_api_key).toBe("string");
    expect(typeof defaults.ai_model_free).toBe("string");
    expect(defaults.ai_model_free.length).toBeGreaterThan(0);
  });

  it("carries the decision thresholds the classifier reads", () => {
    const d = settingDefaults();
    expect(d.parser_auto_save_threshold).toBe("90");
    expect(d.parser_review_threshold).toBe("50");
    expect(d.parser_escalate_threshold).toBe("85");
  });
});
