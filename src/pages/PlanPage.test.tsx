/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ add: vi.fn(), settle: vi.fn(), unsettle: vi.fn(), due: [] as unknown[], settlements: [] as unknown[] }));
vi.mock("@/components/seo/SEOMeta", () => ({ SEOMeta: () => null }));
// The native-select mock isolates financial form behavior; this does not qualify real browser interaction.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
vi.mock("@/providers/trpc", () => ({ trpc: {
  useUtils: () => ({ coach: { overview: { invalidate: vi.fn() } } }),
  coach: {
    overview: { useQuery: () => ({ data: { plan: null, due: state.due, settlements: state.settlements, position: {
      wallets: { total: 0, count: 0 }, duesKnown: 0, freeBeforeIncome: 0, until: "2026-11-25", days: 10, untilIsPayday: true,
      duesUnknownAmount: [], undated: [], incomeConfirmed: 0, incomeEstimated: 0,
    } } }) },
    addCashflow: { useMutation: () => ({ mutate: state.add, isPending: false }) },
    settle: { useMutation: () => ({ mutate: state.settle }) },
    unsettle: { useMutation: () => ({ mutate: state.unsettle }) },
    paymentSuggestions: { useQuery: () => ({ data: [] }) },
  },
  profile: { listContacts: { useQuery: () => ({ data: { contacts: [{ id: 41, name: "خالد", relation: "صديق" }] } }) } },
} }));

import PlanPage from "./PlanPage";

beforeEach(() => { vi.clearAllMocks(); state.due = []; state.settlements = []; });
describe("commitments screen debt behavior", () => {
  it("lets a user choose a receivable and its contact without silently recording a loan", () => {
    render(<PlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "ضيف التزام أو دخل جاي" }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "debt" } });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "in" } });
    fireEvent.change(screen.getAllByRole("combobox")[3], { target: { value: "41" } });
    fireEvent.change(screen.getByPlaceholderText("الاسم (إيجار الشقة، قسط الموبايل…)"), { target: { value: "رد خالد" } });
    fireEvent.change(screen.getByPlaceholderText("المبلغ (سيبه فاضي لو مش عارفه)"), { target: { value: "٨٠٠٫٥٠" } });
    expect(screen.getByText("ده ميعاد ردّ الدين بس، مش تسجيل سلفة جديدة أو سداد.")).toBeInTheDocument();
    expect(state.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "احفظ" }));
    expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "debt", direction: "in", contactId: 41, amount: 800.5 }));
  });

  it("does not leak a selected debt contact or direction into another commitment kind", () => {
    render(<PlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "ضيف التزام أو دخل جاي" }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "debt" } });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "in" } });
    fireEvent.change(screen.getAllByRole("combobox")[3], { target: { value: "41" } });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "rent" } });
    fireEvent.change(screen.getByPlaceholderText("الاسم (إيجار الشقة، قسط الموبايل…)"), { target: { value: "إيجار" } });
    fireEvent.click(screen.getByRole("button", { name: "احفظ" }));
    expect(state.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "rent", direction: "out", contactId: null }));
  });

  it("shows the person and partial remainder and explains what an off-record payment changes", () => {
    state.due = [{ cashflowId: 8, kind: "debt", title: "رد السلفة", contactName: "خالد", dueDay: "2026-11-15", amount: 800, paid: 300, remaining: 500, status: "partial", direction: "out", certainty: "confirmed" }];
    render(<PlanPage />);
    expect(screen.getByText("الشخص: خالد")).toBeInTheDocument();
    expect(screen.getByText(/اتدفع ٣٠٠ ج.*فاضل ٥٠٠ ج/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "اتدفع؟" }));
    expect(screen.getByText("ده يعلّم الميعاد إنه اتدفع بس. رصيد الدين بيتغيّر لما تسجّل السداد في عملياتك.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "دفعته من غير ما أسجله" }));
    expect(state.settle).toHaveBeenCalledWith({ cashflowId: 8, dueDay: "2026-11-15", expenseId: null, amount: 500 });
  });

  it("lets the user unlink a paid date without deleting its ledger transaction", () => {
    state.due = [{ cashflowId: 8, kind: "debt", title: "رد السلفة", dueDay: "2026-11-15", amount: 800, paid: 800, remaining: 0, status: "paid", direction: "out", certainty: "confirmed" }];
    state.settlements = [{ id: 91, cashflowId: 8, dueDay: "2026-11-15", expenseId: 42, amount: "800.00" }];
    render(<PlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "راجع السداد" }));
    expect(screen.getByText("فكّ الربط بيرجع الميعاد غير مدفوع، وبيسيب العملية المتسجلة زي ما هي.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "فكّ ربط السداد" }));
    expect(state.unsettle).toHaveBeenCalledWith({ settlementId: 91 });
    expect(state.settle).not.toHaveBeenCalled();
  });
});
