import { randomUUID } from "crypto";
import { getCacheRuntimeStatus, getRedisClient } from "../../lib/redis-client";
import type {
  VoicePendingAction,
  VoiceSessionInput,
  VoiceSessionState,
} from "./types";

const VOICE_SESSION_TTL_SECONDS = 60 * 60;
const memoryStore = new Map<string, { expiresAtMs: number; state: VoiceSessionState }>();

function sessionKey(sessionId: string): string {
  return `voice_session:${sessionId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiresIso(): string {
  return new Date(Date.now() + VOICE_SESSION_TTL_SECONDS * 1000).toISOString();
}

function cloneState(state: VoiceSessionState): VoiceSessionState {
  return JSON.parse(JSON.stringify(state)) as VoiceSessionState;
}

function pruneMemoryStore(): void {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAtMs <= now) memoryStore.delete(key);
  }
}

function canUseMemoryFallback(): boolean {
  return getCacheRuntimeStatus().memoryFallbackAllowed;
}

function voiceSessionRedisRequiredError(): Error {
  return new Error("Voice session state requires Redis when memory cache fallback is disabled.");
}

async function saveState(state: VoiceSessionState): Promise<VoiceSessionState> {
  const next = {
    ...state,
    updatedAt: nowIso(),
  };

  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.setEx(sessionKey(next.sessionId), VOICE_SESSION_TTL_SECONDS, JSON.stringify(next));
      return cloneState(next);
    } catch (error) {
      console.warn("[Voice Session] Redis set failed, using memory fallback", error);
    }
  }

  if (!canUseMemoryFallback()) {
    throw voiceSessionRedisRequiredError();
  }

  pruneMemoryStore();
  memoryStore.set(next.sessionId, {
    expiresAtMs: Date.now() + VOICE_SESSION_TTL_SECONDS * 1000,
    state: cloneState(next),
  });
  return cloneState(next);
}

export async function createVoiceSessionState(input: VoiceSessionInput): Promise<VoiceSessionState> {
  const startedAt = nowIso();
  return saveState({
    sessionId: input.sessionId ?? `voice_${randomUUID()}`,
    userId: input.userId,
    userType: input.userType,
    userPlan: input.userPlan,
    status: "active",
    startedAt,
    updatedAt: startedAt,
    expiresAt: expiresIso(),
    pendingActions: [],
  });
}

export async function getVoiceSessionState(sessionId: string): Promise<VoiceSessionState | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(sessionKey(sessionId));
      if (cached) return JSON.parse(cached) as VoiceSessionState;
    } catch (error) {
      console.warn("[Voice Session] Redis get failed, using memory fallback", error);
    }
  }

  if (!canUseMemoryFallback()) {
    return null;
  }

  pruneMemoryStore();
  const entry = memoryStore.get(sessionId);
  return entry ? cloneState(entry.state) : null;
}

export async function updateVoiceSessionState(
  sessionId: string,
  updater: (state: VoiceSessionState) => VoiceSessionState,
): Promise<VoiceSessionState | null> {
  const current = await getVoiceSessionState(sessionId);
  if (!current) return null;
  return saveState(updater(current));
}

export async function addVoicePendingAction(
  sessionId: string,
  action: VoicePendingAction,
): Promise<VoicePendingAction> {
  const updated = await updateVoiceSessionState(sessionId, (state) => ({
    ...state,
    pendingActions: [
      ...state.pendingActions.filter((item) => item.id !== action.id),
      action,
    ],
  }));

  if (!updated) {
    throw new Error("Voice session not found");
  }
  return action;
}

export async function getVoicePendingAction(
  sessionId: string,
  actionId?: string,
): Promise<VoicePendingAction | null> {
  const state = await getVoiceSessionState(sessionId);
  if (!state) return null;

  const pending = state.pendingActions.filter((action) => action.status === "pending_confirmation");
  if (actionId) return pending.find((action) => action.id === actionId) ?? null;
  return pending[pending.length - 1] ?? null;
}

export async function updateVoicePendingAction(
  sessionId: string,
  actionId: string,
  patch: Partial<VoicePendingAction>,
): Promise<VoicePendingAction | null> {
  let nextAction: VoicePendingAction | null = null;
  const updated = await updateVoiceSessionState(sessionId, (state) => ({
    ...state,
    pendingActions: state.pendingActions.map((action) => {
      if (action.id !== actionId) return action;
      nextAction = {
        ...action,
        ...patch,
        updatedAt: nowIso(),
      };
      return nextAction;
    }),
  }));

  if (!updated) return null;
  return nextAction;
}

export async function endVoiceSessionState(sessionId: string): Promise<void> {
  await updateVoiceSessionState(sessionId, (state) => ({
    ...state,
    status: "ended",
  }));
}

export async function clearVoiceSessionState(sessionId: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del(sessionKey(sessionId));
    } catch (error) {
      console.warn("[Voice Session] Redis delete failed", error);
    }
  }
  memoryStore.delete(sessionId);
}

export const voiceSessionTestUtils = {
  clearMemoryStore(): void {
    memoryStore.clear();
  },
};
