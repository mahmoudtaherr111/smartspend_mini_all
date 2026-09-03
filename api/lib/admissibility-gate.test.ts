/**
 * The gate's job is to spend nothing on text that cannot be a transaction — while
 * never turning away a real one. The second half matters more, so the "must pass"
 * list is deliberately long and drawn from the benchmark.
 */
import { describe, it, expect } from "vitest";
import { checkAdmissibility } from "./admissibility-gate";
import { normalizeV2 } from "./normalizer-v2";

const gate = (t: string) => checkAdmissibility(normalizeV2(t).forRules);

describe("admissibility gate", () => {
  it("passes every real transaction untouched", () => {
    const real = [
      "دفعت فاتورة الكهربا 450",
      "قبضت الجمعية 5000",
      "بنزين 200",
      "شربت قهوة 35",
      "اشتريت بـ تمنمية جنيه هدوم",
      "حولت 1,250.50 ج.م انستاباي",
      "اديت السواق ألفين ونص",
      "جبت لبان بجنيه ونص",
      "دفعت إيجار الشقة 2500 وجبت كهربا بـ 300 وللبواب 200",
      "روحت السوبرماركت",
      "طلبت دليفري 220",
      "7awalt 500 gneh l Ahmed 3ala instapay",
    ];
    for (const t of real) {
      expect(gate(t).verdict, t).toBe("financial");
    }
  });

  it("answers a spending question instead of recording it", () => {
    const r = gate("عايز اعرف صرفت كام الشهر ده");
    expect(r.verdict).toBe("question");
    expect(r.userMessage).toBeTruthy();
  });

  it("does not mistake a statement carrying a stray marker for a question", () => {
    // The amount makes this a record, not a query.
    expect(gate("دفعت كام؟ 50 للسايس").verdict).toBe("financial");
  });

  it("refuses to record something that explicitly did not happen", () => {
    const cases = [
      "كنت هروح الجيم وادفع 500 بس مروحتش",
      "الشقة اللي شفتها كانت بمليون ونص بس مشتريتهاش",
      "كنت هطلب دليفري بـ 200 بس لغيت",
    ];
    for (const t of cases) {
      const r = gate(t);
      expect(r.verdict, t).toBe("negated");
      expect(r.reason, t).toMatch(/^negated_/);
    }
  });

  it("leaves a mixed message to the per-segment check rather than rejecting it whole", () => {
    // One clause happened, one did not — the gate must not throw away both.
    const r = gate("دفعت 300 كهربا بس الجيم مروحتش وكان 500");
    expect(r.verdict).toBe("financial");
  });

  it("rejects chatter without spending anything", () => {
    const chatter = [
      "النهاردة كان يوم حلو والجو جميل",
      "تمام يا صاحبي شكرا ليك على المساعدة",
    ];
    for (const t of chatter) {
      const r = gate(t);
      expect(r.verdict, t).toBe("not_financial");
      expect(r.userMessage, t).toBeTruthy();
    }
  });

  it("gives very short input the benefit of the doubt", () => {
    // "بنزين" alone is something users genuinely type.
    expect(gate("بنزين").verdict).toBe("financial");
    expect(gate("قهوة").verdict).toBe("financial");
  });

  it("handles empty input without throwing", () => {
    const r = checkAdmissibility("");
    expect(r.verdict).toBe("not_financial");
    expect(r.reason).toBe("empty_input");
  });

  it("reports the signals it decided on", () => {
    const r = gate("دفعت فاتورة الكهربا 450");
    expect(r.signals.amountCount).toBe(1);
    expect(r.signals.matchedVerb ?? r.signals.matchedNoun).toBeTruthy();
  });
});
