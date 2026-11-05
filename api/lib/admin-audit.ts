import { db } from "../queries/connection";
import { adminAuditLogs } from "../../db/schema";
import { createLogger } from "./log";

const logger = createLogger("admin-audit");

export interface AdminAuditEntry {
  action: string;
  targetType: string;
  targetId: string | number;
  details?: Record<string, unknown> | null;
}

export async function logAdminAction(
  ctx: { user?: { id: number; type: string } | null; ip?: string; audit?: { written: boolean } },
  entry: AdminAuditEntry,
): Promise<void> {
  if (!ctx.user || !entry.action || !entry.targetType) return;
  // The staff middleware (api/middleware.ts) then adds no second, poorer entry for the same request.
  if (ctx.audit) ctx.audit.written = true;

  try {
    await db.insert(adminAuditLogs).values({
      adminId: ctx.user.id,
      adminType: ctx.user.type,
      action: entry.action,
      targetType: entry.targetType,
      targetId: String(entry.targetId),
      details: entry.details ?? null,
      ipAddress: ctx.ip || "127.0.0.1",
    });
  } catch (error) {
    logger.warn({ action: entry.action, targetType: entry.targetType, err: error }, "Failed to persist admin audit log");
  }
}
