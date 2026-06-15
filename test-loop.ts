import { getDb } from "./api/queries/connection";
import { pendingClarifications } from "./db/schema";
import { eq, desc } from "drizzle-orm";
import { env } from "./api/lib/env";
import { appRouter } from "./api/router";

async function simulate() {
  const db = getDb();
  const caller = appRouter.createCaller({
    user: { id: 1, type: "user", plan: "free", role: "user" }
  });

  const text = "اديت يحيى 500 جنيه واديت منه 200 جنيه واديت علاء 600 جنيه";
  
  console.log("1. Sending text to AI parser...");
  const parseResult = await caller.ai.parseExpense({ text, inputChannel: "text" });
  
  console.log("Decision:", parseResult.decision);
  console.log("Clarification Question:", parseResult.clarificationQuestion);
  
  if (parseResult.decision === "clarify") {
    let clarId = parseResult.clarificationId;
    let needsClarification = true;
    
    // Simulate frontend answering
    let step = 1;
    while (needsClarification && clarId) {
       console.log(`\n--- Step ${step} ---`);
       console.log(`Answering clarification ${clarId} with 'اخويا'...`);
       
       const answerResult = await caller.expense.answerClarification({
         clarificationId: clarId,
         answer: "اخويا"
       });
       
       console.log("Success:", answerResult.success);
       console.log("Needs Clarification:", answerResult.needsClarification);
       console.log("Enriched Text:", answerResult.enrichedText);
       console.log("Next Question:", answerResult.clarificationQuestion);
       
       needsClarification = answerResult.needsClarification;
       step++;
    }
    
    console.log("\nFinished loop!");
  }
}

simulate().catch(console.error);
