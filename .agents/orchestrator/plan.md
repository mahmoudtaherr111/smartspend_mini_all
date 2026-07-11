# Execution Plan

## Objective
Implement architectural upgrades for SmartSpend AI, covering refactoring of database/sync, AI/Zero-Token engine, NLP parser, Settings views, and system verification.

## Orchestration Strategy
We will use the **Project Pattern** (Dual Track if needed, or structured milestone execution).
Since we are implementing features and refactoring an existing project, we will follow the sequential Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycle.

## Phases
1. **Planning & Setup**: Decompose the task and create `PROJECT.md` and `plan.md`. Start heartbeat cron.
2. **Exploration**: Spawn `teamwork_preview_explorer` to study the codebase, identify existing tables, files, dictionary, cache invalidation, narrative decomposer, person resolver, Settings views, and tRPC routers.
3. **Execution**:
   - Milestone 1: Database Schema & Sync Refactoring
   - Milestone 2: AI Classification & Zero-Token Logic
   - Milestone 3: Advanced NLP Parsing (Multi-person / Multi-intent)
   - Milestone 4: Settings Page UI/UX (People Management + Business Mode)
   - Milestone 5: Integration & Verification
4. **Final Victory Audit**: Verify the system using all automated test scripts and manual acceptance criteria.
