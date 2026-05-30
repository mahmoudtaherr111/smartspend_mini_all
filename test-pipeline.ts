import { runPipelineV2Compat } from "./api/lib/pipeline-v2";

async function test() {
  try {
    const text1 = "اديت لمروان الف";
    const text2 = "اديت لمريم 500 جنيه";

    console.log("=== Testing: ", text1, " ===");
    const res1 = await runPipelineV2Compat(
      text1,
      { id: 1, type: "local" } as any,
      "free",
      null as any,
    );
    console.log("Decision:", res1.decision);
    console.log("ParsedBy:", res1.parsedBy);
    console.log("Items:", JSON.stringify(res1.items, null, 2));
    console.log("Log Entities:", res1.log.entitiesFound);

    console.log("\n=== Testing: ", text2, " ===");
    const res2 = await runPipelineV2Compat(
      text2,
      { id: 1, type: "local" } as any,
      "free",
      null as any,
    );
    console.log("Decision:", res2.decision);
    console.log("ParsedBy:", res2.parsedBy);
    console.log("Items:", JSON.stringify(res2.items, null, 2));
    console.log("Log Entities:", res2.log.entitiesFound);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

test();
