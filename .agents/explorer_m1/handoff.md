# Milestone 1: Dynamic AI Provider & Automatic Model Discovery Engine — Handoff Report

**Agent**: `explorer_m1` (teamwork_preview_explorer)  
**Milestone**: Milestone 1 (Dynamic AI Provider & Automatic Model Discovery Engine)  
**Deliverable**: `e:/smartspend_V1_fixed/.agents/explorer_m1/plan.md`  

---

## 1. Observation

1. **Existing Model Catalog & Routing are Static**:
   - `api/lib/ai-provider-registry.ts:47-298` hardcodes 20 models in `MODEL_CATALOG`. Adding any new model or custom provider (e.g. OpenRouter, DeepSeek Direct, Together) requires code modification and server redeployments.
   - `api/lib/model-mapper.ts:42-80` uses hardcoded prefix checks (`isGroqModel`, `isGeminiModel`, `isFireworksModel`, `isNvidiaModel`).
   - `api/lib/env.ts:18-25` defines static env variables for only 4 providers (`GEMINI_API_KEY`, `GROQ_API_KEY`, `FIREWORKS_API_KEY`, `NVIDIA_API_KEY`).
2. **Missing Database Tables for AI Infrastructure**:
   - `db/schema.ts:1-1082` currently has 48 tables, but lacks `ai_providers`, `ai_models`, and `ai_token_ledgers`.
   - `db/relations.ts:1-466` does not have provider-to-model relational mappings.
3. **API Key Security in Database**:
   - Provider API keys stored in MySQL must not be stored in plaintext. An AES-256-GCM symmetric encryption scheme is required with backward compatibility for legacy keys.
4. **Admin Procedures**:
   - `api/admin-router.ts:720-800` contains an outdated `getAvailableModels` query with hardcoded fallback arrays and no dynamic provider discovery or management.

---

## 2. Logic Chain

1. **Schema Layer**: Defining `ai_providers` and `aiModels` tables with Drizzle in `db/schema.ts` and linking them in `db/relations.ts` establishes the relational foundation for dynamic providers, purpose assignment (`chat`, `classification`, `ocr`, `voice_stt`, `voice_call`, `report`, `goal`, `embedding`), tier mapping (`free`, `pro`, `ultra`), and pricing overrides (USD per 1M tokens).
2. **Security Layer**: Building `api/lib/crypto-vault.ts` with AES-256-GCM and SHA-256 key derivation from `JWT_SECRET` allows secure encryption at rest while providing zero-downtime fallback for unencrypted strings and UI masking (`sk-o...9f3a`).
3. **Discovery Layer**: Building `api/lib/model-discovery.ts` supporting OpenAI (`GET /models`), Google Gemini (`GET /v1beta/models`), and Anthropic protocols enables 1-click model scanning with automatic context window parsing and capability inferencing (vision, reasoning, function calling).
4. **Registry & Cache Layer**: Refactoring `api/lib/ai-provider-registry.ts` and `api/lib/model-mapper.ts` to load active models from MySQL with an in-memory 5-minute cache (`CACHE_TTL_MS = 300,000`) and instant admin invalidation guarantees sub-millisecond model resolution with zero database query overhead on hot paths, while preserving synchronous legacy helper contracts.
5. **Admin tRPC API Layer**: Exposing 8 dedicated admin procedures (`getAiProviders`, `createAiProvider`, `testAndDiscoverModels`, `updateAiProvider`, `deleteAiProvider`, `getAiModels`, `importDiscoveredModels`, `updateAiModelConfig`) in `api/admin-router.ts` delivers full programmatic control for the admin UI.

---

## 3. Caveats

- **Database Migration**: `npm run db:push` or `npm run db:generate` will be required when applying the schema to a live MySQL instance.
- **Provider Protocol Idiosyncrasies**: Some self-hosted OpenAI proxies may omit pricing in their `GET /models` response; the discovery engine defaults missing pricing to 0 and allows manual admin override.

---

## 4. Conclusion

The implementation blueprint for Milestone 1 is fully specified in `e:/smartspend_V1_fixed/.agents/explorer_m1/plan.md`. It covers all 5 required components with exact types, database schemas, cryptographic methods, remote discovery engines, cache strategies, and tRPC router procedures. The orchestrator and implementation workers can proceed directly to code generation.

---

## 5. Verification Method

1. **Inspect Blueprint**: Review `e:/smartspend_V1_fixed/.agents/explorer_m1/plan.md` for complete code listings and types.
2. **Type Check**: Once implemented by workers, verify with:
   ```bash
   npm run check
   ```
3. **Unit Tests**: Run unit tests for crypto vault, discovery heuristics, and model mapper:
   ```bash
   npx vitest run api/lib/model-mapper.test.ts
   ```
