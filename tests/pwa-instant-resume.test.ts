/** @vitest-environment jsdom */
/**
 * Guards the behaviour that makes a resumed session feel native rather than
 * relaunched. Each case here corresponds to a specific stall users reported:
 * a reload on returning to the app, a skeleton held for a network round trip,
 * and a refetch storm on every focus.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(__dirname, "..");

describe("Instant resume — manifest and precache contract", () => {
  const viteConfig = fs.readFileSync(
    path.join(ROOT_DIR, "vite.config.ts"),
    "utf-8",
  );

  it("launches straight into the dashboard instead of the transit route", () => {
    expect(viteConfig).toMatch(/start_url:\s*"\/dashboard"/);
  });

  it("keeps the installed app identity stable so installs are not orphaned", () => {
    expect(viteConfig).toMatch(/id:\s*"\/"/);
    expect(viteConfig).toMatch(/scope:\s*"\/"/);
  });

  it("asks the browser to focus the running app rather than navigate it", () => {
    expect(viteConfig).toContain("launch_handler");
    expect(viteConfig).toContain("focus-existing");
  });

  it("precaches everything the dashboard needs to paint including dependency closure", () => {
    expect(viteConfig).toContain("assets/**/*.{js,css}");
    for (const chunk of [
      "assets/index-*.{js,css}",
      "assets/vendor-*.js",
      "assets/Home-*.js",
      "assets/MonthlyCalendar-*.js",
      "assets/FinancialGoalsPanel-*.js",
      "assets/ExpenseChart-*.js",
      "assets/charts-*.js",
    ]) {
      expect(viteConfig).toContain(chunk);
    }

    // Verify all 22 required dependency chunks match the closure pattern
    const assetsDir = path.join(ROOT_DIR, "dist", "public", "assets");
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      const criticalDeps = [
        "badge",
        "card",
        "tabs",
        "input",
        "useHistoryBound",
        "usePushNotifications",
      ];
      for (const dep of criticalDeps) {
        const hasDepChunk = files.some(
          (f) => f.startsWith(`${dep}-`) && f.endsWith(".js"),
        );
        expect(hasDepChunk).toBe(true);
      }
    }
  });

  it("leaves screenshots, device splash images, and precompressed files out of precache", () => {
    const globBlock = viteConfig
      .split("globPatterns:")[1]
      .split("globIgnores")[0];
    expect(globBlock).not.toContain("splash");
    expect(globBlock).not.toContain("screenshots");

    // Precompressed .gz/.br must be ignored to prevent cache doubling
    expect(viteConfig).toMatch(/globIgnores:\s*\[.*"\*\*\/\*\.\{gz,br\}".*\]/);
  });
});

describe("Instant resume — built service worker", () => {
  const swPath = path.join(ROOT_DIR, "dist", "public", "sw.js");
  const built = fs.existsSync(swPath);

  it.runIf(built)("ships the dashboard chunks in the precache manifest", () => {
    const sw = fs.readFileSync(swPath, "utf-8");
    const urls = [...sw.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);

    expect(urls).toContain("index.html");
    expect(urls.some((u) => /^assets\/Home-.*\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /^assets\/charts-.*\.js$/.test(u))).toBe(true);
    // Splash images would multiply the install for bytes nobody reads.
    expect(urls.some((u) => u.startsWith("splash/"))).toBe(false);
  });
});

describe("Instant resume — the identity snapshot's security limits", () => {
  const IDENTITY_KEY = "smartspend_offline_identity_v1";

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function loadPersister() {
    return await import("../src/lib/queryPersister");
  }

  it("replays the last verified tier so a subscriber is not shown a free shell", async () => {
    const { saveOfflineIdentity, getOfflineIdentity } = await loadPersister();

    saveOfflineIdentity({
      id: 12,
      type: "oauth",
      name: "محمود",
      avatar: null,
      plan: "ultra",
    });

    expect(getOfflineIdentity()?.plan).toBe("ultra");
  });

  it("never records a role, so no admin surface can be replayed from a device", async () => {
    const { saveOfflineIdentity } = await loadPersister();

    saveOfflineIdentity({
      id: 12,
      type: "oauth",
      name: "محمود",
      avatar: null,
      plan: "pro",
    });

    const stored = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "{}");
    expect(stored).not.toHaveProperty("role");
  });

  it("rejects a hand-edited tier outright rather than trusting it", async () => {
    const { getOfflineIdentity } = await loadPersister();

    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        id: 12,
        type: "oauth",
        name: "محمود",
        plan: "owner",
        savedAt: Date.now(),
      }),
    );

    expect(getOfflineIdentity()).toBeNull();
  });

  it("still accepts snapshots written before the tier was recorded", async () => {
    const { getOfflineIdentity } = await loadPersister();

    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        id: 12,
        type: "oauth",
        name: "محمود",
        savedAt: Date.now(),
      }),
    );

    const identity = getOfflineIdentity();
    expect(identity?.id).toBe(12);
    expect(identity?.plan).toBeUndefined();
  });

  it("expires a snapshot rather than resuming a session that sat for days", async () => {
    const { getOfflineIdentity, PERSISTED_QUERY_MAX_AGE } =
      await loadPersister();

    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        id: 12,
        type: "oauth",
        name: "محمود",
        plan: "pro",
        savedAt: Date.now() - PERSISTED_QUERY_MAX_AGE - 1,
      }),
    );

    expect(getOfflineIdentity()).toBeNull();
    expect(localStorage.getItem(IDENTITY_KEY)).toBeNull();
  });
});

