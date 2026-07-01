# 🏗️ SmartSpend AI — مخطط سير التصنيف الكامل

> هذا الملف يوثق مسار التصنيف بالتفصيل الممل — من لحظة كتابة المستخدم للنص
> حتى حفظ العملية في قاعدة البيانات.

---

## 📊 الرسم التخطيطي العام (Bird's Eye View)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         👤 المستخدم يكتب                            │
│  "بنزين 200" أو "فطرت بـ 50 وركبت اوبر 80" أو "7awalte le a7mad 500" │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  ⓪ Classification  │  ← lru-cache (7 أيام TTL)
                    │     Cache Hit?     │     مفتاح = userId:plan:normalizedText
                    └─────────┬───────────┘
                              │
                    ┌─────────┴─────────┐
                    │ Yes → إرجاع فوري  │
                    │ No  → متابعة ↓    │
                    └─────────┬─────────┘
                              │ No
                              ▼
                    ┌─────────────────────┐
                    │  ⓵ Muscle Memory    │  ← DB classification_logs (90 يوم)
                    │  Pattern Match?    │     template similarity ≥ 85%
                    └─────────┬───────────┘
                              │
                    ┌─────────┴─────────┐
                    │ Yes → auto_save   │
                    │ No  → متابعة ↓    │
                    └─────────┬─────────┘
                              │ No
                              ▼
                    ┌─────────────────────┐
                    │  ⓶ Pre-Filter       │  ← فحص: فيه مبلغ؟ فيه فعل مالي؟
                    │  Reject non-finance│     12+ كلمة مفتاحية
                    └─────────┬───────────┘
                              │
                    ┌─────────┴─────────┐
                    │ Reject → clarify  │
                    │ Accept → متابعة ↓ │
                    └─────────┬─────────┘
                              │ Accept
                              ▼
                    ┌─────────────────────┐
                    │  ⓷ Normalizer V2    │  ← normalizeText (forRules) + normalizeLightForAI
                    │  Dual Output       │     Franco-Arab → Arabic
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  ⓸ Narrative       │  ← decomposeHeuristic (0 tokens)
                    │  Decomposer        │     يقسم الجمل الطويلة على "و" + أفعال
                    └─────────┬───────────┘
                              │
                              ▼
              ┌───────────────────────────────────────┐
              │     ⓹ Rule Engine (7 Steps)           │
              │     (لكل segment من الـ decomposer)    │
              │                                       │
              │  Step 1: User Dictionary (100%)       │
              │  Step 2: Merchant Registry (100%)     │
              │  Step 3: SYNONYM_GRAPH (90-98%)       │
              │  Step 4: Trigram/Bigram Match (87-92%)│
              │  Step 5: Single-word Dictionary (78-85%)│
              │  Step 6: Damerau Fuzzy Match (55%)    │
              │  Step 7: Local Semantic Engine (80%)  │
              │         ↑ n-gram TF + damerau         │
              │                                       │
              │  + Disambiguation Layer               │
              │    (عربية، نور، سيف، تذكرة، شراب، كفر) │
              │                                       │
              │  + Ambiguity Scorer (context-aware)   │
              │    (باقة + نت → skip penalty)         │
              │                                       │
              │  + Profile Hints                      │
              │    (أطفال → تعليم، عائلة → بقالة)     │
              └───────────────────┬───────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │ confidence ≥ 85 │         │ confidence < 85 │
          │ → auto_save     │         │ → متابعة ↓      │
          │ 0 tokens, 0 API │         │                 │
          └─────────────────┘         └────────┬────────┘
                                               │
                                               ▼
                               ┌─────────────────────────┐
                               │  ⓺ Fireworks Embedding   │
                               │  qwen3-embedding-8b     │
                               │  + Instruct Prefix      │
                               │  92% accuracy           │
                               │                         │
                               │  LRU cache (24h)        │
                               │  Descriptor index       │
                               │  (pre-built at boot)    │
                               │                         │
                               │  Skip if person context │
                               └────────────┬────────────┘
                                            │
                               ┌────────────┴────────────┐
                               │                         │
                               ▼                         ▼
                     ┌─────────────────┐       ┌─────────────────┐
                     │ score ≥ 70      │       │ API fail/low    │
                     │ → review        │       │ → متابعة ↓      │
                     │ 1 API call      │       │                 │
                     └─────────────────┘       └────────┬────────┘
                                                        │
                                                        ▼
                                       ┌─────────────────────────┐
                                       │  ⓻ AI Generative        │
                                       │  (Gemini/Groq/Fireworks)│
                                       │                         │
                                       │  Category Scorer V3     │
                                       │  → 5-10 فئات للـ prompt │
                                       │                         │
                                       │  System Prompt شامل     │
                                       │  + قواعد عامية مصرية    │
                                       │  + 8 أمثلة              │
                                       │                         │
                                       │  Amount Anchoring       │
                                       │  Decomposition Hints    │
                                       │  RAG (user history)     │
                                       │                         │
                                       │  Retry on 429 (×3)     │
                                       │  Fallback: Key 2 → AI  │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  ⓼ Post-Processing      │
                                       │                         │
                                       │  Person Resolution      │
                                       │  (known → auto,         │
                                       │   unknown → clarify)    │
                                       │                         │
                                       │  Verifier               │
                                       │  (تناقضات، income/expense│
                                       │   conflict، duplicate)  │
                                       │                         │
                                       │  Reverse Mapping        │
                                       │  (إنقاذ المتنوعات)      │
                                       │                         │
                                       │  Normalize Taxonomy     │
                                       │  (توحيد الفئات)         │
                                       │                         │
                                       │  Amount Thresholds      │
                                       │  (مرتب <100 + عيد → عيدية│
                                       │   استثمار <50 → متنوعات)│
                                       │                         │
                                       │  Deduplication          │
                                       │  (إزالة التكرار بين      │
                                       │   rule engine و AI)     │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  ⓽ Decision & Cache     │
                                       │                         │
                                       │  auto_save (≥85%)       │
                                       │  review (60-84%)        │
                                       │  clarify (<60% أو مجهول)│
                                       │                         │
                                       │  Save to cache (7 أيام) │
                                       │  Save to DB log         │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  💾 حفظ في DB            │
                                       │  expenses table          │
                                       │  classification_logs     │
                                       │  → Muscle Memory يتعلم  │
                                       └─────────────────────────┘
