/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminSmsAiSection } from "./AdminSmsAiSection";

describe("AdminSmsAiSection", () => {
  it("is on until the admin switches it off, and saves the switch through the settings form", () => {
    const updateField = vi.fn();
    render(<AdminSmsAiSection formData={{}} updateField={updateField} />);
    const toggle = screen.getByRole("switch", { name: "الموديل لرسايل البنوك" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(updateField).toHaveBeenCalledWith("sms_ai_enabled", "false");
  });

  it("sets the daily cost cap in dollars", () => {
    const updateField = vi.fn();
    render(<AdminSmsAiSection formData={{ sms_ai_daily_cost_cap_usd: "2" }} updateField={updateField} />);
    fireEvent.change(screen.getByLabelText("سقف التكلفة اليومي لرسايل البنوك"), { target: { value: "1.5" } });
    expect(updateField).toHaveBeenCalledWith("sms_ai_daily_cost_cap_usd", "1.5");
  });
});
