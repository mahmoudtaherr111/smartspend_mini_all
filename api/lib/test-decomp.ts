import { decomposeHeuristic } from "./narrative-decomposer";

const text = "صرفت 1500 جنيه جبت بيهم فراخ وصرفت 350 جنيه جبت بيهم لعبت بيهم بالستيكشن بصراحه وبعدها جبت ازازه 100 ب50 جنيه وشحنت كارت فكه في دافوم ب40 جنيه";
const result = decomposeHeuristic(text, []);
console.log(JSON.stringify(result, null, 2));
