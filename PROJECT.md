# Project: SmartSpend AI Upgrades

## Architecture
- **Database Layer**: Drizzle ORM managing schema and tables (`db/schema.ts`, `db/relations.ts`).
- **Profile Service**: Service layer parsing and storing user contacts and profile data (`api/services/user-profile-service.ts`).
- **AI Classification Pipeline**: Multi-model classification logic utilizing Gemini/Fireworks and a zero-token local rule engine (`api/lib/smart-pipeline.ts`, `api/lib/rule-engine.ts`, `api/lib/category-registry.ts`, `api/lib/dynamic-prompt-builder.ts`, `api/lib/muscle-memory.ts`, `api/lib/egyptian-names-dictionary.ts`).
- **NLP Narrative Parser**: Decomposes complex financial/personal statements into separate transactions (`api/lib/narrative-decomposer.ts`, `api/lib/person-resolver.ts`).
- **UI Settings Views**: Settings dashboard pages for managing people and business settings (`src/components/settings/PeopleSettingsView.tsx`, `src/components/settings/BusinessSettingsView.tsx`, `src/pages/Settings.tsx`).
- **tRPC API Route**: Exposes routers for CRUD on business, custom categories, contacts (`api/business-router.ts`, `api/profile-router.ts`, `api/expense-router.ts`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Database Schema & Sync Refactoring | Eliminate contact storage split. Add `user_businesses` and `business_categories`. Update `user_contacts`. Add relations in Drizzle. Migrate dynamic contacts from profiles. | None | PLANNED |
| 2 | AI Classification & Zero-Token | Fix names dictionary comments. Fix muscle memory cache transaction bypass. Local rule engine zero-token category loading. Prompt duplication & pruning. | M1 | PLANNED |
| 3 | Advanced NLP Parsing | Multi-person/intent narrative decomposer sentence splitting. Refine person resolver (avoid term swallow, stricter fuzzy match, handle silenced/skip). | M1, M2 | PLANNED |
| 4 | People Management Settings UI/UX | Build People Hub Settings view using Framer Motion (tabs, search, add/edit/delete modal, merge duplicates). | M1, M3 | PLANNED |
| 5 | Business Mode Setup Wizard & tRPC | Build Business Settings view (visual cards, category customization, contact linking). Create/update backend tRPC routers. | M1, M2, M4 | PLANNED |
| 6 | Integration & Verification | Run all verification test scripts, perform final opaque-box manual tests, and compile handoff report. | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts
### Database ↔ Profile/AI/NLP Services
- `user_contacts` is single source of truth for contact profiles.
- `user_businesses` and `business_categories` define active business context.
- `isSilenced = true` bypasses future clarifications for that general contact.
