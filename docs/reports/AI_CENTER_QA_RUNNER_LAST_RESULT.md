# AI Center QA Runner Last Result

Generated: 2026-08-23T14:15:03.052Z
Status: FAIL

## Seed

- User: AI Center QA Seed / 01055501999 / id 1
- Expenses: 11
- Wallets: 1
- Goals: 1
- Active memories: 5
- Embeddings: 5
- Embedding backfill: scanned=5, inserted=0, skippedExisting=5, skippedFallback=0, failed=0, model=accounts/fireworks/models/qwen3-embedding-8b, dimensions=768

## Cases

### PASS - chat finance today uses SQL facts without embedding

- Duration: 41 ms

```json
{
  "traceId": "aik_mt5w2oxa_v2z87t",
  "intent": "finance_query",
  "needs": [
    "finance.summary"
  ],
  "factCount": 8,
  "artifactTypes": [],
  "tokensUsed": 0,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:summary:today:2026-08-23:2026-08-23:salary_1"
  ],
  "embeddingRows": 0,
  "contentPreview": "في اليوم، صرفت ٢١٥٫٥ جنيه من ٣ عملية. الدخل المسجل ٠ جنيه، والصافي ؜-٢١٥٫٥ جنيه."
}
```

### PASS - chat food current month returns category total and evidence rows

- Duration: 64 ms

```json
{
  "traceId": "aik_mt5w2oyf_m6sbth",
  "intent": "finance_query",
  "needs": [
    "finance.category_total",
    "finance.transactions"
  ],
  "factCount": 11,
  "artifactTypes": [],
  "tokensUsed": 0,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:category_total:current_month:2026-08-01:2026-08-31:salary_1:food",
    "finance_cache:miss:redis:transactions:current_month:2026-08-01:2026-08-31:salary_1:food:expense:12"
  ],
  "embeddingRows": 0,
  "contentPreview": "في الشهر الحالي، إجمالي صرفك على أكل وشرب هو ٥٥١٫٢٥ جنيه من ٣ عملية.\nالعمليات اللي دخلت في الرقم:\nLunch: ١٢٠ جنيه\nMorning coffee: ٥٥٫٥ جنيه\nGroceries: ٣٧٥٫٧٥ جنيه"
}
```

### FAIL - chat memory recall uses Fireworks Qwen vector retrieval

- Duration: 796 ms
- Error: Expected embedding:fireworks trace, got memory_cache:miss:redis, query_reformulated:goal_or_saving_query+car_goal_query, embedding:query_embedded, embedding:fallback:fireworks_embedding_failed_accounts/fireworks/models/qwen3-embedding-8b:412, embedding:rows:5

### PASS - chat chart request returns chart artifact

- Duration: 32 ms

```json
{
  "traceId": "aik_mt5w2pmb_y4z5ro",
  "intent": "chart_request",
  "needs": [
    "chart.data"
  ],
  "factCount": 0,
  "artifactTypes": [
    "chart"
  ],
  "tokensUsed": 0,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:chart_data:custom:2026-03-01:2026-08-23:salary_1:food:month:12"
  ],
  "embeddingRows": 0,
  "contentPreview": "جهزت لك الرسم البياني من بياناتك الفعلية. تقدر تراجعه في البطاقة المعروضة تحت الرسالة."
}
```

### PASS - chat site guide answers from local product guide

- Duration: 29 ms

```json
{
  "traceId": "aik_mt5w2pn7_oid74q",
  "intent": "site_help",
  "needs": [
    "site_guide.search"
  ],
  "factCount": 4,
  "artifactTypes": [
    "text_block",
    "text_block"
  ],
  "tokensUsed": 0,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "static_local",
  "retrievalPolicy": {
    "embedding": "static_local",
    "reason": "site_guide_uses_zero_api_static_256_vectors",
    "dimensions": 256
  },
  "cacheHits": [
    "site_guide:static_256"
  ],
  "embeddingRows": 0,
  "contentPreview": "أيوه، الربط هنا بيتم على خطوتين أساسيتين:\n- ربط الفيزا أو البطاقة داخل SmartSpend\n- ربط رسائل SMS لاستخراج المصاريف تلقائيا\nابدأ بإنشاء حساب/بطاقة باسم الفيزا أو البنك، وبعدها فعّل"
}
```

### PASS - voice finance tool uses exact hot summary

- Duration: 14 ms

```json
{
  "ok": true,
  "tool": "finance_query",
  "factCount": 8,
  "artifactTypes": [],
  "dataNeeds": [
    "finance.summary"
  ],
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:hit:redis:summary:today:2026-08-23:2026-08-23:salary_1"
  ],
  "embeddingRows": 0,
  "result": {
    "errors": [],
    "factCount": 8,
    "artifactCount": 0
  }
}
```

### FAIL - voice memory tool uses same vector memory

- Duration: 4 ms
- Error: Expected voice memory fireworks_qwen, got fallback

### PASS - voice action draft requires confirmation

- Duration: 10 ms

```json
{
  "ok": true,
  "tool": "action_draft",
  "factCount": 0,
  "artifactTypes": [],
  "dataNeeds": [],
  "cacheHits": [],
  "embeddingRows": 0,
  "actionStatus": "pending_confirmation",
  "result": {
    "requiresConfirmation": true,
    "requiresUiConfirmation": false,
    "instruction": "Ask the user for explicit confirmation before calling action_confirm."
  }
}
```
