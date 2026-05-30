import { detectIntent } from "./api/lib/intent-detector";

const text = "اديت ليوسف 1000 جنيه صاحبي";
const intent = detectIntent(text);

const personPattern =
  /(?:ل(ـ)?\s+[ا-ي]{2,})|(?:حول(ت|نا)\s+[ا-ي]{2,})|(?:بعت(ت)?\s+[ا-ي]{2,})|(?:[اإ]?ديت\s+[ا-ي]{2,})|(?:عطيت\s+[ا-ي]{2,})|(?:من\s+[ا-ي]{2,})|(?:لأحمد|لمحمد|لعلي|لمحمود|لهدى|لخالد|لصاحبي|لأخويا|لأختي)/;
const hasPersonMention = personPattern.test(text);

const ruleIsStrong = intent.confidence > 88 && !hasPersonMention;

console.log({
  intentConfidence: intent.confidence,
  hasPersonMention,
  ruleIsStrong,
});
