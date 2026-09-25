/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { stats } = vi.hoisted(() => ({
  stats: {
    days: 7, calls: 12, callers: 5, minutes: 30.5, averageCallSeconds: 152, costUsd: 1.83, toolCostUsd: 0.01,
    costPerMinuteUsd: 0.06, firstAudioMs: { p50: 900, p95: 2100 }, reconnectsPerCall: 0.2, toolCallsPerCall: 1.5,
    endReasons: [{ key: "user", count: 10 }, { key: "network", count: 2 }],
    clients: [{ key: "web", count: 12 }], memory: [{ key: "saved", count: 11 }],
    models: [{ key: "gemini-3.8-live", count: 12, minutes: 30.5, costUsd: 1.83 }],
    incidents: [{ key: "spoken_number_mismatch", count: 1 }],
    recent: [{
      id: "vc_1", user: "local:1", startedAt: "2026-09-25T10:00:00.000Z", seconds: 95, model: "gemini-3.8-live",
      client: "web", endReason: "user", costUsd: 0.09, firstAudioP50: 850, incidents: 0, memory: "saved",
    }],
  },
}));

vi.mock("@/providers/trpc", () => ({
  trpc: { voice: { adminStats: { useQuery: () => ({ data: stats, isLoading: false, error: null }) } } },
}));

import { AdminVoiceCallSection } from "./AdminVoiceCallSection";

describe("AdminVoiceCallSection", () => {
  it("shows the calls dashboard without any words said in a call", () => {
    render(<AdminVoiceCallSection formData={{}} updateField={() => undefined} />);
    expect(screen.getByText("12", { selector: "div" })).toBeInTheDocument();
    expect(screen.getAllByText("$0.0600").length).toBeGreaterThan(0);
    expect(screen.getAllByText("المستخدم قفل").length).toBeGreaterThan(0);
    expect(screen.getByText("spoken_number_mismatch")).toBeInTheDocument();
  });

  it("stops calls for everyone, and sets a plan's daily cost cap, through the settings form", () => {
    const updateField = vi.fn();
    render(<AdminVoiceCallSection formData={{ voice_daily_cost_cap_usd_pro: "0.50" }} updateField={updateField} />);
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(updateField).toHaveBeenCalledWith("voice_v2_kill_switch", "true");
    fireEvent.change(screen.getByDisplayValue("0.50"), { target: { value: "0.75" } });
    expect(updateField).toHaveBeenCalledWith("voice_daily_cost_cap_usd_pro", "0.75");
  });
});
