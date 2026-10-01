import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../api/queries/connection";
import { aiMemoryItems } from "../db/schema";
import { databaseDeps } from "../api/services/voice/post-call";
import { memoryBrief } from "../api/services/voice/brain/snapshot";

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_947, userType: "local" };
/** The same numeric id as a Google account: another person. */
const other = { userId: 88_947, userType: "oauth" };

async function clean() {
  for (const who of [user, other]) {
    await db.delete(aiMemoryItems).where(and(eq(aiMemoryItems.userId, who.userId), eq(aiMemoryItems.userType, who.userType)));
  }
}

const call = (endedAt: string) => ({ ...user, endedAt: new Date(endedAt) });

describe("remembered things with a slot", () => {
  beforeEach(clean);
  afterAll(clean);

  itWithDatabase("keeps one current value per slot, for this user only", async () => {
    await databaseDeps.write({ ...other, endedAt: new Date("2026-09-01T10:00:00Z") }, "vc_other", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "حساب تاني بيقبض يوم 1", importance: 70, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-02T10:00:00Z"), "vc_one", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "مرتبه بينزل يوم 25", importance: 70, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-20T10:00:00Z"), "vc_two", {
      summary: "", closes: [], facts: [{ type: "fact", slot: "income.payday", content: "مرتبه بقى بينزل يوم 27", importance: 70, replaces: null }],
    });
    const mine = await databaseDeps.existing(call("2026-09-21T10:00:00Z"));
    expect(mine.filter((item) => item.slot === "income.payday").map((item) => [item.content, item.day])).toEqual([["مرتبه بقى بينزل يوم 27", "2026-09-20"]]);
    const theirs = await databaseDeps.existing({ ...other, endedAt: null });
    expect(theirs.map((item) => item.content)).toEqual(["حساب تاني بيقبض يوم 1"]);
  });

  itWithDatabase("lets a refusal expire, and closes a follow-up the next call settled", async () => {
    await databaseDeps.write(call("2026-08-01T10:00:00Z"), "vc_old", {
      summary: "", closes: [], facts: [{ type: "refusal", slot: "refusal:food_budget", content: "مش عايز ميزانية للأكل دلوقتي", importance: 60, replaces: null }],
    });
    await databaseDeps.write(call("2026-09-25T10:00:00Z"), "vc_new", {
      summary: "", closes: [], facts: [{ type: "followup", slot: "followup:installment_amount", content: "هيشوف قيمة القسط ويقولها", importance: 60, replaces: null }],
    });
    const before = await databaseDeps.existing(call("2026-09-26T10:00:00Z"));
    // The refusal was said two months ago: its 30 days are over, so it is not carried on.
    expect(before.map((item) => item.type)).toEqual(["followup"]);
    await databaseDeps.write(call("2026-09-27T10:00:00Z"), "vc_next", { summary: "", facts: [], closes: [before[0].id] });
    expect(await databaseDeps.existing(call("2026-09-28T10:00:00Z"))).toEqual([]);
  });

  itWithDatabase("opens a call with what is known, grouped, dated, and without what expired", async () => {
    await databaseDeps.write(call("2026-09-10T10:00:00Z"), "vc_a", {
      summary: "اتكلم عن الموبايل.",
      closes: [],
      facts: [
        { type: "fact", slot: "income.payday", content: "مرتبه بينزل يوم 25", importance: 70, replaces: null },
        { type: "plan", slot: "goal:phone", content: "بيحوش لموبايل بتلاتين ألف", importance: 80, replaces: null },
        { type: "refusal", slot: "refusal:food_budget", content: "مش عايز ميزانية للأكل دلوقتي", importance: 60, replaces: null },
        { type: "followup", slot: "followup:installment_amount", content: "هيشوف قيمة القسط ويقولها", importance: 60, replaces: null },
      ],
    });
    const brief = await memoryBrief({ callId: "vc_b", userId: user.userId, userType: "local", plan: "pro", role: "user" }, new Date("2026-09-15T10:00:00Z"));
    const text = brief.join("\n");
    expect(text).toContain("مرتبه بينزل يوم 25 (10/9)");
    expect(text).toContain("بيحوش لموبايل");
    expect(text).toMatch(/مفتوح[\s\S]*هيشوف قيمة القسط/);
    expect(text).toMatch(/رفض[\s\S]*ميزانية للأكل/);
    // A month later the refusal and the follow-up have expired.
    const later = (await memoryBrief({ callId: "vc_c", userId: user.userId, userType: "local", plan: "pro", role: "user" }, new Date("2026-11-20T10:00:00Z"))).join("\n");
    expect(later).not.toContain("ميزانية للأكل");
    expect(later).not.toContain("قيمة القسط");
    expect(later).toContain("مرتبه بينزل يوم 25");
  });
});
