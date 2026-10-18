/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
  logout: vi.fn(async () => undefined),
  userType: "local" as "local" | "oauth",
  deleteOptions: {} as { onSuccess?: () => Promise<void> | void },
  mutation: () => ({ mutate: () => undefined, isPending: false }),
}));

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    ai: { getUserLimits: { useQuery: () => ({ data: undefined }) } },
    profile: {
      getSmartProfile: { useQuery: () => ({ data: undefined }) },
      updateUserInfo: { useMutation: state.mutation },
      submitOnboardingAnswer: { useMutation: state.mutation },
      deleteMyAccount: {
        useMutation: (options: typeof state.deleteOptions) => {
          state.deleteOptions = options;
          return { mutate: state.deleteMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "منى", role: "user", plan: "free", type: state.userType },
    logout: state.logout,
  }),
}));

import { ProfileScreen } from "./ProfileScreen";

function openDelete() {
  render(
    <MemoryRouter>
      <ProfileScreen />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getAllByText("حذف الحساب")[0]);
}

describe("deleting the account from the profile", () => {
  beforeEach(() => {
    state.deleteMutate.mockClear();
    state.logout.mockClear();
    state.userType = "local";
  });

  it("deletes only after the phrase and, for a phone account, the password", async () => {
    openDelete();
    const confirm = await screen.findByRole("button", { name: "احذف الحساب نهائيًا" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-account-phrase"), { target: { value: "احذف حسابي" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("delete-account-password"), { target: { value: "secret" } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(state.deleteMutate).toHaveBeenCalledWith({ confirmation: "احذف حسابي", password: "secret" });

    await state.deleteOptions.onSuccess?.();
    await waitFor(() => expect(state.logout).toHaveBeenCalledTimes(1));
  });

  it("asks a Google account for the phrase only", async () => {
    state.userType = "oauth";
    openDelete();
    await screen.findByTestId("delete-account-phrase");
    expect(screen.queryByTestId("delete-account-password")).toBeNull();
    fireEvent.change(screen.getByTestId("delete-account-phrase"), { target: { value: "احذف حسابي" } });
    fireEvent.click(screen.getByRole("button", { name: "احذف الحساب نهائيًا" }));
    expect(state.deleteMutate).toHaveBeenCalledWith({ confirmation: "احذف حسابي", password: undefined });
  });
});
