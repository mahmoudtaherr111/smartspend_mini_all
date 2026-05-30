import "dotenv/config";
import { getSmartProfile } from "./api/services/user-profile-service.js";
import { appRouter } from "./api/router.ts";
import { db } from "./api/queries/connection.js";

async function run() {
  try {
    const caller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 3, type: "local" }
    });

    console.log("Calling expense.list...");
    const res = await caller.expense.list({ limit: 7 });
    console.log("Success:", res);
  } catch (err) {
    console.error("Error calling expense.list:", err);
  }
  process.exit(0);
}

run();
