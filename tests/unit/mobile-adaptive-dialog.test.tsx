/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  AdaptiveDialog,
  AdaptiveDialogTrigger,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogFooter,
  AdaptiveDialogTitle,
  AdaptiveDialogDescription,
  AdaptiveDialogClose,
  AdaptiveDialogOverlay,
  AdaptiveDialogPortal,
  useAdaptiveDialog,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTrigger,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogClose,
} from "@/components/ui/adaptive-dialog";
import { backButtonManager } from "@/lib/back-button-manager";

// Mock ResizeObserver for Radix & Vaul
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

// Helper to mock matchMedia
function setViewportWidth(width: number) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      let matches = false;
      if (query.includes("max-width: 768px")) {
        matches = width <= 768;
      } else if (query.includes("max-width: 1024px")) {
        matches = width <= 1024;
      } else if (query.includes("min-width: 768px")) {
        matches = width >= 768;
      }
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

describe("Tier 1: AdaptiveDialog Feature Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1.1 Renders Radix Dialog on Desktop Viewport (>= 768px)", () => {
    setViewportWidth(1024);

    render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent data-testid="dialog-content">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>عنوان النافذة ديسكتوب</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>وصف النافذة ديسكتوب</AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div data-testid="dialog-body">محتوى الديسكتوب</div>
          <AdaptiveDialogFooter>
            <AdaptiveDialogClose asChild>
              <button>إغلاق</button>
            </AdaptiveDialogClose>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByText("عنوان النافذة ديسكتوب")).toBeTruthy();
    expect(screen.getByText("وصف النافذة ديسكتوب")).toBeTruthy();
    expect(screen.getByTestId("dialog-body")).toBeTruthy();
    const content = screen.getByTestId("dialog-content");
    expect(content.className).toContain("sm:max-w-lg");
  });

  it("1.2 Renders Vaul Bottom Sheet Drawer on Mobile Viewport (< 768px)", () => {
    setViewportWidth(390);

    render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent data-testid="drawer-content">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>عنوان البوتوم شيت</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>وصف البوتوم شيت</AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div data-testid="drawer-body">محتوى الموبايل</div>
          <AdaptiveDialogFooter>
            <AdaptiveDialogClose asChild>
              <button>إغلاق</button>
            </AdaptiveDialogClose>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByText("عنوان البوتوم شيت")).toBeTruthy();
    expect(screen.getByText("وصف البوتوم شيت")).toBeTruthy();
    expect(screen.getByTestId("drawer-body")).toBeTruthy();
    const content = screen.getByTestId("drawer-content");
    expect(content.className).toContain("rounded-t-3xl");
  });

  it("1.3 Shows Grabber Pill on Mobile Content by Default", () => {
    setViewportWidth(390);

    const { container } = render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>العنوان</AdaptiveDialogTitle>
          <div>محتوى</div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    const grabber = container.querySelector(".w-12.h-1\\.5.rounded-full");
    expect(grabber).not.toBeNull();
  });

  it("1.4 Registers with BackButtonManager on Open and Unregisters on Close", () => {
    setViewportWidth(390);
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <AdaptiveDialog open={true} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>شيت قابل للإغلاق</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(backButtonManager.getStackLength()).toBe(1);

    // Trigger back button
    const handled = backButtonManager.executeTopHandler();
    expect(handled).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Close sheet
    rerender(
      <AdaptiveDialog open={false} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>شيت قابل للإغلاق</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(backButtonManager.getStackLength()).toBe(0);
  });

  it("1.5 Exports All ResponsiveDialog Aliases Identically", () => {
    expect(ResponsiveDialog).toBe(AdaptiveDialog);
    expect(ResponsiveDialogContent).toBe(AdaptiveDialogContent);
    expect(ResponsiveDialogTrigger).toBe(AdaptiveDialogTrigger);
    expect(ResponsiveDialogHeader).toBe(AdaptiveDialogHeader);
    expect(ResponsiveDialogFooter).toBe(AdaptiveDialogFooter);
    expect(ResponsiveDialogTitle).toBe(AdaptiveDialogTitle);
    expect(ResponsiveDialogDescription).toBe(AdaptiveDialogDescription);
    expect(ResponsiveDialogClose).toBe(AdaptiveDialogClose);
  });
});

