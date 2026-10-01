import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

/**
 * Standard Mock User Profile for Unified Auth Context
 */
export const MOCK_USER = {
  id: 101,
  name: "كريم أحمد",
  email: "kareem.test@smartspend.eg",
  role: "user" as const,
  plan: "pro" as const,
  type: "oauth" as const,
  phone: "01012345678",
  avatar: null,
};

/**
 * Mock Financial Month Summary & Category Stats
 */
export const MOCK_FINANCIAL_SUMMARY = {
  totalSpent: 4250.75,
  totalIncome: 12000.0,
  balance: 7749.25,
  healthRatio: 35.4,
  streakDays: 14,
  categoryBreakdown: [
    {
      category: "طعام ومشروبات",
      amount: 1850.0,
      percentage: 43.5,
      color: "#10b981",
    },
    { category: "مواصلات", amount: 950.0, percentage: 22.3, color: "#3b82f6" },
    {
      category: "فواتير ومرافق",
      amount: 800.75,
      percentage: 18.8,
      color: "#f59e0b",
    },
    { category: "تسوق", amount: 650.0, percentage: 15.4, color: "#ec4899" },
  ],
  dailyExpenses: [
    { date: "2026-08-01", total: 320.0 },
    { date: "2026-08-05", total: 150.5 },
    { date: "2026-08-10", total: 600.0 },
    { date: "2026-08-15", total: 1200.25 },
    { date: "2026-08-20", total: 450.0 },
    { date: "2026-08-25", total: 230.0 },
  ],
};

/**
 * Extended Playwright Test Fixture with Mobile Helpers
 */
export interface MobileTestFixtures {
  /** Setup mock auth and tRPC query interceptors */
  setupMockEnvironment: (options?: {
    plan?: "free" | "pro" | "ultra";
    installedPwa?: boolean;
    /** What ai.getUserLimits answers instead of the plan's limits: another payload, or a server error. */
    limitsReply?: { data: unknown } | "error";
  }) => Promise<void>;
  /** Error tracking trap to catch runtime console.error and uncaught exceptions */
  consoleErrors: string[];
  /** Dispatch smooth touch drag across screen coordinates */
  dragTouchCoordinates: (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps?: number,
  ) => Promise<void>;
  /** Drag horizontally across bottom navigation tabs */
  dragBetweenTabs: (
    sourceTabId: "record" | "stats" | "ai" | "calendar" | "more",
    targetTabId: "record" | "stats" | "ai" | "calendar" | "more",
  ) => Promise<void>;
}

