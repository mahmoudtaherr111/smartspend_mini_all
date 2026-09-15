/**
 * `npm run changes` reports what changed in the shape of the system by comparing two versions of the
 * architecture model. This checks the comparison and the Arabic report on small models, without git.
 */
import { describe, expect, it } from "vitest";
import { diffModels, renderReport } from "../../scripts/agent/changes";
import { parseArchitectureModel } from "../../scripts/knowledge/flows-rules";

const model = (text: string) => parseArchitectureModel([{ file: "docs/architecture/generated/test.c4", text }]);

const before = model(`model {
  extend smartspend.api.trpc {
    expense = router 'expense' {
      create = procedure 'expense.create'
    }
  }
  extend smartspend.mysql {
    expenses = table 'expenses'
  }
  smartspend.api.trpc.expense.create -[writes]-> smartspend.mysql.expenses
}`);

const after = model(`model {
  extend smartspend.api.trpc {
    expense = router 'expense' {
      create = procedure 'expense.create'
    }
    invoice = router 'invoice' {
      create = procedure 'invoice.create'
    }
  }
  extend smartspend.mysql {
    expenses = table 'expenses'
    invoices = table 'invoices'
  }
  smartspend.api.trpc.expense.create -[reads]-> smartspend.mysql.expenses
  smartspend.api.trpc.invoice.create -[writes]-> smartspend.mysql.invoices
}`);

describe("npm run changes", () => {
  const diff = diffModels(before, after);

  it("lists elements that appeared, ignoring structural kinds such as routers", () => {
    expect(diff.added.map((element) => element.name)).toEqual([
      "smartspend.api.trpc.invoice.create",
      "smartspend.mysql.invoices",
    ]);
    expect(diff.removed).toEqual([]);
  });

  it("reports connections that started or stopped, but not those of new elements", () => {
    expect(diff.linksAdded).toEqual([
      { source: "smartspend.api.trpc.expense.create", target: "smartspend.mysql.expenses", kind: "reads" },
    ]);
    expect(diff.linksRemoved).toEqual([
      { source: "smartspend.api.trpc.expense.create", target: "smartspend.mysql.expenses", kind: "writes" },
    ]);
  });

  it("writes a report the owner can read in Arabic", () => {
    const report = renderReport(
      { from: "aaaaaaa1", to: "bbbbbbb2" },
      [{ hash: "bbbbbbb", date: "2026-09-15", subject: "feat: invoices", agent: "codex" }],
      diff,
      { before, after },
      "ar",
    );
    expect(report).toContain("feat: invoices — codex");
    expect(report).toContain("جدول `invoices`");
    expect(report).toContain("procedure في الـAPI `expense.create` بطّل يكتب في جدول `expenses`");
  });
});
