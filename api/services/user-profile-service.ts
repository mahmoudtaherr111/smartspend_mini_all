import { and, eq } from "drizzle-orm";
import {
  localUsers,
  profileLearningEvents,
  userProfiles,
  users,
} from "../../db/schema";

export const SMART_PROFILE_VERSION = 2;

export type UserType = "local" | "oauth" | string;

export interface UserIdentity {
  id: number;
  type: UserType;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
}

export interface SmartUserProfile {
  basicInfo: Record<string, unknown>;
  financialInfo: Record<string, unknown>;
  lifestyleInfo: Record<string, unknown>;
  onboardingAnswers: Record<string, OnboardingAnswer>;
  aiInferredAttributes: Record<string, unknown>;
  preferences: Record<string, unknown>;
  avatarId: string | null;
  profileVersion: number;
  profileCompleted: boolean;
  lastAiRefreshAt: Date | null;
  legacy: {
    monthlyIncome: number | null;
    financialGoal: string | null;
    financialPersonality: string | null;
  };
}

export interface OnboardingAnswer {
  value: unknown;
  skipped?: boolean;
  answeredAt?: string;
  updatedAt?: string;
}

export interface SmartProfilePatch {
  basicInfo?: Record<string, unknown>;
  financialInfo?: Record<string, unknown>;
  lifestyleInfo?: Record<string, unknown>;
  onboardingAnswers?: Record<string, OnboardingAnswer>;
  aiInferredAttributes?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  avatarId?: string | null;
  profileCompleted?: boolean;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deepMerge(
  base: Record<string, unknown>,
  patch?: Record<string, unknown>
): Record<string, unknown> {
  if (!patch) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = next[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      next[key] = deepMerge(
        current as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function buildDefaultSmartProfile(
  identity: UserIdentity,
  legacy?: {
    monthlyIncome?: unknown;
    financialGoal?: string | null;
    financialPersonality?: string | null;
    profileCompleted?: boolean | null;
    basicInfo?: unknown;
    financialInfo?: unknown;
    lifestyleInfo?: unknown;
    onboardingAnswers?: unknown;
    aiInferredAttributes?: unknown;
    preferences?: unknown;
    avatarId?: string | null;
    profileVersion?: number | null;
    lastAiRefreshAt?: Date | null;
  } | null
): SmartUserProfile {
  const monthlyIncome = toNumber(legacy?.monthlyIncome);
  const financialGoal = legacy?.financialGoal ?? null;
  const financialPersonality = legacy?.financialPersonality ?? null;

  const basicInfo = deepMerge(
    {
      name: identity.name ?? null,
      phone: identity.phone ?? null,
      email: identity.email ?? null,
      profession: null,
    },
    asObject(legacy?.basicInfo)
  );

  const financialInfo = deepMerge(
    {
      averageMonthlyIncome: monthlyIncome,
      incomeSources: [],
      spendingPattern: null,
    },
    asObject(legacy?.financialInfo)
  );

  if (financialGoal && !financialInfo.primaryGoal) {
    financialInfo.primaryGoal = financialGoal;
  }

  return {
    basicInfo,
    financialInfo,
    lifestyleInfo: deepMerge(
      {
        hasChildren: null,
        childrenCount: null,
        childrenAges: [],
        responsibleForFamily: null,
        livesAlone: null,
        supportsOthers: [],
        fixedMonthlyCommitments: null,
      },
      asObject(legacy?.lifestyleInfo)
    ),
    onboardingAnswers: asObject(legacy?.onboardingAnswers) as Record<
      string,
      OnboardingAnswer
    >,
    aiInferredAttributes: deepMerge(
      {
        financialStability: null,
        topSpendingCategories: [],
        topSpendingDays: [],
        weeklySpendingPattern: null,
        spendingBehavior: null,
        hasSpikeSpending: false,
        financialPersonality,
      },
      asObject(legacy?.aiInferredAttributes)
    ),
    preferences: deepMerge(
      {
        reportStyle: "balanced",
        detailLevel: "summary",
        alertsEnabled: true,
        questionFriction: "medium",
      },
      asObject(legacy?.preferences)
    ),
    avatarId: legacy?.avatarId ?? null,
    profileVersion: legacy?.profileVersion ?? SMART_PROFILE_VERSION,
    profileCompleted: Boolean(legacy?.profileCompleted),
    lastAiRefreshAt: legacy?.lastAiRefreshAt ?? null,
    legacy: {
      monthlyIncome,
      financialGoal,
      financialPersonality,
    },
  };
}

export function mergeSmartProfilePatch(
  current: SmartUserProfile,
  patch: SmartProfilePatch
): SmartUserProfile {
  return {
    ...current,
    basicInfo: deepMerge(current.basicInfo, patch.basicInfo),
    financialInfo: deepMerge(current.financialInfo, patch.financialInfo),
    lifestyleInfo: deepMerge(current.lifestyleInfo, patch.lifestyleInfo),
    onboardingAnswers: {
      ...current.onboardingAnswers,
      ...(patch.onboardingAnswers || {}),
    },
    aiInferredAttributes: deepMerge(
      current.aiInferredAttributes,
      patch.aiInferredAttributes
    ),
    preferences: deepMerge(current.preferences, patch.preferences),
    avatarId:
      patch.avatarId === undefined ? current.avatarId : patch.avatarId,
    profileCompleted:
      patch.profileCompleted === undefined
        ? current.profileCompleted
        : patch.profileCompleted,
    profileVersion: SMART_PROFILE_VERSION,
  };
}

async function getIdentity(userId: number, userType: string): Promise<UserIdentity> {
  const { db } = await import("../queries/connection");
  if (userType === "oauth") {
    const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
    return {
      id: userId,
      type: userType,
      name: row?.name,
      email: row?.email,
      avatar: row?.avatar,
    };
  }
  const row = await db.query.localUsers.findFirst({
    where: eq(localUsers.id, userId),
  });
  return {
    id: userId,
    type: userType,
    name: row?.name,
    phone: row?.phone,
    email: row?.email,
  };
}

export async function getSmartProfile(
  userId: number,
  userType: string
): Promise<SmartUserProfile> {
  const { db } = await import("../queries/connection");
  const [identity, rows] = await Promise.all([
    getIdentity(userId, userType),
    db
      .select()
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)))
      .limit(1),
  ]);

  const row = rows[0];
  const profile = buildDefaultSmartProfile(identity, row);

  if (!row) {
    await saveSmartProfile(userId, userType, profile);
  }

  return profile;
}

export async function saveSmartProfile(
  userId: number,
  userType: string,
  profile: SmartUserProfile
): Promise<void> {
  const { db } = await import("../queries/connection");
  const monthlyIncome = toNumber(profile.financialInfo.averageMonthlyIncome);
  const financialGoal =
    typeof profile.financialInfo.primaryGoal === "string"
      ? profile.financialInfo.primaryGoal
      : profile.legacy.financialGoal;
  const financialPersonality =
    typeof profile.aiInferredAttributes.financialPersonality === "string"
      ? profile.aiInferredAttributes.financialPersonality
      : profile.legacy.financialPersonality;

  await db
    .insert(userProfiles)
    .values({
      userId,
      userType,
      monthlyIncome: monthlyIncome === null ? undefined : monthlyIncome.toString(),
      financialGoal,
      financialPersonality,
      basicInfo: profile.basicInfo,
      financialInfo: profile.financialInfo,
      lifestyleInfo: profile.lifestyleInfo,
      onboardingAnswers: profile.onboardingAnswers,
      aiInferredAttributes: profile.aiInferredAttributes,
      preferences: profile.preferences,
      avatarId: profile.avatarId,
      profileVersion: SMART_PROFILE_VERSION,
      profileCompleted: profile.profileCompleted,
      lastAiRefreshAt: profile.lastAiRefreshAt ?? undefined,
      lastAskedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        monthlyIncome: monthlyIncome === null ? undefined : monthlyIncome.toString(),
        financialGoal,
        financialPersonality,
        basicInfo: profile.basicInfo,
        financialInfo: profile.financialInfo,
        lifestyleInfo: profile.lifestyleInfo,
        onboardingAnswers: profile.onboardingAnswers,
        aiInferredAttributes: profile.aiInferredAttributes,
        preferences: profile.preferences,
        avatarId: profile.avatarId,
        profileVersion: SMART_PROFILE_VERSION,
        profileCompleted: profile.profileCompleted,
        lastAiRefreshAt: profile.lastAiRefreshAt ?? undefined,
        lastAskedAt: new Date(),
      },
    });
}

