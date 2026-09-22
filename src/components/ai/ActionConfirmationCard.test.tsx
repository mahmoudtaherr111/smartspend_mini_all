/** @vitest-environment jsdom */
/**
 * The card of an action that cannot be taken back waits for its words before it lets the user confirm, and hands
 * them to the server, which checks them again. A medium action still confirms with one tap.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/providers/trpc", () => ({ trpc: {} }));

import { ActionConfirmationCard } from "./AIChatbot";

function card(payload: Record<string, unknown>) {
  return {
    id: "action_confirmation:9",
    type: "action_confirmation" as const,
    title: "إيقاف هدف",
    payload: { actionId: 9, summary: "إيقاف هدف العربية", fields: {}, ...payload },
  };
}

describe("the action card", () => {
  it("keeps the confirm button shut until the words are typed, then sends them", () => {
    const onConfirm = vi.fn();
    render(
      <ActionConfirmationCard
        artifact={card({ risk: "high", confirmationPhrase: "أوقف الهدف" })}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirm = screen.getByRole("button", { name: /تأكيد/ });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("اكتب أوقف الهدف للتأكيد"), { target: { value: "اوقف الهدف" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(9, "اوقف الهدف");
  });

  it("confirms a medium action with one tap", () => {
    const onConfirm = vi.fn();
    render(<ActionConfirmationCard artifact={card({ risk: "medium" })} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /تأكيد/ }));
    expect(onConfirm).toHaveBeenCalledWith(9, undefined);
  });
});
