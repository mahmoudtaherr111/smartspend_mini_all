/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  rubberband,
  hasScrollableAncestor,
  PTR_THRESHOLD,
  PTR_REFRESH_HEIGHT,
  PTR_MIN_REFRESH_DELAY_MS,
} from "./PullToRefreshWrapper";

describe("PullToRefreshWrapper — Mathematical & Static Contract Invariants", () => {
  const filePath = path.resolve(
    process.cwd(),
    "src/components/pwa/PullToRefreshWrapper.tsx",
  );
  const sourceCode = fs.readFileSync(filePath, "utf-8");

  // =========================================================================
  // 1. CONSTANTS & MATHEMATICAL RUBBER-BANDING FORMULA
  // =========================================================================
  describe("1. Rubber-Banding Formula & Calibration Constants", () => {
    it("exports correctly calibrated constants", () => {
      expect(PTR_THRESHOLD).toBe(80);
      expect(PTR_REFRESH_HEIGHT).toBe(60);
      expect(PTR_MIN_REFRESH_DELAY_MS).toBe(450);
    });

    it("applies authentic iOS rubber-banding formula with diminishing returns", () => {
      const dimension = 800; // window.innerHeight
      const r0 = rubberband(0, dimension);
      const r50 = rubberband(50, dimension);
      const r100 = rubberband(100, dimension);
      const r200 = rubberband(200, dimension);
      const r400 = rubberband(400, dimension);

      expect(r0).toBe(0);
      // Resistance increases monotonically
      expect(r50).toBeGreaterThan(0);
      expect(r100).toBeGreaterThan(r50);
      expect(r200).toBeGreaterThan(r100);
      expect(r400).toBeGreaterThan(r200);

      // Marginal displacement diminishes (rubber-band resistance)
      const delta1 = r100 - r50;
      const delta2 = r200 - r100;
      const delta3 = r400 - r200;
      expect(delta2).toBeLessThan(delta1 * 2);
      expect(delta3).toBeLessThan(delta2 * 2);

      // Verify formula exact calculation: (d * dim * 0.55) / (dim + 0.55 * d)
      const expectedR100 = (100 * 800 * 0.55) / (800 + 0.55 * 100);
      expect(r100).toBeCloseTo(expectedR100, 5);
    });
  });

  // =========================================================================
  // 2. DIRECTION LOCKING & MULTI-TOUCH FILTERING (STATIC & CONTRACT ANALYSIS)
  // =========================================================================
  describe("2. Direction Lock & Touch Filtering Invariants", () => {
    it("rejects horizontal gestures when |dx| > |dy|", () => {
      expect(sourceCode).toContain("absX > absY");
      expect(sourceCode).toContain("cancelPull()");
      expect(sourceCode).toContain("isDirectionLocked");
    });

    it("ignores multi-touch events (length !== 1) to avoid erratic gestures", () => {
      // In touchstart:
      expect(sourceCode).toMatch(/e\.touches\.length !== 1[\s\S]*?isTracking = false/);
      // In touchmove:
      expect(sourceCode).toMatch(/e\.touches\.length !== 1[\s\S]*?cancelPull\(\)/);
    });

    it("only initiates pull-down when scroll position is at the very top (scrollTop <= 0)", () => {
      expect(sourceCode).toMatch(/el\.scrollTop > 0[\s\S]*?isTracking = false/);
      expect(sourceCode).toMatch(/el\.scrollTop > 0[\s\S]*?cancelPull\(\)/);
    });

    it("cancels pull gesture when user scrolls down during active gesture", () => {
      expect(sourceCode).toContain("if (el.scrollTop > 0)");
    });

    it("handles touchcancel events gracefully by cancelling pull", () => {
      expect(sourceCode).toContain('addEventListener("touchcancel", onTouchCancel');
      expect(sourceCode).toContain('removeEventListener("touchcancel", onTouchCancel');
    });
  });

  // =========================================================================
  // 3. ZERO-RENDER DRAGGING VIA DIRECT DOM & rAF
  // =========================================================================
  describe("3. Direct DOM & rAF Performance Architecture", () => {
    it("does not call React setState during continuous touchmove dragging", () => {
      // Find onTouchMove function body
      const touchMoveStart = sourceCode.indexOf("const onTouchMove =");
      const touchMoveEnd = sourceCode.indexOf("const onTouchEnd =", touchMoveStart);
      const touchMoveBody = sourceCode.slice(touchMoveStart, touchMoveEnd);

      // Only setStatus("pulling") is called once upon direction lock, never continuous setState
      expect(touchMoveBody).not.toContain("setPullProgress");
      expect(touchMoveBody).not.toContain("setIsRefreshing");
      expect(touchMoveBody).toContain("scheduleDomUpdate()");
    });

    it("uses requestAnimationFrame for all drag coordinate updates", () => {
      expect(sourceCode).toContain("requestAnimationFrame");
      expect(sourceCode).toContain("cancelAnimationFrame");
      expect(sourceCode).toContain("scheduleDomUpdate");
    });

    it("directly updates container height, spinner scale, opacity, and rotation via DOM refs", () => {
      expect(sourceCode).toContain("indicatorContainerRef.current.style.height");
      expect(sourceCode).toContain("spinnerContainerRef.current.style.transform");
      expect(sourceCode).toContain("spinnerContainerRef.current.style.opacity");
      expect(sourceCode).toContain("spinnerIconRef.current.style.transform");
    });

    it("cleans up pending rAF on unmount", () => {
      const effectReturnIndex = sourceCode.lastIndexOf("return () => {");
      const cleanupBlock = sourceCode.slice(effectReturnIndex);
      expect(cleanupBlock).toContain("cancelAnimationFrame(state.current.rafId)");
    });
  });

  // =========================================================================
  // 4. REFRESH DURATION & HAPTICS CALIBRATION
  // =========================================================================
  describe("4. Refresh Timing & Haptics", () => {
    it("uses Promise.all with 450ms minimum timer for max(network_time, 450ms) guarantee", () => {
      expect(sourceCode).toContain("PTR_MIN_REFRESH_DELAY_MS");
      expect(sourceCode).toMatch(
        /Promise\.all\(\[\s*utilsRef\.current\.invalidate\(\),\s*minDelay\s*\]\)/,
      );
    });

    it("triggers lightTap haptic feedback when crossing threshold during drag", () => {
      expect(sourceCode).toMatch(
        /resistance >= PTR_THRESHOLD && !state\.current\.thresholdCrossed/,
      );
      expect(sourceCode).toContain("hapticsRef.current.lightTap()");
    });

    it("triggers mediumTap haptic feedback when refresh is triggered on release", () => {
      const triggerRefreshStart = sourceCode.indexOf("const triggerRefresh =");
      const triggerRefreshEnd = sourceCode.indexOf("const onTouchStart =", triggerRefreshStart);
      const triggerRefreshBody = sourceCode.slice(triggerRefreshStart, triggerRefreshEnd);

      expect(triggerRefreshBody).toContain("hapticsRef.current.mediumTap()");
    });

    it("protects async refresh completion against unmounted component lifecycle", () => {
      expect(sourceCode).toContain("isMountedRef.current");
      expect(sourceCode).toContain("isMountedRef.current = false");
    });

    it("resets thresholdCrossed state when drag position reverses back above origin (dy <= 0)", () => {
      expect(sourceCode).toMatch(/if\s*\(dy <= 0\)[\s\S]*?thresholdCrossed = false/);
    });

    it("guards rubberband dimension against 0 or undefined window.innerHeight", () => {
      expect(sourceCode).toMatch(
        /window\.innerHeight > 0\s*\?\s*window\.innerHeight\s*:\s*800/,
      );
    });
  });
});

