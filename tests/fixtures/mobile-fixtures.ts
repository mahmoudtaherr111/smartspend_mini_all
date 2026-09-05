import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";

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
          !text.includes("favicon.ico")
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
    const setup = async (options?: { plan?: "free" | "pro" | "ultra" }) => {
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
      await page.addInitScript((user) => {
        try {
          window.localStorage.setItem("smartspend_user", JSON.stringify(user));
          window.localStorage.setItem("smartspend_pwa_standalone", "true");
          window.localStorage.setItem("smartspend_theme", "dark");
          window.localStorage.setItem("theme", "dark");
          // Mark document element as standalone and dark mode
          document.documentElement.classList.add("dark", "pwa-standalone");
          document.documentElement.setAttribute("dir", "rtl");
          document.documentElement.setAttribute("lang", "ar");
        } catch {
          // ignore
        }
      }, activeUser);

      // Route-level tRPC API Mocking
      await page.route("**/api/trpc/**", async (route) => {
        const url = route.request().url();
        const requestPath = decodeURIComponent(new URL(url).pathname);
        const encodedProcedures = requestPath.split("/api/trpc/")[1] || "";
        const procedures = encodedProcedures.split(",").filter(Boolean);

        const dataForProcedure = (procedure: string): unknown => {
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
          if (procedure === "chat.getQuickActions") return [];
          if (procedure === "chat.getConversations") return [];
          if (procedure === "ads.list") return [];
          return {};
        };

        const response = procedures.map((procedure) => ({
          result: { data: dataForProcedure(procedure) },
        }));

        return route.fulfill({
          status: 200,
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
          const createTouch = (x: number, y: number, target: Element) =>
            new Touch({
              identifier: Date.now(),
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

          const startTarget =
            document.elementFromPoint(startX, startY) || document.body;
          const initialTouch = createTouch(startX, startY, startTarget);

          startTarget.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [initialTouch],
              targetTouches: [initialTouch],
              changedTouches: [initialTouch],
            }),
          );

          for (let i = 1; i <= steps; i++) {
            const currentX = startX + ((endX - startX) * i) / steps;
            const currentY = startY + ((endY - startY) * i) / steps;
            const moveTarget =
              document.elementFromPoint(currentX, currentY) || startTarget;
            const moveTouch = createTouch(currentX, currentY, moveTarget);

            moveTarget.dispatchEvent(
              new TouchEvent("touchmove", {
                bubbles: true,
                cancelable: true,
                touches: [moveTouch],
                targetTouches: [moveTouch],
                changedTouches: [moveTouch],
              }),
            );

            // Micro-delay between touch interpolation steps (approx 16ms / 60fps)
            await new Promise((resolve) => setTimeout(resolve, 16));
          }

          const endTarget =
            document.elementFromPoint(endX, endY) || startTarget;
          const endTouch = createTouch(endX, endY, endTarget);

          endTarget.dispatchEvent(
            new TouchEvent("touchend", {
              bubbles: true,
              cancelable: true,
              touches: [],
              targetTouches: [],
              changedTouches: [endTouch],
            }),
          );
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
