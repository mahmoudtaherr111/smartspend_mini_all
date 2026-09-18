/**
 * Loading the providers is where a stored key reaches the current secret. Setting AI_GATEWAY_SECRET has to be
 * enough: no command to run, no key to enter again, and no key left on JWT_SECRET to be lost when that rotates.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env")>();
  return {
    env: { ...actual.env, AI_GATEWAY_SECRET: "gateway-secret", AI_GATEWAY_SECRET_PREVIOUS: undefined, JWT_SECRET: "jwt-secret" },
  };
});

const rows: { providers: Array<Record<string, unknown>>; models: Array<Record<string, unknown>> } = {
  providers: [],
  models: [],
};
const updates: Array<{ values: Record<string, unknown>; where: SQL | undefined }> = [];

vi.mock("../queries/connection", () => {
  const chain = (result: () => unknown[]) => {
    const self: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) self[method] = () => self;
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return self;
  };
  const db = {
    select: () => ({
      from: (table: Record<symbol, unknown>) => {
        const name = String(table[Symbol.for("drizzle:Name")] || "");
        return chain(() => (name === "ai_providers" ? rows.providers : rows.models));
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL | undefined) => {
          updates.push({ values, where });
          return Promise.resolve([]);
        },
      }),
    }),
  };
  return { db, getDb: () => db };
});

vi.mock("./settings-cache", () => ({ getSystemSettings: async () => ({}), invalidateSettingsCache: () => {} }));

import { refreshGatewayCache, resolveAdminRoutes } from "./ai-gateway";
import { openProviderKey } from "./provider-key-crypto";

/** A key as every earlier version sealed it: AES-256-GCM under sha256(secret). */
function sealedWith(secret: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  let data = cipher.update(plain, "utf8", "hex");
  data += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data}`;
}

function provider(id: number, slug: string, apiKeyEncrypted: string, isActive = true) {
  return { id, slug, displayName: slug, protocol: "openai", baseUrl: `https://${slug}.example/v1`, apiKeyEncrypted, isActive, priority: id };
}

function model(providerId: number, modelId: string) {
  return {
    id: providerId * 10,
    providerId,
    modelId,
    displayName: modelId,
    purposes: ["classification"],
    allowedTiers: ["free"],
    isDefaultForPurpose: false,
    isActive: true,
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    cachedPricePer1M: 0,
    supportsVision: false,
    supportsReasoning: false,
  };
}

const dialect = new MySqlDialect();

beforeEach(() => {
  rows.providers = [];
  rows.models = [];
  updates.length = 0;
});

describe("loading the providers", () => {
  it("moves a key sealed with JWT_SECRET to AI_GATEWAY_SECRET, only if nobody changed it meanwhile", async () => {
    const stored = sealedWith("jwt-secret", "sk-openrouter");
    rows.providers = [provider(1, "openrouter", stored)];
    rows.models = [model(1, "deepseek/deepseek-v4-flash")];

    await refreshGatewayCache();

    expect(updates).toHaveLength(1);
    const resealed = String(updates[0].values.apiKeyEncrypted);
    expect(openProviderKey(resealed)).toEqual({ key: "sk-openrouter", state: "sealed", secret: "AI_GATEWAY_SECRET" });
    const condition = dialect.sqlToQuery(updates[0].where!);
    expect(condition.params).toEqual([1, stored]);

    const routes = await resolveAdminRoutes("classification", "free");
    expect(routes.routes.map((route) => route.apiKey)).toEqual(["sk-openrouter"]);
  });

  it("moves the key of a provider that is switched off, so it still opens when switched back on", async () => {
    rows.providers = [provider(2, "groq", sealedWith("jwt-secret", "gsk-groq"), false)];
    await refreshGatewayCache();
    expect(updates).toHaveLength(1);
  });

  it("leaves a key alone when it is already on the current secret", async () => {
    rows.providers = [provider(3, "deepseek", sealedWith("gateway-secret", "sk-deepseek"))];
    rows.models = [model(3, "deepseek-chat")];
    await refreshGatewayCache();

    expect(updates).toHaveLength(0);
    expect((await resolveAdminRoutes("classification", "free")).routes).toHaveLength(1);
  });

  it("keeps a key nothing opens out of routing and does not overwrite it, so re-entering it is still possible", async () => {
    rows.providers = [provider(4, "nvidia", sealedWith("a-secret-nobody-has", "nvapi-key"))];
    rows.models = [model(4, "meta/llama")];
    await refreshGatewayCache();

    expect(updates).toHaveLength(0);
    expect((await resolveAdminRoutes("classification", "free")).routes).toEqual([]);
  });
});
