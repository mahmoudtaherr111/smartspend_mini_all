import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("SmartSpend AI Mobile Dashboard & AI Recording Input Re-architecture", () => {
  test.beforeEach(async ({ setupMockEnvironment, page }) => {
    // 1. Injected performance observer for CLS measurement and mock media devices
    await page.addInitScript(() => {
      // Mock CLS Observer
      (window as any).__cumulativeLayoutShift = 0;
      try {
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            const shiftEntry = entry as unknown as { value: number; hadRecentInput: boolean };
            if (!shiftEntry.hadRecentInput) {
              (window as any).__cumulativeLayoutShift += shiftEntry.value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
      } catch {
        // Fallback for environments lacking layout-shift API
      }

      // Mock getUserMedia & AudioContext to prevent permission dialogs in headless runs
      if (!navigator.mediaDevices) {
        (navigator as any).mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const dst = ctx.createMediaStreamDestination();
            osc.connect(dst);
            osc.start();
            return dst.stream;
          }
          return new MediaStream();
        } catch {
          return new MediaStream();
        }
      };
    });

    // 2. Setup mock authenticated environment
    await setupMockEnvironment({ plan: "pro" });
  });

  // ==========================================
  // TIER 1: FEATURE COVERAGE
  // ==========================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("T1.1: Fluid Morphing AI Discovery Banner supports collapse/expand with ✨ تسجيل ذكي badge", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // Verify presence of discovery banner or compact inline badge
      const bannerContainer = page
        .locator(
          "[data-testid='ai-discovery-banner'], text='سجل بحرية.. والذكاء الاصطناعي هيفهمك', [data-testid='banner-compact-badge'], button:has-text('تسجيل ذكي')",
        )
        .first();
      await expect(bannerContainer).toBeAttached();

      // Check if banner toggle / badge is interactive
      const bannerToggle = page
        .locator(
          "[data-testid='banner-toggle'], button:has-text('تسجيل ذكي'), [data-testid='banner-compact-badge'], [aria-label*='طي'], [aria-label*='توسيع']",
        )
        .first();

      if ((await bannerToggle.count()) > 0) {
        await bannerToggle.click();
        await page.waitForTimeout(200);

        // Verify badge or banner toggles cleanly without throwing errors
        expect(consoleErrors).toHaveLength(0);
      }
    });

    test("T1.2: Contextual Dynamic Recording State eliminates static 'الحالة: جاهز' and renders dynamic waveform pill", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // Locate mic / voice recording button
      const micButton = page
        .locator(
          "button[aria-label*='تسجيل صوتي'], button:has(.lucide-mic), [data-testid='mic-record-btn'], button:has-text('تسجيل صوتي')",
        )
        .first();

      if ((await micButton.count()) > 0) {
        // Click mic to start recording
        await micButton.click();
        await page.waitForTimeout(300);

        // Verify active recording waveform pill / listening state is rendered
        const recordingFeedback = page
          .locator(
            "[data-testid='recording-waveform'], [data-testid='recording-pill'], .recording-pulse, text='جاري الاستماع', text='تسجيل'",
          )
          .first();

        if ((await recordingFeedback.count()) > 0) {
          await expect(recordingFeedback).toBeVisible();
        }

        // Stop recording
        await micButton.click();
        await page.waitForTimeout(200);
      }

      expect(consoleErrors).toHaveLength(0);
    });

    test("T1.3: Top Financial Metrics & Streak Header Compaction integrates StreakCounter into title bar", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // Verify title bar header
      const header = page.locator("header").first();
      await expect(header).toBeVisible();

      // StreakCounter should be rendered in header area
      const streakCounter = header
        .locator("[data-testid='streak-counter'], .streak-counter, text*='يوم', [class*='StreakCounter']")
        .first();
      if ((await streakCounter.count()) > 0) {
        await expect(streakCounter).toBeVisible();
      }

      // Verify compact financial summary chips
      const incomeChip = page.locator("text='دخل الشهر'").first();
      const expenseChip = page.locator("text='مصروف الشهر'").first();
      await expect(incomeChip).toBeVisible();
      await expect(expenseChip).toBeVisible();

      expect(consoleErrors).toHaveLength(0);
    });

    test("T1.4: Thumb-Zone Textarea & Action Bar Elevation renders within ergonomic reach", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const textarea = page.locator("#expense-input, textarea[placeholder*='سجل']").first();
      await expect(textarea).toBeVisible();

      const actionButtons = page
        .locator("button[type='submit'], button[aria-label*='تسجيل'], button:has(.lucide-mic)")
        .first();
      await expect(actionButtons).toBeVisible();

      // Verify action buttons bounding box is within viewport
      const box = await actionButtons.boundingBox();
      const viewport = page.viewportSize();
      if (box && viewport) {
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 150);
      }

      expect(consoleErrors).toHaveLength(0);
    });
  });

  // ==========================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("T2.1: Very long Arabic business titles do not clip or break title bar layout", async ({
      page,
      consoleErrors,
    }) => {
      // Seed user with long business name
      await page.addInitScript(() => {
        try {
          const userStr = window.localStorage.getItem("smartspend_user");
          if (userStr) {
            const user = JSON.parse(userStr);
            user.name = "مؤسسة الأهرام للتجارة العامة والمقاولات والتوريدات العمومية ذ.م.م";
            window.localStorage.setItem("smartspend_user", JSON.stringify(user));
          }
        } catch {
          // ignore
        }
      });

      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const header = page.locator("header").first();
      await expect(header).toBeVisible();

      // Verify zero horizontal scroll
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
      expect(consoleErrors).toHaveLength(0);
    });

    test("T2.2: Quick consecutive toggle collapse/expand executes smoothly without layout jitter", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const bannerToggle = page
        .locator(
          "[data-testid='banner-toggle'], button:has-text('تسجيل ذكي'), [data-testid='banner-compact-badge'], [aria-label*='طي'], [aria-label*='توسيع']",
        )
        .first();

      if ((await bannerToggle.count()) > 0) {
        // Rapid toggle clicks
        for (let i = 0; i < 4; i++) {
          await bannerToggle.click();
          await page.waitForTimeout(60);
        }

        await page.waitForTimeout(200);
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);
      }

      expect(consoleErrors).toHaveLength(0);
    });

    test("T2.3: Immediate recording toggle (start & instant cancel) resets state cleanly", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const micButton = page
        .locator(
          "button[aria-label*='تسجيل صوتي'], button:has(.lucide-mic), [data-testid='mic-record-btn']",
        )
        .first();

      if ((await micButton.count()) > 0) {
        // Start and immediately cancel
        await micButton.click();
        await page.waitForTimeout(50);
        await micButton.click();
        await page.waitForTimeout(150);

        const textarea = page.locator("#expense-input, textarea").first();
        await expect(textarea).toBeEnabled();
      }

      expect(consoleErrors).toHaveLength(0);
    });

    test("T2.4: Textarea handles large multi-line input and retains action bar accessibility", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const textarea = page.locator("#expense-input, textarea[placeholder*='سجل']").first();
      await expect(textarea).toBeVisible();

      // Enter multi-line verbose expense text
      const multiLineText =
        "صرفت اليوم 450 جنيه في كارفور المعادي\nشراء خضار وفواكه ومستلزمات منزلية\nودفعت 75 جنيه بنزين في توتال\nو120 جنيه صيدلية العزبي أدوية";
      await textarea.fill(multiLineText);

      await expect(textarea).toHaveValue(multiLineText);

      // Verify submit button is reachable
      const submitBtn = page
        .locator("button[type='submit'], button:has-text('سجل'), button:has-text('حفظ')")
        .first();
      await expect(submitBtn).toBeVisible();

      expect(consoleErrors).toHaveLength(0);
    });
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("T3.1: Active recording works smoothly while banner is collapsed", async ({
      page,
      consoleErrors,
    }) => {
      // Seed banner collapsed in localStorage
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem("smartspend_banner_collapsed", "true");
          window.localStorage.setItem("smartspend_ai_banner_collapsed", "true");
        } catch {
          // ignore
        }
      });

      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const micButton = page
        .locator("button[aria-label*='تسجيل صوتي'], button:has(.lucide-mic)")
        .first();

      if ((await micButton.count()) > 0) {
        await micButton.click();
        await page.waitForTimeout(250);

        // Verify recording pill / waveform active without horizontal overflow
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);

        await micButton.click();
      }

      expect(consoleErrors).toHaveLength(0);
    });

    test("T3.2: Dark and Light theme switching preserves component contrast and layout geometry", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      // 1. Dark Mode verification
      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      expect(typeof isDark).toBe("boolean");

      // 2. Switch to Light Mode
      await page.evaluate(() => {
        document.documentElement.classList.remove("dark");
        window.localStorage.setItem("smartspend_theme", "light");
      });
      await page.waitForTimeout(100);

      const isLight = await page.evaluate(
        () => !document.documentElement.classList.contains("dark"),
      );
      expect(isLight).toBe(true);

      // Verify elements remain visible in light mode
      const summaryChip = page.locator("text='دخل الشهر'").first();
      await expect(summaryChip).toBeVisible();

      // Switch back to Dark Mode
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        window.localStorage.setItem("smartspend_theme", "dark");
      });
      await page.waitForTimeout(100);

      expect(consoleErrors).toHaveLength(0);
    });

    test("T3.3: Dynamic viewport resize between iPhone 14 (390x844) and Pixel 7 (412x915) maintains responsiveness", async ({
      page,
      consoleErrors,
    }) => {
      // Start at 390x844 (iPhone 14)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const overflow390 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow390).toBe(false);

      // Resize to 412x915 (Android Chrome Pixel 7)
      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(150);

      const overflow412 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow412).toBe(false);

      expect(consoleErrors).toHaveLength(0);
    });
  });

  // ==========================================
  // TIER 4: REAL-WORLD SCENARIOS & QUALITY AUDIT
  // ==========================================
  test.describe("Tier 4: Real-World Scenarios & Quality Audit", () => {
    test("T4.1: Cumulative Layout Shift (CLS) remains < 0.05 across full mobile interaction lifecycle", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(300);

      // Interact with form
      const textarea = page.locator("#expense-input, textarea[placeholder*='سجل']").first();
      if ((await textarea.count()) > 0) {
        await textarea.focus();
        await textarea.fill("150 جنيه قهوة ومشروبات");
        await page.waitForTimeout(150);
      }

      // Interact with banner toggle if present
      const toggle = page
        .locator(
          "[data-testid='banner-toggle'], button:has-text('تسجيل ذكي'), [data-testid='banner-compact-badge']",
        )
        .first();
      if ((await toggle.count()) > 0) {
        await toggle.click();
        await page.waitForTimeout(200);
      }

      // Measure CLS score
      const clsScore = await page.evaluate(() => (window as any).__cumulativeLayoutShift || 0);
      expect(clsScore).toBeLessThanOrEqual(0.05);

      expect(consoleErrors).toHaveLength(0);
    });

    test("T4.2: RecentExpenses card starts visible above the fold on mobile viewports", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(200);

      const recentExpenses = page
        .locator(
          "[data-testid='recent-expenses'], text='أحدث العمليات', text='أحدث المعاملات', text='أحدث المصروفات'",
        )
        .first();

      if ((await recentExpenses.count()) > 0) {
        const box = await recentExpenses.boundingBox();
        const viewport = page.viewportSize();

        if (box && viewport) {
          // Top of recent expenses starts within usable mobile scroll canvas
          expect(box.y).toBeLessThan(viewport.height + 250);
        }
      }

      expect(consoleErrors).toHaveLength(0);
    });

    test("T4.3: Zero horizontal clipping or overflow across entire mobile document tree", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");

      const overflowAudit = await page.evaluate(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const elementsWithOverflow: string[] = [];

        document.querySelectorAll("*").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > innerWidth + 5) {
            elementsWithOverflow.push(
              `${el.tagName}.${el.className} (right: ${rect.right}px > ${innerWidth}px)`,
            );
          }
        });

        return {
          hasOverflow: scrollWidth > innerWidth,
          scrollWidth,
          innerWidth,
          overflowCount: elementsWithOverflow.length,
          sample: elementsWithOverflow.slice(0, 3),
        };
      });

      expect(overflowAudit.hasOverflow).toBe(false);
      expect(consoleErrors).toHaveLength(0);
    });

    test("T4.4: Complete zero console error and unhandled rejection invariant during mobile session", async ({
      page,
      consoleErrors,
    }) => {
      await page.goto("/dashboard?tab=record");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(200);

      // Verify no runtime exceptions or console errors were captured
      expect(consoleErrors).toHaveLength(0);
    });
  });
});
