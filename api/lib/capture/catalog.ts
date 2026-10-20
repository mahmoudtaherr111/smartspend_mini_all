/**
 * The capture catalog: the sources whose notifications SmartSpend reads (`capture_sources`) and the subscriptions it
 * recognises in card charges (`subscription_catalog`). Both are shared by every user and hold no user data.
 *
 * Each process keeps one copy, reloaded every five minutes or within ten seconds of an admin change on any process
 * (the `capturecataloggen` generation, decision 0013). The seed in ./seed-sources.ts and ./seed-subscriptions.ts is
 * written at boot by `syncCaptureSeed`; a row an admin edited is left as the admin left it.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { CATEGORIES } from "../../../contracts/categories";
import {
  CAPTURE_SOURCE_KINDS,
  CATALOG_STATUSES,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_KINDS,
  type CaptureSourceForPhone,
  type CaptureSourceKind,
  type CatalogStatus,
  type SubscriptionCycle,
  type SubscriptionKind,
} from "../../../contracts/capture";
import { captureSources, subscriptionCatalog } from "../../../db/schema";
import { db } from "../../queries/connection";
import { CAPTURE_CATALOG_GENERATION } from "../cache-keys";
import { createLogger } from "../log";
import { watchGeneration } from "../shared-generation";
import { SEED_SOURCES, type SeedSource } from "./seed-sources";
import { SEED_SUBSCRIPTIONS, type SeedSubscription } from "./seed-subscriptions";

const log = createLogger("capture-catalog");

export interface CaptureSource {
  id: number;
  slug: string;
  kind: CaptureSourceKind;
  nameAr: string;
  nameEn: string;
  countries: string[];
  androidPackages: string[];
  senderIds: string[];
  aliases: string[];
  notes: string | null;
  priority: number;
  status: CatalogStatus;
  origin: "seed" | "admin";
  adminEditedAt: Date | null;
}

export interface CatalogSubscription {
  id: number;
  slug: string;
  name: string;
  nameAr: string;
  kind: SubscriptionKind;
  matchTokens: string[];
  categoryId: string;
  subCategoryId: string;
  cycle: SubscriptionCycle;
  status: CatalogStatus;
  origin: "seed" | "admin";
  adminEditedAt: Date | null;
}

export interface CaptureCatalog {
  sources: CaptureSource[];
  subscriptions: CatalogSubscription[];
  /** Moves whenever the catalog changes; phones compare it with the copy they keep. */
  version: string;
}

// ─── Validation: one set of rules for the seed, the admin and what is read back ───

const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const SLUG_PATTERN = /^[a-z0-9_]{2,60}$/;

const cleanList = (values: string[], transform: (value: string) => string = (value) => value) =>
  [...new Set(values.map((value) => transform(value.trim())).filter(Boolean))];

export const captureSourceInput = z.object({
  slug: z.string().regex(SLUG_PATTERN, "الاسم المختصر حروف إنجليزي صغيرة وأرقام و_ بس"),
  kind: z.enum(CAPTURE_SOURCE_KINDS),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20).default(["EG"]),
  androidPackages: z.array(z.string().trim().regex(PACKAGE_PATTERN, "اسم تطبيق أندرويد مش صحيح")).max(20),
  senderIds: z.array(z.string().trim().min(2).max(20)).max(30),
  aliases: z.array(z.string().trim().min(2).max(60)).max(30),
  notes: z.string().trim().max(1000).nullable().default(null),
  priority: z.number().int().min(0).max(1000).default(100),
  status: z.enum(CATALOG_STATUSES).default("active"),
});
export type CaptureSourceInput = z.infer<typeof captureSourceInput>;

export const subscriptionInput = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, "الاسم المختصر حروف إنجليزي صغيرة وأرقام و_ بس"),
    name: z.string().trim().min(2).max(100),
    nameAr: z.string().trim().min(2).max(100),
    kind: z.enum(SUBSCRIPTION_KINDS).default("service"),
    matchTokens: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
    categoryId: z.string(),
    subCategoryId: z.string(),
    cycle: z.enum(SUBSCRIPTION_CYCLES).default("monthly"),
    status: z.enum(CATALOG_STATUSES).default("active"),
  })
  .refine((value) => isSpendingSubcategory(value.categoryId, value.subCategoryId), {
    message: "التصنيف لازم يكون تصنيف مصروف موجود، والتصنيف الفرعي جواه",
    path: ["subCategoryId"],
  });
