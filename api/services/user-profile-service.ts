import { and, eq } from "drizzle-orm";
import {
  localUsers,
  profileLearningEvents,
  userProfiles,
  users,
} from "../../db/schema";
import { normalizeRelationship } from "../lib/relationship-normalizer";

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
  gamification: {
    currentStreak: number;
    highestStreak: number;
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
  // Handle string JSON (columns are longtext, MySQL2 returns raw strings)
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
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
  patch?: Record<string, unknown>,
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
        value as Record<string, unknown>,
      );
    } else {
      next[key] = value;
    }
  }
  return next;
}

function isSmartProfileSchemaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return (
    message.includes("user_profiles") &&
    [
      "basic_info",
      "financial_info",
      "lifestyle_info",
      "onboarding_answers",
      "ai_inferred_attributes",
      "preferences",
      "avatar_id",
      "profile_version",
      "last_ai_refresh_at",
    ].some((column) => message.includes(column))
  );
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
    currentStreak?: number | null;
    highestStreak?: number | null;
  } | null,
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
    asObject(legacy?.basicInfo),
  );

  const financialInfo = deepMerge(
    {
      averageMonthlyIncome: monthlyIncome,
      incomeSources: [],
      spendingPattern: null,
    },
    asObject(legacy?.financialInfo),
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
        childrenNames: [],
        childrenAges: [],
        responsibleForFamily: null,
        livesAlone: null,
        supportsOthers: [],
        fixedMonthlyCommitments: null,
        partnerName: null,
        carOwnership: null,
        carType: null,
        monthlyCarCost: null,
        hasPets: null,
        petNames: [],
        smoking: null,
        subscriptions: [],
        regularContacts: [],
        favoriteSpendingPlaces: [],
        dynamicContacts: [],
      },
      asObject(legacy?.lifestyleInfo),
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
      asObject(legacy?.aiInferredAttributes),
    ),
    preferences: deepMerge(
      {
        reportStyle: "balanced",
        detailLevel: "summary",
        alertsEnabled: true,
        questionFriction: "medium",
      },
      asObject(legacy?.preferences),
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
    gamification: {
      currentStreak: legacy?.currentStreak ?? 0,
      highestStreak: legacy?.highestStreak ?? 0,
    },
  };
}

export function mergeSmartProfilePatch(
  current: SmartUserProfile,
  patch: SmartProfilePatch,
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
      patch.aiInferredAttributes,
    ),
    preferences: deepMerge(current.preferences, patch.preferences),
    avatarId: patch.avatarId === undefined ? current.avatarId : patch.avatarId,
    profileCompleted:
      patch.profileCompleted === undefined
        ? current.profileCompleted
        : patch.profileCompleted,
    profileVersion: SMART_PROFILE_VERSION,
  };
}

