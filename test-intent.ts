import { detectIntent } from "./api/lib/intent-detector";

const result = detectIntent("ديت 500 جنيه لحالة (صحبتي)");
console.log(result);
