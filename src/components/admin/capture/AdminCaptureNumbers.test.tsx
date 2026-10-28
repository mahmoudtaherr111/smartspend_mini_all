/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { funnel, calls } = vi.hoisted(() => ({
  funnel: {
    days: 7,
    rows: [
      { sourceSlug: "cib", kind: "card_purchase", review: 1, held: 0, recorded: 18, dismissed: 1, deleted: 0, auto: 20, autoUndone: 2 },
      { sourceSlug: "nbe", kind: "atm_withdrawal", review: 0, held: 2, recorded: 5, dismissed: 0, deleted: 0, auto: 0, autoUndone: 0 },
    ],
    model: [{ status: "done", outcome: "read", jobs: 4 }],
    oldestWaitingAt: null,
    paused: ["cib"],
  },
  calls: { bulkUndo: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({ captureAdmin: { funnel: { invalidate: () => undefined } } }),
    captureAdmin: {
      funnel: { useQuery: () => ({ data: funnel, isLoading: false }) },
      bulkUndo: {
        useMutation: () => ({
          isPending: false,
          mutate: (input: Record<string, unknown>, options?: { onSuccess?: (result: unknown) => void }) => {
            calls.bulkUndo.push(input);
            options?.onSuccess?.({ rows: 12, users: 3, removed: input.apply ? 12 : 0, max: 500 });
          },
        }),
      },
    },
  },
}));

import { AdminCaptureNumbers } from "./AdminCaptureNumbers";

beforeEach(() => {
  calls.bulkUndo.length = 0;
});

describe("AdminCaptureNumbers", () => {
  it("shows each bank and kind, marks a high undo rate, and lists the stopped banks", () => {
    render(<AdminCaptureNumbers />);
    expect(screen.getByText("card_purchase")).toBeInTheDocument();
    expect(screen.getByText("2 (10%)")).toHaveClass("text-rose-600");
    expect(screen.getByText("0 (—)")).not.toHaveClass("text-rose-600");
    expect(screen.getAllByText("cib").some((node) => node.closest("[class*=badge], .font-mono"))).toBe(true);
    expect(screen.getByText("read")).toBeInTheDocument();
  });

  it("counts before it takes anything back, and asks once more before it does", () => {
    render(<AdminCaptureNumbers />);
    fireEvent.change(screen.getByLabelText("البنك (الـ slug)"), { target: { value: "cib" } });
    fireEvent.change(screen.getByLabelText("من"), { target: { value: "2026-10-01T00:00" } });
    fireEvent.change(screen.getByLabelText("لحد"), { target: { value: "2026-10-02T00:00" } });
    fireEvent.click(screen.getByRole("button", { name: "احسب" }));
    expect(calls.bulkUndo).toHaveLength(1);
    expect(calls.bulkUndo[0]).toMatchObject({ sourceSlug: "cib", onlyAuto: true, apply: false });
    expect(screen.getByText(/12 صف عند 3 مستخدم/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "شيل الصفوف دي" }));
    fireEvent.click(screen.getByRole("button", { name: "أيوه، شيلهم" }));
    expect(calls.bulkUndo[1]).toMatchObject({ sourceSlug: "cib", apply: true });
  });
});
