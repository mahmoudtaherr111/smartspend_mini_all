# AI Center Redis Setup

Date: 2026-06-15

Redis is the production hot-cache/session layer for the AI Center. It is not the long-term vector database; memory vectors stay in the database/vector store, while Redis is used for hot finance queries, memory retrieval cache, voice session state, embedding query cache, and invalidation.

## Local Development

If Redis is not configured locally, the app intentionally uses the in-process RAM fallback in development and test:

```env
NODE_ENV=development
REDIS_URL=
```

Expected trace:

```text
cache backend -> memory / redis off / ram <count>
```

To test with real Redis locally, start Redis and set:

```env
REDIS_URL=redis://localhost:6379
```

Then restart the dev server.

## Windows Options

Use one of these:

```powershell
docker run --name smartspend-redis -p 6379:6379 -d redis:7-alpine
```

or install Redis through WSL/Linux and expose port `6379`.

Quick connectivity check:

```powershell
docker exec smartspend-redis redis-cli ping
```

Expected output:

```text
PONG
```

## Production Rule

Production must not silently use process RAM:

```env
NODE_ENV=production
REDIS_URL=redis://...
AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION=false
```

If `REDIS_URL` is missing in production, cacheable work recomputes and traces report `backend=disabled`.

## Verification

Run:

```powershell
npm run check
npm test
```

Real Redis integration gate:

```powershell
$env:REDIS_URL="redis://localhost:6379"
npm run test:redis
```

Expected when Redis is running:

```text
backend: redis
miss -> hit -> delete pattern -> miss
```

If this fails with `ECONNREFUSED 127.0.0.1:6379` / `::1:6379`, the app code reached the real Redis gate but no Redis server is listening. Start Redis first, then rerun `npm run test:redis`.

Browser QA signals:

- Chat finance trace should show cache backend `redis` after Redis is configured.
- Repeated finance hot queries should move from `finance_cache:miss:redis...` to `finance_cache:hit:redis...`.
- Repeated memory search should preserve semantic provenance while showing memory cache hit:

```text
memory_cache:hit:redis
embedding:fireworks
embedding:rows:<n>
embeddingCalls=0
```

Voice session state in production requires Redis unless an explicit emergency override is set.