async function getIdentity(
  userId: number,
  userType: string,
): Promise<UserIdentity> {
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
  userType: string,
): Promise<SmartUserProfile> {
  const { db } = await import("../queries/connection");
  const identity = await getIdentity(userId, userType);

  let row: any | undefined;
  try {
    const rows = await db
      .select()
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, userId),
          eq(userProfiles.userType, userType),
        ),
      )
      .limit(1);
    row = rows[0];
  } catch (err) {
    if (!isSmartProfileSchemaError(err)) throw err;

    console.warn(
      "[getSmartProfile] Full read failed, attempting auto-repair...",
    );
    try {
      await autoRepairProfileSchema();
      // Retry full read after repair
      const rows = await db
        .select()
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.userId, userId),
            eq(userProfiles.userType, userType),
          ),
        )
        .limit(1);
      row = rows[0];
      console.log("[getSmartProfile] Auto-repair + retry succeeded!");
    } catch (retryErr) {
      console.error(
        "[getSmartProfile] Retry failed, using legacy read:",
        retryErr instanceof Error ? retryErr.message : retryErr,
      );
      const legacyRows = await db
        .select({
          monthlyIncome: userProfiles.monthlyIncome,
          financialGoal: userProfiles.financialGoal,
          financialPersonality: userProfiles.financialPersonality,
          profileCompleted: userProfiles.profileCompleted,
        })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.userId, userId),
            eq(userProfiles.userType, userType),
          ),
        )
        .limit(1);

      row = legacyRows[0];
    }
  }

  // Fetch streak from the user identity table (users or localUsers)
  let currentStreak = 0;
  let highestStreak = 0;
  if (userType === "oauth") {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (u) {
      currentStreak = u.currentStreak || 0;
      highestStreak = u.highestStreak || 0;
    }
  } else {
    const u = await db.query.localUsers.findFirst({
      where: eq(localUsers.id, userId),
    });
    if (u) {
      currentStreak = u.currentStreak || 0;
      highestStreak = u.highestStreak || 0;
    }
  }

  if (row) {
    row.currentStreak = currentStreak;
    row.highestStreak = highestStreak;
  } else {
    row = { currentStreak, highestStreak };
  }

  const result = buildDefaultSmartProfile(identity, row);
  
  // Phase 3: Smart Data Stitching
  try {
    const { userContacts, profileLearningEvents } = await import("../../db/schema");
    const { desc } = await import("drizzle-orm");
    
    // Fetch user contacts
    const contacts = await db
      .select({
        name: userContacts.name,
        relationship: userContacts.relation
      })
      .from(userContacts)
      .where(and(eq(userContacts.userId, userId), eq(userContacts.userType, userType)))
      .limit(50);
      
    if (contacts.length > 0) {
      result.aiInferredAttributes.knownPeople = contacts as any;
    }
    
    // Fetch latest learning events for context injection.
    const events = await db
      .select({
        eventType: profileLearningEvents.eventType,
        metadata: profileLearningEvents.metadata,
      })
      .from(profileLearningEvents)
      .where(and(eq(profileLearningEvents.userId, userId), eq(profileLearningEvents.userType, userType)))
      .orderBy(desc(profileLearningEvents.createdAt))
      .limit(5);

    if (events.length > 0) {
      result.aiInferredAttributes.spendingBehavior =
        (result.aiInferredAttributes.spendingBehavior ? result.aiInferredAttributes.spendingBehavior + "\\n" : "") +
        "أحدث أحداث التعلم:\\n" +
        events
          .map((e) => {
            const meta =
              e.metadata && typeof e.metadata === "object"
                ? JSON.stringify(e.metadata).slice(0, 160)
                : "";
            return `- ${e.eventType}${meta ? `: ${meta}` : ""}`;
          })
          .join("\\n");
    }
  } catch(err) {
    console.error("[getSmartProfile] Failed to load extra smart context:", err);
  }

  console.log(
    `[getSmartProfile] user=${userId}, hasRow=${!!row}, hasOnboardingAnswers=${row?.onboardingAnswers ? Object.keys(row.onboardingAnswers).length : 0}, resultAnswers=${Object.keys(result.onboardingAnswers).length}`,
  );
  return result;
}

export async function saveSmartProfile(
  userId: number,
  userType: string,
  profile: SmartUserProfile,
): Promise<void> {
  const { db } = await import("../queries/connection");
  const { sql: sqlTag } = await import("drizzle-orm");

  const monthlyIncome = toNumber(profile.financialInfo.averageMonthlyIncome);
  const financialGoal =
    typeof profile.financialInfo.primaryGoal === "string"
      ? profile.financialInfo.primaryGoal
      : profile.legacy.financialGoal;
  const financialPersonality =
    typeof profile.aiInferredAttributes.financialPersonality === "string"
      ? profile.aiInferredAttributes.financialPersonality
      : profile.legacy.financialPersonality;

  // Explicitly serialize ALL JSON fields — columns are longtext, not json type
  const onboardingJson = JSON.stringify(profile.onboardingAnswers || {});
  const basicJson = JSON.stringify(profile.basicInfo || {});
  const financialJson = JSON.stringify(profile.financialInfo || {});
  const lifestyleJson = JSON.stringify(profile.lifestyleInfo || {});
  const inferredJson = JSON.stringify(profile.aiInferredAttributes || {});
  const prefsJson = JSON.stringify(profile.preferences || {});
  const completed = profile.profileCompleted ? 1 : 0;

  try {
    // Use raw SQL with parameterized values — 100% reliable regardless of column types
    await db.execute(
      sqlTag`INSERT INTO user_profiles
        (user_id, user_type, monthly_income, financial_goal, financial_personality,
         profile_completed, onboarding_answers, basic_info, financial_info,
         lifestyle_info, ai_inferred_attributes, preferences, avatar_id,
         profile_version)
        VALUES
        (${userId}, ${userType}, ${monthlyIncome}, ${financialGoal}, ${financialPersonality},
         ${completed}, ${onboardingJson}, ${basicJson}, ${financialJson},
         ${lifestyleJson}, ${inferredJson}, ${prefsJson}, ${profile.avatarId},
         ${SMART_PROFILE_VERSION})
        ON DUPLICATE KEY UPDATE
          monthly_income = VALUES(monthly_income),
          financial_goal = VALUES(financial_goal),
          financial_personality = VALUES(financial_personality),
          profile_completed = VALUES(profile_completed),
          onboarding_answers = VALUES(onboarding_answers),
          basic_info = VALUES(basic_info),
          financial_info = VALUES(financial_info),
          lifestyle_info = VALUES(lifestyle_info),
          ai_inferred_attributes = VALUES(ai_inferred_attributes),
          preferences = VALUES(preferences),
          avatar_id = VALUES(avatar_id),
          profile_version = VALUES(profile_version)`,
    );
    console.log(
      `[saveSmartProfile] ✅ Saved. answers=${Object.keys(profile.onboardingAnswers).length}, completed=${profile.profileCompleted}`,
    );
  } catch (err) {
    console.error(
      "[saveSmartProfile] Save failed:",
      err instanceof Error ? err.message : err,
    );

    // Fallback: try saving just the legacy columns
    try {
      await db
        .insert(userProfiles)
        .values({
          userId,
          userType,
          monthlyIncome:
            monthlyIncome === null ? undefined : monthlyIncome.toString(),
          financialGoal,
          financialPersonality,
          profileCompleted: profile.profileCompleted,
          onboardingAnswers: profile.onboardingAnswers,
        })
        .onDuplicateKeyUpdate({
          set: {
            monthlyIncome:
              monthlyIncome === null ? undefined : monthlyIncome.toString(),
            financialGoal,
            financialPersonality,
            profileCompleted: profile.profileCompleted,
            onboardingAnswers: profile.onboardingAnswers,
          },
        });
      console.warn(
        "[saveSmartProfile] ⚠️ Legacy fallback used — JSON data NOT saved!",
      );
    } catch (legacyErr) {
      console.error("[saveSmartProfile] Even legacy save failed:", legacyErr);
      throw err;
    }
  }
}

