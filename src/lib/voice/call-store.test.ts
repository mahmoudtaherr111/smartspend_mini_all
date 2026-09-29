// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const controllers = vi.hoisted(() => [] as Array<{ end: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>);

vi.mock("./audio-io", () => ({
  primeCallAudio: () => ({ context: { close: async () => undefined }, mic: Promise.resolve({ getTracks: () => [] }) }),
}));
vi.mock("./call-controller", () => ({
  VoiceCallController: class {
    end = vi.fn();
    dispose = vi.fn();
    constructor(private readonly options: { getView(): object; setView(view: object): void }) {
      controllers.push(this);
    }
    async start() {
      this.options.setView({ ...this.options.getView(), phase: "live", callId: "vc_previousaccount", timeline: [{ kind: "caption", role: "user", text: "دفعت خمسين" }] });
    }
  },
}));

import { voiceCall } from "./call-store";

describe("the call when the account goes away", () => {
  beforeEach(() => {
    controllers.length = 0;
    localStorage.setItem("smartspend_voice_intro_v1", "1");
  });

  it("ends the call, closes the microphone and the line, and leaves nothing on screen", async () => {
    voiceCall.open({ client: "web" } as never);
    await vi.waitFor(() => expect(voiceCall.getView().phase).toBe("live"));
    voiceCall.signOut();
    expect(controllers[0].end).toHaveBeenCalledTimes(1);
    expect(controllers[0].dispose).toHaveBeenCalledTimes(1);
    expect(voiceCall.getView()).toMatchObject({ phase: "idle", callId: null, timeline: [] });
    // Nothing to restart for the next account.
    voiceCall.restart();
    expect(voiceCall.getView().phase).toBe("idle");
  });
});
