import { classifyTransactionPipeline } from "./api/lib/classification-pipeline";

async function test() {
  const result = await classifyTransactionPipeline({
    text: "اديت ليوسف 1000 جنيه (صاحبي)",
    originalInput: "اديت ليوسف 1000 جنيه (صاحبي)",
  });
  console.log(JSON.stringify(result, null, 2));
}

test();
