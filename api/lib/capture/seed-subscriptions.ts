/**
 * The subscriptions SmartSpend recognises from the start; `syncCaptureSeed` (./catalog.ts) writes them to
 * `subscription_catalog`, and an admin edits that table from then on.
 *
 * `matchTokens` name the service inside a card statement's merchant name, compared without case. Some are the exact
 * statement names published for the service (Google's own help page: "GOOGLE *GOOGLE", "GOOGLE* Google Storage";
 * Apple: "apple.com/bill"; descriptor lookups: "OPENAI *CHATGPT SUBSCR", "ANTHROPIC", "CLAUDE.AI SUBSCRIPTION",
 * "NETFLIX.COM", "DM*Spotify"); the others are the brand as it appears in text and are replaced by the exact form
 * once a real message shows it. Categories are ids from `contracts/categories.ts`.
 */
import type { SubscriptionCycle, SubscriptionKind } from "../../../contracts/capture";

export interface SeedSubscription {
  slug: string;
  name: string;
  nameAr: string;
  kind?: SubscriptionKind;
  matchTokens: string[];
  categoryId: string;
  subCategoryId: string;
  cycle: SubscriptionCycle;
}

const streaming = { categoryId: "subscriptions", subCategoryId: "streaming", cycle: "monthly" } as const;
const music = { categoryId: "subscriptions", subCategoryId: "music", cycle: "monthly" } as const;
const aiTools = { categoryId: "subscriptions", subCategoryId: "ai_tools", cycle: "monthly" } as const;
const software = { categoryId: "subscriptions", subCategoryId: "software", cycle: "monthly" } as const;
const other = { categoryId: "subscriptions", subCategoryId: "general_subscriptions", cycle: "monthly" } as const;

export const SEED_SUBSCRIPTIONS: SeedSubscription[] = [
  // ─── Video ───
  { slug: "netflix", name: "Netflix", nameAr: "نتفليكس", matchTokens: ["netflix.com", "netflix"], ...streaming },
  { slug: "shahid", name: "Shahid", nameAr: "شاهد", matchTokens: ["shahid", "mbc shahid"], ...streaming },
  { slug: "osn_plus", name: "OSN+", nameAr: "OSN+", matchTokens: ["osn+", "osnplus", "osn plus"], ...streaming },
  { slug: "watch_it", name: "WATCH IT", nameAr: "ووتش إت", matchTokens: ["watchit", "watch it"], ...streaming },
  { slug: "yango_play", name: "Yango Play", nameAr: "يانجو بلاي", matchTokens: ["yango play"], ...streaming },
  { slug: "tod", name: "TOD", nameAr: "تود", matchTokens: ["tod tv", "tod.tv"], ...streaming },
  { slug: "bein", name: "beIN", nameAr: "بي إن سبورتس", matchTokens: ["bein"], ...streaming },
  { slug: "starzplay", name: "STARZPLAY", nameAr: "ستارزبلاي", matchTokens: ["starzplay", "starz play"], ...streaming },
  { slug: "jawwy_tv", name: "Jawwy TV", nameAr: "جوي تي في", matchTokens: ["jawwy"], ...streaming },
  { slug: "viu", name: "Viu", nameAr: "فيو", matchTokens: ["viu"], ...streaming },
  { slug: "weyyak", name: "Weyyak", nameAr: "وياك", matchTokens: ["weyyak"], ...streaming },
  { slug: "disney_plus", name: "Disney+", nameAr: "ديزني بلس", matchTokens: ["disney+", "disneyplus", "disney plus"], ...streaming },
  { slug: "prime_video", name: "Amazon Prime Video", nameAr: "أمازون برايم", matchTokens: ["prime video", "primevideo", "amazon prime"], ...streaming },
  { slug: "youtube_premium", name: "YouTube Premium", nameAr: "يوتيوب بريميوم", matchTokens: ["youtube", "google *google"], ...streaming },

  // ─── Music ───
  { slug: "spotify", name: "Spotify", nameAr: "سبوتيفاي", matchTokens: ["spotify", "dm*spotify"], ...music },
  { slug: "anghami", name: "Anghami", nameAr: "أنغامي", matchTokens: ["anghami"], ...music },
  { slug: "deezer", name: "Deezer", nameAr: "ديزر", matchTokens: ["deezer"], ...music },
  { slug: "apple_music", name: "Apple Music", nameAr: "أبل ميوزك", matchTokens: ["apple music"], ...music },

  // ─── AI tools ───
  { slug: "chatgpt", name: "ChatGPT", nameAr: "شات جي بي تي", matchTokens: ["openai *chatgpt subscr", "chatgpt", "openai"], ...aiTools },
  { slug: "claude", name: "Claude", nameAr: "كلود", matchTokens: ["claude.ai subscription", "anthropic", "claude.ai"], ...aiTools },
  { slug: "gemini", name: "Google Gemini", nameAr: "جيميني", matchTokens: ["gemini", "google one ai"], ...aiTools },
  { slug: "perplexity", name: "Perplexity", nameAr: "بربلكسيتي", matchTokens: ["perplexity"], ...aiTools },
  { slug: "cursor", name: "Cursor", nameAr: "كيرسر", matchTokens: ["cursor", "anysphere"], ...aiTools },
  { slug: "github_copilot", name: "GitHub Copilot", nameAr: "جيت هاب كوبايلوت", matchTokens: ["github"], ...aiTools },
  { slug: "midjourney", name: "Midjourney", nameAr: "ميدجورني", matchTokens: ["midjourney"], ...aiTools },

  // ─── Software and storage ───
  { slug: "google_one", name: "Google One", nameAr: "جوجل وان", matchTokens: ["google storage", "google one"], ...software },
  { slug: "icloud", name: "iCloud+", nameAr: "آي كلاود", matchTokens: ["icloud"], ...software },
  { slug: "microsoft_365", name: "Microsoft 365", nameAr: "مايكروسوفت 365", matchTokens: ["microsoft 365", "microsoft*365", "office 365"], ...software },
  { slug: "adobe", name: "Adobe", nameAr: "أدوبي", matchTokens: ["adobe"], ...software },
  { slug: "canva", name: "Canva", nameAr: "كانفا", matchTokens: ["canva"], ...software },
  { slug: "notion", name: "Notion", nameAr: "نوشن", matchTokens: ["notion"], ...software },
  { slug: "dropbox", name: "Dropbox", nameAr: "دروب بوكس", matchTokens: ["dropbox"], ...software },
  { slug: "linkedin_premium", name: "LinkedIn Premium", nameAr: "لينكدإن بريميوم", matchTokens: ["linkedin"], ...software },

  // ─── Games ───
  { slug: "playstation_plus", name: "PlayStation Plus", nameAr: "بلايستيشن بلس", matchTokens: ["playstation", "sony interactive"], ...other },
  { slug: "xbox_game_pass", name: "Xbox Game Pass", nameAr: "إكس بوكس جيم باس", matchTokens: ["xbox", "microsoft*xbox"], ...other },

  // ─── App stores: the charge names the store, so the service is asked once and remembered ───
  { slug: "google_play", name: "Google Play", nameAr: "جوجل بلاي", kind: "store", matchTokens: ["google *", "google*", "google play"], ...other, cycle: "varies" },
  { slug: "apple_store", name: "Apple (App Store)", nameAr: "أبل (آب ستور)", kind: "store", matchTokens: ["apple.com/bill", "apple.com"], ...other, cycle: "varies" },
];
