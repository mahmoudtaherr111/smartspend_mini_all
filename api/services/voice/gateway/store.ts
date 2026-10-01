/**
 * Where a call's short-lived state lives: Redis, so a dropped call can be picked up by any server, with the
 * process-memory fallback only where the cache runtime allows it (development). Tickets are single-use and
 * stored by hash; nothing here is written to MySQL.
 */
import { createHash } from "crypto";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  getCacheRuntimeStatus,
  getRedisClient,
} from "../../../lib/redis-client";

export const TICKET_TTL_SECONDS = 60;
export const CALL_STATE_TTL_SECONDS = 3 * 60 * 60;
/** How long the words of a call wait for the post-call summary before they are gone for good. */
export const TRANSCRIPT_TTL_SECONDS = 60 * 60;

export const hashSecret = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const ticketKey = (ticket: string) => `voice:ticket:${hashSecret(ticket)}`;
const callKey = (callId: string) => `voice:call:${callId}`;
const transcriptKey = (callId: string) => `voice:transcript:${callId}`;

/** True when there is somewhere to keep call state: Redis, or the memory fallback where it is allowed. */
export async function callStateAvailable(): Promise<boolean> {
  return (
    Boolean(await getRedisClient()) ||
    getCacheRuntimeStatus().memoryFallbackAllowed
  );
}

export async function putTicket<T>(ticket: string, payload: T): Promise<void> {
  await cacheSet(
    ticketKey(ticket),
    TICKET_TTL_SECONDS,
    JSON.stringify(payload),
  );
}

/** Returns the ticket's payload once; a second take of the same ticket gets null. */
export async function takeTicket<T>(ticket: string): Promise<T | null> {
  const key = ticketKey(ticket);
  const client = await getRedisClient();
  let raw: string | null = null;
  if (client) {
    try {
      const [value] = await client.multi().get(key).del(key).exec();
      raw = typeof value === "string" ? value : null;
    } catch {
      raw = null;
    }
    // The memory copy cacheSet may have kept must not answer a second take.
    await cacheDel(key);
  } else {
    raw = await cacheGet(key);
    await cacheDel(key);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const SAVE_CALL_LUA = `
local old = redis.call('GET', KEYS[1])
local candidate = cjson.decode(ARGV[1])
if old then
  local previous = cjson.decode(old)
  if previous.closed then return 0 end
  local previousEpoch = tonumber(previous.epoch or 0)
  local nextEpoch = tonumber(candidate.epoch or 0)
  if previousEpoch > nextEpoch or (previousEpoch == nextEpoch and previous.owner ~= candidate.owner) then return 0 end
  if previousEpoch == nextEpoch and tonumber(previous.revision or 0) > tonumber(candidate.revision or 0) then return 1 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`;

/** An older server cannot overwrite a takeover or recreate an ended call. */
export async function saveCallState<T>(
  callId: string,
  state: T,
): Promise<boolean> {
  const raw = JSON.stringify(state);
  const client = await getRedisClient();
  if (client)
    return (
      Number(
        await client.eval(SAVE_CALL_LUA, {
          keys: [callKey(callId)],
          arguments: [raw, String(CALL_STATE_TTL_SECONDS)],
        }),
      ) === 1
    );
  if (!getCacheRuntimeStatus().memoryFallbackAllowed) return false;
  const previous = await cacheGet(callKey(callId));
  const next = state as { epoch?: number; owner?: string; revision?: number };
  if (previous) {
    const prior = JSON.parse(previous) as {
      epoch?: number;
      owner?: string;
      revision?: number;
      closed?: boolean;
    };
    if (
      prior.closed ||
      (prior.epoch ?? 0) > (next.epoch ?? 0) ||
      ((prior.epoch ?? 0) === (next.epoch ?? 0) && prior.owner !== next.owner)
    )
      return false;
    if (
      (prior.epoch ?? 0) === (next.epoch ?? 0) &&
      (prior.revision ?? 0) > (next.revision ?? 0)
    )
      return true;
  }
  await cacheSet(callKey(callId), CALL_STATE_TTL_SECONDS, raw);
  return true;
}

export async function loadCallState<T>(callId: string): Promise<T | null> {
  const raw = await cacheGet(callKey(callId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.closed ? null : (parsed as T);
  } catch {
    return null;
  }
}

export async function deleteCallState(callId: string): Promise<void> {
  // A tombstone holds no user data, token or transcript; delayed checkpoints cannot resurrect the call.
  await cacheSet(
    callKey(callId),
    CALL_STATE_TTL_SECONDS,
    JSON.stringify({ closed: true }),
  );
}

export interface TranscriptLine {
  /**
   * `forgotten`: something the user asked to forget during the call (or from the memory screen while its summary was
   * pending). It travels with the words, lives as long as they do, and tells the summary what to leave out.
   */
  role: "user" | "assistant" | "forgotten";
  text: string;
}

/** Kept only until the post-call summary reads it; never in MySQL (the user's decision: no stored transcripts). */
export async function saveTranscript(
  callId: string,
  lines: TranscriptLine[],
): Promise<void> {
  await cacheSet(
    transcriptKey(callId),
    TRANSCRIPT_TTL_SECONDS,
    JSON.stringify(lines),
  );
}

/** Read without deleting, so a summary that fails can be tried again while the words are still here. */
export async function readTranscript(
  callId: string,
): Promise<TranscriptLine[] | null> {
  const raw = await cacheGet(transcriptKey(callId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TranscriptLine[]) : null;
  } catch {
    return null;
  }
}

export async function deleteTranscript(callId: string): Promise<void> {
  await cacheDel(transcriptKey(callId));
}

/** Adds a forgotten item to words still waiting for their summary; nothing when they are gone. */
export async function appendForgotten(
  callId: string,
  text: string,
): Promise<boolean> {
  const lines = await readTranscript(callId);
  if (!lines) return false;
  lines.push({ role: "forgotten", text });
  await saveTranscript(callId, lines);
  return true;
}
