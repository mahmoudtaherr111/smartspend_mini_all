## 2026-08-23T18:22:01Z

<USER_REQUEST>
You are Worker 2 implementing Milestone 2 for the SmartSpend AI remediation project.
Your working directory is: E:/smartspend_V1_fixed/.agents/worker_2

Authoritative files to read first:
- E:/smartspend_V1_fixed/ORIGINAL_REQUEST.md
- E:/smartspend_V1_fixed/MASTER_ROOT_CAUSE_CATALOG.md
- E:/smartspend_V1_fixed/AGENTS.md
- E:/smartspend_V1_fixed/PROJECT.md
- Explorer 3 Analysis: E:/smartspend_V1_fixed/.agents/explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You EXCLUSIVELY own and may modify these files:
- E:/smartspend_V1_fixed/api/services/scheduler-lock.ts
- E:/smartspend_V1_fixed/api/expense-router.ts
- E:/smartspend_V1_fixed/api/support-router.ts
- E:/smartspend_V1_fixed/api/profile-router.ts
- E:/smartspend_V1_fixed/api/admin-whatsapp-router.ts
- E:/smartspend_V1_fixed/api/boot.ts
- E:/smartspend_V1_fixed/src/components/ui/command.tsx
- E:/smartspend_V1_fixed/src/components/ui/dialog.tsx
- E:/smartspend_V1_fixed/src/components/seo/SEOMeta.tsx
- E:/smartspend_V1_fixed/.gitignore

Tasks to execute:
1. In `api/services/scheduler-lock.ts`:
   - Fix TS2344 compilation error: import `type { RowDataPacket } from "mysql2/promise";` and type the query as `connection.query<RowDataPacket[] & Array<{ acquired: number }>>("SELECT GET_LOCK(?, 0) AS acquired", [lockName])`.
2. In `api/expense-router.ts`:
   - Refactor `batchCreate` and `resolveExpenseReferences` to support batched `inArray` queries for `contactId` and `classificationLogId` to eliminate N+1 queries.
   - Batch aggregate the `userContacts` update count so multiple contacts are updated efficiently without redundant roundtrips.
   - Replace raw `throw new Error` at lines 1728, 1851, 1902 with `throw new TRPCError({ code: ... })`.
3. In `api/support-router.ts`:
   - Replace raw `throw new Error("غير مصرح")` at lines 82 and 201 with `throw new TRPCError({ code: "FORBIDDEN", message: ... })`.
4. In `api/profile-router.ts`:
   - Replace raw `throw new Error(...)` at line 420 with `throw new TRPCError({ code: "PRECONDITION_FAILED", message: ... })`.
5. In `api/admin-whatsapp-router.ts`:
   - Replace raw `throw new Error(...)` at lines 120 and 167 with `throw new TRPCError({ code: ... })`.
6. In `api/boot.ts`:
   - In Paymob webhook handler, add explicit defense-in-depth currency guard: `if (obj.currency && obj.currency !== "EGP") return c.json({ error: "Invalid currency" }, 400);`.
7. In UI components:
   - `src/components/ui/command.tsx`: move `DialogHeader` inside `DialogContent`.
   - `src/components/ui/dialog.tsx`: ensure `aria-describedby={props["aria-describedby"] ?? undefined}` is passed to `DialogPrimitive.Content`.
   - `src/components/seo/SEOMeta.tsx`: set `document.title = title || data?.title || "SmartSpend AI"` unconditionally in `useEffect` and configure `{ retry: false, staleTime: 5 * 60 * 1000 }` on `trpc.seo.getPage`.
8. In `.gitignore`:
   - Add `dev-dist/`, `*.png`, `.audit-*`.

Verification:
- Run `npm run check` and targeted tests.
- Document commands and results in `E:/smartspend_V1_fixed/.agents/worker_2/handoff.md`.
- Send message back when complete.
</USER_REQUEST>