export const test = base.extend<MobileTestFixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];

    const handleConsole = (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Exclude benign network disconnects during teardown or expected 404 test assertions
        if (
          !text.includes(
            "Failed to load resource: net::ERR_CONNECTION_REFUSED",
          ) &&
          !text.includes("favicon.ico") &&
          // WebKit ignores this Chromium-only viewport hint; it is a browser
          // capability notice, not an application exception.
          text !== 'Viewport argument key "interactive-widget" not recognized and ignored.'
        ) {
          errors.push(text);
        }
      }
    };

    const handlePageError = (err: Error) => {
      errors.push(`PageError: ${err.message}\n${err.stack || ""}`);
    };

    page.on("console", handleConsole);
    page.on("pageerror", handlePageError);

    await use(errors);

    page.off("console", handleConsole);
    page.off("pageerror", handlePageError);
  },

  setupMockEnvironment: async ({ page, context }, use) => {
    const setup = async (options?: {
      plan?: "free" | "pro" | "ultra";
      installedPwa?: boolean;
      limitsReply?: { data: unknown } | "error";
    }) => {
      const activeUser = {
        ...MOCK_USER,
        plan: options?.plan || "pro",
      };

      // Set mock session cookies
      await context.addCookies([
        {
          name: "google_session",
          value: "mock_jwt_token_for_playwright_e2e",
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);

      // Seed localStorage for fast-boot PWA client cache
      await page.addInitScript(({ user, installedPwa }) => {
        try {
          window.localStorage.setItem("smartspend_user", JSON.stringify(user));
          // The device identity snapshot a returning user has (src/lib/queryPersister.ts), so
          // the shell mounts once with the user from the first frame, as it does on a phone.
          window.localStorage.setItem(
            "smartspend_offline_identity_v1",
            JSON.stringify({ id: user.id, type: user.type, name: user.name, plan: user.plan, role: user.role, savedAt: Date.now() }),
          );
          window.localStorage.setItem("smartspend_pwa_standalone", String(installedPwa));
          // Installed display mode is a browser capability, not a storage flag.
          Object.defineProperty(navigator, "standalone", { configurable: true, value: installedPwa });
          const matchMedia = window.matchMedia.bind(window);
          window.matchMedia = (query) => {
            const result = matchMedia(query);
            if (query === "(display-mode: standalone)") {
              Object.defineProperty(result, "matches", { configurable: true, value: installedPwa });
            }
            return result;
          };
          window.localStorage.setItem("smartspend_theme", "dark");
          window.localStorage.setItem("theme", "dark");
          // Mark document element as standalone and dark mode
          document.documentElement.classList.add("dark");
          document.documentElement.classList.toggle("pwa-standalone", installedPwa);
          document.documentElement.setAttribute("dir", "rtl");
          document.documentElement.setAttribute("lang", "ar");
        } catch {
          // ignore
        }
      }, { user: activeUser, installedPwa: options?.installedPwa ?? true });

      // Route-level tRPC API Mocking
      await page.route("**/api/trpc/**", async (route) => {
        const url = route.request().url();
        const requestPath = decodeURIComponent(new URL(url).pathname);
        const encodedProcedures = requestPath.split("/api/trpc/")[1] || "";
        const procedures = encodedProcedures.split(",").filter(Boolean);

        const dataForProcedure = (procedure: string): unknown => {
          if (procedure === "ai.getUserLimits") {
            const reply = options?.limitsReply;
            if (reply && reply !== "error") return reply.data;
            const limit = activeUser.plan === "ultra" ? 0
              : activeUser.plan === "pro" ? 1800 : 300;
            return {
              ai: { limit: 30000, used: 0, remaining: 30000, maxPerRequest: 1000 },
              voice: {
                limit, used: 0, remaining: limit ? limit : -1,
                resetDate: "2030-01-01T00:00:00.000Z",
                maxPerRequest: activeUser.plan === "free" ? 60 : activeUser.plan === "pro" ? 180 : 300,
              },
              offline: { limit: 3 },
            } satisfies inferRouterOutputs<AppRouter>["ai"]["getUserLimits"];
          }
          // The tRPC procedure returns the user itself, not `{ user }`.
          if (procedure === "auth.me" || procedure === "auth.getSession") {
            return activeUser;
          }
          if (procedure === "localAuth.me") return null;

          if (procedure === "expense.getMonthSummary") {
            return MOCK_FINANCIAL_SUMMARY;
          }
          if (procedure === "expense.getMonthlyStats") {
            return {
              stats: MOCK_FINANCIAL_SUMMARY.categoryBreakdown,
              daily: MOCK_FINANCIAL_SUMMARY.dailyExpenses,
              totalSpent: MOCK_FINANCIAL_SUMMARY.totalSpent,
            };
          }
          if (procedure === "expense.list") {
            return { items: [], total: 0 };
          }
          if (procedure === "goals.list") {
            return { goals: [], isPro: true };
          }
          if (
            procedure === "system.getSettings" ||
            procedure.startsWith("settings.")
          ) {
            return {
              currency: "EGP",
              salaryDay: 1,
              notificationsEnabled: true,
              aiBudget: 50,
            };
          }
          if (procedure === "profile.getSmartProfile") {
            return {
              profileCompleted: true,
              financialInfo: { hasFixedSalary: false },
              gamification: { currentStreak: 14 },
            };
          }
          if (procedure === "profile.getInAppNotifications") return [];
          if (procedure === "profile.getSmsSuggestions") return [];
          if (procedure === "expense.getPendingClarifications") return [];
          if (procedure === "budget.list") return { budgets: [] };
          if (procedure === "expense.getDebtBalances") return { balances: [], owedToYou: 0, youOwe: 0 };
          if (procedure === "expense.getSeasonSpending") return { season: "ramadan", label: "رمضان", startDay: "2026-02-18", endDay: "2026-03-19", total: 0, count: 0, byCategory: [], previous: null };
          if (procedure === "expense.listInstallmentPlans") return [];
          if (procedure === "expense.previewCategory") return null;
          if (procedure === "chat.getQuickActions") return [];
          if (procedure === "chat.getConversations") return [];
          if (procedure === "ads.list") return [];
          return {};
        };

        const failing = (procedure: string) =>
          procedure === "ai.getUserLimits" && options?.limitsReply === "error";
        const response = procedures.map((procedure) =>
          failing(procedure)
            ? { error: { message: "Internal server error", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: procedure } } }
            : { result: { data: dataForProcedure(procedure) } },
        );

        return route.fulfill({
          status: procedures.some(failing) ? 207 : 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
      });
    };

    await use(setup);
  },

  dragTouchCoordinates: async ({ page }, use) => {
    const helper = async (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      steps: number = 10,
    ) => {
      // Evaluate continuous touch events on the active page
      await page.evaluate(
        async ({ startX, startY, endX, endY, steps }) => {
          // Synthetic events exercise our handlers, not native browser scrolling.
          // WebKit exposes Touch but rejects its constructor. Supply the same
          // coordinate fields through ordinary events on both engines.
          const createTouch = (x: number, y: number, target: Element) =>
            ({
              identifier: 1,
              target,
              clientX: x,
              clientY: y,
              pageX: x,
              pageY: y,
              screenX: x,
              screenY: y,
              radiusX: 10,
              radiusY: 10,
              rotationAngle: 0,
              force: 0.8,
            });
          const touchEvent = (type: string, touch: ReturnType<typeof createTouch>) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, {
              touches: { value: type === "touchend" ? [] : [touch] },
              targetTouches: { value: type === "touchend" ? [] : [touch] },
              changedTouches: { value: [touch] },
            });
            return event;
          };

          const startTarget =
            document.elementFromPoint(startX, startY) || document.body;
          const initialTouch = createTouch(startX, startY, startTarget);
          const isNavigation = Boolean(startTarget.closest("[data-testid='mobile-bottom-nav']"));
          const pointerEvent = (type: string, x: number, y: number) => new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
            isPrimary: true, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y,
          });
          if (isNavigation) startTarget.dispatchEvent(pointerEvent("pointerdown", startX, startY));

          startTarget.dispatchEvent(
            touchEvent("touchstart", initialTouch),
          );

          for (let i = 1; i <= steps; i++) {
            const currentX = startX + ((endX - startX) * i) / steps;
            const currentY = startY + ((endY - startY) * i) / steps;
            const moveTarget = startTarget;
            const moveTouch = createTouch(currentX, currentY, moveTarget);

            moveTarget.dispatchEvent(
              touchEvent("touchmove", moveTouch),
            );
            if (isNavigation) startTarget.dispatchEvent(pointerEvent("pointermove", currentX, currentY));

            // Micro-delay between touch interpolation steps (approx 16ms / 60fps)
            await new Promise((resolve) => setTimeout(resolve, 16));
          }

          const endTarget = startTarget;
          const endTouch = createTouch(endX, endY, endTarget);

          endTarget.dispatchEvent(
            touchEvent("touchend", endTouch),
          );
          if (isNavigation) startTarget.dispatchEvent(pointerEvent("pointerup", endX, endY));
        },
        { startX, startY, endX, endY, steps },
      );
    };

    await use(helper);
  },

  dragBetweenTabs: async ({ page, dragTouchCoordinates }, use) => {
    const helper = async (
      sourceTabId: "record" | "stats" | "ai" | "calendar" | "more",
      targetTabId: "record" | "stats" | "ai" | "calendar" | "more",
    ) => {
      // Find source tab and target tab selectors (support both data-testid and fallback aria/text selectors)
      const getTabCenter = async (
        id: string,
      ): Promise<{ x: number; y: number }> => {
        // The shell mounts again once the session is known; measure the settled nav.
        await expect(page.getByTestId("mobile-bottom-nav")).toHaveCSS("position", "fixed");
        const selectorCandidates = [
          `[data-testid="nav-tab-${id}"]`,
          `[data-tab="${id}"]`,
          `nav.mobile-bottom-nav a[href*="tab=${id}"]`,
          `nav.mobile-bottom-nav a[href*="/${id}"]`,
          `nav.mobile-bottom-nav button[aria-label*="${id === "more" ? "المزيد" : id}"]`,
        ];

        let locator: Locator | null = null;
        for (const sel of selectorCandidates) {
          const count = await page.locator(sel).count();
          if (count > 0) {
            locator = page.locator(sel).first();
            break;
          }
        }

        if (!locator) {
          // Fallback based on tab index in 5-column nav grid
          const tabOrder = ["record", "stats", "ai", "calendar", "more"];
          const index = tabOrder.indexOf(id);
          const navBar = page
            .locator('nav.mobile-bottom-nav, [data-testid="mobile-bottom-nav"]')
            .first();
          const navBox = await navBar.boundingBox();
          if (!navBox)
            throw new Error(`Could not find bottom navigation for tab ${id}`);
          const tabWidth = navBox.width / 5;
          // In RTL layout: index 0 (record) is at the right
          const centerX = navBox.x + navBox.width - (index + 0.5) * tabWidth;
          const centerY = navBox.y + navBox.height / 2;
          return { x: centerX, y: centerY };
        }

        await locator.waitFor({ state: "visible" });
        const box = await locator.boundingBox();
        if (!box) throw new Error(`Bounding box not found for tab ${id}`);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };

      const start = await getTabCenter(sourceTabId);
      const end = await getTabCenter(targetTabId);

      await dragTouchCoordinates(start.x, start.y, end.x, end.y, 12);
    };

    await use(helper);
  },
});

export { expect };
