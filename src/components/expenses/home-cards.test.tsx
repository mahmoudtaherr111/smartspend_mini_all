/** @vitest-environment jsdom */
/**
 * The cards on Home read lists from the server. A reply that is not the list they expect (an
 * older server during a deploy, a proxy error page parsed as {}) must leave Home standing:
 * each card renders nothing instead of throwing through the app's error boundary.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { replies } = vi.hoisted(() => ({ replies: {} as Record<string, unknown> }));

vi.mock("@/providers/trpc", () => {
  const procedure = (path: string) => ({
    useQuery: () => ({ data: replies[path] }),
    useMutation: () => ({ mutate: () => undefined, isPending: false }),
    invalidate: () => Promise.resolve(),
  });
  const router = (name: string) =>
    new Proxy({}, { get: (_target, proc) => procedure(`${name}.${String(proc)}`) });
  const utils = new Proxy({}, { get: (_target, name) => router(String(name)) });
  return {
    trpc: new Proxy({}, { get: (_target, name) => (name === "useUtils" ? () => utils : router(String(name))) }),
  };
});

import { PendingQuestionsCard } from "./PendingQuestionsCard";
import { SmsSuggestionsCard } from "../bank-sync/SmsSuggestionsCard";
import { BudgetsPanel } from "../budgets/BudgetsPanel";

describe("Home cards with an unexpected reply", () => {
  it.each([{}, null, "error", 42])("render nothing for %j instead of throwing", (reply) => {
    replies["expense.getPendingClarifications"] = reply;
    replies["profile.getSmsSuggestions"] = reply;
    const { container } = render(
      <>
        <PendingQuestionsCard />
        <SmsSuggestionsCard />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the budgets panel's empty state when the list is missing", () => {
    replies["budget.list"] = {};
    const { getByText } = render(<BudgetsPanel />);
    expect(getByText(/حط حد شهري لفئة/)).toBeInTheDocument();
  });
});
