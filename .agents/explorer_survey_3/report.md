# Comprehensive Investigation Report: Test Infrastructure, Mobile Multi-Viewport Auditing & Verification

**Author:** Explorer 3 (Investigation & Synthesis)  
**Project:** SmartSpend AI — Mobile Dashboard & AI Recording Input Re-architecture  
**Date:** 2026-08-26  
**Status:** Completed  

---

## 1. Executive Summary

SmartSpend AI features a mature automated testing infrastructure encompassing **Playwright v1.61.1** for end-to-end (E2E) browser testing and **Vitest v4.1.5** with **TypeScript v5.9.3** (`tsc -b`) for unit, integration, and AST invariant testing.

This investigation evaluated the test setup, multi-viewport mobile capabilities (iPhone 14/14 Pro `390x844` and Android Pixel 7 `412x915`), automated layout shift (CLS) tracking, console error trapping, element clipping checks, and the existing Vitest suite touching `ExpenseForm.tsx` and `Home.tsx`.

### Key Findings:
1. **Playwright Infrastructure:** Fully operational with `playwright.config.ts` pre-configured for `"iPhone 14"` (390x844) and `"Android Chrome Pixel 7"` (412x915), RTL locale (`ar-EG`), Cairo timezone, and dark mode.
2. **Mobile Fixtures (`tests/fixtures/mobile-fixtures.ts`):** Provides mock authentication contexts, mock tRPC routes (`auth.me`, `expense.getMonthSummary`, `expense.getMonthlyStats`, `system.getSettings`), console error listener, and continuous touch-gesture simulation (`dragTouchCoordinates`, `dragBetweenTabs`).
3. **Vitest Suite (`npm run test`):** 74 test suites (459 tests) validate backend business logic, Drizzle relations, SMS rule parsers, and client component AST invariants (`ExpenseForm.quick-save.test.ts`).
4. **TypeScript Verification (`npm run check`):** 100% clean type check across the monorepo with 0 errors.
5. **E2E Testing Track Requirements:** A dedicated E2E test spec `tests/e2e/mobile-dashboard-ai-recording.spec.ts` must be created to autonomously assert the 5 core deliverables:
   - Fluid Morphing AI Discovery Banner (smooth Framer Motion collapse with zero dead whitespace).
   - Contextual Dynamic Recording State (removal of static "الحالة: جاهز", active waveform / recording pill).
   - Top Financial Metrics & Streak Header Compaction (`StreakCounter` in title bar, streamlined subtitle, compact `SummaryChip` pills).
   - Thumb-Zone Textarea & Action Bar Elevation (60–90px elevation, recent transactions visible above fold).
   - Autonomous Multi-Viewport In-Browser Auditing (0 CLS shifts, 0 console errors, 0 clipping).

---

## 2. Test Setup & Architecture Survey

### 2.1 Playwright Configuration (`playwright.config.ts`)

| Setting | Value / Implementation | Notes |
| :--- | :--- | :--- |
| **Test Directory** | `./tests/e2e` | Excluded from Vitest in `vitest.config.ts` |
| **Base URL** | `http://localhost:3000` | Points to local Hono/Vite dev server |
| **Web Server** | `npm run dev` | Auto-boots dev server with 120s timeout |
| **Locale & Timezone** | `locale: "ar-EG"`, `timezoneId: "Africa/Cairo"` | Native Egyptian Arabic formatting |
| **Color Scheme** | `dark` | Default dark mode theme |
| **HTTP Headers** | `Accept-Language: ar-EG,ar;q=0.9...` | Matches real Egyptian mobile clients |

#### Configured Viewport Matrix:
1. **iPhone 14 / iPhone 14 Pro:** `390x844` (`deviceScaleFactor: 3`, `hasTouch: true`, `isMobile: true`)
2. **iPhone 16 Pro:** `393x852` (`deviceScaleFactor: 3`, `hasTouch: true`, `isMobile: true`)
3. **Android Chrome Pixel 7:** `412x915` (`deviceScaleFactor: 2.6`, `hasTouch: true`, `isMobile: true`)
4. **iPad Air Tablet:** `820x1180` (`deviceScaleFactor: 2`, `hasTouch: true`, `isMobile: true`)

### 2.2 Mobile Fixtures (`tests/fixtures/mobile-fixtures.ts`)