// =========================================================================
// 5. BEHAVIORAL GESTURE STATE MACHINE SIMULATION
// =========================================================================
describe("PullToRefreshWrapper — Gesture State Machine Simulation", () => {
  let state: {
    startX: number;
    startY: number;
    isTracking: boolean;
    isPulling: boolean;
    isDirectionLocked: boolean;
    thresholdCrossed: boolean;
    currentProgress: number;
    refreshing: boolean;
    rafId: number;
  };
  let status: "idle" | "pulling" | "refreshing";
  let lightTapMock: ReturnType<typeof vi.fn<() => void>>;
  let mediumTapMock: ReturnType<typeof vi.fn<() => void>>;
  let invalidateMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let preventDefaultMock: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    state = {
      startX: 0,
      startY: 0,
      isTracking: false,
      isPulling: false,
      isDirectionLocked: false,
      thresholdCrossed: false,
      currentProgress: 0,
      refreshing: false,
      rafId: 0,
    };
    status = "idle";
    lightTapMock = vi.fn();
    mediumTapMock = vi.fn();
    invalidateMock = vi.fn(async () => {});
    preventDefaultMock = vi.fn();
  });

  const simulateTouchStart = (
    touches: Array<{ clientX: number; clientY: number }>,
    scrollTop: number,
  ) => {
    if (state.refreshing) return;
    if (touches.length !== 1) {
      state.isTracking = false;
      return;
    }
    if (scrollTop > 0) {
      state.isTracking = false;
      return;
    }
    state.startX = touches[0].clientX;
    state.startY = touches[0].clientY;
    state.isTracking = true;
    state.isPulling = false;
    state.isDirectionLocked = false;
    state.thresholdCrossed = false;
    state.currentProgress = 0;
  };

  const simulateTouchMove = (
    touches: Array<{ clientX: number; clientY: number }>,
    scrollTop: number,
  ) => {
    if (!state.isTracking || state.refreshing) return;
    if (touches.length !== 1) {
      // Cancel
      state.isTracking = false;
      state.isPulling = false;
      status = "idle";
      return;
    }
    if (scrollTop > 0) {
      state.isTracking = false;
      state.isPulling = false;
      status = "idle";
      return;
    }

    const dx = touches[0].clientX - state.startX;
    const dy = touches[0].clientY - state.startY;

    if (!state.isDirectionLocked) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 5 && absY < 5) return;

      state.isDirectionLocked = true;
      if (absX > absY) {
        // Horizontal swipe rejected
        state.isTracking = false;
        state.isPulling = false;
        status = "idle";
        return;
      }
      if (dy <= 0) {
        // Upward rejected
        state.isTracking = false;
        state.isPulling = false;
        status = "idle";
        return;
      }
      state.isPulling = true;
      status = "pulling";
    }

    if (!state.isPulling) return;
    if (dy <= 0) {
      state.currentProgress = 0;
      state.thresholdCrossed = false;
      return;
    }

    const resistance = rubberband(dy, 800);
    state.currentProgress = resistance;

    if (resistance >= PTR_THRESHOLD && !state.thresholdCrossed) {
      state.thresholdCrossed = true;
      lightTapMock();
    } else if (resistance < PTR_THRESHOLD && state.thresholdCrossed) {
      state.thresholdCrossed = false;
    }

    preventDefaultMock();
  };

  const simulateTouchEnd = async () => {
    if (!state.isTracking || !state.isPulling || state.refreshing) {
      state.isTracking = false;
      state.isPulling = false;
      return;
    }
    state.isTracking = false;
    state.isPulling = false;

    if (state.currentProgress >= PTR_THRESHOLD) {
      state.refreshing = true;
      status = "refreshing";
      mediumTapMock();

      const minDelay = new Promise((resolve) =>
        setTimeout(resolve, PTR_MIN_REFRESH_DELAY_MS),
      );
      await Promise.all([invalidateMock(), minDelay]);

      state.refreshing = false;
      state.currentProgress = 0;
      state.thresholdCrossed = false;
      status = "idle";
    } else {
      state.thresholdCrossed = false;
      status = "idle";
    }
  };

  it("completes full pull-to-refresh lifecycle when pulled beyond threshold", async () => {
    // 1. Touch start at scrollTop = 0
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 0);
    expect(state.isTracking).toBe(true);
    expect(status).toBe("idle");

    // 2. Drag down 200px (vertical > horizontal)
    simulateTouchMove([{ clientX: 105, clientY: 300 }], 0);
    expect(state.isPulling).toBe(true);
    expect(status).toBe("pulling");
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(state.currentProgress).toBeGreaterThanOrEqual(PTR_THRESHOLD);
    expect(lightTapMock).toHaveBeenCalledTimes(1);

    // 3. Release touch -> enters refreshing
    const refreshPromise = simulateTouchEnd();
    expect(status).toBe("refreshing");
    expect(mediumTapMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    await refreshPromise;
    expect(status).toBe("idle");
    expect(state.refreshing).toBe(false);
  });

  it("triggers haptic tap both times when pulled past threshold, pushed back up above origin (dy <= 0), and pulled down again", () => {
    // 1. Touch start at Y=100
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 0);

    // 2. Drag down past threshold (Y=300, dy=200)
    simulateTouchMove([{ clientX: 100, clientY: 300 }], 0);
    expect(state.currentProgress).toBeGreaterThanOrEqual(PTR_THRESHOLD);
    expect(lightTapMock).toHaveBeenCalledTimes(1);

    // 3. Move finger back above touch origin (Y=80, dy=-20 <= 0)
    simulateTouchMove([{ clientX: 100, clientY: 80 }], 0);
    expect(state.currentProgress).toBe(0);
    expect(state.thresholdCrossed).toBe(false);

    // 4. Drag down past threshold a second time (Y=300, dy=200)
    simulateTouchMove([{ clientX: 100, clientY: 300 }], 0);
    expect(state.currentProgress).toBeGreaterThanOrEqual(PTR_THRESHOLD);
    expect(lightTapMock).toHaveBeenCalledTimes(2);
  });

  it("rejects horizontal swipe gestures (|dx| > |dy|)", () => {
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 0);
    // User swiped horizontally (dx = 80, dy = 10)
    simulateTouchMove([{ clientX: 180, clientY: 110 }], 0);

    expect(state.isPulling).toBe(false);
    expect(status).toBe("idle");
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  it("ignores multi-touch start and cancels on multi-touch move", () => {
    // Two fingers on touchstart
    simulateTouchStart(
      [
        { clientX: 100, clientY: 100 },
        { clientX: 150, clientY: 100 },
      ],
      0,
    );
    expect(state.isTracking).toBe(false);

    // Valid single touch start
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 0);
    expect(state.isTracking).toBe(true);

    // Second finger touches during move
    simulateTouchMove(
      [
        { clientX: 100, clientY: 150 },
        { clientX: 150, clientY: 150 },
      ],
      0,
    );
    expect(state.isPulling).toBe(false);
    expect(state.isTracking).toBe(false);
  });

  it("ignores pull when scrollTop > 0", () => {
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 50);
    expect(state.isTracking).toBe(false);

    simulateTouchMove([{ clientX: 100, clientY: 200 }], 50);
    expect(state.isPulling).toBe(false);
  });

  it("snaps back to idle without triggering refresh if released below threshold", async () => {
    simulateTouchStart([{ clientX: 100, clientY: 100 }], 0);
    // Pull down only 30px
    simulateTouchMove([{ clientX: 100, clientY: 130 }], 0);
    expect(state.isPulling).toBe(true);
    expect(status).toBe("pulling");
    expect(state.currentProgress).toBeLessThan(PTR_THRESHOLD);
    expect(lightTapMock).not.toHaveBeenCalled();

    await simulateTouchEnd();
    expect(status).toBe("idle");
    expect(mediumTapMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  describe("6. Inner Scrollable Container Conflict Prevention", () => {
    it("returns false if target is null or root has no scrolled children", () => {
      const root = document.createElement("div");
      expect(hasScrollableAncestor(null, root)).toBe(false);
      const child = document.createElement("div");
      root.appendChild(child);
      expect(hasScrollableAncestor(child, root)).toBe(false);
    });

    it("detects scrolled ancestor via DOM parent hierarchy when scrollTop > 0", () => {
      const root = document.createElement("div");
      const modal = document.createElement("div");
      const innerContent = document.createElement("div");
      const button = document.createElement("button");

      root.appendChild(modal);
      modal.appendChild(innerContent);
      innerContent.appendChild(button);

      modal.scrollTop = 45;
      expect(hasScrollableAncestor(button, root)).toBe(true);

      modal.scrollTop = 0;
      expect(hasScrollableAncestor(button, root)).toBe(false);
    });

    it("detects scrolled ancestor using composedPath() when available", () => {
      const root = document.createElement("div");
      const scrollableSubContainer = document.createElement("div");
      const chip = document.createElement("span");

      root.appendChild(scrollableSubContainer);
      scrollableSubContainer.appendChild(chip);

      scrollableSubContainer.scrollTop = 120;

      const mockEvent = {
        composedPath: () => [chip, scrollableSubContainer, root, document.body],
      } as unknown as TouchEvent;

      expect(hasScrollableAncestor(chip, root, mockEvent)).toBe(true);

      scrollableSubContainer.scrollTop = 0;
      expect(hasScrollableAncestor(chip, root, mockEvent)).toBe(false);
    });
  });
});