export type SubscriptionInput = z.infer<typeof subscriptionInput>;

/** A spending category of the taxonomy and one of its own subcategories. */
export function isSpendingSubcategory(categoryId: string, subCategoryId: string): boolean {
  const category = CATEGORIES.find((candidate) => candidate.id === categoryId);
  return Boolean(category && category.type === "expense" && category.subcategories.some((sub) => sub.id === subCategoryId));
}

/** The stored form: lists trimmed and without repeats, senders and tokens compared without case. */
export function normalizeSourceInput(input: CaptureSourceInput): CaptureSourceInput {
  return {
    ...input,
    countries: cleanList(input.countries),
    androidPackages: cleanList(input.androidPackages),
    senderIds: cleanList(input.senderIds),
    aliases: cleanList(input.aliases),
    notes: input.notes?.trim() ? input.notes.trim() : null,
  };
}

export function normalizeSubscriptionInput(input: SubscriptionInput): SubscriptionInput {
  return { ...input, matchTokens: cleanList(input.matchTokens, (token) => token.toLowerCase().replace(/\s+/g, " ")) };
}

/** Packages another source already claims: one app belongs to one source, or a notification would have two owners. */
export function packagesTakenElsewhere(sources: Pick<CaptureSource, "slug" | "androidPackages">[], slug: string, packages: string[]): string[] {
  const taken = new Set(sources.filter((source) => source.slug !== slug).flatMap((source) => source.androidPackages));
  return packages.filter((pkg) => taken.has(pkg));
}

// ─── Reading rows: JSON columns are shaped by their writers, so a reader tolerates anything ───

const stringList = (value: unknown): string[] => {
  const list = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function sourceFromRow(row: typeof captureSources.$inferSelect): CaptureSource {
  return {
    id: row.id,
    slug: row.slug,
    kind: oneOf(CAPTURE_SOURCE_KINDS, row.kind, "bank"),
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    countries: stringList(row.countries),
    androidPackages: stringList(row.androidPackages),
    senderIds: stringList(row.senderIds),
    aliases: stringList(row.aliases),
    notes: row.notes ?? null,
    priority: row.priority,
    status: oneOf(CATALOG_STATUSES, row.status, "disabled"),
    origin: row.origin === "seed" ? "seed" : "admin",
    adminEditedAt: row.adminEditedAt ?? null,
  };
}

export function subscriptionFromRow(row: typeof subscriptionCatalog.$inferSelect): CatalogSubscription {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.nameAr,
    kind: oneOf(SUBSCRIPTION_KINDS, row.kind, "service"),
    matchTokens: stringList(row.matchTokens),
    categoryId: row.categoryId,
    subCategoryId: row.subCategoryId,
    cycle: oneOf(SUBSCRIPTION_CYCLES, row.cycle, "varies"),
    status: oneOf(CATALOG_STATUSES, row.status, "disabled"),
    origin: row.origin === "seed" ? "seed" : "admin",
    adminEditedAt: row.adminEditedAt ?? null,
  };
}

// ─── The per-process copy ───

const RELOAD_EVERY_MS = 5 * 60_000;
const catalogGeneration = watchGeneration(CAPTURE_CATALOG_GENERATION);
let cached: { catalog: CaptureCatalog; loadedAt: number } | null = null;
let loading: Promise<CaptureCatalog> | null = null;

async function loadFromDatabase(): Promise<CaptureCatalog> {
  const generation = await catalogGeneration.current();
  const [sourceRows, subscriptionRows] = await Promise.all([
    db.select().from(captureSources).orderBy(asc(captureSources.priority), asc(captureSources.slug)),
    db.select().from(subscriptionCatalog).orderBy(asc(subscriptionCatalog.slug)),
  ]);
  const sources = sourceRows.map(sourceFromRow);
  const subscriptions = subscriptionRows.map(subscriptionFromRow);
  catalogGeneration.loaded(generation);
  return { sources, subscriptions, version: catalogVersion(generation, sources, subscriptions) };
}

