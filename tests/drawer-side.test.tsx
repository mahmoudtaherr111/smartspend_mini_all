/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

describe("Drawer Content Directional Positioning Regression Tests", () => {
  it("does not apply unconditional mx-auto or inset-x-0 on side drawers", () => {
    const { getByTestId } = render(
      <Drawer open direction="right">
        <DrawerContent data-testid="drawer-right">
          <div>Right Drawer Content</div>
        </DrawerContent>
      </Drawer>,
    );

    const el = getByTestId("drawer-right");
    const classNames = el.className.split(/\s+/);

    // Should NOT have unconditional 'mx-auto' or 'inset-x-0' as base classes
    expect(classNames.includes("mx-auto")).toBe(false);
    expect(classNames.includes("inset-x-0")).toBe(false);

    // Side drawer should have end-0 and w-3/4
    expect(el.className).toContain("data-[vaul-drawer-direction=right]:end-0");
    expect(el.className).toContain("data-[vaul-drawer-direction=right]:w-3/4");
  });

  it("applies mx-auto and inset-x-0 specifically for top and bottom directions", () => {
    const { getByTestId } = render(
      <Drawer open direction="bottom">
        <DrawerContent data-testid="drawer-bottom">
          <div>Bottom Drawer Content</div>
        </DrawerContent>
      </Drawer>,
    );

    const el = getByTestId("drawer-bottom");
    expect(el.className).toContain("data-[vaul-drawer-direction=bottom]:mx-auto");
    expect(el.className).toContain("data-[vaul-drawer-direction=bottom]:inset-x-0");
    expect(el.className).toContain("data-[vaul-drawer-direction=top]:mx-auto");
    expect(el.className).toContain("data-[vaul-drawer-direction=top]:inset-x-0");
  });
});
