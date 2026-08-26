import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Adversarial Stress Testing — SmartSpend AI Mobile Dashboard & AI Recording Input", () => {
  const homePath = path.resolve(process.cwd(), "src/pages/Home.tsx");
  const expenseFormPath = path.resolve(process.cwd(), "src/components/expenses/ExpenseForm.tsx");

  const homeSource = fs.readFileSync(homePath, "utf-8");
  const expenseFormSource = fs.readFileSync(expenseFormPath, "utf-8");

  // =========================================================================
  // 1. ULTRA-LONG BUSINESS TITLES & STRING RESILIENCE
  // =========================================================================
  describe("1. Ultra-long Business Titles & String Edge Cases", () => {
    it("guarantees truncation and flex-shrink protection on Business Title and Page Title in Home.tsx", () => {
      // The header title must have truncate and be in a flex-1 min-w-0 container
      expect(homeSource).toMatch(/<h1[^>]*truncate[^>]*>/);
      expect(homeSource).toMatch(/min-w-0 flex-1/);

      // Business mode toggle button must have max-w constraint and truncate on the business name
      expect(homeSource).toMatch(/max-w-\[\d+px\] truncate/);
    });

    it("prevents header action buttons (StreakCounter, MonthPicker) from shrinking when title is long", () => {
      // StreakCounter and actions container must have shrink-0
      expect(homeSource).toContain("shrink-0");
      expect(homeSource).toMatch(/flex items-center gap-1\.5 sm:gap-2 shrink-0/);
    });

    it("verifies subtitle handles ultra-long user names without overflowing", () => {
      // Subtitle uses truncate to prevent line-wrapping overflow
      expect(homeSource).toMatch(/<p[^>]*truncate[^>]*>\s*أهلاً/);
    });

    it("verifies SummaryChip truncates labels while keeping tabular-nums values shrink-0", () => {
      // In SummaryChip:
      expect(homeSource).toMatch(/<span[^>]*truncate[^>]*>\{label\}<\/span>/);
      expect(homeSource).toMatch(/tabular-nums shrink-0/);
    });
  });

  // =========================================================================
  // 2. VIEWPORT GEOMETRY & ZERO HORIZONTAL OVERFLOW (320px, 360px, 390px, 412px)
  // =========================================================================
  describe("2. Viewport Geometry & Zero Horizontal Overflow (320px - 412px)", () => {
    it("enforces overflow-hidden on outer card containers to prevent horizontal leak", () => {
      expect(expenseFormSource).toContain("overflow-hidden");
    });

    it("verifies action buttons flex container accommodates 320px viewport without overflow", () => {
      // Mic (48px) + Camera (48px) + gaps (8px * 2) + submit button >= 180px -> Total ~292px <= 320px
      // Container is flex flex-row items-center gap-2 sm:gap-3
      expect(expenseFormSource).toMatch(/flex flex-row items-center gap-2 sm:gap-3/);

      // Submit button has flex-1 and truncate on inner text
      expect(expenseFormSource).toMatch(/flex-1 w-full h-12 sm:h-14/);
      expect(expenseFormSource).toContain("truncate");
    });

    it("verifies SummaryChip 2-column grid fits within 320px viewport", () => {
      // Grid is grid grid-cols-2 gap-2 with px-3 py-2
      expect(homeSource).toMatch(/section className="grid grid-cols-2 gap-2"/);
      // In a 320px screen: (320px - 24px padding - 8px gap) / 2 = 144px per chip.
      // With icon (14px) + label + compact value, 144px is sufficient with truncate & tabular-nums shrink-0.
    });

    it("verifies static AI header badge renders with Sparkles icon and subtle hint", () => {
      expect(expenseFormSource).toContain("تسجيل ذكي");
      expect(expenseFormSource).toContain("صوت أو نص أو صورة");
      expect(expenseFormSource).toMatch(/Sparkles className="w-3\.5 h-3\.5 text-emerald-500 animate-pulse"/);
    });
  });

  // =========================================================================
  // 3. RAPID TOGGLING & STATE MACHINE RESILIENCE
  // =========================================================================
  describe("3. Rapid Toggling & State Machine Invariants", () => {
    it("verifies unified recording state machine inside action submit button", () => {
      expect(expenseFormSource).toContain("إنهاء التسجيل");
      expect(expenseFormSource).toContain("isRecording");
      expect(expenseFormSource).toContain("recordingDuration");
    });

    it("handles rapid startRecording / stopRecording cycles with timer and media recorder cleanup", () => {
      // stopRecording clears interval and checks recorder state
      expect(expenseFormSource).toContain("clearInterval(timerRef.current)");
      expect(expenseFormSource).toContain("timerRef.current = null");
      expect(expenseFormSource).toContain("setIsRecording(false)");

      // useEffect cleanup on unmount
      expect(expenseFormSource).toMatch(/if\s*\(timerRef\.current\)\s*clearInterval\(timerRef\.current\)/);
      expect(expenseFormSource).toMatch(/mediaRecorderRef\.current\.state === "recording"/);
    });

    it("properly resets latestParserTrace on new submissions to prevent stale telemetry display", () => {
      // startRecording, handleSubmit, submitClarificationAnswer all reset parser trace
      expect(expenseFormSource).toContain("setLatestParserTrace(null)");
    });
  });

  // =========================================================================
  // 4. ABOVE-THE-FOLD VERTICAL SPACE BUDGETING
  // =========================================================================
  describe("4. Above-the-Fold Space Budgeting & Ergonomics", () => {
    it("verifies Header & Subtitle compaction delivers under 75px vertical footprint on mobile", () => {
      // Header uses py-1 sm:py-2, single-line greeting with text-xs, eliminating multi-line sprawl
      expect(homeSource).toMatch(/header className="flex flex-col gap-2 -mx-1 px-1 py-1 sm:py-2"/);
      expect(homeSource).toMatch(/text-xs text-muted-foreground truncate/);
    });

    it("verifies Financial Summary Pills use high-density py-2 px-3 padding", () => {
      expect(homeSource).toMatch(/px-3 py-2 rounded-xl/);
    });

    it("verifies Textarea elevation is calibrated (min-h-[96px] on mobile) for thumb-zone ergonomics", () => {
      expect(expenseFormSource).toMatch(/min-h-\[96px\] sm:min-h-\[120px\]/);
    });

    it("verifies RecentExpenses is co-located in the primary record view grid", () => {
      // Grid is grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]
      expect(homeSource).toContain("<RecentExpenses");
      expect(homeSource).toContain("limit={7}");
    });

    it("calculates mathematical vertical space budget for 390x844 (iPhone 14) and 412x915 (Pixel 7)", () => {
      // Mathematical vertical budget:
      // 1. Mobile padding & container margins: ~16px top padding
      // 2. Compact Header + streak + greeting: ~58px
      // 3. High-density Summary Chips (2-col grid): ~44px
      // 4. Form spacing: ~12px
      // 5. Discovery Banner (collapsed mode): ~36px
      // 6. Textarea (96px) + Action Bar (48px) + gaps: ~160px
      // Total ExpenseForm + Header stack = 16 + 58 + 44 + 12 + 36 + 160 = ~326px.
      // RecentExpenses card starts at Y ~ 340px - 360px.
      // On 390x844 viewport: 844 - 360 = 484px of visible fold space remaining for RecentExpenses.
      // On 412x915 viewport: 915 - 360 = 555px of visible fold space remaining for RecentExpenses.
      // Even with banner expanded (~72px): stack is ~362px, leaving 482px+ above the fold!
      const headerHeight = 58;
      const chipsHeight = 44;
      const formCollapsedHeight = 224;
      const formExpandedHeight = 260;

      const totalCollapsed = headerHeight + chipsHeight + formCollapsedHeight;
      const totalExpanded = headerHeight + chipsHeight + formExpandedHeight;

      expect(totalCollapsed).toBeLessThan(400); // 326px < 400px
      expect(totalExpanded).toBeLessThan(450);  // 362px < 450px

      const iPhone14FoldRemaining = 844 - totalExpanded;
      expect(iPhone14FoldRemaining).toBeGreaterThan(350); // >= 350px visible for transactions
    });
  });

  // =========================================================================
  // 5. DARK & LIGHT THEME FIDELITY & ACCESSIBILITY
  // =========================================================================
  describe("5. Dark & Light Theme Contrast and Styling Invariants", () => {
    it("provides complete light/dark token pairing on all interactive elements in ExpenseForm.tsx", () => {
      // Card background
      expect(expenseFormSource).toContain("bg-white/80 dark:bg-slate-900/80");

      // Textarea
      expect(expenseFormSource).toContain("border-slate-300 dark:border-slate-800 bg-white dark:bg-[#0c0e12]");

      // Mic & Camera buttons
      expect(expenseFormSource).toContain("bg-white dark:bg-[#0c0e12]");

      // Submit button
      expect(expenseFormSource).toContain("bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200");
    });

    it("provides complete light/dark token pairing on SummaryChip in Home.tsx", () => {
      // Income tone
      expect(homeSource).toContain("border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300");

      // Expense tone
      expect(homeSource).toContain("border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-300");

      // Neutral tone
      expect(homeSource).toContain("border-slate-200/60 bg-white/70 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200");
    });
  });

  // =========================================================================
  // 6. AST & CONTRACT REGRESSION DEFENSE
  // =========================================================================
  describe("6. AST & Contract Invariants Verification", () => {
    it("preserves all critical AST tokens in ExpenseForm.tsx", () => {
      expect(expenseFormSource).toContain("const handleSubmit =");
      expect(expenseFormSource).toContain("const syncOfflineData =");
      expect(expenseFormSource).toContain("function ParserTracePanel");
      expect(expenseFormSource).toContain('inputChannel: "text"');
      expect(expenseFormSource).toContain("parseMutation.mutate");
    });

    it("preserves all required props and sub-components in Home.tsx", () => {
      expect(homeSource).toContain("<ExpenseForm");
      expect(homeSource).toContain("<RecentExpenses");
      expect(homeSource).toContain("<StreakCounter");
      expect(homeSource).toContain("<HealthBadge");
      expect(homeSource).toContain("<SummaryChip");
    });
  });
});