/** A short fingerprint of what the phones receive, so an unchanged catalog keeps its version across restarts. */
function catalogVersion(generation: string, sources: CaptureSource[], subscriptions: CatalogSubscription[]): string {
  const material = JSON.stringify([
    sources.filter((source) => source.status === "active").map(({ slug, kind, androidPackages, senderIds }) => [slug, kind, androidPackages, senderIds]),
    subscriptions.filter((item) => item.status === "active").map(({ slug, matchTokens }) => [slug, matchTokens]),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index++) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}.${generation}`;
}

/** The catalog, from this process's copy when it is fresh. A caller receives the shared copy and must not change it. */
export async function getCaptureCatalog(now = Date.now()): Promise<CaptureCatalog> {
  if (cached && now - cached.loadedAt < RELOAD_EVERY_MS && !(await catalogGeneration.moved(now))) return cached.catalog;
  loading ??= loadFromDatabase()
    .then((catalog) => {
      cached = { catalog, loadedAt: Date.now() };
      return catalog;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** After any write to either table: every process reloads within ten seconds, this one now. */
export async function invalidateCaptureCatalog(): Promise<void> {
  await catalogGeneration.bump();
  cached = null;
}

// ─── Lookups ───

/** The active source an Android app belongs to. */
export function sourceForPackage(catalog: CaptureCatalog, packageName: string): CaptureSource | null {
  return catalog.sources.find((source) => source.status === "active" && source.androidPackages.includes(packageName)) ?? null;
}

/** The active source a confirmed SMS sender id belongs to (compared without case or surrounding spaces). */
export function sourceForSender(catalog: CaptureCatalog, sender: string): CaptureSource | null {
  const wanted = sender.trim().toLowerCase();
  if (!wanted) return null;
  return catalog.sources.find((source) => source.status === "active" && source.senderIds.some((id) => id.toLowerCase() === wanted)) ?? null;
}

/**
 * The subscription a card charge's merchant name points at: the active entry whose token appears in the name, the
 * longest token winning, so "GOOGLE *GOOGLE" (YouTube) beats the store's "google *".
 */
export function subscriptionForMerchant(catalog: CaptureCatalog, merchant: string): CatalogSubscription | null {
  const name = merchant.toLowerCase().replace(/\s+/g, " ").trim();
  if (!name) return null;
  let best: { item: CatalogSubscription; length: number } | null = null;
  for (const item of catalog.subscriptions) {
    if (item.status !== "active") continue;
    for (const token of item.matchTokens) {
      if (token.length > (best?.length ?? 0) && containsToken(name, token)) best = { item, length: token.length };
    }
  }
  return best?.item ?? null;
}

/** `token` inside `name` where it does not continue a longer word: "viu" is not inside "review". */
function containsToken(name: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = name.indexOf(token, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : name[at - 1];
    const after = name[at + token.length] ?? "";
    const wordChar = /[a-z0-9]/;
    const startsClean = !wordChar.test(token[0]) || !wordChar.test(before);
    const endsClean = !wordChar.test(token[token.length - 1]) || !wordChar.test(after);
    if (startsClean && endsClean) return true;
    from = at + 1;
  }
}

/** What a phone needs to decide which notifications to read: active sources only, without notes or aliases. */
export function sourcesForPhones(catalog: CaptureCatalog): CaptureSourceForPhone[] {
  return catalog.sources
    .filter((source) => source.status === "active")
    .map(({ slug, kind, nameAr, nameEn, androidPackages, senderIds }) => ({ slug, kind, nameAr, nameEn, androidPackages, senderIds }));
}

// ─── The seed ───

type SeedRowValues<T> = Omit<T, "id" | "adminEditedAt">;

function seedSourceValues(seed: SeedSource): SeedRowValues<CaptureSource> {
  const input = normalizeSourceInput(
    captureSourceInput.parse({
      ...seed,
      countries: seed.countries ?? ["EG"],
      senderIds: seed.senderIds ?? [],
      notes: seed.notes ?? null,
    }),
  );
  return { ...input, origin: "seed" };
}

function seedSubscriptionValues(seed: SeedSubscription): SeedRowValues<CatalogSubscription> {
  return { ...normalizeSubscriptionInput(subscriptionInput.parse(seed)), origin: "seed" };
}

export interface SeedPlan<T> {
  insert: T[];
  update: { id: number; values: T }[];
}

/**
 * What the seed changes: a slug the table lacks is inserted, and a row the seed wrote and no admin touched is brought
 * up to date. A row an admin added or edited is never touched, and nothing is deleted.
 */
export function planSeedSync<T extends { slug: string }>(
  existing: { id: number; slug: string; origin: string; adminEditedAt: Date | null; values: T }[],
  seed: T[],
  same: (a: T, b: T) => boolean,
): SeedPlan<T> {
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const plan: SeedPlan<T> = { insert: [], update: [] };
  for (const values of seed) {
    const row = bySlug.get(values.slug);
    if (!row) plan.insert.push(values);
    else if (row.origin === "seed" && !row.adminEditedAt && !same(row.values, values)) plan.update.push({ id: row.id, values });
  }
  return plan;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const comparableSource = ({ slug, kind, nameAr, nameEn, countries, androidPackages, senderIds, aliases, notes, priority, status }: SeedRowValues<CaptureSource>) =>
  [slug, kind, nameAr, nameEn, countries, androidPackages, senderIds, aliases, notes, priority, status];

const comparableSubscription = ({ slug, name, nameAr, kind, matchTokens, categoryId, subCategoryId, cycle, status }: SeedRowValues<CatalogSubscription>) =>
  [slug, name, nameAr, kind, matchTokens, categoryId, subCategoryId, cycle, status];

/** Writes the seed to both tables (see `planSeedSync`). Runs at boot under a lock; safe to run again. */
export async function syncCaptureSeed(): Promise<{ inserted: number; updated: number }> {
  const [sourceRows, subscriptionRows] = await Promise.all([db.select().from(captureSources), db.select().from(subscriptionCatalog)]);

  const sourcePlan = planSeedSync(
    sourceRows.map((row) => {
      const source = sourceFromRow(row);
      return { id: row.id, slug: row.slug, origin: row.origin, adminEditedAt: row.adminEditedAt ?? null, values: source as SeedRowValues<CaptureSource> };
    }),
    SEED_SOURCES.map(seedSourceValues),
    (a, b) => sameJson(comparableSource(a), comparableSource(b)),
  );
  const subscriptionPlan = planSeedSync(
    subscriptionRows.map((row) => {
      const item = subscriptionFromRow(row);
      return { id: row.id, slug: row.slug, origin: row.origin, adminEditedAt: row.adminEditedAt ?? null, values: item as SeedRowValues<CatalogSubscription> };
    }),
    SEED_SUBSCRIPTIONS.map(seedSubscriptionValues),
    (a, b) => sameJson(comparableSubscription(a), comparableSubscription(b)),
  );

  for (const values of sourcePlan.insert) await db.insert(captureSources).values(values);
  for (const { id, values } of sourcePlan.update) await db.update(captureSources).set(values).where(eq(captureSources.id, id));
  for (const values of subscriptionPlan.insert) await db.insert(subscriptionCatalog).values(values);
  for (const { id, values } of subscriptionPlan.update) await db.update(subscriptionCatalog).set(values).where(eq(subscriptionCatalog.id, id));

  const inserted = sourcePlan.insert.length + subscriptionPlan.insert.length;
  const updated = sourcePlan.update.length + subscriptionPlan.update.length;
  if (inserted || updated) {
    await invalidateCaptureCatalog();
    log.info({ event: "capture.seed.synced", inserted, updated }, "Capture catalog seed written");
  }
  return { inserted, updated };
}

/** The seed's values for one slug, for an admin who wants a seeded row back as it was shipped. */
export function seedSourceBySlug(slug: string): SeedRowValues<CaptureSource> | null {
  const seed = SEED_SOURCES.find((item) => item.slug === slug);
  return seed ? seedSourceValues(seed) : null;
}

export function seedSubscriptionBySlug(slug: string): SeedRowValues<CatalogSubscription> | null {
  const seed = SEED_SUBSCRIPTIONS.find((item) => item.slug === slug);
  return seed ? seedSubscriptionValues(seed) : null;
}
