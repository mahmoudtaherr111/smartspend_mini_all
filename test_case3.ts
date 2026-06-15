import { decomposeHeuristic } from "./api/lib/narrative-decomposer";

const text = "دفعت اشتراك الجيم 300 جنيه وجبت مية بـ 10";
console.log("DECOMPOSITION:", JSON.stringify(decomposeHeuristic(text), null, 2));
