import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Native Mobile Transformation: Adversarial Vitest Integration & Architecture Invariants", () => {
  const rootDir = process.cwd();
  const indexHtmlPath = path.resolve(rootDir, "index.html");
  const indexCssPath = path.resolve(rootDir, "src/index.css");
  const navComponentPath = path.resolve(
    rootDir,
    "src/components/layout/MobileBottomNav.tsx",
  );
  const drawerComponentPath = path.resolve(
    rootDir,
    "src/components/ui/drawer.tsx",
  );
  const hapticsHookPath = path.resolve(rootDir, "src/hooks/useHaptics.ts");
  const backButtonPath = path.resolve(
    rootDir,
    "src/lib/back-button-manager.ts",
  );

  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
  const indexCss = fs.readFileSync(indexCssPath, "utf-8");
  const navComponent = fs.readFileSync(navComponentPath, "utf-8");
  const drawerComponent = fs.readFileSync(drawerComponentPath, "utf-8");
  const hapticsHook = fs.readFileSync(hapticsHookPath, "utf-8");
  const backButtonSource = fs.readFileSync(backButtonPath, "utf-8");

  // =========================================================================
  // 1. NATIVE ROOT TAB SEMANTICS
  // =========================================================================
  describe("1. Native root-tab invariants", () => {
    it("uses semantic links with stable test and accessibility labels", () => {
      expect(navComponent).toContain("<Link");
      expect(navComponent).toContain("data-testid={`nav-tab-${item.id}`}");
      expect(navComponent).toContain("aria-label={item.label}");
      expect(navComponent).toContain(
        'aria-current={isSelected ? "page" : undefined}',
      );
    });

    it("keeps page content static while restricting press-and-drag selection to iPhone", () => {
      expect(navComponent).not.toContain("calculateIndexFromTouch");
      expect(navComponent).not.toContain("onTouchMove");
      expect(navComponent).not.toContain("isDraggingRef");
      expect(navComponent).toContain(
        "onPointerMove={isIphoneScrubEnabled ? handlePointerMove : undefined}",
      );
      expect(navComponent).toContain("findTabIndexWithHysteresis");
      expect(navComponent).toContain("classifyIosScrubIntent");
      expect(navComponent).toContain("touch-pan-y");
      expect(navComponent).not.toContain("suppressClickUntilRef");
      expect(navComponent).not.toContain("activeIosGlassIndicator");
    });

    it("emits light haptics on press and as the scrub preview crosses tabs", () => {
      expect(navComponent).toContain("nextIndex !== scrubIndexRef.current");
      expect(navComponent).toContain("lightTap();");
    });
  });

  // =========================================================================
  // 2. INSTANT 0MS BUTTON ACTIVE STATES & SCROLL CANCELLATION
  // =========================================================================
  describe("2. Instant 0ms Button Active States & Tap Latency Invariants", () => {
    it("configures touch-action: manipulation globally to eliminate 300ms tap delay", () => {
      expect(indexCss).toContain("touch-action: manipulation;");
      expect(indexCss).toMatch(
        /button,\s*a\s*\{[^}]*touch-action:\s*manipulation;/,
      );
    });

    it("defines hardware-accelerated active press physics (.active-press, .btn-press)", () => {
      expect(indexCss).toContain(".active-press");
      expect(indexCss).toContain(".btn-press");
      expect(indexCss).toMatch(
        /transform:\s*scale\(0\.96\)\s*translateZ\(0\);/,
      );
      expect(indexCss).toContain("will-change: transform;");
    });

    it("disables tap highlight and callout overlays globally for native feel", () => {
      expect(indexCss).toContain("-webkit-tap-highlight-color: transparent;");
      expect(indexCss).toContain("-webkit-touch-callout: none;");
    });
  });

  // =========================================================================
  // 3. ACCESSIBLE ZOOM & VIEWPORT STABILITY
  // =========================================================================
  describe("3. Accessible zoom & viewport stability invariants", () => {
    it("keeps viewport edge-to-edge while preserving user zoom", () => {
      expect(indexHtml).toMatch(
        /name="viewport"[^>]*content="[^"]*width=device-width/,
      );
      expect(indexHtml).toMatch(
        /name="viewport"[^>]*content="[^"]*initial-scale=1\.0/,
      );
      expect(indexHtml).not.toContain("maximum-scale=1.0");
      expect(indexHtml).not.toContain("user-scalable=no");
      expect(indexHtml).toMatch(
        /name="viewport"[^>]*content="[^"]*viewport-fit=cover/,
      );
      expect(indexHtml).toMatch(
        /name="viewport"[^>]*content="[^"]*interactive-widget=resizes-visual/,
      );
    });

    it("does not suppress native WebKit pinch gestures", () => {
      expect(indexHtml).not.toContain("gesturestart");
      expect(indexHtml).not.toContain("gesturechange");
      expect(indexHtml).not.toContain("gestureend");
    });

    it("enforces overscroll-behavior-y: none on body to eliminate rubber-banding", () => {
      expect(indexCss).toContain("overscroll-behavior-y: none;");
    });
  });

  // =========================================================================
  // 4. SPATIAL TRANSITIONS & BACKDROP PARALLAX
  // =========================================================================
  describe("4. Spatial Directional Transitions & Glass Elevation", () => {
    it("renders Floating Liquid Glass Capsule with multi-layer blur and saturate", () => {
      expect(navComponent).toContain("backdrop-blur-2xl");
      expect(navComponent).toContain("backdrop-saturate-150");
      expect(navComponent).toContain("dark:bg-slate-900/70");
    });

    it("includes specular rim light top sheen on bottom navigation capsule", () => {
      expect(navComponent).toContain(
        "bg-gradient-to-r from-transparent via-white/70 to-transparent",
      );
    });

    it("uses Framer Motion spring physics with high stiffness for active indicator pill", () => {
      expect(navComponent).toContain('layoutId="activeGlassIndicator"');
      expect(navComponent).toMatch(/stiffness:\s*420/);
      expect(navComponent).toMatch(/damping:\s*32/);
    });
  });

  // =========================================================================
  // 5. ADAPTIVEDIALOG / VAUL BOTTOM SHEETS
  // =========================================================================
  describe("5. AdaptiveDialog & Vaul Bottom Sheet Architecture", () => {
    it("integrates Vaul DrawerPrimitive with full direction support", () => {
      expect(drawerComponent).toContain(
        'import { Drawer as DrawerPrimitive } from "vaul";',
      );
      expect(drawerComponent).toContain('data-slot="drawer"');
      expect(drawerComponent).toContain('data-slot="drawer-content"');
    });

    it("renders the tactile grabber bar pill on bottom drawer variants", () => {
      expect(drawerComponent).toMatch(
        /bg-muted mx-auto mt-2\.5 hidden h-1 w-10 shrink-0 rounded-full group-data-\[vaul-drawer-direction=bottom\]\/drawer-content:block/,
      );
    });

    it("applies animated backdrop overlay with smooth fade-in and fade-out", () => {
      expect(drawerComponent).toContain(
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
      );
      expect(drawerComponent).toContain(
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      );
      expect(drawerComponent).toContain("fixed inset-0 z-50 bg-black/50");
    });
  });

  // =========================================================================
  // 6. CAPACITOR LIFECYCLE & BACKBUTTONMANAGER
  // =========================================================================
  describe("6. Capacitor Shell Lifecycle & BackButtonManager Stack", () => {
    it("exports BackButtonManager singleton with LIFO stack and priority sorting", () => {
      expect(backButtonSource).toContain("class BackButtonManager");
      expect(backButtonSource).toContain(
        "public register(handler: BackButtonHandler, priority = 10)",
      );
      expect(backButtonSource).toContain("public executeTopHandler()");
      expect(backButtonSource).toContain("public handleBack(");
    });

    it("implements double-tap exit prevention within 2000ms window on root routes", () => {
      expect(backButtonSource).toContain("now - this.lastRootBackPress < 2000");
      expect(backButtonSource).toContain("App.exitApp()");
      expect(backButtonSource).toContain("اضغط مرة أخرى للخروج");
    });
  });

  // =========================================================================
  // 7. MULTI-TIER HAPTICS ENGINE
  // =========================================================================
  describe("7. Multi-Tier Haptics Engine Invariants", () => {
    it("provides all 7 haptic feedback tiers plus selection lifecycle methods", () => {
      expect(hapticsHook).toContain("selection");
      expect(hapticsHook).toContain("selectionStart");
      expect(hapticsHook).toContain("selectionChanged");
      expect(hapticsHook).toContain("selectionEnd");
      expect(hapticsHook).toContain("lightTap");
      expect(hapticsHook).toContain("mediumTap");
      expect(hapticsHook).toContain("heavyTap");
      expect(hapticsHook).toContain("success");
      expect(hapticsHook).toContain("warning");
      expect(hapticsHook).toContain("error");
    });

    it("gracefully falls back to navigator.vibrate on web and degrades silently on iOS Safari", () => {
      expect(hapticsHook).toContain("isSupportedWeb");
      expect(hapticsHook).toContain("navigator.vibrate");
      expect(hapticsHook).toContain("isCapacitor");
    });
  });

  // =========================================================================
  // 8. GPU COMPOSITING & CAIRO ARABIC FONT METRICS
  // =========================================================================
  describe("8. GPU Compositing & Cairo Variable Typography Invariants", () => {
    it("imports self-hosted @fontsource-variable/cairo and @fontsource-variable/inter in index.css", () => {
      expect(indexCss).toMatch(
        /@import\s+["']@fontsource-variable\/cairo["'];/,
      );
      expect(indexCss).toMatch(
        /@import\s+["']@fontsource-variable\/inter["'];/,
      );
    });

    it("declares 16px minimum font size on inputs to prevent iOS automatic zoom on focus", () => {
      expect(indexCss).toMatch(
        /input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px;/,
      );
    });

    it("declares proper RTL text-rendering and font smoothing on body", () => {
      expect(indexCss).toContain("text-rendering: optimizeLegibility;");
      expect(indexCss).toContain("-webkit-font-smoothing: antialiased;");
      expect(indexCss).toContain("-moz-osx-font-smoothing: grayscale;");
    });
  });
});
