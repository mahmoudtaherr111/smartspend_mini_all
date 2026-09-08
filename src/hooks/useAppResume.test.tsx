/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RESUME_REFRESH_AFTER_MS, useAppResume } from "./useAppResume";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useAppResume", () => {
  let queryClient: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient();
    invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does nothing when the user glances away and comes straight back", () => {
    renderHook(() => useAppResume(), { wrapper });

    setVisibility("hidden");
    vi.advanceTimersByTime(3_000);
    setVisibility("visible");

    // The data on screen is still the data they left. Refetching it here is
    // the stall that made returning to the app feel like a cold start.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("re-syncs after a real absence", () => {
    renderHook(() => useAppResume(), { wrapper });

    setVisibility("hidden");
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS + 1);
    setVisibility("visible");

    expect(invalidate).toHaveBeenCalledTimes(1);
    // Only what is mounted; everything else revalidates if the user goes there.
    expect(invalidate).toHaveBeenCalledWith({ refetchType: "active" });
  });

  it("ignores a visible event that was not preceded by going hidden", () => {
    renderHook(() => useAppResume(), { wrapper });

    setVisibility("visible");

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("measures each absence separately rather than accumulating", () => {
    renderHook(() => useAppResume(), { wrapper });

    setVisibility("hidden");
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS + 1);
    setVisibility("visible");
    expect(invalidate).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    vi.advanceTimersByTime(2_000);
    setVisibility("visible");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => useAppResume(), { wrapper });
    unmount();

    setVisibility("hidden");
    vi.advanceTimersByTime(RESUME_REFRESH_AFTER_MS + 1);
    setVisibility("visible");

    expect(invalidate).not.toHaveBeenCalled();
  });
});
