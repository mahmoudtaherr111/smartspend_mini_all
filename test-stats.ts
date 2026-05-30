import "dotenv/config";
import { db } from "./api/queries/connection";
import { expenses } from "./db/schema";
import { eq } from "drizzle-orm";

async function main() {
  try {
    const allExpenses = await db.select().from(expenses).limit(100);
    console.log(`Fetched ${allExpenses.length} expenses.`);

    // Let's test the exact stats parsing logic on all fetched expenses
    allExpenses.forEach((item, index) => {
      try {
        const d = new Date(item.date);
        const iso = d.toISOString();
        const split = iso.split("T")[0];
      } catch (err: any) {
        console.error(
          `Expense ID ${item.id} has invalid date:`,
          item.date,
          "Error:",
          err.message,
        );
      }
    });

    console.log("Stats parsing logic check completed.");
  } catch (err) {
    console.error("Error during check:", err);
  }
  process.exit(0);
}

main().catch(console.error);
