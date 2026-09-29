/**
 * A fabricated user in the evaluation database to sign in with on the app of scripts/voice-eval/dev-server.mjs: the
 * `base` fixture of scripts/voice-eval/fixtures.ts, the QA seed's phone and password
 * (api/qa/ai-center-qa-seed.ts), an agreed plan with a step, and a few commitments. Run again, it starts over.
 */
import * as dotenv from "dotenv";

dotenv.config();
process.env.DATABASE_URL = String(process.env.VOICE_EVAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "")
  .replace(/\/([A-Za-z0-9_]+)(\?|$)/, (_m, name: string, tail: string) => `/${name.endsWith("_eval") ? name : `${name}_eval`}${tail}`);
if (process.env.REDIS_URL) process.env.REDIS_URL = process.env.REDIS_URL.replace(/(\/\d+)?$/, "/7");

(async () => {
  const [{ createEvalUser, removeEvalUsers }, { AI_CENTER_QA_PHONE, AI_CENTER_QA_PASSWORD }, { hashPassword }, { db }, schema, { eq }, cashflows, plans] = await Promise.all([
    import("./fixtures"),
    import("../../api/qa/ai-center-qa-seed"),
    import("../../api/local-auth-utils"),
    import("../../api/queries/connection"),
    import("../../db/schema"),
    import("drizzle-orm"),
    import("../../api/services/coach/cashflows"),
    import("../../api/services/coach/plans"),
  ]);
  const [existing] = await db.select({ id: schema.localUsers.id }).from(schema.localUsers).where(eq(schema.localUsers.phone, AI_CENTER_QA_PHONE));
  if (existing) await removeEvalUsers([existing.id]);
  const user = await createEvalUser("base");
  await db.update(schema.localUsers).set({ phone: AI_CENTER_QA_PHONE, password: await hashPassword(AI_CENTER_QA_PASSWORD) }).where(eq(schema.localUsers.id, user.id));
  const me = { userId: user.id, userType: "local" };
  await cashflows.createCashflow(me, { kind: "rent", direction: "out", title: "إيجار الشقة", amount: 4000, recurrence: "monthly", startDay: user.days.cycleStart, certainty: "confirmed", source: "user" });
  await cashflows.createCashflow(me, { kind: "subscription", direction: "out", title: "باقة النت", amount: 350, recurrence: "monthly", startDay: user.days.today, certainty: "confirmed", source: "user" });
  await cashflows.createCashflow(me, { kind: "school", direction: "out", title: "مصاريف المدرسة", amount: null, recurrence: "once", startDay: null, certainty: "confirmed", source: "user" });
  await cashflows.createCashflow(me, { kind: "freelance", direction: "in", title: "شغل حر", amount: 3000, recurrence: "once", startDay: user.days.today, certainty: "estimated", source: "user" });
  await plans.acceptPlan(me, {
    title: "لحد القبض من غير سلف", goal: "أوصل للمرتب من غير ما أستلف", source: "app",
    steps: [{ title: "الأكل برّه ميتين في اليوم", kind: "spending_limit", target: { amountPerDay: 200, category: "أكل وشرب" } }, { title: "أسجل كل مصروف كاش في نفس اليوم", kind: "record" }],
    evidence: [{ label: "المتاح في اليوم", value: 200 }],
  });
  console.log(`seeded local user ${user.id} (the QA seed's phone and password)`);
  process.exit(0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
