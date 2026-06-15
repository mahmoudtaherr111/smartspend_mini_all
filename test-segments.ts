process.env.DATABASE_URL = "mysql://a:b@localhost:3306/db";
process.env.GOOGLE_CLIENT_ID = "mock";
process.env.GOOGLE_CLIENT_SECRET = "mock";
process.env.JWT_SECRET = "mock";
process.env.GEMINI_API_KEY = "mock";

import { runRuleEngine } from "./api/lib/rule-engine";

async function main() {
  const segments = [
    "ودفعت 100 جنيه للقهوجي"
  ];
  
  for (const seg of segments) {
    const res = await runRuleEngine(seg, [], undefined);
    console.log("Segment:", seg);
    console.dir(res, { depth: null });
  }
}

main();
