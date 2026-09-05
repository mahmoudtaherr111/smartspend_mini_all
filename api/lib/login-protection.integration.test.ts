const runIntegration =
  process.env.RUN_REDIS_INTEGRATION === "1" && Boolean(process.env.REDIS_URL);
const describeRedisIntegration = runIntegration ? describe : describe.skip;

describeRedisIntegration("login protection with real Redis", () => {
  it("enforces failure-only account backoff atomically in the shared store", async () => {
    const {
      beginLoginAttempt,
      recordLoginFailure,
      resetLoginProtectionForTests,
    } = await import("./login-protection");
    const { getRedisClient } = await import("./redis-client");
    const client = await getRedisClient();
    if (!client) {
      throw new Error("Redis integration requires a running REDIS_URL");
    }

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const touchedKeys = new Set<string>();

    try {
      for (let index = 0; index < 5; index++) {
        const attempt = await beginLoginAttempt({
          ip: `198.51.100.${20 + index}`,
          accountIdentifier: `integration-account-${nonce}`,
          requestId: `redis-integration-${index}`,
        });
        Object.values(attempt.keys).forEach((key) => touchedKeys.add(key));
        expect(attempt).toMatchObject({ allowed: true, backend: "redis" });
        await recordLoginFailure(attempt);
      }

      const blocked = await beginLoginAttempt({
        ip: "198.51.100.99",
        accountIdentifier: `integration-account-${nonce}`,
        requestId: "redis-integration-blocked",
      });
      Object.values(blocked.keys).forEach((key) => touchedKeys.add(key));
      expect(blocked).toMatchObject({
        allowed: false,
        backend: "redis",
        reason: "account_backoff",
        remaining: 0,
      });
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    } finally {
      if (touchedKeys.size > 0) await client.del([...touchedKeys]);
      resetLoginProtectionForTests();
      if ("destroy" in client && typeof client.destroy === "function") {
        client.destroy();
      } else {
        await client.disconnect().catch(() => undefined);
      }
    }
  });

  it("atomically caps concurrent credential work across requests", async () => {
    const {
      beginLoginAttempt,
      releaseLoginAttempt,
      resetLoginProtectionForTests,
    } = await import("./login-protection");
    const { getRedisClient } = await import("./redis-client");
    const client = await getRedisClient();
    if (!client)
      throw new Error("Redis integration requires a running REDIS_URL");

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const attempts = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        beginLoginAttempt({
          ip: `203.0.113.${100 + index}`,
          accountIdentifier: `concurrent-account-${nonce}`,
          requestId: `redis-concurrency-${index}`,
        }),
      ),
    );
    const touchedKeys = new Set(
      attempts.flatMap((attempt) => Object.values(attempt.keys)),
    );

    try {
      expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(3);
      expect(attempts.find((attempt) => !attempt.allowed)).toMatchObject({
        reason: "concurrency_limit",
        backend: "redis",
      });
      await Promise.all(
        attempts
          .filter((attempt) => attempt.allowed)
          .map((attempt) => releaseLoginAttempt(attempt)),
      );
    } finally {
      if (touchedKeys.size > 0) await client.del([...touchedKeys]);
      resetLoginProtectionForTests();
      if ("destroy" in client && typeof client.destroy === "function") {
        client.destroy();
      } else {
        await client.disconnect().catch(() => undefined);
      }
    }
  });
});
