import { userAnalytics } from "../../db/schema";
import { db } from "../queries/connection";
import { businessDateKey } from "./app-time";
import { env } from "./env";
import { createLogger } from "./log";
import { stateClaim } from "./redis-client";

const log = createLogger("client-platform");

export type ClientPlatform = "android" | "ios" | "web" | "unknown";

/**
 * Which app a request came from and its version, read from the user agent the mobile app sends
 * ("SmartSpend-Mobile (android; production; 1.4.0)"); anything else with a user agent is the website.
 */
export function readClient(userAgent: string | null | undefined): { platform: ClientPlatform; version: string | null } {
  const agent = (userAgent ?? "").trim();
  const mobile = /^SmartSpend-Mobile \(([a-z]+);\s*[a-z]+(?:;\s*([\w.+-]+))?\)/i.exec(agent);
  if (mobile) {
    const os = mobile[1].toLowerCase();
    return { platform: os === "ios" ? "ios" : os === "android" ? "android" : "unknown", version: mobile[2] ?? null };
  }
  return { platform: agent ? "web" : "unknown", version: null };
}

/**
 * Notes once per Cairo day that a person used the app, with the platform and version, so the console can count
 * people by platform and see which versions are still in use. Never blocks or fails the request.
 */
export function noteAppSeen(user: { id: number; type: string }, userAgent: string | null | undefined): void {
  // Unit tests run procedures without a database or Redis of their own.
  if (env.NODE_ENV === "test") return;
  const day = businessDateKey();
  void (async () => {
    try {
      if (!(await stateClaim(`seen:${user.type}:${user.id}:${day}`, 26 * 60 * 60))) return;
      const client = readClient(userAgent);
      await db.insert(userAnalytics).values({
        userId: user.id,
        userType: user.type,
        event: "app_seen",
        metadata: { platform: client.platform, version: client.version },
      });
    } catch (error) {
      log.warn({ err: error, event: "client_platform.note_failed" }, "Could not note the app as seen");
    }
  })();
}
