/**
 * app_help: how to do something in the app, from the approved site guide only. When the guide has nothing close,
 * the answer says so instead of letting the model invent steps.
 */
import { searchSiteGuide } from "../../../site-guide";
import { str, type VoiceTool } from "./types";

/** The screen a guide topic lives on, where that is certain. */
const ROUTES: Partial<Record<string, string>> = { sms: "/bank-sync", card: "/bank-sync", expenses: "/" };

/** What the assistant can and cannot do in a call, so it never promises a missing feature. */
const CAN = ["يجاوب بأرقام من الدفتر", "يسجل مصروف أو دخل بعد موافقتك", "يعمل هدف أو ميزانية أو محفظة", "يفتكر ويدوّر في كلامكم القديم", "يشرح استخدام التطبيق"];
const CANNOT = ["تحويل فلوس أو دفع", "تذكير أو منبّه في ميعاد", "ربط البنك بنفسه", "مسح عمليات قديمة (بتتمسح من شاشة المصاريف)"];

export const appHelpTool: VoiceTool = {
  declaration: {
    name: "app_help",
    description: "How to use the app (linking bank messages, wallets, goals, reports...). Describe only the steps it returns.",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
  async run(args) {
    const question = str(args.question, 200) ?? "";
    const result = searchSiteGuide(question, 2);
    const best = result.chunks[0];
    // Real questions score 0.3 and up; unrelated ones stay near 0.1 (the guide never returns nothing on its own).
    if (!best || best.score < 0.25) {
      return {
        response: {
          ok: true,
          found: false,
          can: CAN,
          cannot: CANNOT,
          say: "الدليل مافيهوش ده. قول كده بصراحة، ولو ينفع قول أقرب حاجة تقدر تعملها.",
        },
      };
    }
    return {
      response: { ok: true, found: true, topic: best.title, steps: best.steps.slice(0, 5), cannot: CANNOT },
      card: { kind: "guide", title: best.title, steps: best.steps.slice(0, 6), route: ROUTES[best.area] },
    };
  },
};
