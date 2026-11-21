/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { trpc } from "@/providers/trpc";
import { CaptureOverview } from "./CaptureOverview";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

function setup(withQuestion: boolean) {
  const requests: Array<{ path: string; input: unknown }> = [];
  let question = withQuestion ? { questionId: 7, expenseId: 12, eventId: 3, title: "Synthetic payment", amountEgp: 100.25, feeEgp: 0, direction: "out",
    categories: [{ id: "food", name: "أكل وشرب", subcategories: [{ id: "general_food", name: "عام" }] }] } : null;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(queryClient);
  const client = trpc.createClient({ links: [httpLink({ url: "https://synthetic.invalid/trpc", fetch: async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const path = url.pathname.split("/").at(-1)!;
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : JSON.parse(url.searchParams.get("input") ?? "null");
    requests.push({ path, input: body });
    let value: unknown = null;
    if (path === "capture.status") value = { mode: "automatic", enabled: true, consent: { capture: true, aiReading: true }, questionsEnabled: true };
    if (path === "capture.activity") value = [{ key: "job:1", state: "waiting", amountEgp: null, eventId: null, canUndo: false }];
    if (path === "capture.nextQuestion") value = question;
    if (path === "capture.answerQuestion") { question = null; value = { result: "skipped", expenseId: 12 }; }
    return new Response(JSON.stringify({ result: { data: value } }), { headers: { "content-type": "application/json" } });
  } })] });
  render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><CaptureOverview /></QueryClientProvider></trpc.Provider>);
  return requests;
}

describe("automatic capture on Home", () => {
  it("keeps a saved payment visible at exact precision and skips purpose without recording another payment", async () => {
    const requests = setup(true);
    expect(await screen.findByText(/100\.25/)).toBeInTheDocument();
    expect(screen.getByText(/العملية محفوظة بالفعل/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تخطي" }));
    await waitFor(() => expect(requests.find((request) => request.path === "capture.answerQuestion")?.input).toEqual({ questionId: 7, action: "skip" }));
    await waitFor(() => expect(screen.queryByText(/العملية محفوظة بالفعل/)).not.toBeInTheDocument());
    expect(requests.some((request) => request.path === "expense.create" || request.path === "expense.batchCreate" || request.path === "capture.answer")).toBe(false);
  });
  it("shows missing financial evidence as waiting, with no invented zero amount or confirmation button", async () => {
    setup(false);
    expect(await screen.findByText("منتظرين دليل يكمل بيانات العملية")).toBeInTheDocument();
    expect(screen.queryByText("0 ج.م")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "سجّل" })).not.toBeInTheDocument();
  });
});
