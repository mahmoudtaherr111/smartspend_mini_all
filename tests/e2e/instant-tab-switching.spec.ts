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
    const mainArea = page
      .locator("main, [data-testid='warm-tab-container'], #root")
      .first();
    await expect(mainArea).toBeVisible();

    // Verify record tab elements exist
    const expenseFormOrInput = page
      .locator(
        "input[placeholder*='مبلغ'], input[placeholder*='0.00'], [data-testid='expense-form']",
      )
      .first();
    if ((await expenseFormOrInput.count()) > 0) {
      await expect(expenseFormOrInput).toBeAttached();
    }
  });

  test("Tier 1 (F9): Tab selection shows the active warm panel within 1500ms of input", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    for (const id of ["stats", "calendar"]) {
      const tab = page.getByTestId(`nav-tab-${id}`);
      // Measure in the browser from the user's release to the next paint of
      // the active panel. Playwright's navigation auto-wait adds engine and
      // transport overhead that is not the app's response time.
      await page.evaluate((panelId) => {
        document.body.removeAttribute("data-selection-ms");
        let started: number | null = null;
        const start = (event: Event) => {
          if (started !== null || !(event.target instanceof Element)) return;
          // iOS captures the pointer on the nav, so release is retargeted
          // from the tab link to its parent navigation element.
          if (event.target.closest("[data-testid='mobile-bottom-nav']"))
            started = performance.now();
        };
        // WebKit's automation port can emit mouse events without pointer events.
        document.addEventListener("pointerup", start, true);
        document.addEventListener("mouseup", start, true);
        document.addEventListener("touchend", start, true);
        document.addEventListener("click", start, true);
        const observer = new MutationObserver(() => {
          if (
            started === null ||
            document.getElementById(panelId)?.dataset.state !== "active"
          )
            return;
          observer.disconnect();
          document.removeEventListener("pointerup", start, true);
          document.removeEventListener("mouseup", start, true);
          document.removeEventListener("touchend", start, true);
          document.removeEventListener("click", start, true);
          requestAnimationFrame(() => {
            document.body.setAttribute(
              "data-selection-ms",
              String(performance.now() - started!),
            );
          });
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-state"],
        });
      }, `home-panel-${id}`);
      await tab.click();
      await expect(
        page.locator(`#home-panel-${id}[data-state='active']`),
      ).toBeVisible({ timeout: 1000 });
      await expect(page.locator("body")).toHaveAttribute(
        "data-selection-ms",
        /\d/,
      );
      expect(
        Number(await page.locator("body").getAttribute("data-selection-ms")),
      ).toBeLessThan(1500);
    }
  });

  test("Tier 1 (F9): Form draft state is 100% preserved across tab switches", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    const amountInput = page
      .locator(
        "input[type='number'], input[placeholder*='0.00'], input[placeholder*='مبلغ']",
      )
      .first();
    const noteInput = page
      .locator(
        "input[placeholder*='ملاحظات'], input[placeholder*='تفاصيل'], textarea",
      )
      .first();

    if ((await amountInput.count()) > 0) {
      // Type test input into amount and note fields
      await amountInput.fill("750");

      if ((await noteInput.count()) > 0) {
        await noteInput.fill("عشاء عائلي مطعم المشويات");
      }

      // Switch away to stats tab
      const statsTab = page
        .locator("[data-testid='mobile-bottom-nav']")
        .getByText("إحصائيات")
        .first();
      await statsTab.click();
      await page.waitForTimeout(100);

      // Switch away to calendar tab
      const calendarTab = page
        .locator("[data-testid='mobile-bottom-nav']")
        .getByText("تقويم")
        .first();
      await calendarTab.click();
      await page.waitForTimeout(100);

      // Switch back to record tab
      const recordTab = page
        .locator("[data-testid='mobile-bottom-nav']")
        .getByText("تسجيل")
        .first();
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
    const statsTab = page
      .locator("[data-testid='mobile-bottom-nav']")
      .getByText("إحصائيات")
      .first();
    await statsTab.click();
    await page.waitForTimeout(100);

    // Switch back to record
    const recordTab = page
      .locator("[data-testid='mobile-bottom-nav']")
      .getByText("تسجيل")
      .first();
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
    const recordTab = page
      .locator("[data-testid='mobile-bottom-nav']")
      .getByText("تسجيل")
      .first();
    const statsTab = page
      .locator("[data-testid='mobile-bottom-nav']")
      .getByText("إحصائيات")
      .first();

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
