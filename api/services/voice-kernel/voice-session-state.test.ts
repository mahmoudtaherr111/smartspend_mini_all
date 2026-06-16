async function loadVoiceSessionState(memoryFallbackAllowed: boolean) {
  vi.resetModules();
  vi.doMock("../../lib/redis-client", () => ({
    getRedisClient: vi.fn(async () => null),
    getCacheRuntimeStatus: vi.fn(() => ({
      backend: memoryFallbackAllowed ? "memory" : "disabled",
      memoryEntries: 0,
      memoryFallbackAllowed,
      redisConfigured: false,
      redisConnected: false,
    })),
  }));
  return import("./voice-session-state");
}

describe("voice session state cache policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("../../lib/redis-client");
  });

  it("uses memory session state only when cache runtime allows the fallback", async () => {
    const { createVoiceSessionState, getVoiceSessionState, voiceSessionTestUtils } =
      await loadVoiceSessionState(true);
    voiceSessionTestUtils.clearMemoryStore();

    const session = await createVoiceSessionState({
      userId: 1,
      userType: "local",
      userPlan: "free",
    });

    expect(await getVoiceSessionState(session.sessionId)).toMatchObject({
      sessionId: session.sessionId,
      userId: 1,
      userType: "local",
      status: "active",
    });
  });

  it("refuses silent in-process session state when production cache fallback is disabled", async () => {
    const { createVoiceSessionState, getVoiceSessionState } = await loadVoiceSessionState(false);

    await expect(
      createVoiceSessionState({
        userId: 1,
        userType: "local",
        userPlan: "free",
      }),
    ).rejects.toThrow("Voice session state requires Redis");

    await expect(getVoiceSessionState("voice_missing")).resolves.toBeNull();
  });
});