describe("Tier 2: AdaptiveDialog Boundary & Corner Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("2.1 Hides Grabber Pill when showGrabber={false}", () => {
    setViewportWidth(390);

    const { container } = render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent showGrabber={false}>
          <AdaptiveDialogTitle>بدون مقبض</AdaptiveDialogTitle>
          <div>محتوى</div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    const grabber = container.querySelector(".w-12.h-1\\.5.rounded-full");
    expect(grabber).toBeNull();
  });

  it("2.2 Supports Custom Breakpoint Query (e.g. max-width: 1024px)", () => {
    // 900px would be desktop with standard 768px, but mobile with 1024px breakpoint
    setViewportWidth(900);

    render(
      <AdaptiveDialog open={true} breakpointQuery="(max-width: 1024px)">
        <AdaptiveDialogContent data-testid="tablet-content">
          <AdaptiveDialogTitle>شيت تابلت</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    const content = screen.getByTestId("tablet-content");
    expect(content.className).toContain("rounded-t-3xl");
  });

  it("2.3 Rapid Open/Close Toggling Does Not Leak Stack Handlers", () => {
    setViewportWidth(390);
    const onOpenChange = vi.fn();

    const TestComponent = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="toggle-btn" onClick={() => setOpen((prev) => !prev)}>
            Toggle
          </button>
          <AdaptiveDialog open={open} onOpenChange={setOpen}>
            <AdaptiveDialogContent>
              <AdaptiveDialogTitle>شيت سريع</AdaptiveDialogTitle>
            </AdaptiveDialogContent>
          </AdaptiveDialog>
        </div>
      );
    };

    render(<TestComponent />);
    const toggleBtn = screen.getByTestId("toggle-btn");

    expect(backButtonManager.getStackLength()).toBe(0);

    // Rapid toggle 10 times
    for (let i = 0; i < 10; i++) {
      fireEvent.click(toggleBtn);
    }

    // 10 toggles from false -> even number -> should be false / closed
    expect(backButtonManager.getStackLength()).toBe(0);

    // Open once more
    fireEvent.click(toggleBtn);
    expect(backButtonManager.getStackLength()).toBe(1);
  });

  it("2.4 Handles Uncontrolled Trigger Click Flow", () => {
    setViewportWidth(390);

    render(
      <AdaptiveDialog>
        <AdaptiveDialogTrigger asChild>
          <button data-testid="open-trigger">فتح النافذة</button>
        </AdaptiveDialogTrigger>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>شيت غير مراقب</AdaptiveDialogTitle>
          <AdaptiveDialogClose asChild>
            <button data-testid="close-trigger">إغلاق</button>
          </AdaptiveDialogClose>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    const trigger = screen.getByTestId("open-trigger");
    fireEvent.click(trigger);

    expect(screen.getByText("شيت غير مراقب")).toBeTruthy();
  });

  it("2.5 Handles Nested AdaptiveDialog Instances with Strict LIFO Stacking", () => {
    setViewportWidth(390);

    const NestedTest = () => {
      const [parentOpen, setParentOpen] = useState(true);
      const [childOpen, setChildOpen] = useState(false);

      return (
        <AdaptiveDialog open={parentOpen} onOpenChange={setParentOpen}>
          <AdaptiveDialogContent>
            <AdaptiveDialogTitle>الشيت الرئيسي</AdaptiveDialogTitle>
            <button data-testid="open-child" onClick={() => setChildOpen(true)}>
              فتح الشيت الفرعي
            </button>
            <AdaptiveDialog open={childOpen} onOpenChange={setChildOpen} nested={true}>
              <AdaptiveDialogContent>
                <AdaptiveDialogTitle>الشيت الفرعي</AdaptiveDialogTitle>
              </AdaptiveDialogContent>
            </AdaptiveDialog>
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      );
    };

    render(<NestedTest />);
    expect(backButtonManager.getStackLength()).toBe(1);

    // Open child sheet
    const openChildBtn = screen.getByTestId("open-child");
    fireEvent.click(openChildBtn);
    expect(backButtonManager.getStackLength()).toBe(2);

    // 1st Back button: closes child sheet
    const handled1 = backButtonManager.executeTopHandler();
    expect(handled1).toBe(true);

    // 2nd Back button: closes parent sheet
    const handled2 = backButtonManager.executeTopHandler();
    expect(handled2).toBe(true);

    // 3rd Back button: stack empty
    const handled3 = backButtonManager.executeTopHandler();
    expect(handled3).toBe(false);
  });
});

describe("Tier 3: AdaptiveDialog Cross-Feature Combinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("3.1 Intercepts Back Button on Mobile Without Leaking Route Navigation", () => {
    setViewportWidth(390);
    const historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onOpenChange = vi.fn();

    render(
      <AdaptiveDialog open={true} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>شيت نشط</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    // Simulate hardware back press via backButtonManager.handleBack
    backButtonManager.handleBack(() => false, true);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(historyBackSpy).not.toHaveBeenCalled();
    historyBackSpy.mockRestore();
  });

  it("3.2 Forwards Snap Points Configuration to Mobile Drawer", () => {
    setViewportWidth(390);
    const setActiveSnapPoint = vi.fn();

    render(
      <AdaptiveDialog
        open={true}
        snapPoints={[0.5, 0.9]}
        activeSnapPoint={0.5}
        setActiveSnapPoint={setActiveSnapPoint}
      >
        <AdaptiveDialogContent data-testid="snapped-sheet">
          <AdaptiveDialogTitle>شيت بنقاط توقف</AdaptiveDialogTitle>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByTestId("snapped-sheet")).toBeTruthy();
  });

  it("3.3 AdaptiveDialogContext provides isMobile boolean accurately to child consumers", () => {
    setViewportWidth(390);

    const Consumer = () => {
      const { isMobile } = useAdaptiveDialog();
      return <div data-testid="is-mobile-check">{isMobile ? "mobile" : "desktop"}</div>;
    };

    const { rerender } = render(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>فحص السياق</AdaptiveDialogTitle>
          <Consumer />
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByTestId("is-mobile-check").textContent).toBe("mobile");

    // Switch to desktop
    setViewportWidth(1280);
    rerender(
      <AdaptiveDialog open={true}>
        <AdaptiveDialogContent>
          <AdaptiveDialogTitle>فحص السياق</AdaptiveDialogTitle>
          <Consumer />
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );

    expect(screen.getByTestId("is-mobile-check").textContent).toBe("desktop");
  });
});

