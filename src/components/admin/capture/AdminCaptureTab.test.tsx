/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { catalog, calls } = vi.hoisted(() => {
  const source = (id: number, slug: string, nameAr: string, kind: string, androidPackages: string[], extra = {}) => ({
    id,
    slug,
    kind,
    nameAr,
    nameEn: slug.toUpperCase(),
    countries: ["EG"],
    androidPackages,
    senderIds: [],
    aliases: [],
    notes: null,
    priority: id,
    status: "active",
    origin: "seed",
    adminEditedAt: null,
    ...extra,
  });
  return {
    catalog: {
      version: "abc.1",
      sources: [
        source(1, "vodafone_cash", "فودافون كاش", "wallet", ["com.emeint.android.myservices"]),
        source(2, "cib", "البنك التجاري الدولي", "bank", ["com.cibeg.ddc1.digitalbanking.live"], { adminEditedAt: "2026-10-20T10:00:00Z" }),
      ],
      subscriptions: [
        {
          id: 1,
          slug: "netflix",
          name: "Netflix",
          nameAr: "نتفليكس",
          kind: "service",
          matchTokens: ["netflix.com", "netflix"],
          categoryId: "subscriptions",
          subCategoryId: "streaming",
          cycle: "monthly",
          status: "active",
          origin: "seed",
          adminEditedAt: null,
        },
      ],
    },
    calls: { saveSource: [] as unknown[], setSourceStatus: [] as unknown[], restoreSeed: [] as unknown[] },
  };
});

const { mutation } = vi.hoisted(() => ({
  /** A mutation hook whose calls are recorded under `name`. */
  mutation: (name: "saveSource" | "setSourceStatus" | "restoreSeed" | "other") => ({
    useMutation: () => ({
      isPending: false,
      mutate: (input: unknown) => {
        if (name !== "other") calls[name].push(input);
      },
    }),
  }),
}));

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({ captureAdmin: { catalog: { invalidate: () => undefined } } }),
    captureAdmin: {
      catalog: { useQuery: () => ({ data: catalog, isLoading: false }) },
      syncSeed: mutation("other"),
      saveSource: mutation("saveSource"),
      setSourceStatus: mutation("setSourceStatus"),
      saveSubscription: mutation("other"),
      setSubscriptionStatus: mutation("other"),
      restoreSeed: mutation("restoreSeed"),
    },
  },
}));

import { AdminCaptureTab } from "./AdminCaptureTab";

beforeEach(() => {
  calls.saveSource.length = 0;
  calls.setSourceStatus.length = 0;
  calls.restoreSeed.length = 0;
});

describe("AdminCaptureTab", () => {
  it("lists the sources with their confirmed apps, and says when no sender id is confirmed yet", () => {
    render(<AdminCaptureTab />);
    expect(screen.getByText("فودافون كاش")).toBeInTheDocument();
    expect(screen.getByText("com.cibeg.ddc1.digitalbanking.live")).toBeInTheDocument();
    expect(screen.getAllByText("لسه مش مؤكد")).toHaveLength(2);
    expect(screen.getByText("النسخة: abc.1")).toBeInTheDocument();
  });

  it("finds a source by the name of its app", () => {
    render(<AdminCaptureTab />);
    fireEvent.change(screen.getByPlaceholderText("دوّر بالاسم أو اسم التطبيق"), { target: { value: "emeint" } });
    expect(screen.getByText("فودافون كاش")).toBeInTheDocument();
    expect(screen.queryByText("البنك التجاري الدولي")).not.toBeInTheDocument();
  });

  it("switches a source off, and gives an edited seeded source back as shipped", () => {
    render(<AdminCaptureTab />);
    fireEvent.click(screen.getByRole("switch", { name: "شغّال: فودافون كاش" }));
    expect(calls.setSourceStatus).toEqual([{ id: 1, status: "disabled" }]);
    fireEvent.click(screen.getByRole("button", { name: "رجّع البنك التجاري الدولي زي الأصلي" }));
    expect(calls.restoreSeed).toEqual([{ table: "source", id: 2 }]);
    expect(screen.queryByRole("button", { name: "رجّع فودافون كاش زي الأصلي" })).not.toBeInTheDocument();
  });

  it("saves an edit with one value per line", () => {
    render(<AdminCaptureTab />);
    fireEvent.click(screen.getByRole("button", { name: "عدّل البنك التجاري الدولي" }));
    const dialog = screen.getByRole("dialog");
    const senders = within(dialog).getByLabelText("أسماء الراسل في الـ SMS (من رسالة حقيقية)");
    fireEvent.change(senders, { target: { value: "CIB\nCIB EG\n" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "احفظ" }));
    expect(calls.saveSource).toEqual([
      {
        id: 2,
        item: expect.objectContaining({
          slug: "cib",
          androidPackages: ["com.cibeg.ddc1.digitalbanking.live"],
          senderIds: ["CIB", "CIB EG"],
          status: "active",
        }),
      },
    ]);
  });
});
