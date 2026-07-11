## 2026-07-05T14:02:17Z
Investigate the SmartSpend AI codebase to prepare for architectural upgrades.
Your working directory is: e:\smartspend_V1_fixed\.agents\explorer_investigate\
Please read e:\smartspend_V1_fixed\PROJECT.md and e:\smartspend_V1_fixed\ORIGINAL_REQUEST.md.

Specifically:
1. Examine the current schema in db/schema.ts and db/relations.ts, particularly user_contacts and userProfiles table structure.
2. Locate the service layer user-profile-service.ts and trace how userProfiles.lifestyleInfo.dynamicContacts is accessed and how user_contacts is used.
3. Examine egyptian-names-dictionary.ts (find commented out strings to remove and lists to expand), muscle-memory.ts (find why it bypasses transactions with person verbs), smart-pipeline.ts (cache invalidation), rule-engine.ts, category-registry.ts, and dynamic-prompt-builder.ts (Gemini/Fireworks prompt building, 120+ subcategory taxonomy pruning).
4. Examine narrative-decomposer.ts (sentence splitting, amount/person/intent decomposition) and person-resolver.ts (NON_PERSON_TERMS swallowing, Levenshtein distance, Skip Clarification logic).
5. Locate src/pages/Settings.tsx and check how views are managed.
6. Verify the current baseline tests by running:
   - npx tsc --noEmit && npm run lint
   - npx tsx check-db.ts
   - npx tsx test-names.ts
   - npx tsx test-people-logic.ts
   - npx tsx test-comprehensive-pipeline.ts
7. Output a detailed report in e:\smartspend_V1_fixed\.agents\explorer_investigate\handoff.md, including the exact design decisions, code snippets to change, and baseline test results. Ensure the report is completely self-contained.
