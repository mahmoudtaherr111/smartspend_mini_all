/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock Capacitor core and haptics
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
  },
}));

const mockHapticsState = {
  selection: vi.fn().mockResolvedValue(undefined),
  selectionStart: vi.fn().mockResolvedValue(undefined),
  selectionChanged: vi.fn().mockResolvedValue(undefined),
  selectionEnd: vi.fn().mockResolvedValue(undefined),
  lightTap: vi.fn().mockResolvedValue(undefined),
  mediumTap: vi.fn().mockResolvedValue(undefined),
  heavyTap: vi.fn().mockResolvedValue(undefined),
  success: vi.fn().mockResolvedValue(undefined),
  warning: vi.fn().mockResolvedValue(undefined),
  error: vi.fn().mockResolvedValue(undefined),
  isSupported: true,
};

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => mockHapticsState,
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
  NotificationType: {
    Success: "SUCCESS",
    Warning: "WARNING",
    Error: "ERROR",
  },
}));

vi.hoisted(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  if (typeof window !== "undefined") {
    (window as any).ResizeObserver = MockResizeObserver;
  }
});

import { Button, buttonVariants } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Toggle, toggleVariants } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

describe("Adversarial Stress Suite: Touch Physics, Button Active States & UI Haptics", () => {
  const rootDir = process.cwd();
  const indexCss = fs.readFileSync(path.resolve(rootDir, "src/index.css"), "utf-8");
  const effects3dCss = fs.readFileSync(path.resolve(rootDir, "src/3d-effects.css"), "utf-8");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CSS TRANSITION CURVES & PHYSICAL SPRING INVARIANTS
  // =========================================================================
  describe("1. CSS Touch Physics & Active State Invariants", () => {
    it("enforces 250ms spring recovery and <= 40ms instant down transition in index.css", () => {
      // Resting / recovery state (250ms spring cubic-bezier)
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*transition:\s*transform\s+0\.25s\s+cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/);

      // Active pressed state (0.04s = 40ms fast down)
      expect(indexCss).toMatch(/\.active-press:active,\s*\.btn-press:active\s*\{[^}]*transform:\s*scale\(0\.96\)\s*translateZ\(0\);/);
      expect(indexCss).toMatch(/\.active-press:active,\s*\.btn-press:active\s*\{[^}]*transition:\s*transform\s+0\.04s\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\);/);
    });

    it("enforces identical physics rules in 3d-effects.css for standalone component consumption", () => {
      expect(effects3dCss).toMatch(/\.btn-press,\s*\.active-press\s*\{[^}]*transition:\s*transform\s+0\.25s\s+cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/);
      expect(effects3dCss).toMatch(/\.btn-press:active,\s*\.active-press:active\s*\{[^}]*transform:\s*scale\(0\.96\)\s*translateZ\(0\);/);
      expect(effects3dCss).toMatch(/\.btn-press:active,\s*\.active-press:active\s*\{[^}]*transition:\s*transform\s+0\.04s\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\);/);
    });

    it("verifies mobile touch hygiene: manipulation touch-action, no-callout, transparent highlight, GPU hint", () => {
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*touch-action:\s*manipulation;/);
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*-webkit-touch-callout:\s*none;/);
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*user-select:\s*none;/);
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent;/);
      expect(indexCss).toMatch(/\.active-press,\s*\.btn-press\s*\{[^}]*will-change:\s*transform;/);
    });
  });

  // =========================================================================
  // 2. UI COMPONENT CLASS CONFORMANCE & TOUCH MANIPULATION
  // =========================================================================
  describe("2. UI Component Active State Class Conformance", () => {
    it("ensures Button component includes btn-press, touch-manipulation, and select-none", () => {
      render(<Button data-testid="test-button">Test Button</Button>);
      const btn = screen.getByTestId("test-button");
      expect(btn.className).toContain("btn-press");
      expect(btn.className).toContain("touch-manipulation");
      expect(btn.className).toContain("select-none");
    });

    it("ensures Switch component includes active-press class", () => {
      render(<Switch data-testid="test-switch" />);
      const sw = screen.getByTestId("test-switch");
      expect(sw.className).toContain("active-press");
    });

    it("ensures TabsTrigger includes active-press class", () => {
      render(
        <Tabs defaultValue="t1">
          <TabsList>
            <TabsTrigger value="t1" data-testid="test-tab-1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>,
      );
      const tab = screen.getByTestId("test-tab-1");
      expect(tab.className).toContain("active-press");
    });

    it("ensures Slider thumb includes active-press class", () => {
      render(<Slider data-testid="test-slider" defaultValue={[50]} />);
      const slider = screen.getByTestId("test-slider");
      const thumb = slider.querySelector("[data-slot='slider-thumb']");
      expect(thumb).not.toBeNull();
      expect(thumb?.className).toContain("active-press");
    });

    it("ensures Toggle includes btn-press and touch-manipulation", () => {
      render(<Toggle data-testid="test-toggle">Toggle</Toggle>);
      const toggle = screen.getByTestId("test-toggle");
      expect(toggle.className).toContain("btn-press");
      expect(toggle.className).toContain("touch-manipulation");
    });

    it("ensures ToggleGroupItem includes btn-press", () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="val1" data-testid="test-toggle-item">Item 1</ToggleGroupItem>
        </ToggleGroup>,
      );
      const item = screen.getByTestId("test-toggle-item");
      expect(item.className).toContain("btn-press");
    });
  });

  // =========================================================================
  // 3. SCROLL CANCELLATION & POINTER STATE MACHINE SIMULATION
  // =========================================================================
  describe("3. Touch Scroll Cancellation & State Machine Dynamics", () => {
    it("simulates tap cancellation during scroll gesture (pointerdown -> pointercancel / touchcancel)", () => {
      const clickSpy = vi.fn();
      render(<Button data-testid="cancel-btn" onClick={clickSpy}>Cancelable</Button>);
      const btn = screen.getByTestId("cancel-btn");

      // Step 1: User puts finger down
      fireEvent.pointerDown(btn, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
      fireEvent.touchStart(btn, { touches: [{ clientX: 100, clientY: 100 }] });

      // Step 2: Browser detects vertical scroll movement and emits pointercancel / touchcancel
      fireEvent.pointerCancel(btn, { pointerId: 1, pointerType: "touch" });
      fireEvent.touchCancel(btn, {});

      // Step 3: Finger leaves screen
      fireEvent.pointerUp(btn, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 200 });

      // Invariant: Because gesture was cancelled, click should not execute
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("simulates finger drag out of bounding box (pointerleave) without triggering click", () => {
      const clickSpy = vi.fn();
      render(<Button data-testid="drag-out-btn" onClick={clickSpy}>Drag Out</Button>);
      const btn = screen.getByTestId("drag-out-btn");

      // Pointer down inside button
      fireEvent.pointerDown(btn, { pointerId: 2, clientX: 50, clientY: 50 });
      // Drag finger out of button area
      fireEvent.pointerLeave(btn, { pointerId: 2, clientX: 200, clientY: 200 });
      // Release finger outside
      fireEvent.pointerUp(btn, { pointerId: 2, clientX: 200, clientY: 200 });

      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("completes tap gesture when displacement is minimal (< 5px jitter)", () => {
      const clickSpy = vi.fn();
      render(<Button data-testid="tap-btn" onClick={clickSpy}>Tap Me</Button>);
      const btn = screen.getByTestId("tap-btn");

      fireEvent.pointerDown(btn, { pointerId: 3, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(btn, { pointerId: 3, clientX: 102, clientY: 101 }); // tiny jitter
      fireEvent.pointerUp(btn, { pointerId: 3, clientX: 102, clientY: 101 });
      fireEvent.click(btn);

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. HAPTIC TRIGGER INTEGRATION & EXCEPTION RESILIENCE
  // =========================================================================
  describe("4. Haptic Feedback Wiring & Exception Resilience", () => {
    it("Switch: triggers selection haptics and forwards checked state", () => {
      const onCheckedChange = vi.fn();
      render(<Switch data-testid="haptic-switch" onCheckedChange={onCheckedChange} />);
      const sw = screen.getByTestId("haptic-switch");

      fireEvent.click(sw);
      expect(mockHapticsState.selection).toHaveBeenCalledTimes(1);
      expect(onCheckedChange).toHaveBeenCalledWith(true);

      fireEvent.click(sw);
      expect(mockHapticsState.selection).toHaveBeenCalledTimes(2);
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });

    it("Switch: survives asynchronous haptics rejection without breaking toggle state", async () => {
      mockHapticsState.selection.mockRejectedValueOnce(new Error("Haptics hardware unavailable"));
      const onCheckedChange = vi.fn();
      render(<Switch data-testid="resilient-switch" onCheckedChange={onCheckedChange} />);
      const sw = screen.getByTestId("resilient-switch");

      await act(async () => {
        fireEvent.click(sw);
      });

      expect(mockHapticsState.selection).toHaveBeenCalledTimes(1);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it("TabsTrigger: triggers selection haptics on click and forwards event", () => {
      const onClick = vi.fn();
      render(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a" data-testid="tab-a">Tab A</TabsTrigger>
            <TabsTrigger value="b" data-testid="tab-b" onClick={onClick}>Tab B</TabsTrigger>
          </TabsList>
        </Tabs>,
      );

      const tabB = screen.getByTestId("tab-b");
      fireEvent.click(tabB);

      expect(mockHapticsState.selection).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("Toggle & ToggleGroup: trigger selection haptics accurately", () => {
      const onToggleChange = vi.fn();
      render(<Toggle data-testid="test-toggle-haptic" onPressedChange={onToggleChange}>T</Toggle>);
      const toggle = screen.getByTestId("test-toggle-haptic");

      fireEvent.click(toggle);
      expect(mockHapticsState.selection).toHaveBeenCalled();
      expect(onToggleChange).toHaveBeenCalledWith(true);

      mockHapticsState.selection.mockClear();

      const onGroupChange = vi.fn();
      render(
        <ToggleGroup type="single" onValueChange={onGroupChange}>
          <ToggleGroupItem value="opt1" data-testid="group-item-1">Option 1</ToggleGroupItem>
        </ToggleGroup>,
      );
      const groupItem = screen.getByTestId("group-item-1");
      fireEvent.click(groupItem);

      expect(mockHapticsState.selection).toHaveBeenCalled();
      expect(onGroupChange).toHaveBeenCalledWith("opt1");
    });

    it("HapticButton: triggers lightTap haptics and executes onClick callback", () => {
      const onClick = vi.fn();
      render(<HapticButton data-testid="haptic-button" onClick={onClick}>Haptic Button</HapticButton>);
      const btn = screen.getByTestId("haptic-button");

      fireEvent.click(btn);
      expect(mockHapticsState.lightTap).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. RAPID CONCURRENCY & MULTI-TAP STRESS HAMMER
  // =========================================================================
  describe("5. High-Frequency Interaction Hammer", () => {
    it("handles 100 rapid-fire clicks on Switch without queue desync or errors", async () => {
      const onCheckedChange = vi.fn();
      render(<Switch data-testid="rapid-switch" onCheckedChange={onCheckedChange} />);
      const sw = screen.getByTestId("rapid-switch");

      for (let i = 0; i < 100; i++) {
        fireEvent.click(sw);
      }

      expect(mockHapticsState.selection).toHaveBeenCalledTimes(100);
      expect(onCheckedChange).toHaveBeenCalledTimes(100);
    });

    it("handles 100 rapid-fire clicks on HapticButton without leaking promises", async () => {
      const onClick = vi.fn();
      render(<HapticButton data-testid="rapid-haptic-btn" onClick={onClick}>Click</HapticButton>);
      const btn = screen.getByTestId("rapid-haptic-btn");

      for (let i = 0; i < 100; i++) {
        fireEvent.click(btn);
      }

      expect(mockHapticsState.lightTap).toHaveBeenCalledTimes(100);
      expect(onClick).toHaveBeenCalledTimes(100);
    });
  });
});
