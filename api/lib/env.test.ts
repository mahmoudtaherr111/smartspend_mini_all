import { describe, expect, it } from "vitest";
import { MIN_PRODUCTION_SECRET_LENGTH, parseServerEnv } from "./env";

const required = {
  DATABASE_URL: "mysql://u:p@127.0.0.1:3306/db",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GEMINI_API_KEY: "key",
};
const strong = "x".repeat(MIN_PRODUCTION_SECRET_LENGTH);

describe("server environment", () => {
  it("refuses a short JWT_SECRET in production", () => {
    expect(() => parseServerEnv({ ...required, NODE_ENV: "production", JWT_SECRET: "secret" })).toThrow(/JWT_SECRET/);
    expect(parseServerEnv({ ...required, NODE_ENV: "production", JWT_SECRET: strong }).JWT_SECRET).toBe(strong);
  });

  it("refuses a short gateway or rate-limit secret in production when one is set", () => {
    expect(() =>
      parseServerEnv({ ...required, NODE_ENV: "production", JWT_SECRET: strong, AI_GATEWAY_SECRET: "short" }),
    ).toThrow(/AI_GATEWAY_SECRET/);
    expect(() =>
      parseServerEnv({
        ...required,
        NODE_ENV: "production",
        JWT_SECRET: strong,
        RATE_LIMIT_KEY_SECRET: "sixteen-chars-ok",
      }),
    ).toThrow(/RATE_LIMIT_KEY_SECRET/);
  });

  it("keeps short secrets usable in development and tests", () => {
    expect(parseServerEnv({ ...required, NODE_ENV: "development", JWT_SECRET: "dev" }).JWT_SECRET).toBe("dev");
    expect(parseServerEnv({ ...required, NODE_ENV: "test", JWT_SECRET: "test" }).JWT_SECRET).toBe("test");
  });
});