The existing fixture provides:
- `setupMockEnvironment(options)`: Sets mock session cookie `google_session`, seeds `localStorage` (`smartspend_user`, `smartspend_pwa_standalone`, `smartspend_theme: dark`), sets HTML attributes (`dir="rtl"`, `lang="ar"`, class `dark pwa-standalone`), and intercepts tRPC queries (`auth.me`, `expense.getMonthSummary`, `expense.getMonthlyStats`, `system.getSettings`).
- `consoleErrors`: Automatically hooks `page.on('console')` and `page.on('pageerror')`, filtering out benign connection disconnects and returning a string array of errors.
- `dragTouchCoordinates`: Dispatches standard continuous `touchstart`, `touchmove`, and `touchend` events with 60fps interpolation.
- `dragBetweenTabs`: Maps tab IDs to coordinates on the bottom navigation capsule.

### 2.3 Existing Vitest Suite & AST Invariant Testing

- **Config:** `vitest.config.ts` includes `api/**/*.test.ts`, `src/**/*.test.ts`, `tests/**/*.test.ts`, and excludes `tests/e2e/**`.
- **Monorepo Type Check:** `npm run check` (`tsc -b`) passed with 0 errors.
- **Component AST Invariant Test (`src/components/expenses/ExpenseForm.quick-save.test.ts`):**
  - Asserts `handleSubmit` routes quick save through `parseMutation.mutate` with `inputChannel: "text"` and never directly through `createMutation.mutate`.
  - Asserts `syncOfflineData` preserves AI text path.
  - Asserts `ParserTracePanel` is mounted and rendered.
  - Asserts Dev QA text path (`expense_qa_text`) uses the AI parser route.
  - Asserts stale parser traces are cleared before new parses (`setLatestParserTrace(null)`).

---

## 3. Autonomous Mobile Quality Auditing Techniques

To guarantee production-grade quality across iPhone 14 Pro (390x844) and Android Pixel 7 (412x915), the test harness must audit three non-negotiable dimensions:

### 3.1 Layout Shifts (CLS) Auditing in Playwright

Using the browser's native `PerformanceObserver` injected at initialization:

```typescript
// Add CLS observer in Playwright fixture or test setup
await page.addInitScript(() => {
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
    // Unsupported fallback
  }
});
```

**Assertion in Tests:**
```typescript
const clsScore = await page.evaluate(() => (window as any).__cumulativeLayoutShift || 0);
expect(clsScore).toBeLessThanOrEqual(0.05); // Zero jarring layout shifts
```

### 3.2 Console Errors & Exceptions Trapping

Already supported via `consoleErrors` in `tests/fixtures/mobile-fixtures.ts`:
```typescript
test("Zero console errors during interaction", async ({ page, consoleErrors }) => {
  // Interact with banner collapse, voice recording, tab switching
  expect(consoleErrors).toHaveLength(0);
});
```

### 3.3 Element Clipping, Text Truncation & Above-the-Fold Geometry

1. **Zero Horizontal Overflow:**
   ```typescript
   const hasHorizontalOverflow = await page.evaluate(() => {
     return document.documentElement.scrollWidth > window.innerWidth;
   });
   expect(hasHorizontalOverflow).toBe(false);
   ```

2. **Above-The-Fold Visibility on 390x844 and 412x915:**
   ```typescript
   // On initial load without scrolling, recent transactions card must start within viewport
   const recentExpenses = page.locator("[data-testid='recent-expenses'], text='أحدث العمليات'").first();
   const box = await recentExpenses.boundingBox();
   const viewport = page.viewportSize()!;
   expect(box).not.toBeNull();
   expect(box!.y).toBeLessThan(viewport.height);
   ```

3. **Banner Collapse Zero Dead Whitespace:**
   ```typescript
   const banner = page.locator("[data-testid='ai-discovery-banner']");
   const bannerBox = await banner.boundingBox();
   // When collapsed, container height must be 0px
   expect(bannerBox?.height ?? 0).toBe(0);
   ```

---

## 4. Current Component Architecture & Target Refactoring Points

### 4.1 `ExpenseForm.tsx` (Current vs Desired State)

| Area | Current State in `ExpenseForm.tsx` | Desired Re-architecture | Testing Strategy |
| :--- | :--- | :--- | :--- |
| **AI Discovery Banner** | Static `CardHeader` with `<CardTitle>سجل بحرية.. والذكاء الاصطناعي هيفهمك</CardTitle>` (lines 1120–1125) taking ~60px fixed vertical height | Fluid Morphing Banner with `framer-motion` `AnimatePresence` that collapses to 0 height, leaving a compact inline badge `✨ تسجيل ذكي` | Assert banner height collapses to 0, compact badge is visible, CLS score < 0.05 |
| **Recording State Indicator** | Static text `<div className="text-xs text-muted-foreground text-center">الحالة: جاهز</div>` (lines 1136–1149) | Removed in idle; dynamic recording pill / live waveform rendered only during active recording/parsing; compact idle height | Assert static text is removed; assert waveform / recording pill appears only when `isRecording = true` |
| **Textarea & Action Bar** | Textarea with `min-h-[140px]`, buttons at `h-14` (56px) sitting directly below without elevated thumb positioning | Elevated 60–90px on mobile with thumb-zone padding, rich placeholder prompt | Verify bounding box position, verify RecentExpenses visible above fold on 390x844 & 412x915 |

