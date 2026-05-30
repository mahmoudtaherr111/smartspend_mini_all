import { buildGlobalDictionary, SUB_CATEGORY_MAP } from "./lib/rule-engine";

const dict = buildGlobalDictionary();
console.log("اكل in CATEGORY_DICTIONARY?", !!dict["اكل"], dict["اكل"]);
console.log("أكل in CATEGORY_DICTIONARY?", !!dict["أكل"], dict["أكل"]);
console.log("اكل in SUB_CATEGORY_MAP?", !!SUB_CATEGORY_MAP["اكل"]);
