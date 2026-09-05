## 2026-08-28T05:45:01Z
You are explorer_m1, a teamwork_preview_explorer for Milestone 1 (Dynamic AI Provider & Automatic Model Discovery Engine).

Your working directory is: e:/smartspend_V1_fixed/.agents/explorer_m1/
You must read:
1. e:/smartspend_V1_fixed/ORIGINAL_REQUEST.md
2. e:/smartspend_V1_fixed/PROJECT.md
3. e:/smartspend_V1_fixed/AGENTS.md
4. `db/schema.ts`, `db/relations.ts`, `api/lib/model-mapper.ts`, `api/lib/ai-provider-registry.ts`, `api/admin-router.ts`

Task:
Analyze and formulate the exact, line-by-line implementation blueprint for Milestone 1:
1. `db/schema.ts` and `db/relations.ts`: Drizzle table definitions for `aiProviders` and `aiModels` with all required columns, types, default values, indices, and dual-user relations.
2. `api/lib/crypto-vault.ts`: AES-256-GCM symmetric encryption/decryption functions (`encryptApiKey`, `decryptApiKey`) with fallback for unencrypted legacy keys.
3. `api/lib/model-discovery.ts`: Remote model discovery engine supporting OpenAI protocol (`GET ${baseUrl}/models`), Gemini protocol (`GET /v1beta/models`), and Anthropic protocol.
4. `api/lib/ai-provider-registry.ts` & `api/lib/model-mapper.ts`: Refactor static catalog to dynamically query active database models & providers with cached defaults for system purposes (`chat`, `classification`, `ocr`, `voice_stt`, `voice_call`, `report`, `goal`, `embedding`) and tiers (`free`, `pro`, `ultra`).
5. `api/admin-router.ts`: New tRPC procedures (`getAiProviders`, `createAiProvider`, `testAndDiscoverModels`, `updateAiProvider`, `deleteAiProvider`, `getAiModels`, `importDiscoveredModels`, `updateAiModelConfig`).

Write your detailed plan to:
`e:/smartspend_V1_fixed/.agents/explorer_m1/plan.md`

When done, message the orchestrator with your findings and path to plan.md.
