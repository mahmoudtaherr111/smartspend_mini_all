import {it,expect} from "vitest";
import {detectNegation} from "./negation-detector";
import {planFinancialEvents} from "./financial-event-plan";
it.each(["ثمن الكتاب160 بس ما اشتريتهوش","ما جبتهاش","ما حجزتهمش","ما دفعتهاش"])("recognizes separated Egyptian negation: %s",text=>expect(detectNegation(text).negated).toBe(true));
it.each(["دفعت160 ثمن الكتاب","ما دفعتش غير45 جنيه","دفعت للمقهى60","بنتي دفعت30"])("does not negate a realized event: %s",text=>expect(detectNegation(text).negated).toBe(false));
it("does not admit a quoted price whose purchase was negated",()=>expect(planFinancialEvents("ثمن الكتاب160 بس أنا لسه ما اشتريتهوش").admitted).toHaveLength(0));
it("explicit repetition cannot auto-save one collapsed event",()=>expect(planFinancialEvents("فاتورة كهرباء450 اتسددت مرتين").admitted.some(e=>e.reviewReasons.includes("repeated_event_requires_reconciliation"))).toBe(true));
