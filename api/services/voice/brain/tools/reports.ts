/**
 * What was already written about the user's money, read as it is instead of being worked out again: a month's
 * report (the analysis tab's AI report in `ai_summaries`, else the month-end job's `monthly_reports`) and the
 * classification questions still waiting for the user. One indexed row or a few, cut down to what a spoken answer
 * needs, because every word handed to the live model is billed again on each later turn.
 */
import { and, desc, eq } from "drizzle-orm";
import { aiSummaries, monthlyReports, pendingClarifications } from "../../../../../db/schema";
import { businessDateKey } from "../../../../lib/app-time";
import { db } from "../../../../queries/connection";
import type { CallIdentity } from "../../gateway/call-session";

export interface StoredReport {
  source: "analysis" | "monthly_job";
  /** The Cairo date it was written, YYYY-MM-DD. */
  writtenOn: string | null;
  points: string[];
}

const MAX_POINTS = 3;
const MAX_POINT_CHARS = 140;

/** The report's first few real sentences, without markdown or headings. */
export function reportPoints(text: string): string[] {
  const points: string[] = [];
  for (const raw of text.split(/\n+|(?<=[.!؟?])\s+/)) {
    const line = raw
      .replace(/[#*_`>|]/g, " ")
      .replace(/^\s*(?:[-•–]|\d+[.)-])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 15) continue;
    points.push(line.length > MAX_POINT_CHARS ? `${line.slice(0, MAX_POINT_CHARS - 1)}…` : line);
    if (points.length >= MAX_POINTS) break;
  }
  return points;
}

function reportText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { response_text?: unknown };
    if (parsed && typeof parsed.response_text === "string") return parsed.response_text;
  } catch {
    // Plain text.
  }
  return content;
}

const day = (value: Date | string | null | undefined) => (value ? businessDateKey(new Date(value)) : null);

export async function readStoredReport(identity: CallIdentity, month: string): Promise<StoredReport | null> {
  const owner = and(eq(aiSummaries.userId, identity.userId), eq(aiSummaries.userType, identity.userType));
  const [analysis] = await db
    .select({ content: aiSummaries.content, createdAt: aiSummaries.createdAt })
    .from(aiSummaries)
    .where(and(owner, eq(aiSummaries.period, "monthly"), eq(aiSummaries.periodValue, month)))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  if (analysis) {
    const points = reportPoints(reportText(String(analysis.content)));
    if (points.length) return { source: "analysis", writtenOn: day(analysis.createdAt), points };
  }
  const [job] = await db
    .select({ insights: monthlyReports.insights, aiReport: monthlyReports.aiReport, createdAt: monthlyReports.createdAt })
    .from(monthlyReports)
    .where(and(eq(monthlyReports.userId, identity.userId), eq(monthlyReports.userType, identity.userType), eq(monthlyReports.month, month)))
    .orderBy(desc(monthlyReports.createdAt))
    .limit(1);
  const jobText = job ? String(job.aiReport ?? job.insights ?? "") : "";
  const points = jobText ? reportPoints(reportText(jobText)) : [];
  return points.length ? { source: "monthly_job", writtenOn: day(job?.createdAt), points } : null;
}

export interface WaitingEntry {
  /** The clarification's id, which record_draft takes to close it once the entry is recorded. */
  id: number;
  question: string;
  /** What the user first typed, so the entry can be recorded with their answer. */
  words: string;
}

const oneLine = (text: unknown, max: number) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Entries the classifier could not record without an answer, newest first: the ones the Home card lists, which the
 * call can offer to finish. `count` stops at 20.
 */
export async function readPendingQuestions(identity: CallIdentity, limit = 3): Promise<{ count: number; items: WaitingEntry[] }> {
  const rows = await db
    .select({ id: pendingClarifications.id, question: pendingClarifications.question, words: pendingClarifications.originalText })
    .from(pendingClarifications)
    .where(and(
      eq(pendingClarifications.userId, identity.userId),
      eq(pendingClarifications.userType, identity.userType),
      eq(pendingClarifications.status, "pending"),
    ))
    .orderBy(desc(pendingClarifications.createdAt))
    .limit(20);
  return {
    count: rows.length,
    items: rows.slice(0, limit).map((row) => ({ id: row.id, question: oneLine(row.question, 120), words: oneLine(row.words, 120) })),
  };
}
