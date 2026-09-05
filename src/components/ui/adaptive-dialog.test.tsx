/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogTrigger,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
} from "./adaptive-dialog";
import { backButtonManager } from "@/lib/back-button-manager";

// Mock matchMedia
function setMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AdaptiveDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    backButtonManager.clear();
  });

  it("renders desktop Radix dialog when viewport >= 768px", () => {
    setMatchMedia(false); // desktop

    render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>عنوان النافذة</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>وصف النافذة</AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div>محتوى الديسكتوب</div>
          <AdaptiveDialogFooter>
            <button>زر التأكيد</button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByText("عنوان النافذة")).toBeInTheDocument();
    expect(screen.getByText("وصف النافذة")).toBeInTheDocument();
    expect(screen.getByText("محتوى الديسكتوب")).toBeInTheDocument();
  });

  it("renders mobile Vaul drawer when viewport < 768px", () => {
    setMatchMedia(true); // mobile

    render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent showGrabber={true}>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>عنوان البوتوم شيت</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>وصف البوتوم شيت</AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div>محتوى الموبايل</div>
          <AdaptiveDialogFooter>
            <button>زر الحفظ</button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByText("عنوان البوتوم شيت")).toBeInTheDocument();
    expect(screen.getByText("وصف البوتوم شيت")).toBeInTheDocument();
    expect(screen.getByText("محتوى الموبايل")).toBeInTheDocument();
  });

  it("registers and triggers onOpenChange on hardware back button press when open", () => {
    setMatchMedia(true);
    const onOpenChange = vi.fn();

    render(
      <AdaptiveDialog open={true} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>نافذة تفاعلية</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(backButtonManager.getStackLength()).toBe(1);

    // Simulate back button press
    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