```

---

## 🔬 التفصيل الممل لكل خطوة

### ⓪ Classification Cache

**الملف:** `smart-pipeline.ts`

```
المستخدم: "بنزين 200"
         │
         ▼
makeCacheKey("بنزين 200", "free", 1)
  = "cls:1:free:بنزين 200"
         │
         ▼
classificationCache.get("cls:1:free:بنزين 200")
  └─ lru-cache (max: 5000, TTL: 7 أيام)
         │
    ┌────┴────┐
    │         │
  HIT       MISS
    │         │
  إرجاع    متابعة
  فوري     للخطوة ⓵
  <1ms
```

**متى يُحذف الكاش؟**
- `invalidateUserClassificationCache(userId)` — عند تصحيح المستخدم لتصنيف
- TTL انتهى (7 أيام)
- LRU eviction (أكثر من 5000 entry)

---

### ⓵ Muscle Memory

**الملف:** `muscle-memory.ts`

```
المستخدم: "دفعت كهربا 200" (قالها 3 مرات من قبل)
         │
         ▼
textToTemplate("دفعت كهربا 200")
  = "دفعت كهربا {X}"
         │
         ▼
loadUserPatterns(999, "local")
  └─ SELECT FROM classification_logs
     WHERE userId=999 AND createdAt >= 90 days
     ORDER BY createdAt DESC LIMIT 500
         │
         ▼
templateSimilarity("دفعت كهربا {X}", "دفعت كهربا {X}")
  └─ 100% (exact template match)
         │
    ┌────┴────┐
    │         │
  ≥85%      <85%
    │         │
  auto_save  متابعة
  0 tokens   للخطوة ⓶
```

**كيف يتعلم؟**
```
User says "دفعت كهربا 200" → classified as فواتير/كهرباء
  → saved to classification_logs
  → next time "دفعت كهربا 300" → template match 98%
  → instant classification, 0 tokens
