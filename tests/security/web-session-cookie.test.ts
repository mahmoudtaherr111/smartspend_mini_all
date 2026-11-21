/**
 * The website's session is an HttpOnly cookie that no script on the page can read (accounts and web app pages,
 * decision 0037). The server sets it on every sign-in; the website never stores, reads or sends the token itself.
 * The mobile app keeps the token from the answer in the Keychain or Keystore and sends it as a Bearer header.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sessionCookie } from "../../api/local-auth-utils";
import { env } from "../../api/lib/env";

const root = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const webFiles = sourceFiles(path.join(root, "src")).map((file) => ({
  file: path.relative(root, file).replace(/\\/g, "/"),
  text: fs.readFileSync(file, "utf8"),
}));

describe("the website never holds the session token", () => {
  it("does not store or read it in web storage; the only mention removes what older builds kept", () => {
    const mentions = webFiles.flatMap(({ file, text }) =>
      text.split("\n").flatMap((line) => (line.includes("local_auth_token") ? [`${file}: ${line.trim()}`] : [])),
    );
    expect(mentions).toEqual(['src/hooks/useAuth.ts: localStorage.removeItem("local_auth_token");']);
  });

  it("sends no Authorization header of its own: the browser sends the cookie", () => {
    const bearer = webFiles.filter(({ text }) => /Authorization["']?\s*:|Bearer \$\{/.test(text)).map(({ file }) => file);
    expect(bearer).toEqual([]);
  });

  it("never passes a token between tabs", () => {
    const hook = webFiles.find(({ file }) => file === "src/hooks/useAuth.ts")!.text;
    const event = /export interface AuthBroadcastEvent \{([\s\S]*?)\}/.exec(hook)?.[1] ?? "";
    expect(event).not.toMatch(/token/);
  });
});

describe("the session cookie", () => {
  const original = env.NODE_ENV;
  afterEach(() => {
    env.NODE_ENV = original;
  });

  it("is HttpOnly, SameSite=Lax, for the whole site, and lives as long as the session", () => {
    const cookie = sessionCookie("the-token", new Request("http://localhost:3000/api/trpc/localAuth.login"));
    expect(cookie).toBe("smartspend_token=the-token; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800");
  });

  it("is Secure in production, over https, and behind a proxy that reports https", () => {
    expect(sessionCookie("t", new Request("https://app.example/api/trpc/localAuth.login"))).toMatch(/; Secure$/);
    const proxied = new Request("http://internal:3000/api/trpc/localAuth.login", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(sessionCookie("t", proxied)).toMatch(/; Secure$/);
    env.NODE_ENV = "production";
    expect(sessionCookie("t", new Request("http://internal:3000/api/trpc/localAuth.login"))).toMatch(/; Secure$/);
  });

  it("is set by every way of signing in to the website", () => {
    const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
    const localAuth = read("api/local-auth-router.ts");
    for (const procedure of ["register", "login", "verifyOtp"]) {
      const start = localAuth.indexOf(`  ${procedure}: `);
      expect(start, procedure).toBeGreaterThan(-1);
      const next = localAuth.slice(start + 1).search(/\n {2}[a-zA-Z]+: [a-zA-Z]+Procedure/);
      const body = localAuth.slice(start, next === -1 ? undefined : start + 1 + next);
      expect(body, procedure).toContain('ctx.resHeaders.append("Set-Cookie", sessionCookie(token, ctx.req))');
    }
    const passkey = read("api/webauthn-router.ts");
    const verify = passkey.slice(passkey.indexOf("verifyAuthentication:"));
    expect(verify).toContain('ctx.resHeaders.append("Set-Cookie", sessionCookie(token, ctx.req))');
  });
});
