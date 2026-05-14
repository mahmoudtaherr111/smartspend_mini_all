import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);

  // Backfill only recent rows (last 90 days) to keep migration safe and fast.
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [rows] = await connection.query(
    "SELECT id, decision, confidence FROM classification_logs WHERE created_at >= ? AND classification_version IS NULL",
    [since]
  ) as any[];

  for (const row of rows as Array<{ id: number; decision: string | null; confidence: number | null }>) {
    await connection.query(
      "UPDATE classification_logs SET classification_version = ?, input_channel = ?, needs_followup = ? WHERE id = ?",
      ["v2.1", "text", row.decision === "clarify" || (row.confidence ?? 0) < 60, row.id]
    );
  }

  console.log(`Backfilled ${(rows as any[]).length} classification logs`);
  await connection.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
