/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminCaptureSection } from "./AdminCaptureSection";

describe("AdminCaptureSection", () => {
  it("is off until the admin opens it, and saves the switch through the settings form", () => {
    const updateField = vi.fn();
    render(<AdminCaptureSection formData={{}} updateField={updateField} />);
    const toggle = screen.getByRole("switch", { name: "التسجيل من رسايل البنك" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(updateField).toHaveBeenCalledWith("capture_enabled", "true");
  });

  it("edits the paused banks and the question notices", () => {
    const updateField = vi.fn();
    render(<AdminCaptureSection formData={{ capture_enabled: "true" }} updateField={updateField} />);
    fireEvent.change(screen.getByLabelText("بنوك موقفة عن التسجيل لوحدها"), { target: { value: "nbe" } });
    fireEvent.change(screen.getByLabelText("إشعارات الأسئلة في اليوم"), { target: { value: "3" } });
    expect(updateField.mock.calls).toEqual([
      ["capture_paused_sources", "nbe"],
      ["capture_daily_question_notices", "3"],
    ]);
    expect(screen.queryByLabelText("الأنواع اللي بتتسجل لوحدها")).toBeNull();
  });
});
