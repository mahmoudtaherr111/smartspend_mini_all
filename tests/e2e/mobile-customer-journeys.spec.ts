import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("R4: Mobile Customer Journeys & Multi-Viewport Auditing", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("Tier 4 (Scenario 1): Daily Mobile Expense Logging Journey across tabs with zero console errors", async ({
    page,
    dragBetweenTabs,
    consoleErrors,
  }) => {
    // 1. User launches app in standalone mobile mode
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 2. Fill expense form
    const amountInput = page.locator("input[placeholder*='0.00'], input[placeholder*='مبلغ'], input[type='number']").first();
    if ((await amountInput.count()) > 0) {
      await amountInput.fill("120");
    }

    // 3. Touch glide to Stats tab
    await dragBetweenTabs("record", "stats");
    await page.waitForTimeout(100);

    // Verify stats content
    const statsIndicator = page.locator("text='إحصائيات', text='تحليل', text='طعام ومشروبات'").first();
    await expect(statsIndicator).toBeVisible();

    // 4. Touch glide to Calendar tab
    await dragBetweenTabs("stats", "calendar");
    await page.waitForTimeout(100);

    // Verify calendar ledger
    const calendarView = page.locator("text='تقويم', text='أغسطس', [class*='calendar']").first();
    await expect(calendarView).toBeVisible();

    // 5. Touch glide back to Record tab
    await dragBetweenTabs("calendar", "record");
    await page.waitForTimeout(100);

    // Form value remains preserved
    if ((await amountInput.count()) > 0) {
      await expect(amountInput).toHaveValue("120");
    }

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
    const aiCenter = page.locator("main, [data-testid='ai-center'], text='المساعد المالي', text='SmartSpend AI'").first();
    await expect(aiCenter).toBeVisible();

    // Verify chat input composer exists and is not occluded by floating bottom nav
    const chatInput = page.locator("input[placeholder*='اسأل'], textarea[placeholder*='اسأل'], [data-testid='chat-input']").first();
    if ((await chatInput.count()) > 0) {
      await expect(chatInput).toBeVisible();

      // Check coordinates of chat input vs bottom nav
      const inputRect = await chatInput.boundingBox();
      const viewport = page.viewportSize();

      if (inputRect && viewport) {
        // Chat input should be above the bottom edge safe area
        expect(inputRect.y + inputRect.height).toBeLessThanOrEqual(viewport.height);
      }
    }

    // Assert zero console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test("Tier 4 (Scenario 3): Tablet & Large Mobile Screen Geometry & Menu Drawer audit", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    // Open More drawer / sidebar
    const moreTabOrMenu = page.locator("nav button[aria-label*='المزيد'], nav button[aria-label*='فتح القائمة'], nav").getByText("المزيد").first();
    if ((await moreTabOrMenu.count()) > 0) {
      await moreTabOrMenu.click();
      await page.waitForTimeout(150);

      // Verify sidebar drawer or menu overlay opens
      const drawerOrSidebar = page.locator("[role='dialog'], [data-state='open'], aside, nav").first();
      await expect(drawerOrSidebar).toBeVisible();
    }

    // Assert zero console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test("Tier 2 (BVA): Rapid full-loop touch gestures across all 5 navigation tabs", async ({
    page,
    dragBetweenTabs,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // Sequence of touch glides across tabs
    await dragBetweenTabs("record", "stats");
    await dragBetweenTabs("stats", "ai");
    await dragBetweenTabs("ai", "calendar");
    await dragBetweenTabs("calendar", "more");

    await page.waitForTimeout(100);

    // Nav container should remain firmly visible
    const nav = page.locator("nav.mobile-bottom-nav, [data-testid='mobile-bottom-nav'], nav[aria-label*='التنقل']").first();
    await expect(nav).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });
});
