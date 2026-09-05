## 2026-08-28T05:45:01Z
Analyze and formulate the exact, line-by-line implementation blueprint for Milestone 3:
1. `api/lib/dialect-polarity.ts`: Egyptian dialect negation patterns ("مادفعتش", "ماصرفتش", "مش هدفع", "مدفعتش", "مادفعناش"), social invitations ("عزمني على غدا ومادفعتش"), and cancellations ("طلبنا وكنسلنا"), outputting exact `PolarityMultiplier` (0.10, 0.15, 0.30, 0.60, 1.00).
2. `api/lib/dialect-disambiguation.ts`: Contextual disambiguation matrix for polysemous Egyptian financial and colloquial terms ("نور" -> utility vs person transfer; "كريم" -> Careem ride vs person contact; "مشروع" -> business investment vs Alexandria microbus; "شلت" -> gold investment vs ATM cash withdrawal).
3. `api/lib/confidence-scorer.ts` & `api/lib/rule-engine.ts`: Implement 3-factor probabilistic scoring formula:
   Confidence = ((S_semantic * 0.50) + (S_context * 0.30) + (S_category * 0.20)) * PolarityMultiplier
   with decision thresholds (>= 85 -> autoSave, 60-84 -> review, < 60 -> clarify).
4. `api/admin-router.ts`: `testRuleEngineSandbox` procedure returning factor scores, calculated confidence, and dialect rationale.

Write your detailed plan to:
`e:/smartspend_V1_fixed/.agents/explorer_m3/plan.md`
