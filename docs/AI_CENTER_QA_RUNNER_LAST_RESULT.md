# AI Center QA Runner Last Result

Generated: 2026-06-21T20:50:41.908Z
Status: PASS

## Seed

- User: AI Center QA Seed / 01055501999 / id 1
- Expenses: 11
- Wallets: 1
- Goals: 1
- Active memories: 2
- Embeddings: 2
- Embedding backfill: scanned=2, inserted=0, skippedExisting=2, skippedFallback=0, failed=0, model=accounts/fireworks/models/qwen3-embedding-8b, dimensions=768

## Cases

### PASS - chat finance today uses SQL facts without embedding

- Duration: 29 ms

```json
{
  "traceId": "aik_mqo9gun5_eeahfn",
  "intent": "finance_query",
  "needs": [
    "finance.summary"
  ],
  "factCount": 8,
  "artifactTypes": [],
  "tokensUsed": 92,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:summary:today:2026-06-21:2026-06-21:salary_1"
  ],
  "embeddingRows": 0,
  "contentPreview": "في اليوم، صرفت ٣٨٥٫٥ جنيه من ٦ عملية. الدخل المسجل ٠ جنيه، والصافي ؜-٣٨٥٫٥ جنيه."
}
```

### PASS - chat food current month returns category total and evidence rows

- Duration: 16 ms

```json
{
  "traceId": "aik_mqo9gunx_5qk4kn",
  "intent": "finance_query",
  "needs": [
    "finance.category_total",
    "finance.transactions"
  ],
  "factCount": 20,
  "artifactTypes": [],
  "tokensUsed": 181,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:category_total:current_month:2026-06-01:2026-06-30:salary_1:food",
    "finance_cache:miss:redis:transactions:current_month:2026-06-01:2026-06-30:salary_1:food:expense:12"
  ],
  "embeddingRows": 0,
  "contentPreview": "في الشهر الحالي، إجمالي صرفك على الأكل هو ٣٬٠٦٥٫٢٥ جنيه من ١٤ عملية.\nالعمليات اللي دخلت في الرقم:\nجبت ب منهم شيبسي: ٥٠ جنيه\nدومتي: ٢٠ جنيه\nLunch: ١٢٠ جنيه\nMorning coffee: ٥٥٫٥ جنيه"
}
```

### PASS - chat memory recall uses Fireworks Qwen vector retrieval

- Duration: 11 ms

```json
{
  "intent": "memory_question",
  "needs": [
    "memory.search"
  ],
  "factCount": 2,
  "artifactTypes": [],
  "retrievalPolicy": {
    "embedding": "fireworks_qwen",
    "vectorRows": 2
  },
  "cacheHits": [
    "memory_cache:miss:redis",
    "query_reformulated:goal_or_saving_query+car_goal_query",
    "embedding:query_cache_hit",
    "embedding:fireworks",
    "embedding:rows:2"
  ],
  "embeddingRows": 2,
  "selected": [
    "اتفقنا على coffee plan: أقلل القهوة من 5 مرات يوميا إلى مرتين فقط، وأحول الفرق لهدف العربية.",
    "مهم تفتكر sleep plan: عايز أنام قبل 12 بالليل عشان مصاريف الدليفري آخر الليل بتزيد."
  ],
  "errors": []
}
```

### PASS - chat chart request returns chart artifact

- Duration: 10 ms

```json
{
  "traceId": "aik_mqo9guoo_hvu2ju",
  "intent": "chart_request",
  "needs": [
    "chart.data"
  ],
  "factCount": 0,
  "artifactTypes": [
    "chart"
  ],
  "tokensUsed": 115,
  "llmCalls": 0,
  "embeddingCalls": 0,
  "embeddingApiStatus": "skipped",
  "retrievalPolicy": {
    "embedding": "skipped",
    "reason": "structured_sql_or_cached_facts_do_not_need_embedding"
  },
  "cacheHits": [
    "finance_cache:miss:redis:chart_data:custom:2026-01-01:2026-06-21:salary_1:food:month:12"
  ],
  "embeddingRows": 0,
  "contentPreview": "جهزت لك الرسم البياني من بياناتك الفعلية. تقدر تراجعه في البطاقة المعروضة تحت الرسالة."
}
```

### PASS - chat site guide answers from local product guide

- Duration: 6 ms

```json
{
  "traceId": "aik_mqo9guoy_hkjmuc",
  "intent": "site_help",
  "needs": [
    "site_guide.search"
  ],
  "factCount": 4,
  "artifactTypes": [
    "text_block",
    "text_block"
  ],
  "tokensUsed": 163,
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

- Duration: 6 ms

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
    "finance_cache:hit:redis:summary:today:2026-06-21:2026-06-21:salary_1"
  ],
  "embeddingRows": 0,
  "result": {
    "errors": [],
    "factCount": 8,
    "artifactCount": 0
  }
}
```

### PASS - voice memory tool uses same vector memory

- Duration: 2 ms

```json
{
  "ok": true,
  "tool": "memory_search",
  "factCount": 2,
  "artifactTypes": [],
  "dataNeeds": [
    "memory.search"
  ],
  "embeddingApiStatus": "semantic_result_cache_hit",
  "retrievalPolicy": {
    "embedding": "fireworks_qwen",
    "reason": "memory_search_semantic_retrieval",
    "vectorRows": 2
  },
  "cacheHits": [
    "memory_cache:hit:redis",
    "query_reformulated:goal_or_saving_query+car_goal_query",
    "embedding:query_cache_hit",
    "embedding:fireworks",
    "embedding:rows:2"
  ],
  "embeddingRows": 2,
  "result": {
    "query": "coffee plan sleep plan هدف العربية",
    "selected": [
      "اتفقنا على coffee plan: أقلل القهوة من 5 مرات يوميا إلى مرتين فقط، وأحول الفرق لهدف العربية.",
      "مهم تفتكر sleep plan: عايز أنام قبل 12 بالليل عشان مصاريف الدليفري آخر الليل بتزيد."
    ],
    "errors": []
  }
}
```

### PASS - voice action draft requires confirmation

- Duration: 4 ms

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
