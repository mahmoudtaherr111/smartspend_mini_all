import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function main() {
  const TEXT = "جبت فطار فول وطعمية بـ 35 وركبت ميكروباص بـ 7.5 وبعدها قعدت على القهوة بـ 50";
  const r1 = await runSmartPipeline({ text: TEXT, apiKey: "", knownPeople: [] });
  console.dir(r1, { depth: null });
}

main();
