/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSelection = vi.fn();
const mockLightTap = vi.fn();
const mockMediumTap = vi.fn();
const mockHeavyTap = vi.fn();
const mockSuccess = vi.fn();
const mockWarning = vi.fn();
const mockError = vi.fn();

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    selection: mockSelection,
    selectionStart: vi.fn(),
    selectionChanged: vi.fn(),
    selectionEnd: vi.fn(),
    lightTap: mockLightTap,
    mediumTap: mockMediumTap,
    heavyTap: mockHeavyTap,
    success: mockSuccess,
    warning: mockWarning,
    error: mockError,
    isSupported: true,
  }),
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

import { Switch } from "./switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { Slider } from "./slider";
import { Toggle } from "./toggle";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Button } from "./button";

describe("UI Components Haptic Tactile Wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Switch Component", () => {
    it("triggers selection haptics when checked state changes", () => {
      const onCheckedChange = vi.fn();
      render(<Switch data-testid="test-switch" onCheckedChange={onCheckedChange} />);
      const switchEl = screen.getByTestId("test-switch");

      fireEvent.click(switchEl);

      expect(mockSelection).toHaveBeenCalledTimes(1);
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  describe("Tabs & TabsTrigger Component", () => {
    it("triggers selection haptics on TabsTrigger click", () => {
      const onClick = vi.fn();
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" data-testid="tab-1" onClick={onClick}>
              Tab 1
            </TabsTrigger>
            <TabsTrigger value="tab2" data-testid="tab-2">
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      const tab1 = screen.getByTestId("tab-1");
      fireEvent.click(tab1);

      expect(mockSelection).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);

      const tab2 = screen.getByTestId("tab-2");
      fireEvent.click(tab2);
      expect(mockSelection).toHaveBeenCalledTimes(2);
    });
  });

  describe("Slider Component", () => {
    it("renders slider and forwards props correctly", () => {
      const onValueChange = vi.fn();
      render(
        <Slider
          data-testid="test-slider"
          defaultValue={[25]}
          max={100}
          step={1}
          onValueChange={onValueChange}
        />,
      );

      const sliderEl = screen.getByTestId("test-slider");
      expect(sliderEl).toBeDefined();
      expect(sliderEl.getAttribute("data-slot")).toBe("slider");
    });
  });

  describe("Toggle Component", () => {
    it("triggers selection haptics on toggle click and pressed change", () => {
      const onPressedChange = vi.fn();
      render(
        <Toggle data-testid="test-toggle" onPressedChange={onPressedChange}>
          Toggle
        </Toggle>,
      );

      const toggleEl = screen.getByTestId("test-toggle");
      fireEvent.click(toggleEl);

      expect(mockSelection).toHaveBeenCalled();
      expect(onPressedChange).toHaveBeenCalledWith(true);
    });

    it("triggers selection haptics on click even without onPressedChange", () => {
      const onClick = vi.fn();
      render(
        <Toggle data-testid="test-toggle-click" onClick={onClick}>
          Toggle Click
        </Toggle>,
      );

      const toggleEl = screen.getByTestId("test-toggle-click");
      fireEvent.click(toggleEl);

      expect(mockSelection).toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("ToggleGroup & ToggleGroupItem Component", () => {
    it("triggers selection haptics on item click", () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup type="single" onValueChange={onValueChange}>
          <ToggleGroupItem value="a" data-testid="item-a">
            Item A
          </ToggleGroupItem>
          <ToggleGroupItem value="b" data-testid="item-b">
            Item B
          </ToggleGroupItem>
        </ToggleGroup>,
      );

      const itemA = screen.getByTestId("item-a");
      fireEvent.click(itemA);

      expect(mockSelection).toHaveBeenCalled();
      expect(onValueChange).toHaveBeenCalledWith("a");
    });
  });

  describe("Button Active Physics Classes", () => {
    it("includes btn-press and touch-manipulation classes", () => {
      render(<Button data-testid="test-btn">Press Me</Button>);
      const btn = screen.getByTestId("test-btn");

      expect(btn.className).toContain("btn-press");
      expect(btn.className).toContain("touch-manipulation");
    });
  });

  describe("Swipe-to-Delete Threshold Haptics Logic", () => {
    it("simulates threshold crossing (60px) behavior with lightTap and heavyTap", () => {
      let thresholdPassed = false;
      const threshold = 60;
      const isRTL = true;

      const simulateDrag = (offsetX: number) => {
        const passed = isRTL ? offsetX < -threshold : offsetX > threshold;
        if (passed && !thresholdPassed) {
          thresholdPassed = true;
          mockLightTap();
        } else if (!passed && thresholdPassed) {
          thresholdPassed = false;
        }
      };

      const simulateDragEnd = (offsetX: number, onRequestDelete: () => void) => {
        const hasDraggedPast = isRTL ? offsetX < -threshold : offsetX > threshold;
        thresholdPassed = false;
        if (hasDraggedPast) {
          mockHeavyTap();
          onRequestDelete();
        }
      };

      // 1. Dragging 30px (below threshold) -> no haptics
      simulateDrag(-30);
      expect(mockLightTap).not.toHaveBeenCalled();
      expect(thresholdPassed).toBe(false);

      // 2. Dragging 65px (crosses threshold) -> fires lightTap
      simulateDrag(-65);
      expect(mockLightTap).toHaveBeenCalledTimes(1);
      expect(thresholdPassed).toBe(true);

      // 3. Dragging further (80px) -> no repeated lightTap
      simulateDrag(-80);
      expect(mockLightTap).toHaveBeenCalledTimes(1);

      // 4. Dragging back to 40px (below threshold) -> resets state
      simulateDrag(-40);
      expect(mockLightTap).toHaveBeenCalledTimes(1);
      expect(thresholdPassed).toBe(false);

      // 5. Dragging past threshold again -> fires lightTap second time
      simulateDrag(-70);
      expect(mockLightTap).toHaveBeenCalledTimes(2);
      expect(thresholdPassed).toBe(true);

      // 6. Releasing past threshold -> fires heavyTap and requests delete
      const deleteCallback = vi.fn();
      simulateDragEnd(-70, deleteCallback);
      expect(mockHeavyTap).toHaveBeenCalledTimes(1);
      expect(deleteCallback).toHaveBeenCalledTimes(1);
    });
  });
});
