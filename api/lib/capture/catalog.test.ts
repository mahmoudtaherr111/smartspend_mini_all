import { describe, expect, it } from "vitest";
import { CAPTURE_SOURCE_KINDS } from "../../../contracts/capture";
import {
  captureSourceInput,
  isSpendingSubcategory,
  normalizeSourceInput,
  packagesTakenElsewhere,
  planSeedSync,
  sourceForPackage,
  sourceForSender,
  sourcesForPhones,
  subscriptionForMerchant,
  subscriptionInput,
  type CaptureCatalog,
  type CaptureSource,
  type CatalogSubscription,
} from "./catalog";
import { SEED_SOURCES } from "./seed-sources";
import { SEED_SUBSCRIPTIONS } from "./seed-subscriptions";

function source(overrides: Partial<CaptureSource>): CaptureSource {
  return {
    id: 1,
    slug: "cib",
    kind: "bank",
    nameAr: "البنك التجاري الدولي",
    nameEn: "CIB",
    countries: ["EG"],
    androidPackages: [],
    senderIds: [],
    aliases: [],
    notes: null,
    priority: 5,
    status: "active",
    origin: "seed",
    adminEditedAt: null,
    ...overrides,
  };
}

/** The seeded subscriptions as the loader would hold them. */
function seededCatalog(sources: CaptureSource[] = []): CaptureCatalog {
  const subscriptions: CatalogSubscription[] = SEED_SUBSCRIPTIONS.map((seed, index) => {
    const parsed = subscriptionInput.parse(seed);
    return {
      id: index + 1,
      ...parsed,
      matchTokens: parsed.matchTokens.map((token) => token.toLowerCase()),
      origin: "seed",
      adminEditedAt: null,
    };
  });
  return { sources, subscriptions, version: "test" };
}