export async function updateSmartProfile(
  userId: number,
  userType: string,
  patch: SmartProfilePatch
): Promise<SmartUserProfile> {
  const current = await getSmartProfile(userId, userType);
  const next = mergeSmartProfilePatch(current, patch);
  await saveSmartProfile(userId, userType, next);
  return next;
}

export function summarizeProfileForAI(profile: SmartUserProfile): string {
  const financialInfo = profile.financialInfo;
  const lifestyleInfo = profile.lifestyleInfo;
  const inferred = profile.aiInferredAttributes;
  const preferences = profile.preferences;

  return [
    `Monthly income: ${financialInfo.averageMonthlyIncome ?? "unknown"}`,
    `Income sources: ${Array.isArray(financialInfo.incomeSources) ? financialInfo.incomeSources.join(", ") : "unknown"}`,
    `Goal: ${financialInfo.primaryGoal ?? "unknown"}`,
    `Has children: ${lifestyleInfo.hasChildren ?? "unknown"}`,
    `Responsible for family: ${lifestyleInfo.responsibleForFamily ?? "unknown"}`,
    `Supports others: ${Array.isArray(lifestyleInfo.supportsOthers) ? lifestyleInfo.supportsOthers.join(", ") : "unknown"}`,
    `Fixed commitments: ${lifestyleInfo.fixedMonthlyCommitments ?? "unknown"}`,
    `Financial stability: ${inferred.financialStability ?? "unknown"}`,
    `Spending behavior: ${inferred.spendingBehavior ?? "unknown"}`,
    `Report preference: ${preferences.detailLevel ?? "summary"}`,
  ].join("\n");
}

export async function recordProfileLearningEvent(input: {
  userId: number;
  userType: string;
  eventType: string;
  source?: string;
  previousAttributes?: Record<string, unknown>;
  newAttributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { db } = await import("../queries/connection");
  await db
    .insert(profileLearningEvents)
    .values({
      userId: input.userId,
      userType: input.userType,
      eventType: input.eventType,
      source: input.source || "backend",
      previousAttributes: input.previousAttributes || {},
      newAttributes: input.newAttributes || {},
      metadata: input.metadata || {},
    })
    .catch(() => {});
}