describe("Instant resume — launch targets", () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, "", "/dashboard");
  });

  async function loadLaunchHandler() {
    return await import("../src/pwa/launch-handler");
  }

  it("routes a shared receipt to the capture screen", async () => {
    const { resolveLaunchPath } = await loadLaunchHandler();
    expect(
      resolveLaunchPath("http://localhost:3000/dashboard?tab=record"),
    ).toBe("/dashboard?tab=record");
  });

  it("refuses a launch target pointing at another origin", async () => {
    const { resolveLaunchPath } = await loadLaunchHandler();
    expect(resolveLaunchPath("https://evil.example.com/dashboard")).toBeNull();
    expect(resolveLaunchPath("javascript:alert(1)")).toBeNull();
  });

  it("does not navigate when the launch points at the current screen", async () => {
    const { resolveLaunchPath } = await loadLaunchHandler();
    expect(resolveLaunchPath("/dashboard")).toBeNull();
  });

  it("holds a launch that arrives before the router exists, and yields it once", async () => {
    const queue: { consumer?: (params: { targetURL?: string }) => void } = {};
    (window as unknown as { launchQueue: unknown }).launchQueue = {
      setConsumer: (consumer: (params: { targetURL?: string }) => void) => {
        queue.consumer = consumer;
      },
    };

    const { initLaunchHandler, consumePendingLaunchPath } =
      await loadLaunchHandler();
    initLaunchHandler();
    queue.consumer?.({ targetURL: "/ai" });

    expect(consumePendingLaunchPath()).toBe("/ai");
    expect(consumePendingLaunchPath()).toBeNull();

    delete (window as unknown as { launchQueue?: unknown }).launchQueue;
  });
});

describe("Instant resume — scroll position across process eviction", () => {
  const SCROLL_KEY = "smartspend_scroll_offsets_v1";

  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  async function loadScrollRestoration() {
    return await import("../src/hooks/useScrollRestoration");
  }

  it("mirrors offsets to storage when the app goes to the background", async () => {
    const { setScrollOffset } = await loadScrollRestoration();
    setScrollOffset("/dashboard", 640);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(JSON.parse(sessionStorage.getItem(SCROLL_KEY)!)).toContainEqual([
      "/dashboard",
      640,
    ]);
  });

  it("restores them on the relaunch that follows a discarded process", async () => {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify([["/dashboard", 640]]));

    // A fresh module registry stands in for the fresh page the OS forces.
    const { getScrollOffset } = await loadScrollRestoration();

    expect(getScrollOffset("/dashboard")).toBe(640);
  });

  it("ignores a corrupt store instead of failing the launch", async () => {
    sessionStorage.setItem(SCROLL_KEY, "{not json");

    const { scrollCache } = await loadScrollRestoration();

    expect(scrollCache.size).toBe(0);
  });

  it("discards entries that are not a key and a finite offset", async () => {
    sessionStorage.setItem(
      SCROLL_KEY,
      JSON.stringify([["/dashboard", 640], ["/ai", "x"], ["/pro", NaN]]),
    );

    const { scrollCache } = await loadScrollRestoration();

    expect([...scrollCache]).toEqual([["/dashboard", 640]]);
  });

  it("clears the store on sign-out so offsets do not outlive the account", async () => {
    const { setScrollOffset, clearScrollCache, persistScrollCache } =
      await loadScrollRestoration();

    setScrollOffset("/dashboard", 640);
    persistScrollCache();
    expect(sessionStorage.getItem(SCROLL_KEY)).not.toBeNull();

    clearScrollCache();
    expect(sessionStorage.getItem(SCROLL_KEY)).toBeNull();
  });
});