### 4.2 `Home.tsx` (Current vs Desired State)

| Area | Current State in `Home.tsx` | Desired Re-architecture | Testing Strategy |
| :--- | :--- | :--- | :--- |
| **StreakCounter** | Rendered in separate row/flex container `<div className="flex items-center gap-3"><StreakCounter ... /></div>` (lines 624–628) | Integrated directly into top title bar alongside the page title and `HealthBadge` | Assert `StreakCounter` locator is a child of the header title bar container |
| **Subtitle** | Two-line descriptive paragraph `<p className="text-muted-foreground text-sm">أهلاً ... ابدأ بتسجيل العملية بسرعة واترك التحليلات لقسم الإحصائيات.</p>` (lines 630–633) | Streamlined single-line / compact mobile subtitle saving vertical space | Measure header total height reduction (~25–35px saved) |
| **Metric SummaryChips** | `SummaryChip` with `px-2 xs:px-3 py-2.5` (lines 113–128) | Refactored into ultra-compact financial pills (`py-2 px-3`), saving ~40px vertical space | Assert grid layout, compute bounding box height of metric section |

---

## 5. E2E Testing Track Implementation Plan

### 5.1 Test Suite Structure (`tests/e2e/mobile-dashboard-ai-recording.spec.ts`)

```typescript
import { test, expect } from "../fixtures/mobile-fixtures";

test.describe("Mobile Dashboard Visual Hierarchy & AI Recording Re-architecture", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("Requirement 1: Fluid Morphing AI Discovery Banner collapses smoothly with zero dead whitespace", async ({
    page,
    consoleErrors,
  }) => {
    // 1. Visit dashboard on mobile viewport
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 2. Locate discovery banner
    // 3. Trigger collapse / verify minimal inline badge '✨ تسجيل ذكي'
    // 4. Assert zero dead whitespace and CLS < 0.05
    expect(consoleErrors).toHaveLength(0);
  });

  test("Requirement 2: Contextual Dynamic Recording State eliminates static 'الحالة: جاهز' and renders dynamic waveform", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify absence of static 'الحالة: جاهز'
    const staticStatus = page.getByText("الحالة: جاهز");
    await expect(staticStatus).toHaveCount(0);

    // 2. Click mic button to simulate recording
    // 3. Assert dynamic waveform / recording pill appears
    // 4. Stop recording, assert return to compact idle height
    expect(consoleErrors).toHaveLength(0);
  });

  test("Requirement 3: Top Financial Metrics & Streak Header Compaction reduces vertical footprint", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify StreakCounter in title bar
    // 2. Verify streamlined subtitle
    // 3. Verify compact SummaryChip financial pills
    expect(consoleErrors).toHaveLength(0);
  });

  test("Requirement 4: Thumb-Zone Textarea & Action Bar Elevation keeps Recent Expenses above fold", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify textarea and action bar elevation
    // 2. Assert Recent Expenses top edge is above the viewport fold (y < viewport.height)
    // 3. Verify on both 390x844 (iPhone 14) and 412x915 (Pixel 7)
    expect(consoleErrors).toHaveLength(0);
  });

  test("Requirement 5: Multi-Viewport Quality Invariants (0 CLS, 0 Console Errors, 0 Clipping)", async ({
    page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");

    // 1. Assert zero horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 2. Assert zero console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
```

---

## 6. Recommendations & Next Steps

1. **Keep AST Invariant Test Intact:** Ensure any modifications in `ExpenseForm.tsx` adhere to `ExpenseForm.quick-save.test.ts` (or update test regex/markers if function names change).
2. **Execute Full Verification Gate:**
   - Type check: `npm run check` (zero TypeScript errors).
   - Unit/Integration test: `npm run test` (all suites passing).
   - E2E Multi-viewport audit: Playwright suite across iPhone 14 Pro (390x844) and Pixel 7 (412x915).
3. **Mock Audio Recording in E2E:** In Playwright tests, ensure `navigator.mediaDevices.getUserMedia` and `MediaRecorder` are mocked or guarded with fallback dummy streams to prevent browser permission blocks in CI/headless environments.
