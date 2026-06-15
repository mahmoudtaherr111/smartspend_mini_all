import * as fs from "fs";
import * as readline from "readline";

async function main() {
  const filePath = "C:\\Users\\hp\\.gemini\\antigravity\\brain\\b87408ec-e60f-45ed-9f62-038493b03509\\.system_generated\\logs\\transcript.jsonl";
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("Searching transcript for API key changes or previous configurations...");
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes("GEMINI_API_KEY") || line.includes("voice_call_model") || line.includes("bidiGenerateContent")) {
      // Print first 300 chars of the line to keep it clean
      console.log(`Line ${lineNum}: ${line.substring(0, 300)}`);
    }
  }
  console.log("Done searching.");
}

main();