/**
 * Auto-repair: add missing JSON columns to user_profiles if they don't exist.
 */
async function autoRepairProfileSchema(): Promise<void> {
  const { db } = await import("../queries/connection");
  const requiredColumns = [
    { name: "basic_info", type: "JSON DEFAULT NULL" },
    { name: "financial_info", type: "JSON DEFAULT NULL" },
    { name: "lifestyle_info", type: "JSON DEFAULT NULL" },
    { name: "onboarding_answers", type: "JSON DEFAULT NULL" },
    { name: "ai_inferred_attributes", type: "JSON DEFAULT NULL" },
    { name: "preferences", type: "JSON DEFAULT NULL" },
    { name: "avatar_id", type: "VARCHAR(100) DEFAULT NULL" },
    { name: "profile_version", type: "INT DEFAULT 2" },
    { name: "last_ai_refresh_at", type: "DATETIME DEFAULT NULL" },
    { name: "last_asked_at", type: "DATETIME DEFAULT NULL" },
  ];

  for (const col of requiredColumns) {
    try {
      await db.execute(
        `ALTER TABLE user_profiles ADD COLUMN \`${col.name}\` ${col.type}`,
      );
      console.log(`  [auto-repair] Added column: ${col.name}`);
    } catch (e: any) {
      // Column already exists — ignore
      if (!e.message?.includes("Duplicate column")) {
        console.warn(`  [auto-repair] Could not add ${col.name}:`, e.message);
      }
    }
  }
}

export async function updateSmartProfile(
  userId: number,
  userType: string,
  patch: SmartProfilePatch,
): Promise<SmartUserProfile> {
  const current = await getSmartProfile(userId, userType);
  const next = mergeSmartProfilePatch(current, patch);

  // Sync: when profile is edited directly, mark corresponding onboarding questions as answered
  if (patch.financialInfo || patch.lifestyleInfo || patch.basicInfo) {
    next.onboardingAnswers = syncOnboardingAnswersFromProfile(next);
  }

  await saveSmartProfile(userId, userType, next);
  return next;
}

/**
 * Derive onboarding answer state from the structured profile fields.
 * Ensures if a user edits their profile directly, the onboarding engine
 * knows those questions are already answered and won't re-ask them.
 */
