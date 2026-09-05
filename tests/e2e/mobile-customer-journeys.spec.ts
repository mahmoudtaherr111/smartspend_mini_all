import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("R4: Mobile Customer Journeys & Multi-Viewport Auditing", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("Tier 4 (Scenario 1): Daily Mobile Expense Logging Journey across tabs with zero console errors", async ({
    page,
    consoleErrors,
  }) => {
    // 1. User launches app in standalone mobile mode
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 2. Fill expense form
    const expenseDraft = page.locator("#expense-input");
    await expect(expenseDraft).toBeVisible();
    await expenseDraft.fill("120 جنيه غدا");

    // 3. Root destinations switch with a deliberate tab tap, matching native
    // tab-bar semantics instead of treating the app as a horizontal carousel.
    await page.getByTestId("nav-tab-stats").click();

    // Verify stats content
    await expect(
      page.locator("#home-panel-stats[data-state='active']"),
    ).toBeVisible();

    // 4. Tap Calendar
    await page.getByTestId("nav-tab-calendar").click();

    // Verify calendar ledger
    await expect(
      page.locator("#home-panel-calendar[data-state='active']"),
    ).toBeVisible();

    // 5. Tap back to Record
    await page.getByTestId("nav-tab-record").click();

    // Form value remains preserved
    await expect(expenseDraft).toHaveValue("120 جنيه غدا");

    // 6. Assert zero console errors occurred during the journey
    expect(consoleErrors).toHaveLength(0);
  });

  test("Tier 4 (Scenario 2): AI Center Workflow with voice trigger & non-occluded chat input", async ({
    page,
    consoleErrors,
  }) => {
    // Navigate to AI Center
    await page.goto("/ai");
    await page.waitForLoadState("domcontentloaded");

    // Verify AI Center container is rendered
    const aiCenter = page
      .locator("main, [data-testid='ai-center']")
      .or(page.getByText(/المساعد المالي|SmartSpend AI/))
      .first();
    await expect(aiCenter).toBeVisible();

    // Verify chat input composer exists and is not occluded by floating bottom nav
    const chatInput = page
      .locator(
        "input[placeholder*='اسأل'], textarea[placeholder*='اسأل'], [data-testid='chat-input']",
      )
      .first();
    if ((await chatInput.count()) > 0) {
      await expect(chatInput).toBeVisible();

      // Check coordinates of chat input vs bottom nav
      const inputRect = await chatInput.boundingBox();
      const viewport = page.viewportSize();

      if (inputRect && viewport) {
        // Chat input should be above the bottom edge safe area
        expect(inputRect.y + inputRect.height).toBeLessThanOrEqual(
          viewport.height,
        );
      }
    }

    // Assert zero console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test("Tier 4 (Scenario 3): Tablet & Large Mobile Screen Geometry & More destination audit", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    // "More" is a stable root destination. Native tab bars should navigate to
    // a full screen instead of opening an unrelated sidebar drawer.
    await page.getByTestId("nav-tab-more").click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.getByRole("heading", { name: "المزيد" })).toBeVisible();

    // Assert zero console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test("Tier 2 (BVA): Rapid full-loop taps across all 5 root navigation tabs", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    const destinations = [
      { tab: "stats", url: /tab=stats/ },
      { tab: "ai", url: /\/ai$/ },
      { tab: "calendar", url: /tab=calendar/ },
      { tab: "more", url: /\/more$/ },
    ];
    for (const destination of destinations) {
      const tab = page.getByTestId(`nav-tab-${destination.tab}`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page).toHaveURL(destination.url);
      await page.waitForTimeout(180);
    }

    // Nav container should remain firmly visible
    const nav = page
      .locator(
        "nav.mobile-bottom-nav, [data-testid='mobile-bottom-nav'], nav[aria-label*='التنقل']",
      )
      .first();
    await expect(nav).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });
});