describe("the seeded sources", () => {
  it("every one passes the admin's own rules", () => {
    for (const seed of SEED_SOURCES) {
      const parsed = captureSourceInput.safeParse({ ...seed, countries: seed.countries ?? ["EG"], senderIds: seed.senderIds ?? [] });
      expect(parsed.success, seed.slug).toBe(true);
      expect(CAPTURE_SOURCE_KINDS).toContain(seed.kind);
    }
  });

  it("has unique slugs, and gives each Android app to one source only", () => {
    const slugs = SEED_SOURCES.map((seed) => seed.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const packages = SEED_SOURCES.flatMap((seed) => seed.androidPackages);
    expect(new Set(packages).size).toBe(packages.length);
  });

  it("covers every licensed bank and the four telecom wallets", () => {
    const banks = SEED_SOURCES.filter((seed) => seed.kind === "bank");
    expect(banks.length).toBeGreaterThanOrEqual(37);
    for (const slug of ["vodafone_cash", "etisalat_cash", "orange_cash", "we_pay", "instapay"]) {
      expect(SEED_SOURCES.some((seed) => seed.slug === slug), slug).toBe(true);
    }
  });

  it("uses no short or ambiguous alias that ordinary words would match", () => {
    for (const seed of SEED_SOURCES) {
      for (const alias of seed.aliases) {
        expect(alias.length, `${seed.slug}: ${alias}`).toBeGreaterThanOrEqual(3);
        expect(["we", "bm", "pay", "bank", "cash"]).not.toContain(alias.toLowerCase());
      }
    }
  });

  it("guesses no SMS sender id: none is listed until a real message shows it", () => {
    expect(SEED_SOURCES.flatMap((seed) => seed.senderIds ?? [])).toEqual([]);
  });
});

describe("the seeded subscriptions", () => {
  it("have unique slugs and spending categories that exist", () => {
    const slugs = SEED_SUBSCRIPTIONS.map((seed) => seed.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const seed of SEED_SUBSCRIPTIONS) {
      expect(isSpendingSubcategory(seed.categoryId, seed.subCategoryId), seed.slug).toBe(true);
    }
  });

  it("are recognised in the statement names the services publish", () => {
    const catalog = seededCatalog();
    const cases: [string, string][] = [
      ["NETFLIX.COM AMSTERDAM NL", "netflix"],
      ["OPENAI *CHATGPT SUBSCR", "chatgpt"],
      ["CLAUDE.AI SUBSCRIPTION", "claude"],
      ["ANTHROPIC PBC", "claude"],
      ["DM*Spotify", "spotify"],
      ["GOOGLE *GOOGLE", "youtube_premium"],
      ["GOOGLE* Google Storage", "google_one"],
      ["GOOGLE *Duolingo", "google_play"],
      ["APPLE.COM/BILL", "apple_store"],
      ["MICROSOFT*XBOX", "xbox_game_pass"],
    ];
    for (const [merchant, slug] of cases) {
      expect(subscriptionForMerchant(catalog, merchant)?.slug, merchant).toBe(slug);
    }
  });

  it("does not see a token inside a longer word", () => {
    const catalog = seededCatalog();
    expect(subscriptionForMerchant(catalog, "REVIEW STORE CAIRO")).toBeNull();
    expect(subscriptionForMerchant(catalog, "BEING HEALTHY CLINIC")).toBeNull();
    expect(subscriptionForMerchant(catalog, "CANVAS SHOES")).toBeNull();
    expect(subscriptionForMerchant(catalog, "")).toBeNull();
  });

  it("ignores a disabled entry", () => {
    const catalog = seededCatalog();
    catalog.subscriptions = catalog.subscriptions.map((item) => (item.slug === "netflix" ? { ...item, status: "disabled" } : item));
    expect(subscriptionForMerchant(catalog, "NETFLIX.COM")).toBeNull();
  });

  it("refuses a category that is not spending, or a subcategory from another category", () => {
    const base = { slug: "x_service", name: "X Service", nameAr: "اكس", matchTokens: ["x service"], cycle: "monthly" as const };
    expect(subscriptionInput.safeParse({ ...base, categoryId: "salary", subCategoryId: "base_salary" }).success).toBe(false);
    expect(subscriptionInput.safeParse({ ...base, categoryId: "subscriptions", subCategoryId: "electricity" }).success).toBe(false);
    expect(subscriptionInput.safeParse({ ...base, categoryId: "subscriptions", subCategoryId: "streaming" }).success).toBe(true);
  });
});

describe("finding the source of a notification", () => {
  const catalog: CaptureCatalog = {
    sources: [
      source({ id: 1, slug: "cib", androidPackages: ["com.cibeg.ddc1.digitalbanking.live"], senderIds: ["CIB"] }),
      source({ id: 2, slug: "old_bank", status: "disabled", androidPackages: ["com.old.bank"], senderIds: ["OLDBANK"] }),
    ],
    subscriptions: [],
    version: "test",
  };

  it("by the app that posted it, among active sources only", () => {
    expect(sourceForPackage(catalog, "com.cibeg.ddc1.digitalbanking.live")?.slug).toBe("cib");
    expect(sourceForPackage(catalog, "com.old.bank")).toBeNull();
    expect(sourceForPackage(catalog, "com.whatsapp")).toBeNull();
  });

  it("by a confirmed sender id, without case or spaces", () => {
    expect(sourceForSender(catalog, " cib ")?.slug).toBe("cib");
    expect(sourceForSender(catalog, "OLDBANK")).toBeNull();
    expect(sourceForSender(catalog, "")).toBeNull();
  });

  it("gives phones the active sources without the admin's notes or aliases", () => {
    const phones = sourcesForPhones(catalog);
    expect(phones.map((item) => item.slug)).toEqual(["cib"]);
    expect(Object.keys(phones[0]).sort()).toEqual(["androidPackages", "kind", "nameAr", "nameEn", "senderIds", "slug"]);
  });
});

describe("admin input", () => {
  it("is stored trimmed and without repeats", () => {
    const input = captureSourceInput.parse({
      slug: "new_bank",
      kind: "bank",
      nameAr: "بنك جديد",
      nameEn: "New Bank",
      androidPackages: ["com.new.bank", " com.new.bank "],
      senderIds: ["NEWBANK", "NEWBANK"],
      aliases: ["new bank"],
      notes: "  ",
    });
    expect(normalizeSourceInput(input)).toMatchObject({
      androidPackages: ["com.new.bank"],
      senderIds: ["NEWBANK"],
      notes: null,
      countries: ["EG"],
      status: "active",
    });
  });

  it("refuses an Android package that is not a package name", () => {
    const parsed = captureSourceInput.safeParse({
      slug: "bad",
      kind: "bank",
      nameAr: "بنك",
      nameEn: "Bank",
      androidPackages: ["not a package"],
      senderIds: [],
      aliases: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("finds an app another source already owns", () => {
    const sources = [source({ slug: "cib", androidPackages: ["com.cib.app"] }), source({ slug: "nbe", androidPackages: ["com.nbe.app"] })];
    expect(packagesTakenElsewhere(sources, "nbe", ["com.cib.app", "com.nbe.app"])).toEqual(["com.cib.app"]);
    expect(packagesTakenElsewhere(sources, "cib", ["com.cib.app"])).toEqual([]);
  });
});

describe("writing the seed", () => {
  type Row = { slug: string; name: string };
  const same = (a: Row, b: Row) => a.name === b.name;

  it("adds what is missing and updates seeded rows nobody edited", () => {
    const plan = planSeedSync<Row>(
      [
        { id: 1, slug: "a", origin: "seed", adminEditedAt: null, values: { slug: "a", name: "old" } },
        { id: 2, slug: "b", origin: "seed", adminEditedAt: null, values: { slug: "b", name: "same" } },
      ],
      [
        { slug: "a", name: "new" },
        { slug: "b", name: "same" },
        { slug: "c", name: "added" },
      ],
      same,
    );
    expect(plan.insert).toEqual([{ slug: "c", name: "added" }]);
    expect(plan.update).toEqual([{ id: 1, values: { slug: "a", name: "new" } }]);
  });

  it("never touches a row an admin edited or added, and deletes nothing", () => {
    const plan = planSeedSync<Row>(
      [
        { id: 1, slug: "a", origin: "seed", adminEditedAt: new Date(), values: { slug: "a", name: "admin's" } },
        { id: 2, slug: "b", origin: "admin", adminEditedAt: null, values: { slug: "b", name: "admin's" } },
        { id: 3, slug: "gone", origin: "seed", adminEditedAt: null, values: { slug: "gone", name: "kept" } },
      ],
      [
        { slug: "a", name: "seed" },
        { slug: "b", name: "seed" },
      ],
      same,
    );
    expect(plan).toEqual({ insert: [], update: [] });
  });
});
