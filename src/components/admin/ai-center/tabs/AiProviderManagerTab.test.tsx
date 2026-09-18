/** @vitest-environment jsdom */
/**
 * The provider card tells the admin what the server knows about each key: whether any configured secret opens
 * it, whether it still depends on JWT_SECRET, and — for a key nothing opens — a way to enter it again without
 * deleting the provider and its models. The dot beside the name used to be green for every provider.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mutateCalls: unknown[] = [];
const invalidate = vi.fn();

let providers: Array<Record<string, unknown>> = [];

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/providers/trpc", () => {
  const mutation = () => ({
    mutate: (input: unknown) => mutateCalls.push(input),
    mutateAsync: async (input: unknown) => mutateCalls.push(input),
    isPending: false,
  });
  return {
    trpc: {
      useUtils: () => ({ admin: { getAiProviders: { invalidate } } }),
      admin: {
        getAiProviders: { useQuery: () => ({ data: providers, refetch: vi.fn() }) },
        getAiModels: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
        addAiProvider: { useMutation: mutation },
        deleteAiProvider: { useMutation: mutation },
        updateAiProvider: { useMutation: mutation },
        discoverProviderModels: { useMutation: mutation },
        saveAiModels: { useMutation: mutation },
      },
    },
  };
});

import { AiProviderManagerTab } from "./AiProviderManagerTab";

function provider(overrides: Record<string, unknown>) {
  return {
    id: 1,
    slug: "openrouter",
    displayName: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyMasked: "••••••••abcd",
    supportsModelDiscovery: true,
    isActive: true,
    priority: 1,
    healthStatus: "healthy",
    keyState: "sealed",
    keySecret: "AI_GATEWAY_SECRET",
    ...overrides,
  };
}

beforeEach(() => {
  mutateCalls.length = 0;
  invalidate.mockReset();
});

describe("the provider card", () => {
  it("says which secret each key is on, and which key nothing opens", () => {
    providers = [
      provider({ id: 1, displayName: "OpenRouter" }),
      provider({ id: 2, displayName: "Groq", keySecret: "JWT_SECRET" }),
      provider({ id: 3, displayName: "NVIDIA", keyState: "unreadable", keySecret: null, apiKeyMasked: "••••••••" }),
    ];
    render(<AiProviderManagerTab />);

    expect(screen.getByText("المفتاح محمي بـ AI_GATEWAY_SECRET")).toBeInTheDocument();
    expect(screen.getByText(/المفتاح مشفّر بـ JWT_SECRET/)).toBeInTheDocument();
    expect(screen.getByText(/لا يفتح أي سر مضبوط على السيرفر هذا المفتاح/)).toBeInTheDocument();
  });

  it("colours the dot by what the provider can do, not green for everyone", () => {
    providers = [
      provider({ id: 1, displayName: "Working" }),
      provider({ id: 2, displayName: "Unreadable", keyState: "unreadable", keySecret: null }),
      provider({ id: 3, displayName: "Untried", healthStatus: "unknown" }),
    ];
    render(<AiProviderManagerTab />);

    expect(screen.getByLabelText("يعمل")).toHaveClass("bg-emerald-500");
    expect(screen.getByLabelText("لا يعمل")).toHaveClass("bg-rose-500");
    expect(screen.getByLabelText("لم يُستدعَ بعد")).toHaveClass("bg-slate-500");
  });

  it("enters a key again without deleting the provider", () => {
    providers = [provider({ id: 7, displayName: "NVIDIA", keyState: "unreadable", keySecret: null })];
    render(<AiProviderManagerTab />);

    fireEvent.click(screen.getByRole("button", { name: "تغيير المفتاح" }));
    fireEvent.change(screen.getByLabelText("المفتاح الجديد لـ NVIDIA"), { target: { value: "  nvapi-new-key  " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(mutateCalls).toEqual([{ id: 7, apiKey: "nvapi-new-key" }]);
  });
});