```

**V2 improvements:**
- accepts rule_engine + AI (not just AI)
- threshold 85% (was 98%)
- damerau in template similarity (handles transpositions)

---

### ⓶ Pre-Filter

**الملف:** `smart-pipeline.ts` (lines 508-530)

```
Input: "ذهبت إلى المتجر"
         │
         ▼
countAmounts("ذهبت إلى المتجر") = 0
         │
         ▼
strongFinancialKeywords.some(kw => text.includes(kw))
  └─ ["صرفت","حولت","دفعت","اشتريت","جبت","شحنت",...]
  └─ NONE found
         │
         ▼
numWords > 2? → Yes (3 words)
         │
         ▼
RETURN clarify: "لم أتمكن من العثور على معاملة مالية واضحة"
```

---

### ⓷ Normalizer V2 (Dual Output)

**الملف:** `normalizer-v2.ts`

```
Input: "7awalte le a7mad 500 جنيه"
         │
         ▼
┌─────────────────────────────────────────────┐
│  forRules (aggressive)                      │
│  1. convertFrancoArab → "حولت لأحمد 500 جنيه" │
│  2. applySttCorrections                      │
│  3. arabicToEnglishNumbers                   │
│  4. COMMON_PHRASE_NORMALIZATIONS             │
│  5. METAPHOR_NORMALIZATIONS                  │
│  6. NEGATION_NORMALIZATIONS                  │
│  7. FILLER_WORDS removal                     │
│  8. Symbol cleanup                           │
│  9. Arabic char normalization (ة→ه, إ→ا)    │
│  10. Word numbers → digits ("خمسين" → "50")  │
│  11. "X ألف" → X*1000                        │
│  12. "X k" → X*1000                          │
│  → "حولت لاحمد 500 جنيه"                     │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  forAI (light)                               │
│  1. convertFrancoArabLight (dict-based)     │
│  2. applySttCorrections                      │
│  3. arabicToEnglishNumbers                   │
│  4. Colloquial numbers → digits              │
│  5. Word numbers → digits                    │
│  6. "X ألف" → X*1000                        │
│  7. NO char normalization (keeps ة, إ, etc) │
│  → "حولت لاحمد 500 جنيه" (preserves Arabic)  │
└─────────────────────────────────────────────┘
```

**Unified Normalizer:** `unified-normalizer.ts`
```
normalizeArabic()        → standard (tashkeel + alef + ya + ta + hamza)
normalizeArabicCompact() → + removes ALL whitespace
normalizeArabicEgyptian() → + ث→س, ذ→ز, ظ→ز, tatweel removal
```

---

### ⓸ Narrative Decomposer

**الملف:** `narrative-decomposer.ts`

```
Input: "فطرت ب 50 وركبت اوبر 80 ودفعت النت 360"
         │
         ▼
decomposeHeuristic(text)
         │
         ▼
Step 1: Find all financial verbs (دفعت, ركبت, فطرت, etc.)
Step 2: Find all amounts (50, 80, 360)
Step 3: Find strong connectors (و, وبعدين, وكمان)
Step 4: Split on connectors + verbs
         │
         ▼
┌──────────────┬──────────────┬──────────────┐
│ Segment 1    │ Segment 2    │ Segment 3    │
│ "فطرت ب 50"  │ "ركبت اوبر   │ "دفعت النت   │
│ verb: فطرت   │ 80"          │ 360"         │
│ amount: 50   │ verb: ركبت   │ verb: دفعت   │
│ dir: expense │ amount: 80   │ amount: 360  │
│              │ dir: expense │ dir: expense │
└──────────────┴──────────────┴──────────────┘
         │
         ▼
كل segment يدخل الـ Rule Engine بشكل مستقل
```

---

### ⓹ Rule Engine (7 Steps)

**الملف:** `rule-engine.ts`

```
Input segment: "ركبت اوبر 80"
         │
         ▼
extractAmounts("ركبت اوبر 80") → [{amount: 80, index: 11}]
         │
         ▼
detectIntent("ركبت اوبر") → {intent: "expense", confidence: 50}
         │
         ▼
