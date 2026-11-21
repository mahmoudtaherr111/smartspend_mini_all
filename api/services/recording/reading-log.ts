/**
 * The reading log rows a save points at, loaded once per request and only the user's own.
 */
import { and, eq, inArray } from "drizzle-orm";
import { classificationLogs } from "../../../db/schema";
import { getDb } from "../../queries/connection";

/** Log id → its stored items (`final_result`), for the ids that are the user's. */
export async function loadReadingLogItems(
  owner: { userId: number; userType: string },
  logIds: Array<number | null | undefined>,
): Promise<Map<number, unknown>> {
  const ids = [...new Set(logIds.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  // cls_log_user_idx (user_id, user_type); the ids bound the rows
  const rows = await getDb()
    .select({ id: classificationLogs.id, finalResult: classificationLogs.finalResult })
    .from(classificationLogs)
    .where(and(eq(classificationLogs.userId, owner.userId), eq(classificationLogs.userType, owner.userType), inArray(classificationLogs.id, ids)))
    .limit(ids.length);
  return new Map(rows.map((row) => [row.id, row.finalResult]));
}
