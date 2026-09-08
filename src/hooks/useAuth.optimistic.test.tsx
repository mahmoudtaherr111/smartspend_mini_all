/** @vitest-environment jsdom */
/**
 * The session check used to hold the whole app on a skeleton until the network
 * answered, and the persisted-cache provider mounted only afterwards — which
 * tore the React tree down and rebuilt it. These cases pin the replacement:
 * a returning session is renderable on the first frame, at a cache scope that
 * does not change when the server confirms it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const authMeQuery = vi.fn();
const localAuthMeQuery = vi.fn();

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: { me: { invalidate: vi.fn(), setData: vi.fn() } },
      localAuth: { me: { invalidate: vi.fn(), setData: vi.fn() } },
    }),
    auth: {
      me: { useQuery: (...args: unknown[]) => authMeQuery(...args) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    localAuth: {
      me: { useQuery: (...args: unknown[]) => localAuthMeQuery(...args) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

const IDENTITY_KEY = "smartspend_offline_identity_v1";

/** The session check is still in flight — nothing has come back yet. */
function pending() {
  return { data: undefined, isFetched: false, refetch: vi.fn() };
}

/** The server answered: `data` is the account, or null for signed out. */
function answered(data: unknown) {
  return { data, isFetched: true, refetch: vi.fn() };
}

function writeSnapshot(plan?: "free" | "pro" | "ultra") {
  localStorage.setItem(
    IDENTITY_KEY,
    JSON.stringify({
      id: 42,
      type: "oauth",
      name: "محمود",
      avatar: null,
      ...(plan ? { plan } : {}),
      savedAt: Date.now(),
    }),
  );
}

async function loadUseAuth() {
  return (await import("./useAuth")).useAuth;
}

describe("useAuth — optimistic session resume", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    authMeQuery.mockReturnValue(pending());
    localAuthMeQuery.mockReturnValue(pending());
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders a returning session on the first frame, before the network answers", async () => {
    writeSnapshot("pro");
    const useAuth = await loadUseAuth();

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user?.id).toBe(42);
    expect(result.current.hasProAccess).toBe(true);
    // The screen is renderable, but the session is not yet confirmed.
    expect(result.current.isVerified).toBe(false);
  });

  it("still waits when the device has no session to replay", async () => {
    const useAuth = await loadUseAuth();

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("never replays an administrator role from the device", async () => {
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        id: 42,
        type: "oauth",
        name: "محمود",
        plan: "ultra",
        role: "admin",
        savedAt: Date.now(),
      }),
    );
    const useAuth = await loadUseAuth();

    const { result } = renderHook(() => useAuth());

    expect(result.current.user?.role).toBe("user");
    expect(result.current.isAdmin).toBe(false);
  });

  it("keeps the cache scope identical across confirmation, so the tree is never rebuilt", async () => {
    writeSnapshot("pro");
    const useAuth = await loadUseAuth();
    const { getQueryCacheScope } = await import("@/lib/queryPersister");

    const { result, rerender } = renderHook(() => useAuth());
    const scopeBefore = getQueryCacheScope(result.current.user!);

    await act(async () => {
      authMeQuery.mockReturnValue(
        answered({
          id: 42,
          name: "محمود",
          email: "m@example.com",
          avatar: null,
          role: "user",
          plan: "pro",
          createdAt: null,
        }),
      );
      localAuthMeQuery.mockReturnValue(answered(null));
      rerender();
    });

    expect(result.current.isVerified).toBe(true);
    expect(getQueryCacheScope(result.current.user!)).toBe(scopeBefore);
  });

  it("corrects a tier the server disagrees with, and records the new one", async () => {
    writeSnapshot("ultra");
    const useAuth = await loadUseAuth();

    const { result, rerender } = renderHook(() => useAuth());
    expect(result.current.hasUltraAccess).toBe(true);

    await act(async () => {
      authMeQuery.mockReturnValue(
        answered({
          id: 42,
          name: "محمود",
          email: "m@example.com",
          avatar: null,
          role: "user",
          plan: "free",
          createdAt: null,
        }),
      );
      localAuthMeQuery.mockReturnValue(answered(null));
      rerender();
    });

    expect(result.current.hasUltraAccess).toBe(false);
    expect(result.current.hasProAccess).toBe(false);
    expect(JSON.parse(localStorage.getItem(IDENTITY_KEY)!).plan).toBe("free");
  });

  it("drops the replayed session when the server says it is signed out", async () => {
    writeSnapshot("pro");
    const useAuth = await loadUseAuth();

    const { result, rerender } = renderHook(() => useAuth());
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      authMeQuery.mockReturnValue(answered(null));
      localAuthMeQuery.mockReturnValue(answered(null));
      rerender();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isVerified).toBe(true);
    // Nothing is left to replay on the next launch.
    expect(localStorage.getItem(IDENTITY_KEY)).toBeNull();
  });
});
