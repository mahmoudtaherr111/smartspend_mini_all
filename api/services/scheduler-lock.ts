import type { RowDataPacket } from "mysql2/promise";
import { mysqlPool } from "../queries/connection";

interface LockAcquiredRow extends RowDataPacket {
  acquired: number | null;
}

/**
 * Holds a MySQL advisory lock on a dedicated connection while one scheduled
 * job runs.  Every replica may register the cron expression safely; at most
 * one will execute the named job at a time.
 */
export async function withScheduledJobLock(
  jobName: string,
  task: () => Promise<void>,
): Promise<boolean> {
  const connection = await mysqlPool.getConnection();
  const lockName = `smartspend:cron:${jobName}`;
  try {
    const [rows] = await connection.query<LockAcquiredRow[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [lockName],
    );
    if (Number(rows[0]?.acquired) !== 1) return false;
    try {
      await task();
      return true;
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } finally {
    connection.release();
  }
}
