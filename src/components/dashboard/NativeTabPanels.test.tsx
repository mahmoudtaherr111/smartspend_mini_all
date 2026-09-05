/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeTabPanels } from "./NativeTabPanels";

const panels = {
  record: <input aria-label="مسودة التسجيل" defaultValue="" />,
  stats: <div>بيانات الإحصائيات</div>,
  calendar: <div>بيانات التقويم</div>,
};

describe("NativeTabPanels", () => {
  it("mounts only the active destination on first render", () => {
    render(<NativeTabPanels activeTab="record">{panels}</NativeTabPanels>);

    expect(
      screen.getByRole("tabpanel", { name: "تسجيل" }).hasAttribute("hidden"),
    ).toBe(false);
    expect(screen.queryByText("بيانات الإحصائيات")).toBeNull();
  });

  it("switches without a carousel transform and keeps visited panel state", () => {
    const { rerender } = render(
      <NativeTabPanels activeTab="record">{panels}</NativeTabPanels>,
    );

    const draft = screen.getByLabelText("مسودة التسجيل");
    fireEvent.change(draft, { target: { value: "غدا 120 جنيه" } });

    rerender(<NativeTabPanels activeTab="stats">{panels}</NativeTabPanels>);
    expect(screen.getByText("بيانات الإحصائيات").closest("section")?.hidden).toBe(
      false,
    );
    expect(screen.getByLabelText("مسودة التسجيل").closest("section")?.hidden).toBe(
      true,
    );
    expect(screen.getByTestId("native-tab-panels").className).not.toContain(
      "overflow-hidden",
    );

    rerender(<NativeTabPanels activeTab="record">{panels}</NativeTabPanels>);
    expect(
      (screen.getByLabelText("مسودة التسجيل") as HTMLInputElement).value,
    ).toBe("غدا 120 جنيه");
  });
});