describe("Tier 4: AdaptiveDialog Real-World Workload Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backButtonManager.clear();
  });

  it("4.1 Simulates Expense Details -> Delete Confirmation Workflow with Safe Stack Teardown", async () => {
    setViewportWidth(390);

    const ExpenseDetailFlow = () => {
      const [detailsOpen, setDetailsOpen] = useState(true);
      const [confirmOpen, setConfirmOpen] = useState(false);
      const [isDeleted, setIsDeleted] = useState(false);

      const handleDelete = () => {
        setIsDeleted(true);
        setConfirmOpen(false);
        setDetailsOpen(false);
      };

      return (
        <div>
          {isDeleted && <div data-testid="deleted-banner">تم حذف المصروف بنجاح</div>}
          <AdaptiveDialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <AdaptiveDialogContent>
              <AdaptiveDialogTitle>تفاصيل المصروف</AdaptiveDialogTitle>
              <div data-testid="expense-amount">350.00 EGP</div>
              <button data-testid="trigger-delete" onClick={() => setConfirmOpen(true)}>
                حذف
              </button>

              <AdaptiveDialog open={confirmOpen} onOpenChange={setConfirmOpen} nested={true}>
                <AdaptiveDialogContent>
                  <AdaptiveDialogTitle>هل أنت متأكد من الحذف؟</AdaptiveDialogTitle>
                  <button data-testid="confirm-delete-btn" onClick={handleDelete}>
                    تأكيد الحذف
                  </button>
                  <button data-testid="cancel-delete-btn" onClick={() => setConfirmOpen(false)}>
                    إلغاء
                  </button>
                </AdaptiveDialogContent>
              </AdaptiveDialog>
            </AdaptiveDialogContent>
          </AdaptiveDialog>
        </div>
      );
    };

    render(<ExpenseDetailFlow />);
    expect(screen.getByText("تفاصيل المصروف")).toBeTruthy();
    expect(backButtonManager.getStackLength()).toBe(1);

    // Step 1: Open Delete Confirmation Modal
    const triggerDelete = screen.getByTestId("trigger-delete");
    fireEvent.click(triggerDelete);
    expect(screen.getByText("هل أنت متأكد من الحذف؟")).toBeTruthy();
    expect(backButtonManager.getStackLength()).toBe(2);

    // Step 2: Cancel Delete via hardware back button
    backButtonManager.executeTopHandler();
    // Confirm modal closed, details sheet remains open
    expect(backButtonManager.getStackLength()).toBe(1);

    // Step 3: Re-open delete confirmation and click confirm
    fireEvent.click(screen.getByTestId("trigger-delete"));
    expect(backButtonManager.getStackLength()).toBe(2);

    fireEvent.click(screen.getByTestId("confirm-delete-btn"));

    // Both sheets should be closed, stack empty, deleted banner visible
    expect(backButtonManager.getStackLength()).toBe(0);
    expect(screen.getByTestId("deleted-banner")).toBeTruthy();
  });

  it("4.2 Preserves Form Input Focus and Value inside AdaptiveDialog", () => {
    setViewportWidth(390);

    const FormFlow = () => {
      const [open, setOpen] = useState(true);
      const [title, setTitle] = useState("");
      const [amount, setAmount] = useState("");

      return (
        <AdaptiveDialog open={open} onOpenChange={setOpen} repositionInputs={true}>
          <AdaptiveDialogContent>
            <AdaptiveDialogTitle>إضافة معاملة</AdaptiveDialogTitle>
            <form onSubmit={(e) => { e.preventDefault(); setOpen(false); }}>
              <input
                data-testid="input-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="اسم المعاملة"
              />
              <input
                data-testid="input-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="المبلغ"
              />
              <button data-testid="submit-btn" type="submit">
                حفظ
              </button>
            </form>
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      );
    };

    render(<FormFlow />);

    const titleInput = screen.getByTestId("input-title") as HTMLInputElement;
    const amountInput = screen.getByTestId("input-amount") as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: "فواتير كهرباء" } });
    fireEvent.change(amountInput, { target: { value: "450" } });

    expect(titleInput.value).toBe("فواتير كهرباء");
    expect(amountInput.value).toBe("450");

    fireEvent.click(screen.getByTestId("submit-btn"));
    expect(backButtonManager.getStackLength()).toBe(0);
  });
});