allContext = "ركبت اوبر"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: User Dictionary                                    │
│  └─ userDictByWord.get("ركبت") → null                       │
│  └─ userDictByWord.get("اوبر") → null                       │
│  → not found                                                │
├─────────────────────────────────────────────────────────────┤
│  Step 2: Merchant Registry (sorted by length desc)          │
│  └─ matchArabicPhrase("ركبت اوبر", "اوبر") → YES!           │
│  → category = "مواصلات", sub = "أوبر/كريم"                 │
│  → confidence = 100, found = true                           │
│  → ambiguityFlags = ["merchant_registry_hit"]               │
├─────────────────────────────────────────────────────────────┤
│  Steps 3-7: SKIPPED (found = true)                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
refineSubCategory("مواصلات", "أوبر/كريم", "ركبت اوبر")
  → "أوبر/كريم" (already specific)
         │
         ▼
Ambiguity Scorer:
  regex = /(حساب|باقة|باقه|كارت|شحن|رصيد)/
  → "ركبت اوبر" doesn't match → no penalty
         │
         ▼
Disambiguation:
  disambiguateContext("اوبر", "ركبت اوبر", "مواصلات", "أوبر/كريم")
  → no disambiguation rule for "اوبر" → keep original
         │
         ▼
finalConfidence = 100
finalCategory = "مواصلات"
finalSubCategory = "أوبر/كريم"
finalType = "expense"
needsReview = false (100 ≥ 85)
         │
         ▼
OUTPUT: {
  amount: 80,
  category: "مواصلات",
  subCategory: "أوبر/كريم",
  confidence: 100,
  type: "expense",
  parsedBy: "rule_engine",
  needsReview: false
}
```

---

### ⓺ Fireworks Embedding Layer

**الملف:** `embedding-engine.ts` + `fireworks-embedding-client.ts`

```
Rule engine returned confidence < 85
Input: "هدوم 900" (rule engine matched but confidence = 78)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer A: Local Semantic Engine                     │
│                                                     │
│  1. ensureLocalIndex() — 385 descriptors, <5ms     │
│  2. normalizeForMatch("هدوم") = "هدوم"              │
│  3. LRU cache check → miss                          │
│  4. Exact descriptor match → miss                  │
│  5. N-gram TF cosine similarity:                    │
│     "هدوم" vs 385 descriptors → best = 0.62        │
│  6. Damerau fuzzy: "هدوم" vs "هدوم" = 1.0          │
│  7. score = calibrate(0.62, margin) = 68           │
│  8. 68 < 80 → continue to Fireworks                 │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer B: Fireworks Embedding API                   │
│                                                     │
│  1. getDescriptorIndex() → pre-built (63 entries)  │
│  2. getFireworksEmbedding("هدوم", apiKey)           │
│     └─ Instruct prefix: "Instruct: Classify...     │
│        Egyptian Arabic... Query: هدوم"             │
│     └─ LRU cache check → miss                      │
│     └─ POST https://api.fireworks.ai/...            │
│     └─ 4096-dim vector returned                     │
│     └─ Cache for 24h                                │
│  3. cosineSim(query vector, each descriptor)        │
│  4. Best: "ملابس وأحذية وأزياء وتسوق" → 0.85       │
│  5. Calibrate: score = 72                           │
│  6. 72 > 68 (local) → use Fireworks result          │
└─────────────────────────────────────────────────────┘
         │
         ▼
