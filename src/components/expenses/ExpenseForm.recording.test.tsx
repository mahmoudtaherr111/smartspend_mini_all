/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { call, toast, invalidate } = vi.hoisted(() => ({
  call: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), loading: vi.fn() },
  invalidate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/providers/trpc", () => {
  const router = (name: string) => new Proxy({}, {
    get: (_target, procedure) => ({
      invalidate: () => invalidate(`${name}.${String(procedure)}`),
      useQuery: () => ({}),
      useMutation: (options: { onSuccess?: (result: unknown) => Promise<void> } = {}) => {
        async function mutateAsync(input: unknown) {
          const result = await call(`${name}.${String(procedure)}`, input);
          await options.onSuccess?.(result);
          return result;
        }
        return { isPending: false, mutateAsync, mutate: (input: unknown) => void mutateAsync(input) };
      },
    }),
  });
  const utils = new Proxy({}, { get: (_target, key) => router(String(key)) });
  return {
    trpc: new Proxy({}, {
      get: (_target, key) => key === "useUtils" ? () => utils : router(String(key)),
    }),
  };
});
vi.mock("@/lib/ledger-refresh", () => ({ refreshLedgerViews: () => invalidate("ledger") }));
vi.mock("@/lib/compress-image", () => ({ compressImageFile: async () => ({ base64: "aW1hZ2U=" }) }));

import { ExpenseForm } from "./ExpenseForm";

describe("recording in the expense form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("replays the saved reading after a lost reply and undoes only the server's saved rows", async () => {
    const sentence = "دفعت ٣٠٠ نت واشتريت دوا";
    let commits = 0;
    call.mockImplementation((path: string) => {
      switch (path) {
        case "ai.parseExpense":
          return {
            text: sentence,
            decision: "review",
            classificationLogId: 901,
            partialReady: true,
            items: [{ amount: 300, category: "فواتير", subCategory: "إنترنت" }],
          };
        case "expense.commitPartialReading":
          if (++commits === 1) throw new Error("Lost reply");
          return { savedIds: [77], questions: [{ id: 91, question: "الدواء كان بكام؟" }] };
        case "expense.delete":
          return { success: true };
        default:
          throw new Error(`Unexpected procedure ${path}`);
      }
    });

    render(<ExpenseForm />);
    const composer = screen.getByRole("textbox", { name: "إدخال نص المصروف أو الدخل" });
    fireEvent.change(composer, { target: { value: sentence } });
    fireEvent.submit(composer.closest("form")!);

    const retry = await screen.findByRole("button", { name: "جرّب الحفظ تاني" });
    expect(JSON.parse(localStorage.getItem("smartspend_offline_texts") ?? "[]")).toEqual([
      expect.objectContaining({ partial: expect.objectContaining({ classificationLogId: 901 }) }),
    ]);
    fireEvent.click(retry);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("إنترنت"), expect.objectContaining({ action: expect.any(Object) }),
    ));
    expect(call.mock.calls).toEqual([
      ["ai.parseExpense", expect.objectContaining({ text: sentence, partialBooking: true })],
      ["expense.commitPartialReading", { classificationLogId: 901 }],
      ["expense.commitPartialReading", { classificationLogId: 901 }],
    ]);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("محتاج ردك"));
    expect(invalidate).toHaveBeenCalledWith("ledger");
    expect(localStorage.getItem("smartspend_offline_texts")).toBe("[]");
    toast.success.mock.calls[0][1].action.onClick();
    await waitFor(() => expect(call).toHaveBeenLastCalledWith("expense.delete", { id: 77 }));
  });

  it("syncs a stored partial reading after reload without asking the parser again", async () => {
    call.mockResolvedValue({ savedIds: [77], questions: [] });
    localStorage.setItem("smartspend_offline_texts", JSON.stringify([{
      id: "offline-901",
      timestamp: Date.now(),
      text: "دفعت ٣٠٠ نت واشتريت دوا",
      partial: { classificationLogId: 901, items: [{ amount: 300, category: "فواتير" }] },
    }]));
    vi.useFakeTimers();
    try {
      render(<ExpenseForm />);
      await act(async () => await vi.advanceTimersByTimeAsync(5000));
      expect(call.mock.calls).toEqual([["expense.commitPartialReading", { classificationLogId: 901 }]]);
      expect(localStorage.getItem("smartspend_offline_texts")).toBe("[]");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([false, true])("carries the receipt purpose only if the filing is kept (refiled: %s)", async (refiled) => {
    const purpose = { category: "groceries", sub: "supermarket" };
    call.mockImplementation((path: string) => {
      switch (path) {
        case "image.parseReceipt":
          return {
            amount: 350,
            type: "expense",
            category: "أكل وشرب",
            subCategory: "سوبرماركت",
            description: "مشتريات بقالة",
            purpose,
          };
        case "expense.create":
          return { id: 77 };
        default:
          throw new Error(`Unexpected procedure ${path}`);
      }
    });

    const { container } = render(<ExpenseForm />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "receipt.jpg", { type: "image/jpeg" })] },
    });
    const save = await screen.findByRole("button", { name: "تأكيد وحفظ" });
    if (refiled) {
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "مواصلات" } });
    } else {
      fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "355" } });
    }
    fireEvent.click(save);

    await waitFor(() => expect(call).toHaveBeenLastCalledWith("expense.create", expect.objectContaining({
      source: "image",
      category: refiled ? "مواصلات" : "أكل وشرب",
      amount: refiled ? 350 : 355,
      purpose: refiled ? undefined : purpose,
    })));
  });

  it("saves a manually selected transfer purpose with its direction and economic kind", async () => {
    call.mockResolvedValue({ id: 77 });
    render(<ExpenseForm />);
    fireEvent.click(screen.getByRole("button", { name: "إدخال يدوي تقليدي" }));
    fireEvent.click(screen.getByRole("button", { name: "تحويل", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /وارد/ }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "purpose:debts" } });
    fireEvent.change(screen.getByRole("combobox", { name: "الفئة الفرعية" }), { target: { value: "people" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "125" } });
    fireEvent.submit(screen.getByRole("button", { name: "حفظ العملية" }).closest("form")!);

    await waitFor(() => expect(call).toHaveBeenLastCalledWith("expense.create", expect.objectContaining({
      type: "transfer",
      amount: 125,
      movementKind: "loan",
      direction: "incoming",
      purpose: { category: "debts", sub: "people" },
    })));
  });
});
