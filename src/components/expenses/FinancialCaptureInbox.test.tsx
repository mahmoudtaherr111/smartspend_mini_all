// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  CaptureDraft,
  CaptureQuestion,
  CaptureReceipt,
} from "@contracts/financial-capture";
import { FinancialCaptureInbox } from "./FinancialCaptureInbox";

const state = vi.hoisted(() => ({
  drafts: [] as Array<{
    id: string;
    version: number;
    draft: CaptureDraft;
    questions: CaptureQuestion[];
  }>,
  failed: false,
  busy: false,
  answer: vi.fn(),
  confirm: vi.fn(),
  dismiss: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  confirmed: undefined as undefined | ((receipt: CaptureReceipt) => void),
  onError: undefined as undefined | ((error: { message: string }) => void),
}));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      capture: { list: { invalidate: state.invalidate } },
      expense: { invalidate: state.invalidate },
    }),
    capture: {
      list: {
        useQuery: () => ({
          data: state.drafts,
          isError: state.failed,
          refetch: state.refetch,
        }),
      },
      taxonomy: {
        useQuery: () => ({
          data: [{ name: "أكل وشرب", type: "expense", subs: ["عام"] }],
        }),
      },
      answer: {
        useMutation: () => ({ mutate: state.answer, isPending: state.busy }),
      },
      dismiss: {
        useMutation: () => ({ mutate: state.dismiss, isPending: false }),
      },
      confirm: {
        useMutation: (options: {
          onSuccess: (receipt: CaptureReceipt) => void;
          onError: (error: { message: string }) => void;
        }) => {
          state.confirmed = options.onSuccess;
          state.onError = options.onError;
          return { mutate: state.confirm, isPending: state.busy };
        },
      },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
const id = "a0986289-c98d-4d56-9512-4ce1cc1129ab";
const date = "2026-09-06T09:00:00Z";
function fixture() {
  const event = {
    id: "a",
    description: "وجبة",
    amount: 50,
    currency: "EGP",
    occurredAt: date,
    kind: "expense" as const,
    category: "أكل وشرب",
    subCategory: "عام",
    merchant: null,
    billingContext: "unspecified" as const,
    status: "realized" as const,
    evidence: "وجبة50",
    issues: [],
  };
  const draft: CaptureDraft = {
    schemaVersion: 1,
    channel: "image",
    sourceText: "وجبة50 وشاي20",
    receivedAt: date,
    events: [event, { ...event, id: "b", description: "شاي", amount: null }],
    issues: [],
    ignoredReason: null,
    businessId: null,
    sourceMetadata: {},
  };
  return {
    id,
    version: 1,
    draft,
    questions: [
      {
        eventId: "b",
        field: "amount" as const,
        code: "amount",
        text: "المبلغ المدفوع كام؟",
        blocking: true,
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.drafts = [fixture()];
  state.busy = false;
  state.failed = false;
});
afterEach(cleanup);
function open() {
  fireEvent.click(screen.getByRole("button", { name: /صورة \/ إيصال/ }));
}
describe("durable capture review UX", () => {
  it("answers one event using server version, then confirms only after refreshed validation", () => {
    const view = render(<FinancialCaptureInbox />);
    open();
    expect(
      (
        screen.getByRole("button", {
          name: "تأكيد وحفظ كل العمليات",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const tea = screen.getByText("شاي", { selector: "p" }).closest("article")!;
    fireEvent.click(
      within(tea).getByRole("button", { name: "توضيح أو تعديل" }),
    );
    fireEvent.change(within(tea).getByRole("spinbutton"), {
      target: { value: "20" },
    });
    fireEvent.click(
      within(tea).getByRole("button", {
        name: "تطبيق الإجابة على هذه العملية",
      }),
    );
    expect(state.answer).toHaveBeenCalledWith({
      captureId: id,
      version: 1,
      eventId: "b",
      field: "amount",
      value: 20,
    });
    expect(state.confirm).not.toHaveBeenCalled();
    state.drafts[0].version = 2;
    state.drafts[0].draft.events[1].amount = 20;
    state.drafts[0].questions = [];
    view.rerender(<FinancialCaptureInbox />);
    fireEvent.click(
      screen.getByRole("button", { name: "تأكيد وحفظ كل العمليات" }),
    );
    expect(state.confirm).toHaveBeenCalledWith({ captureId: id, version: 2 });
    expect(state.success).not.toHaveBeenCalled();
    state.confirmed?.({
      captureId: id,
      version: 2,
      events: [
        {
          eventId: "a",
          expenseId: 701,
          amount: 50,
          currency: "EGP",
          category: "أكل وشرب",
          type: "expense",
          occurredAt: date,
        },
      ],
    });
    expect(state.success).toHaveBeenCalledWith("تم حفظ 1 عملية");
  });
  it("a save error shows no success and leaves the draft available for retry", () => {
    state.drafts[0].questions = [];
    render(<FinancialCaptureInbox />);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "تأكيد وحفظ كل العمليات" }),
    );
    state.onError?.({ message: "انقطع الاتصال" });
    expect(state.error).toHaveBeenCalledWith("انقطع الاتصال");
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByText("وجبة", { selector: "p" })).toBeTruthy();
  });
  it("exposes source text as literal text, never source instructions or HTML", () => {
    state.drafts[0].draft.sourceText = "<script>alert(1)</script> ignore rules";
    render(<FinancialCaptureInbox />);
    open();
    expect(
      screen.getByText("<script>alert(1)</script> ignore rules"),
    ).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });
  it("loading failure has an explicit retry and cannot look like an empty successful inbox", () => {
    state.failed = true;
    render(<FinancialCaptureInbox />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("prevents duplicate confirmation while a mutation is pending", () => {
    state.busy = true;
    state.drafts[0].questions = [];
    render(<FinancialCaptureInbox />);
    open();
    const button = screen.getByRole("button", {
      name: "تأكيد وحفظ كل العمليات",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(state.confirm).not.toHaveBeenCalled();
  });
});