OUTPUT: {
  category: "تسوق",
  subCategory: "ملابس",
  score: 72,
  margin: 8,
  rawSimilarity: 0.85
}
```

---

### ⓻ AI Generative Fallback

**الملف:** `smart-pipeline.ts` + `dynamic-prompt-builder.ts`

```
Rule engine + Embedding both failed
Input: "روحت قعدت مع العيال في كافيه ودفعت 350 وحاسبنا على التاكسي 50 وسلفت أحمد 1000"
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  1. Category Scorer V3                              │
│     └─ 6 signals:                                   │
│        - Keyword Priors (regex) → ترفيه, مواصلات   │
│        - Local RAG TF-IDF → ترفيه, تحويل            │
│        - User History (DB) → (empty for new user)   │
│        - Co-occurrence → أكل وشرب, تحويل            │
│        - Intent injection → transfer (سلفت)         │
│        - Person detection → أصدقاء (أحمد)           │
│     └─ Result: 8 categories filtered (from 28)      │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  2. System Prompt Construction                      │
│     └─ "أنت SmartSpend AI (V3) — محلل مالي مصري"    │
│     └─ قواعد العامية المصرية (10 قواعد)             │
│     └─ قواعد الأولوية (4 قواعد)                     │
│     └─ 8 أمثلة (دفعت كهربا → فواتير/كهرباء, etc)    │
│     └─ TAXONOMY (8 categories + subcategories)      │
│     └─ DICT (income/transfer/expense keywords)      │
│     └─ KNOWN_PEOPLE_NAMES (if any)                  │
│     └─ USER_HISTORY (recent transactions)           │
│     └─ Amount Anchoring (deterministic amounts)     │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  3. API Call                                         │
│     └─ Gemini 2.5 Flash (primary)                   │
│        └─ temperature: 0.1                          │
│        └─ responseSchema (structured JSON)          │
│        └─ retry ×3 on 429                           │
│     └─ Groq (alternative)                           │
│     └─ Fireworks (alternative)                      │
│        └─ Static system prompt (cacheable)          │
│        └─ Dynamic user prompt (per request)         │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  4. Response Parsing                                 │
│     └─ robustJsonParse (markdown extraction,        │
│        trailing comma fix, regex fallback)          │
│     └─ safeExtractItems (handles multiple shapes)   │
└─────────────────────────────────────────────────────┘
```

---

### ⓼ Post-Processing

**الملف:** `smart-pipeline.ts` + `post-classifier-verifier.ts`

```
AI returned 3 items:
  1. {amount: 350, category: "ترفيه", sub: "كافيه"}
  2. {amount: 50, category: "مواصلات", sub: "تاكسي"}
  3. {amount: 1000, category: "تحويل", sub: "دين/سلفة", person: "أحمد"}
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Person Resolution                                   │
│  └─ "أحمد" → not in knownPeople                      │
│  └─ hasLoanIntent("سلفت أحمد") → true               │
│  └─ category = "تحويل", sub = "دين/سلفة"            │
│  └─ needsReview = true (unknown person)             │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Reconciliation (Amount Matching)                    │
│  └─ deterministicAmounts = [350, 50, 1000]           │
│  └─ aiAmounts = [350, 50, 1000]                      │
│  └─ missing = [] → no missing amounts               │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Deduplication                                       │
│  └─ Compare rule engine items vs AI items            │
│  └─ Same amount + same category + same source        │
│     → keep higher confidence                         │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Logical Amount Thresholds                           │
│  └─ investment < 50 → متنوعات                        │
│  └ـ مرتب < 100 + "عيد" in text → عيدية              │
│  └─ إيجار < 50 → متنوعات                             │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Reverse Mapping (Rescue متنوعات)                    │
│  └─ If category = "متنوعات" and description exists: │
│     └─ Check SUB_CATEGORY_MAP for bigrams/unigrams  │
│     └─ "كافيه" → ترفيه/كافيه (rescued!)             │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Normalize Transaction Taxonomy                      │
│  └─ normalizeCategoryName (inferCategoryFromEvidence)│
│  └─ normalizeSubCategoryName (inferSubCategory)      │
│  └─ Ensure type matches category registered type     │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Post-Classifier Verifier                            │
│  └─ Check: income with expense-only category         │
│  └─ Check: expense with income-only category         │
│  └─ Check: missing category/subCategory/amount       │
│  └─ Check: duplicate items (same amount + category)  │
│  └─ Flag severity: error → review, warning → review │
└─────────────────────────────────────────────────────┘
```

---

### ⓽ Decision & Cache Save

```
verifiedItems = 3 items
overallConfidence = average(90, 100, 95) = 95%
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Decision Logic                                       │
│  └─ if decision was "clarify" from person → keep    │
│  └─ if verifier has errors → downgrade to review    │
│  └─ if confidence ≥ autoSaveThreshold (85)           │
│     AND no verifier errors                           │
│     AND no verifier warnings                         │
│     → auto_save                                      │
│  └─ if confidence ≥ reviewThreshold (60)             │
│     → review                                         │
│  └─ else → clarify                                   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Cache Save                                           │
│  └─ if decision = "auto_save" OR "review"            │
│     └─ classificationCache.set(key, result)          │
│  └─ if decision = "clarify"                          │
│     └─ DON'T cache (user hasn't answered yet)        │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  DB Log Save (in ai-router.ts)                       │
│  └─ classification_logs table                        │
│     - originalText, normalizedText                   │
│     - parsedBy (rule_engine / hybrid / ai)          │
│     - confidence, decision                           │
│     - finalResult (JSON)                             │
│     - wasCorrected (user edit)                       │
│     - modelUsed, tokensUsed                          │
│  └─ Muscle Memory reads this on next login           │
└─────────────────────────────────────────────────────┘
```

---

## 📁 خريطة الملفات المتكاملة

```
api/lib/
├── unified-normalizer.ts      ← مصدر واحد لكل التطبيع (3 دوال)
│
├── smart-pipeline.ts          ← الـ Pipeline الرئيسي
│   ├── Cache check (lru-cache)
│   ├── Muscle Memory lookup
│   ├── Pre-filter
│   ├── Normalizer V2 call
│   ├── Decomposer call
│   ├── Rule Engine call (×per segment)
│   ├── Fireworks Embedding layer
│   ├── AI Generative fallback
│   ├── Post-processing
│   ├── Decision & Cache save
│   └── Result return
│
├── rule-engine.ts             ← محرك القواعد (7 steps)
│   ├── User Dictionary
│   ├── Merchant Registry
│   ├── SYNONYM_GRAPH (taxonomy-adapter)
│   ├── Trigram/Bigram SUB_CATEGORY_MAP
│   ├── Single-word dictionary
│   ├── Damerau fuzzy (fuzzy-match.ts)
│   ├── Local Semantic (embedding-engine matchSegment)
│   ├── Disambiguation Layer
│   ├── Ambiguity Scorer (context-aware)
│   └── Profile Hints
│
├── embedding-engine.ts        ← محرك التضمين (4-layer)
│   ├── LRU cache check
│   ├── Exact descriptor match
│   ├── N-gram TF cosine similarity (local)
│   ├── Damerau fuzzy boost (local)
│   ├── Fireworks API fallback (if key available)
│   └── Aggregate + calibrate + cache
│
├── fireworks-embedding-client.ts ← Fireworks API client
│   ├── Instruct prefix wrapping
│   ├── LRU cache (24h queries, 7d descriptors)
│   ├── Batch embedding support
│   └── Graceful error handling
│
├── muscle-memory.ts           ← ذاكرة التعلم
│   ├── LRU per-user cache (30min TTL)
│   ├── Template extraction
│   ├── Template similarity (Jaccard + Damerau)
│   └── DB pattern loading
│
├── unified-normalizer.ts      ← 3 variants:
│   ├── normalizeArabic()       (standard)
│   ├── normalizeArabicCompact() (no whitespace)
│   └── normalizeArabicEgyptian() (ث→س, ذ→ز)
│
├── fuzzy-match.ts             ← المطابقة الضبابية
│   ├── damerauLevenshtein (C-optimized)
│   ├── fuzzyFindCategory
│   ├── matchArabicPhrase (word-boundary)
│   └── stripArabicPrefix
│
├── normalizer-v2.ts           ← معالج مزدوج
│   ├── forRules (aggressive + Franco-Arab)
│   └── forAI (light + Franco-Arab light)
│
├── text-normalizer.ts         ← معالج أساسي
│   ├── Franco-Arab converter
│   ├── STT corrections
│   ├── Metaphor normalizations
│   ├── Word-to-number conversion
│   └── Phrase normalizations
│
├── intent-detector.ts         ← كاشف النية
│   ├── Strong income/expense (weight 50)
│   ├── Normal income/expense (weight 15)
│   ├── Transfer indicators (weight 40)
│   ├── Investment indicators (weight 40)
│   └── Contextual patterns (ATM, حولولي, etc.)
│
├── entity-extractor.ts        ← مستخرج الكيانات
│   ├── Amount extraction (regex + textual)
│   ├── Person name extraction
│   ├── Merchant detection
│   └── Financial context check
│
├── narrative-decomposer.ts    ← مفكك الجمل
│   ├── Financial verb detection
│   ├── Strong connector splitting
│   ├── Amount-verb pairing
│   └── Person detection per segment
│
├── category-registry.ts       ← سجل الفئات (28 فئة)
│   ├── CATEGORIES array (28 main + 120 sub)
│   ├── CATEGORY_ALIASES
│   ├── EXTRA_ALIASES_TO_ID
│   ├── inferCategoryFromEvidence
│   ├── inferSubCategory (data-driven)
│   ├── normalizeTransactionTaxonomy
│   └── canonicalCategoryId
│
├── taxonomy-adapter.ts        ← محول التصنيفات
│   ├── SYNONYM_GRAPH (200+ entries)
│   ├── LEGACY_CATEGORY_ALIASES (cleaned)
│   └── findTaxonomyMatch
│
├── egyptian-dictionary.ts     ← القاموس المصري
│   ├── 1000+ كلمة → فئة
│   ├── normKey (ال + variants)
│   └── Latin case variants
│
├── dynamic-prompt-builder.ts  ← باني الـ AI Prompt
│   ├── System prompt شامل (50+ سطر)
│   ├── قواعد العامية المصرية (10 قواعد)
│   ├── 8 أمثلة (few-shot)
│   ├── Fireworks variant (static + dynamic split)
│   └── Category Scorer integration
│
├── category-scorer.ts         ← مقياس الفئات V3
│   ├── 6 signals (keyword, RAG, history, co-occurrence,
│   │   intent, person)
│   ├── Context-aware person detection
│   └── buildFilteredTaxonomy (5-10 categories)
│
├── local-rag-engine.ts        ← محرك RAG محلي
│   ├── 3 JSON knowledge bases (2211 keywords)
│   ├── Character n-gram TF vectors
│   ├── Damerau fuzzy fallback
│   └── Priority-based deduplication
│
├── post-classifier-verifier.ts ← المدقق
│   ├── Income/expense conflict check
│   ├── Duplicate detection
│   ├── Missing field check
│   └── Severity flagging
│
├── fireworks-embedding-client.ts ← Fireworks API
│   ├── Instruct prefix (92% accuracy)
│   ├── LRU cache (queries 24h, descriptors 7d)
│   ├── Batch embedding
│   └── Timeout + error handling
│
├── anonymizer.ts              ← تشفير البيانات
│   ├── Card numbers
│   ├── Phone numbers (Egyptian)
│   ├── OTP codes
│   └── Arabic + English names
│
└── stt-corrections.ts         ← تصحيح الصوت
    ├── Common STT errors
    └── Damerau fuzzy correction
```

---

## 💰 التكلفة المتوقعة (10K زيارة يومية)

```
10,000 زيارة/يوم
    │
    ├── 40% Cache Hit (متكرر)        → $0/day
    ├── 10% Muscle Memory             → $0/day
    ├── 30% Rule Engine               → $0/day
    ├── 8% Local Semantic             → $0/day
    ├── 7% Fireworks Embedding        → $0.001/day (75K tokens)
    ├── 4% AI Generative              → $0.08/day (400 queries)
    └── 1% Clarify (no save)          → $0/day
                                    ─────────────
                                    ~$0.08/day = ~$2.5/month
```

---

## ⚡ زمن الاستجابة المتوقع

```
Cache Hit:          < 1ms
Muscle Memory:      5-15ms (DB query)
Rule Engine:        2-10ms (per segment)
Local Semantic:     < 5ms
Fireworks Embedding: 200-500ms (API + network)
AI Generative:      1-3s (API + generation)
Full Pipeline:      2-10ms (80% of requests)
                    200-500ms (15% of requests)
                    1-3s (5% of requests)
```

---

*تم إنشاء هذا المخطط كوثيقة مرجعية كاملة لنظام تصنيف SmartSpend AI.*
*© 2026 SmartSpend AI*
