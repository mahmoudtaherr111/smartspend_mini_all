import { and, eq } from "drizzle-orm";
import {
  localUsers,
  profileLearningEvents,
  userProfiles,
  users,
  userContacts,
} from "../../db/schema";
import { normalizeRelationship, parseNameAndRelationship } from "../lib/relationship-normalizer";
import { extractExplicitPeopleContext, cleanPersonName } from "../lib/person-resolver";
import { invalidateUserClassificationCache } from "../lib/smart-pipeline";
import { invalidateUserMemory } from "../lib/muscle-memory";

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
        relationship: userContacts.relation,
        isSilenced: userContacts.isSilenced,
        contactType: userContacts.contactType,
        businessId: userContacts.businessId,
      })
      .from(userContacts)
      .where(and(eq(userContacts.userId, userId), eq(userContacts.userType, userType)))
      .limit(50);
      
    if (contacts.length > 0) {
      result.aiInferredAttributes.knownPeople = contacts as any;
      result.lifestyleInfo.dynamicContacts = contacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        rawRelationship: c.relationship,
        isSilenced: c.isSilenced,
      })) as any;
    } else {
      // Auto-migration: if no DB contacts but JSON has legacy ones, migrate them
      const legacyContacts = Array.isArray(result.lifestyleInfo.dynamicContacts)
        ? result.lifestyleInfo.dynamicContacts as Array<{ name: string; relationship?: string; rawRelationship?: string }>
        : [];
      if (legacyContacts.length > 0) {
        for (const lc of legacyContacts) {
          if (!lc.name || lc.name.length < 2) continue;
          try {
            await db.insert(userContacts).values({
              userId,
              userType,
              name: lc.name,
              relation: lc.relationship || lc.rawRelationship || "شخص معروف",
              contactType: "personal",
              isSilenced: false,
            }).catch(() => {}); // ignore duplicates
          } catch {}
        }
        // Re-fetch after migration
        const migrated = await db
          .select({
            name: userContacts.name,
            relationship: userContacts.relation,
            isSilenced: userContacts.isSilenced,
            contactType: userContacts.contactType,
            businessId: userContacts.businessId,
          })
          .from(userContacts)
          .where(and(eq(userContacts.userId, userId), eq(userContacts.userType, userType)))
          .limit(50);
        if (migrated.length > 0) {
          result.aiInferredAttributes.knownPeople = migrated as any;
          result.lifestyleInfo.dynamicContacts = migrated.map(c => ({
            name: c.name,
            relationship: c.relationship,
            rawRelationship: c.relationship,
            isSilenced: c.isSilenced,
          })) as any;
        }
      }
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
 * Helper to clean and parse candidate dynamic contact name and relationship.
 * Strips clarification prefixes, resolves suffixes, decouples compound answers,
 * and validates the name and relationship to avoid database profile corruption.
 */
function cleanNameAndRelationship(
  name: string,
  relationship: string,
): { name: string | null; relationship: string | null } {
  let cleanName = name.trim();
  let cleanRel = relationship.trim();

  // Strip common clarification/introductory prefixes from both name and relationship
  const prefixesToStrip = [
    /^الناس\s+دول\s+/,
    /^الناس\s+/,
    /^دول\s+/,
    /^الاشخاص\s+/,
    /^الأشخاص\s+/,
    /^التوضيح\s*:\s*/,
    /^التوضيح\s+/,
    /^توضيح\s+/,
    /^مين\s+/,
    /^يا\s+عم\s+/,
    /^يا\s+/,
    /^هو\s+/,
    /^هي\s+/,
    /^هم\s+/,
    /^احنا\s+/,
    /^يكون\s+/,
    /^تكون\s+/,
    /^بيقولي\s+/,
    /^بيقول\s+لي\s+/,
    /^بيقول\s+/,
  ];

  for (const regex of prefixesToStrip) {
    cleanName = cleanName.replace(regex, "");
    cleanRel = cleanRel.replace(regex, "");
  }

  cleanName = cleanName.trim();
  cleanRel = cleanRel.trim();

  // Strip category paths if the AI/Fallback returned them as relationships (e.g., 'أصدقاء/علي صاحبك' -> 'علي صاحبك')
  if (cleanRel.includes("/")) {
    const parts = cleanRel.split("/");
    cleanRel = parts[parts.length - 1].trim();
  }

  // Strip the name itself from the relationship if it's mixed in (e.g., name='علي', rel='علي صاحبك' -> rel='صاحبك')
  if (cleanName && cleanRel.includes(cleanName) && cleanRel !== cleanName) {
    cleanRel = cleanRel.replace(cleanName, "").trim();
  }

  // If the cleanName itself is a relationship term, reject it as a person name!
  const compName = cleanName
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();

  const relationWords = [
    "صاحبي", "صاحبتي", "صحبتي", "صديقي", "صديقتي",
    "اخويا", "أخويا", "اختي", "أختي", "امي", "أمي",
    "ابويا", "أبويا", "بابا", "ماما", "مراتي", "جوزي",
    "بنتي", "ابني", "سواق", "بواب", "شغال", "شغالة",
    "سواقين", "موظف", "مدير", "زميل", "زميلي", "زميلتي",
    "صاحب", "صديق", "اخ", "أخ", "اخت", "أخت", "اب", "أب",
    "ام", "أم", "ابن", "بنت", "زوج", "زوجة", "جوز", "مرات"
  ];

  const noisyNames = [
    "الناس", "الناس دول", "حد", "واحد", "واحدة", "واحده", "شخص", "شخص معروف", "عام"
  ];

  if (noisyNames.includes(compName) || noisyNames.includes(cleanName.toLowerCase().trim())) {
    return { name: null, relationship: null };
  }

  // If the cleanName itself is a relationship term (e.g. "أمي", "صاحبي"), users often use this as the actual name.
  if (relationWords.includes(compName)) {
    const { normalized } = normalizeRelationship(cleanName);
    if (!cleanRel || cleanRel === "شخص" || cleanRel === "شخص معروف" || cleanRel === cleanName) {
       cleanRel = normalized;
    }
  }

  // If cleanName contains a relationship suffix (e.g. "سلمى أختي"), parse it
  const parsed = parseNameAndRelationship(cleanName, "العائلة");
  if (parsed.name && parsed.name !== "شخص" && parsed.relationship !== "شخص معروف") {
    cleanName = parsed.name;
    if (!cleanRel || cleanRel === "شخص معروف" || cleanRel === "قريب" || cleanRel === "شخص") {
      cleanRel = parsed.relationship;
    }
  }

  // If the relationship is compound/lists multiple people, parse specific relationship for cleanName
  if (
    cleanRel.includes("،") ||
    cleanRel.includes(",") ||
    cleanRel.includes(";") ||
    cleanRel.includes("؛") ||
    cleanRel.includes(" و ")
  ) {
    // Wrap inside parentheses to leverage extractExplicitPeopleContext
    const parenthesized = `(${cleanRel})`;
    const parsedPeople = extractExplicitPeopleContext(parenthesized);
    
    // Normalize cleanName for robust matching (ignore spaces & standard letters)
    const normClean = cleanName.replace(/\s+/g, "").replace(/[إأآٱ]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه").toLowerCase().trim();
    
    // Find if cleanName is in the parsed people
    const match = parsedPeople.find((p) => {
      if (!p.name) return false;
      const normPName = p.name.replace(/\s+/g, "").replace(/[إأآٱ]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه").toLowerCase().trim();
      return normPName.includes(normClean) || normClean.includes(normPName);
    });
    if (match && match.relationship) {
      cleanRel = match.relationship;
    }
  }

  // Double check name validity
  const finalName = cleanPersonName(cleanName);
  if (!finalName || finalName === "شخص" || finalName === "عام") {
    return { name: null, relationship: null };
  }

  return { name: finalName, relationship: cleanRel };
}

/**
 * Add a dynamic contact to the user's contacts.
 * Writes ONLY to user_contacts table (Single Source of Truth).
 * getSmartProfile() injects user_contacts into the profile at read time,
 * so buildPersonalContext() always sees fresh data.
 */
export async function addDynamicContact(
  userId: number,
  userType: string,
  name: string,
  relationship: string,
): Promise<void> {
  const cleaned = cleanNameAndRelationship(name, relationship);
  if (!cleaned.name || !cleaned.relationship) {
    console.log(`[Profile Healing] Rejected saving invalid/noisy contact: name="${name}", rel="${relationship}"`);
    return;
  }

  const cleanName = cleaned.name;
  const cleanRel = cleaned.relationship;
  const { normalized } = normalizeRelationship(cleanRel);

  const { db } = await import("../queries/connection");
  const genericTerms = [
    "قريب", "صديق", "موظف", "شخص معروف", "شخص", "قريبتك", "صاحبك", "زميل",
  ];

  try {
    const existing = await db
      .select()
      .from(userContacts)
      .where(and(
        eq(userContacts.userId, userId),
        eq(userContacts.userType, userType),
        eq(userContacts.name, cleanName),
      ))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      const hasSpecific = row.relation && !genericTerms.includes(row.relation);
      const isNewGeneric = genericTerms.includes(cleanRel) || genericTerms.includes(normalized);

      if (!hasSpecific || !isNewGeneric) {
        await db
          .update(userContacts)
          .set({ relation: normalized })
          .where(eq(userContacts.id, row.id));
      }
    } else {
      await db.insert(userContacts).values({
        userId,
        userType,
        name: cleanName,
        relation: normalized,
        contactType: "personal",
        isSilenced: false,
      });
    }
  } catch (err) {
    console.error("[addDynamicContact] DB write failed:", err);
  }

  invalidateUserClassificationCache(userId);
  invalidateUserMemory(userId, userType);
  console.log(`[Profile Healing] Saved contact to DB: name="${cleanName}", rel="${normalized}"`);
}

/**
 * Silence a contact when the user skips clarification.
 * Creates a silent record so the system never asks about this person again.
 */
export async function silenceContact(
  userId: number,
  userType: string,
  name: string,
): Promise<void> {
  const cleaned = cleanNameAndRelationship(name, "جهة اتصال عامة");
  if (!cleaned.name) {
    console.log(`[Profile Healing] Silence: rejected invalid name="${name}"`);
    return;
  }

  const cleanName = cleaned.name;
  const { db } = await import("../queries/connection");

  try {
    const existing = await db
      .select()
      .from(userContacts)
      .where(and(
        eq(userContacts.userId, userId),
        eq(userContacts.userType, userType),
        eq(userContacts.name, cleanName),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userContacts)
        .set({ isSilenced: true, relation: "جهة اتصال عامة" })
        .where(eq(userContacts.id, existing[0].id));
    } else {
      await db.insert(userContacts).values({
        userId,
        userType,
        name: cleanName,
        relation: "جهة اتصال عامة",
        contactType: "personal",
        isSilenced: true,
      });
    }

    invalidateUserClassificationCache(userId);
    invalidateUserMemory(userId, userType);
    console.log(`[Profile Healing] Silenced contact: name="${cleanName}"`);
  } catch (err) {
    console.error("[silenceContact] DB write failed:", err);
  }
}

/**
 * Get all contacts for a user from the user_contacts table.
 */
export async function getUserContacts(
  userId: number,
  userType: string,
): Promise<Array<{
  id: number;
  name: string;
  relation: string | null;
  contactType: string;
  businessId: number | null;
  isSilenced: boolean;
  transactionCount: number;
}>> {
  const { db } = await import("../queries/connection");
  try {
    const rows = await db
      .select({
        id: userContacts.id,
        name: userContacts.name,
        relation: userContacts.relation,
        contactType: userContacts.contactType,
        businessId: userContacts.businessId,
        isSilenced: userContacts.isSilenced,
        transactionCount: userContacts.transactionCount,
      })
      .from(userContacts)
      .where(and(
        eq(userContacts.userId, userId),
        eq(userContacts.userType, userType),
      ));
    return rows;
  } catch (err) {
    console.error("[getUserContacts] Failed:", err);
    return [];
  }
}
