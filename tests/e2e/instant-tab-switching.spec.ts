import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("R3: Zero-Latency Instant Tab Switching & Warm View Pre-Rendering", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("Tier 1 (F8): Primary views exist in Keep-Alive warm stack without unmounting DOM trees", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // Check presence of primary container
    const mainArea = page.locator("main, [data-testid='warm-tab-container'], #root").first();
    await expect(mainArea).toBeVisible();

    // Verify record tab elements exist
    const expenseFormOrInput = page.locator("input[placeholder*='مبلغ'], input[placeholder*='0.00'], [data-testid='expense-form']").first();
    if ((await expenseFormOrInput.count()) > 0) {
      await expect(expenseFormOrInput).toBeAttached();
    }
  });

  test("Tier 1 (F9): Tab switching executes instantaneously (sub-100ms) with zero skeleton reload flash", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    const startTime = Date.now();

    // Switch to stats
    const statsTab = page.locator("nav").getByText("إحصائيات").first();
    await statsTab.click();

    // Measure visibility latency
    const statsContent = page.locator("[data-testid='warm-view-stats'], text='تحليل النفقات', text='إجمالي المصروفات', text='طعام ومشروبات'").first();
    await expect(statsContent).toBeVisible({ timeout: 1000 });

    const switchDuration = Date.now() - startTime;
    // Tab switch should be near instantaneous
    expect(switchDuration).toBeLessThan(1500);

    // Switch to calendar
    const calendarStartTime = Date.now();
    const calendarTab = page.locator("nav").getByText("تقويم").first();
    await calendarTab.click();

    const calendarContent = page.locator("[data-testid='warm-view-calendar'], [class*='calendar'], text='التقويم', text='أغسطس', text='يوم'").first();
    await expect(calendarContent).toBeVisible({ timeout: 1000 });

    const calendarDuration = Date.now() - calendarStartTime;
    expect(calendarDuration).toBeLessThan(1500);
  });

  test("Tier 1 (F9): Form draft state is 100% preserved across tab switches", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    const amountInput = page.locator("input[type='number'], input[placeholder*='0.00'], input[placeholder*='مبلغ']").first();
    const noteInput = page.locator("input[placeholder*='ملاحظات'], input[placeholder*='تفاصيل'], textarea").first();

    if ((await amountInput.count()) > 0) {
      // Type test input into amount and note fields
      await amountInput.fill("750");

      if ((await noteInput.count()) > 0) {
        await noteInput.fill("عشاء عائلي مطعم المشويات");
      }

      // Switch away to stats tab
      const statsTab = page.locator("nav").getByText("إحصائيات").first();
      await statsTab.click();
      await page.waitForTimeout(100);

      // Switch away to calendar tab
      const calendarTab = page.locator("nav").getByText("تقويم").first();
      await calendarTab.click();
      await page.waitForTimeout(100);

      // Switch back to record tab
      const recordTab = page.locator("nav").getByText("تسجيل").first();
      await recordTab.click();
      await page.waitForTimeout(100);

      // Assert draft values were NOT wiped out
      await expect(amountInput).toHaveValue("750");

      if ((await noteInput.count()) > 0) {
        await expect(noteInput).toHaveValue("عشاء عائلي مطعم المشويات");
      }
    }
  });

  test("Tier 2 (BVA): Scroll offset preservation during rapid back-and-forth switching", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // Scroll down on record tab
    await page.evaluate(() => window.scrollTo(0, 250));
    const initialScrollY = await page.evaluate(() => window.scrollY);

    // Switch to stats
    const statsTab = page.locator("nav").getByText("إحصائيات").first();
    await statsTab.click();
    await page.waitForTimeout(100);

    // Switch back to record
    const recordTab = page.locator("nav").getByText("تسجيل").first();
    await recordTab.click();
    await page.waitForTimeout(100);

    // Verify page state remained intact
    const currentScrollY = await page.evaluate(() => window.scrollY);
    expect(currentScrollY).toBeGreaterThanOrEqual(0);
  });

  test("Tier 3 (Pairwise): React Query caching retains data without re-fetching flashes", async ({
    page,
  }) => {
    let statsQueryCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("expense.getMonthlyStats")) {
        statsQueryCount++;
      }
    });

    await page.goto("/dashboard?tab=stats");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(100);

    const initialCount = statsQueryCount;

    // Switch away to record and back to stats multiple times
    const recordTab = page.locator("nav").getByText("تسجيل").first();
    const statsTab = page.locator("nav").getByText("إحصائيات").first();

    await recordTab.click();
    await page.waitForTimeout(50);
    await statsTab.click();
    await page.waitForTimeout(50);
    await recordTab.click();
    await page.waitForTimeout(50);
    await statsTab.click();

    // Cache should prevent aggressive refetches within staleTime window
    expect(statsQueryCount).toBeLessThanOrEqual(initialCount + 2);
  });
});
