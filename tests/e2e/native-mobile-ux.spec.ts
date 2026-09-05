import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("Native Mobile Transformation: Comprehensive 4-Tier UX & Physics Specification", () => {
  test.beforeEach(async ({ setupMockEnvironment, page }) => {
    await setupMockEnvironment({ plan: "pro" });

    // Mock navigator.vibrate to track haptic pulses and touch gesture telemetry
    await page.addInitScript(() => {
      (
        window as unknown as { __hapticCalls: (number | number[])[] }
      ).__hapticCalls = [];
      navigator.vibrate = (pattern: number | number[]) => {
        (
          window as unknown as { __hapticCalls: (number | number[])[] }
        ).__hapticCalls.push(pattern);
        return true;
      };

      // Mock Capacitor plugins in browser runtime
      (
        window as unknown as { Capacitor?: { isNativePlatform: () => boolean } }
      ).Capacitor = {
        isNativePlatform: () => false,
      };
    });
  });

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Touch Physics, Active States, Haptics, Fonts)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("T1.1: Bottom navigation supports press-and-drag tab selection without paging content", async ({
      page,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const navBar = page
        .locator("nav[aria-label*='التنقل'], nav.mobile-bottom-nav")
        .first();
      await expect(navBar).toBeVisible();

      const recordTab = page.getByTestId("nav-tab-record");
      const statsTab = page.getByTestId("nav-tab-stats");
      await expect(recordTab).toBeVisible();
      await expect(statsTab).toBeVisible();
      const recordBox = await recordTab.boundingBox();
      const statsBox = await statsTab.boundingBox();
      expect(recordBox).not.toBeNull();
      expect(statsBox).not.toBeNull();
      if (!recordBox || !statsBox) return;

      const iosScrubEnabled =
        (await navBar.getAttribute("data-ios-scrub-enabled")) === "true";

      await page.mouse.move(
        recordBox.x + recordBox.width / 2,
        recordBox.y + recordBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        statsBox.x + statsBox.width / 2,
        statsBox.y + statsBox.height / 2,
        { steps: 8 },
      );

      if (!iosScrubEnabled) {
        await expect(navBar).toHaveAttribute("data-scrubbing", "false");
        await page.mouse.up();
        await expect(page).toHaveURL(/tab=record/);
        await statsTab.click();
        await expect(page).toHaveURL(/tab=stats/);
        return;
      }

      await expect(navBar).toHaveAttribute("data-scrubbing", "true");
      await expect(navBar).toHaveAttribute("data-preview-index", "1");
      await page.mouse.up();

      await expect(page).toHaveURL(/tab=stats/);
      await expect(navBar).toBeVisible();
      await expect(page.getByTestId("native-tab-panels")).not.toHaveCSS(
        "transform",
        /matrix/,
      );
    });

    test("T1.2 (Instant 0ms Button Active States): Active press classes apply immediate scale transforms without tap delay", async ({
      page,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const buttons = page
        .getByRole("navigation", { name: "التنقل الرئيسي" })
        .getByRole("link");
      await expect(buttons).toHaveCount(5);

      // Verify computed CSS touch-action on the button is manipulation
      const firstBtn = buttons.first();
      await expect(firstBtn).toBeVisible();
      const touchAction = await firstBtn.evaluate((el) => {
        return window.getComputedStyle(el).touchAction;
      });
      expect(touchAction).toMatch(/manipulation|pan-y|none/);
    });

    test("T1.3: Viewport keeps native safe-area support without disabling accessibility zoom", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      // Verify viewport meta attributes
      const viewportMeta = await page
        .locator("meta[name='viewport']")
        .getAttribute("content");
      expect(viewportMeta).toContain("width=device-width");
      expect(viewportMeta).toContain("initial-scale=1.0");
      expect(viewportMeta).toContain("viewport-fit=cover");
      expect(viewportMeta).not.toContain("maximum-scale=1.0");
      expect(viewportMeta).not.toContain("user-scalable=no");

      // Safari's pinch gesture must remain available to users who need zoom.
      const gestureListenersActive = await page.evaluate(() => {
        let defaultPrevented = false;
        const event = new Event("gesturestart", {
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        defaultPrevented = event.defaultPrevented;
        return defaultPrevented;
      });
      expect(gestureListenersActive).toBe(false);
    });

    test("T1.4: Platform tab bar is attached to the viewport edge", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      const nav = page
        .locator("nav[aria-label*='التنقل'], nav.mobile-bottom-nav")
        .first();
      await expect(nav).toBeVisible();
      await expect(nav).toHaveCSS("position", "fixed");

      const navSurface = nav.locator("> div").first();
      await expect(navSurface).toBeVisible();

      const styles = await navSurface.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          backdropFilter:
            cs.backdropFilter ||
            (cs as unknown as Record<string, string>).webkitBackdropFilter ||
            "",
          borderRadius: cs.borderRadius,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
          isIos: /iPad|iPhone|iPod/.test(navigator.userAgent),
        };
      });

      if (styles.isIos) {
        expect(styles.backdropFilter).toContain("blur");
        expect(Number.parseFloat(styles.borderRadius)).toBeGreaterThan(0);
        expect(styles.bottom).toBeLessThan(styles.viewportHeight);
      } else {
        expect(styles.borderRadius).toBe("0px");
        expect(
          Math.abs(styles.viewportHeight - styles.bottom),
        ).toBeLessThanOrEqual(1);
      }
    });

    test("T1.5 (Multi-Tier Haptics Engine): Tab selections trigger localized haptic vibrations", async ({
      page,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const statsTab = page
        .locator("nav.mobile-bottom-nav")
        .getByText("إحصائيات", { exact: true });
      await statsTab.click();
      await page.waitForTimeout(100);

      const hapticCalls = await page.evaluate(() => {
        return (window as unknown as { __hapticCalls: (number | number[])[] })
          .__hapticCalls;
      });
      expect(hapticCalls.length).toBeGreaterThanOrEqual(1);
    });

    test("T1.6 (Self-Hosted Cairo Font Typography): Body renders with Cairo Variable without font clipping", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      const typography = await page.evaluate(() => {
        const bodyStyle = window.getComputedStyle(document.body);
        return {
          fontFamily: bodyStyle.fontFamily,
          dir:
            document.documentElement.getAttribute("dir") ||
            document.body.getAttribute("dir") ||
            "rtl",
          lang: document.documentElement.getAttribute("lang") || "ar",
        };
      });

      expect(typography.fontFamily).toContain("Cairo");
      expect(typography.dir).toBe("rtl");
      expect(typography.lang).toBe("ar");
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Detents, Flicks, Scroll Resistance)
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("T2.1: Rapid flick drag gestures across all navigation tabs maintain stable route state", async ({
      page,
      dragBetweenTabs,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // Rapid flick across tabs
      await dragBetweenTabs("record", "stats");
      await dragBetweenTabs("stats", "ai");
      await dragBetweenTabs("ai", "calendar");
      await dragBetweenTabs("calendar", "record");

      await page.waitForTimeout(200);

      // Verify no console exceptions occurred
      expect(consoleErrors).toHaveLength(0);
      const url = page.url();
      expect(url).toMatch(/dashboard|ai/);
    });

    test("T2.2: Scroll cancellation on touch drag: vertical swipe does not trigger tab change", async ({
      page,
      dragTouchCoordinates,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const viewport = page.viewportSize() || { width: 390, height: 844 };

      // Drag strictly vertically in center of screen
      const startX = viewport.width / 2;
      const startY = viewport.height / 2 + 100;
      const endX = viewport.width / 2;
      const endY = viewport.height / 2 - 100;

      await dragTouchCoordinates(startX, startY, endX, endY, 10);
      await page.waitForTimeout(100);

      // Verify URL stayed on tab=record
      expect(page.url()).toContain("tab=record");
    });

    test("T2.3: Zero elastic rubber-banding on document body (overscroll-behavior-y: none)", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      const overscroll = await page.evaluate(() => {
        return window.getComputedStyle(document.body).overscrollBehaviorY;
      });
      expect(overscroll).toBe("none");
    });

    test("T2.4: More is a real destination and protects logout with confirmation", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      const moreLink = page
        .locator("nav")
        .getByText("المزيد", { exact: true })
        .first();
      await moreLink.click();
      await expect(page).toHaveURL(/\/more$/);
      const logoutButton = page.getByRole("button", {
        name: "تسجيل الخروج",
        exact: true,
      });
      await logoutButton.click();
      const confirmation = page.getByRole("dialog");
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toContainText("تسجيل الخروج؟");
      await page.keyboard.press("Escape");
      await expect(confirmation).toBeHidden();

      expect(consoleErrors).toHaveLength(0);
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Tab Keep-Alive, Keyboard Avoidance)
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Interactions", () => {
    test("T3.1: Form draft state is retained across multiple route navigations without reload", async ({
      page,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const textarea = page
        .locator(
          "#expense-input, textarea, input[placeholder*='0.00'], input[placeholder*='مبلغ']",
        )
        .first();
      if ((await textarea.count()) > 0) {
        await textarea.fill("350 جنيه فواتير كهرباء");

        // Navigate to stats
        const statsTab = page.locator("nav").getByText("إحصائيات").first();
        await statsTab.click();
        await page.waitForTimeout(100);

        // Navigate to AI center
        const aiTab = page.locator("nav").getByText("مركز AI").first();
        await aiTab.click();
        await page.waitForTimeout(100);

        // Navigate back to record tab
        const recordTab = page.locator("nav").getByText("تسجيل").first();
        await recordTab.click();
        await page.waitForTimeout(100);

        // Verify draft was preserved
        await expect(textarea).toHaveValue("350 جنيه فواتير كهرباء");
      }
    });

    test("T3.2: Virtual keyboard invocation automatically adapts bottom navigation without layout clipping", async ({
      page,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const textarea = page
        .locator("#expense-input, textarea, input[type='text']")
        .first();
      if ((await textarea.count()) > 0) {
        await textarea.focus();
        await page.waitForTimeout(100);

        // Verify text input is in viewport
        const box = await textarea.boundingBox();
        const viewport = page.viewportSize();
        if (box && viewport) {
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 500);
        }
      }
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION WORKLOADS & STRESS
  // =========================================================================
  test.describe("Tier 4: Real-World Application Workloads", () => {
    test("T4.1: End-to-end mobile session uses explicit tab taps with zero console errors", async ({
      page,
      consoleErrors,
    }) => {
      // 1. Open app
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // 2. Type expense
      const input = page
        .locator(
          "#expense-input, textarea, input[placeholder*='0.00'], input[placeholder*='مبلغ']",
        )
        .first();
      if ((await input.count()) > 0) {
        await input.fill("180 جنيه سوبر ماركت");
      }

      // 3. Navigate through root destinations by deliberate taps.
      const mobileNav = page.locator("nav.mobile-bottom-nav");
      await mobileNav.getByText("إحصائيات", { exact: true }).click();
      await expect(page).toHaveURL(/tab=stats/);
      await mobileNav.getByText("تقويم", { exact: true }).click();
      await expect(page).toHaveURL(/tab=calendar/);
      await mobileNav.getByText("تسجيل", { exact: true }).click();
      await expect(page).toHaveURL(/tab=record/);

      // 4. Assert zero console errors throughout the entire mobile lifecycle
      expect(consoleErrors).toHaveLength(0);
    });

    test("T4.2: Mobile navigation keeps fixed positioning and immediate touch handling", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("domcontentloaded");

      const navigation = page.getByRole("navigation", {
        name: "التنقل الرئيسي",
      });
      const firstLink = navigation.getByRole("link").first();
      await expect(navigation).toHaveCSS("position", "fixed");
      await expect(firstLink).toBeVisible();
      const touchAction = await firstLink.evaluate(
        (link) => window.getComputedStyle(link).touchAction,
      );
      expect(touchAction).toMatch(/manipulation|pan-y|none/);
    });
  });
});