function syncOnboardingAnswersFromProfile(
  profile: SmartUserProfile,
): Record<string, OnboardingAnswer> {
  const answers = { ...profile.onboardingAnswers };
  const now = new Date().toISOString();
  const fi = profile.financialInfo as Record<string, any>;
  const li = profile.lifestyleInfo as Record<string, any>;
  const bi = profile.basicInfo as Record<string, any>;

  function markAnswered(key: string, value: unknown) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== false
    ) {
      if (!answers[key]) {
        answers[key] = {
          value,
          skipped: false,
          answeredAt: now,
          updatedAt: now,
        };
      } else {
        answers[key] = { ...answers[key], value, updatedAt: now };
      }
    }
  }

  // Financial
  if (fi.averageMonthlyIncome)
    markAnswered("income_level", fi.averageMonthlyIncome);
  if (Array.isArray(fi.incomeSources) && fi.incomeSources.length > 0)
    markAnswered("income_sources", fi.incomeSources);
  if (fi.primaryGoal) markAnswered("app_goal", fi.primaryGoal);
  if (fi.hasDebt !== null && fi.hasDebt !== undefined)
    markAnswered("has_debt", fi.hasDebt);
  if (fi.monthlyDebtPayment)
    markAnswered("debt_monthly", fi.monthlyDebtPayment);

  // Lifestyle
  if (li.hasChildren !== null && li.hasChildren !== undefined)
    markAnswered("children", li.hasChildren);
  if (li.childrenCount) markAnswered("children_count", li.childrenCount);
  if (Array.isArray(li.childrenNames) && li.childrenNames.length > 0)
    markAnswered("children_names", li.childrenNames);
  if (li.livingSituation) markAnswered("living_situation", li.livingSituation);
  if (li.partnerName) markAnswered("partner_name", li.partnerName);
  if (li.housingType) markAnswered("housing_type", li.housingType);
  if (li.monthlyRent) markAnswered("monthly_rent", li.monthlyRent);
  if (Array.isArray(li.supportsOthers) && li.supportsOthers.length > 0)
    markAnswered("supports_others", li.supportsOthers);
  if (li.carOwnership !== null && li.carOwnership !== undefined)
    markAnswered("car_ownership", li.carOwnership);
  if (li.carType) markAnswered("car_type", li.carType);
  if (li.monthlyCarCost) markAnswered("monthly_car_cost", li.monthlyCarCost);
  if (li.hasPets !== null && li.hasPets !== undefined)
    markAnswered("has_pets", li.hasPets);
  if (Array.isArray(li.petNames) && li.petNames.length > 0)
    markAnswered("pet_names", li.petNames);
  if (li.smoking !== null && li.smoking !== undefined)
    markAnswered("smoking", li.smoking);
  if (Array.isArray(li.subscriptions) && li.subscriptions.length > 0)
    markAnswered("subscription_services", li.subscriptions);
  if (Array.isArray(li.regularContacts) && li.regularContacts.length > 0)
    markAnswered("regular_contacts", li.regularContacts);

  // Basic
  if (bi.profession) markAnswered("profession", bi.profession);

  return answers;
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
    `Children names: ${Array.isArray(lifestyleInfo.childrenNames) && lifestyleInfo.childrenNames.length > 0 ? lifestyleInfo.childrenNames.join(", ") : "unknown"}`,
    `Partner name: ${lifestyleInfo.partnerName ?? "unknown"}`,
    `Responsible for family: ${lifestyleInfo.responsibleForFamily ?? "unknown"}`,
    `Supports others: ${Array.isArray(lifestyleInfo.supportsOthers) ? lifestyleInfo.supportsOthers.join(", ") : "unknown"}`,
    `Regular contacts: ${Array.isArray(lifestyleInfo.regularContacts) && lifestyleInfo.regularContacts.length > 0 ? lifestyleInfo.regularContacts.join(", ") : "none"}`,
    `Fixed commitments: ${lifestyleInfo.fixedMonthlyCommitments ?? "unknown"}`,
    `Has car: ${lifestyleInfo.carOwnership ?? "unknown"}${lifestyleInfo.carType ? ` (${lifestyleInfo.carType})` : ""}`,
    `Smoker: ${lifestyleInfo.smoking ?? "unknown"}`,
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

/**
 * Add a dynamic contact to the user's profile based on chat clarifications.
 */
export async function addDynamicContact(
  userId: number,
  userType: string,
  name: string,
  relationship: string,
): Promise<void> {
  const profile = await getSmartProfile(userId, userType);
  const lifestyleInfo = profile.lifestyleInfo as Record<string, any>;

  const dynamicContacts = Array.isArray(lifestyleInfo.dynamicContacts)
    ? [...lifestyleInfo.dynamicContacts]
    : [];

  const { normalized } = normalizeRelationship(relationship);

  // Avoid duplicates or update existing
  const existingIndex = dynamicContacts.findIndex((c: any) => c.name === name);
  if (existingIndex >= 0) {
    const existing = dynamicContacts[existingIndex];
    // Safeguard: Do not overwrite a specific relationship (like 'أم') with a generic fallback (like 'قريب')
    const genericTerms = [
      "قريب",
      "صديق",
      "موظف",
      "شخص معروف",
      "شخص",
      "قريبتك",
      "صاحبك",
      "زميل",
    ];
    const hasSpecific =
      existing.relationship &&
      !genericTerms.includes(existing.relationship) &&
      !genericTerms.includes(existing.rawRelationship);
    const isNewGeneric =
      genericTerms.includes(relationship) || genericTerms.includes(normalized);

    if (!hasSpecific || !isNewGeneric) {
      dynamicContacts[existingIndex].relationship = normalized;
      dynamicContacts[existingIndex].rawRelationship = relationship;
    }
  } else {
    dynamicContacts.push({
      name,
      relationship: normalized,
      rawRelationship: relationship,
    });
  }

  await updateSmartProfile(userId, userType, {
    lifestyleInfo: {
      ...lifestyleInfo,
      dynamicContacts,
    },
  });
}
