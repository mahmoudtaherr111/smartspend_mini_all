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
  /** The service's own Android app, whose store listing gives its real icon (api/lib/capture/brand-logos.ts). */
  appPackage?: string;
  /** Its official Microsoft Store app, the icon's source when it has no Android app (Apple's iCloud). */
  msStoreId?: string;
  /** Its official site, the icon's last source. */
  website?: string;
  /** "disabled" for a service kept for old rows but no longer offered. */
  status?: "active" | "disabled";
  /** Its brand colour, for the badge drawn before the logo is fetched. */
  brandColor?: string;
}

const streaming = { categoryId: "subscriptions", subCategoryId: "streaming", cycle: "monthly" } as const;
const music = { categoryId: "subscriptions", subCategoryId: "music", cycle: "monthly" } as const;
const aiTools = { categoryId: "subscriptions", subCategoryId: "ai_tools", cycle: "monthly" } as const;
const software = { categoryId: "subscriptions", subCategoryId: "software", cycle: "monthly" } as const;
const other = { categoryId: "subscriptions", subCategoryId: "general_subscriptions", cycle: "monthly" } as const;

export const SEED_SUBSCRIPTIONS: SeedSubscription[] = [
  // ─── Video ───
  { slug: "netflix", name: "Netflix", nameAr: "نتفليكس", appPackage: "com.netflix.mediaclient", website: "netflix.com", brandColor: "#E50914", matchTokens: ["netflix.com", "netflix"], ...streaming },
  { slug: "shahid", name: "Shahid", nameAr: "شاهد", appPackage: "net.mbc.shahid", website: "shahid.mbc.net", brandColor: "#12A784", matchTokens: ["shahid", "mbc shahid"], ...streaming },
  { slug: "osn_plus", name: "OSN+", nameAr: "OSN+", appPackage: "com.osn.go", website: "osnplus.com", brandColor: "#0D1B2A", matchTokens: ["osn+", "osnplus", "osn plus"], ...streaming },
  { slug: "watch_it", name: "WATCH IT", nameAr: "ووتش إت", appPackage: "com.watchit.vod", website: "watchit.com", brandColor: "#F4C430", matchTokens: ["watchit", "watch it"], ...streaming },
  { slug: "yango_play", name: "Yango Play", nameAr: "يانجو بلاي", appPackage: "com.yango.saft", website: "play.yango.com", brandColor: "#FC3F1D", matchTokens: ["yango play"], ...streaming },
  { slug: "tod", name: "TOD", nameAr: "تود", appPackage: "com.todtv.tod", website: "tod.tv", brandColor: "#6C2BD9", matchTokens: ["tod tv", "tod.tv"], ...streaming },
  { slug: "bein", name: "beIN", nameAr: "بي إن سبورتس", appPackage: "com.beinsports.andcontent", website: "beinsports.com", brandColor: "#5B2C83", matchTokens: ["bein"], ...streaming },
  { slug: "starzplay", name: "STARZPLAY", nameAr: "ستارزبلاي", appPackage: "com.parsifal.starz", website: "starzplay.com", brandColor: "#0A0A0A", matchTokens: ["starzplay", "starz play"], ...streaming },
  { slug: "jawwy_tv", name: "Jawwy TV", nameAr: "جوي تي في", status: "disabled", website: "jawwy.tv", brandColor: "#6A1B9A", matchTokens: ["jawwy"], ...streaming },
  { slug: "viu", name: "Viu", nameAr: "فيو", appPackage: "com.vuclip.viu", website: "viu.com", brandColor: "#FFC107", matchTokens: ["viu"], ...streaming },
  { slug: "weyyak", name: "Weyyak", nameAr: "وياك", appPackage: "com.tva.z5", website: "weyyak.com", brandColor: "#E91E63", matchTokens: ["weyyak"], ...streaming },
  { slug: "disney_plus", name: "Disney+", nameAr: "ديزني بلس", appPackage: "com.disney.disneyplus", website: "disneyplus.com", brandColor: "#113CCF", matchTokens: ["disney+", "disneyplus", "disney plus"], ...streaming },
  { slug: "prime_video", name: "Amazon Prime Video", nameAr: "أمازون برايم", appPackage: "com.amazon.avod.thirdpartyclient", website: "primevideo.com", brandColor: "#00A8E1", matchTokens: ["prime video", "primevideo", "amazon prime"], ...streaming },
  { slug: "youtube_premium", name: "YouTube Premium", nameAr: "يوتيوب بريميوم", appPackage: "com.google.android.youtube", website: "youtube.com", brandColor: "#FF0000", matchTokens: ["youtube", "google *google"], ...streaming },

  { slug: "crunchyroll", name: "Crunchyroll", nameAr: "كرانشي رول", appPackage: "com.crunchyroll.crunchyroid", website: "crunchyroll.com", brandColor: "#F47521", matchTokens: ["crunchyroll"], ...streaming },

  // ─── Music ───
  { slug: "spotify", name: "Spotify", nameAr: "سبوتيفاي", appPackage: "com.spotify.music", website: "spotify.com", brandColor: "#1DB954", matchTokens: ["spotify", "dm*spotify"], ...music },
  { slug: "anghami", name: "Anghami", nameAr: "أنغامي", appPackage: "com.anghami", website: "anghami.com", brandColor: "#7B2FF7", matchTokens: ["anghami"], ...music },
  { slug: "deezer", name: "Deezer", nameAr: "ديزر", appPackage: "deezer.android.app", website: "deezer.com", brandColor: "#A238FF", matchTokens: ["deezer"], ...music },
  { slug: "youtube_music", name: "YouTube Music", nameAr: "يوتيوب ميوزك", appPackage: "com.google.android.apps.youtube.music", website: "music.youtube.com", brandColor: "#FF0000", matchTokens: ["youtube music"], ...music },
  { slug: "apple_music", name: "Apple Music", nameAr: "أبل ميوزك", appPackage: "com.apple.android.music", website: "music.apple.com", brandColor: "#FA243C", matchTokens: ["apple music"], ...music },

  // ─── AI tools ───
  { slug: "chatgpt", name: "ChatGPT", nameAr: "شات جي بي تي", appPackage: "com.openai.chatgpt", website: "chatgpt.com", brandColor: "#10A37F", matchTokens: ["openai *chatgpt subscr", "chatgpt", "openai"], ...aiTools },
  { slug: "claude", name: "Claude", nameAr: "كلود", appPackage: "com.anthropic.claude", website: "claude.ai", brandColor: "#D97757", matchTokens: ["claude.ai subscription", "anthropic", "claude.ai"], ...aiTools },
  { slug: "gemini", name: "Google Gemini", nameAr: "جيميني", appPackage: "com.google.android.apps.bard", website: "gemini.google.com", brandColor: "#4285F4", matchTokens: ["gemini", "google one ai"], ...aiTools },
  { slug: "perplexity", name: "Perplexity", nameAr: "بربلكسيتي", appPackage: "ai.perplexity.app.android", website: "perplexity.ai", brandColor: "#20808D", matchTokens: ["perplexity"], ...aiTools },
  { slug: "cursor", name: "Cursor", nameAr: "كيرسر", website: "cursor.com", brandColor: "#111111", matchTokens: ["cursor", "anysphere"], ...aiTools },
  { slug: "github_copilot", name: "GitHub Copilot", nameAr: "جيت هاب كوبايلوت", appPackage: "com.github.android", website: "github.com", brandColor: "#24292F", matchTokens: ["github"], ...aiTools },
  { slug: "midjourney", name: "Midjourney", nameAr: "ميدجورني", website: "midjourney.com", brandColor: "#0B0B0B", matchTokens: ["midjourney"], ...aiTools },

  // ─── Software and storage ───
  { slug: "google_one", name: "Google One", nameAr: "جوجل وان", appPackage: "com.google.android.apps.subscriptions.red", website: "one.google.com", brandColor: "#4285F4", matchTokens: ["google storage", "google one"], ...software },
  { slug: "icloud", name: "iCloud+", nameAr: "آي كلاود", msStoreId: "9PKTQ5699M62", website: "icloud.com", brandColor: "#3693F3", matchTokens: ["icloud"], ...software },
  { slug: "microsoft_365", name: "Microsoft 365", nameAr: "مايكروسوفت 365", appPackage: "com.microsoft.office.officehubrow", website: "microsoft365.com", brandColor: "#D83B01", matchTokens: ["microsoft 365", "microsoft*365", "office 365"], ...software },
  { slug: "adobe", name: "Adobe", nameAr: "أدوبي", website: "adobe.com", brandColor: "#FA0F00", matchTokens: ["adobe"], ...software },
  { slug: "canva", name: "Canva", nameAr: "كانفا", appPackage: "com.canva.editor", website: "canva.com", brandColor: "#00C4CC", matchTokens: ["canva"], ...software },
  { slug: "notion", name: "Notion", nameAr: "نوشن", appPackage: "notion.id", website: "notion.so", brandColor: "#000000", matchTokens: ["notion"], ...software },
  { slug: "dropbox", name: "Dropbox", nameAr: "دروب بوكس", appPackage: "com.dropbox.android", website: "dropbox.com", brandColor: "#0061FF", matchTokens: ["dropbox"], ...software },
  { slug: "linkedin_premium", name: "LinkedIn Premium", nameAr: "لينكدإن بريميوم", appPackage: "com.linkedin.android", website: "linkedin.com", brandColor: "#0A66C2", matchTokens: ["linkedin"], ...software },

  { slug: "capcut", name: "CapCut Pro", nameAr: "كاب كات برو", appPackage: "com.lemon.lvoverseas", website: "capcut.com", brandColor: "#000000", matchTokens: ["capcut"], ...software },
  { slug: "zoom", name: "Zoom", nameAr: "زووم", appPackage: "us.zoom.videomeetings", website: "zoom.us", brandColor: "#0B5CFF", matchTokens: ["zoom.us", "zoom video"], ...software },

  // ─── Learning and books ───
  { slug: "duolingo", name: "Duolingo Super", nameAr: "دولينجو", appPackage: "com.duolingo", website: "duolingo.com", brandColor: "#58CC02", matchTokens: ["duolingo"], ...other },
  { slug: "almentor", name: "almentor", nameAr: "المنتور", appPackage: "com.almentor.app", website: "almentor.net", brandColor: "#E42C3A", matchTokens: ["almentor"], ...other },
  { slug: "coursera", name: "Coursera Plus", nameAr: "كورسيرا", appPackage: "org.coursera.android", website: "coursera.org", brandColor: "#0056D2", matchTokens: ["coursera"], ...other },
  { slug: "storytel", name: "Storytel", nameAr: "ستوريتل", appPackage: "grit.storytel.app", website: "storytel.com", brandColor: "#FF5C28", matchTokens: ["storytel"], ...other },
  { slug: "abjjad", name: "Abjjad", nameAr: "أبجد", appPackage: "com.abjjad.app", website: "abjjad.com", brandColor: "#1B6F5C", matchTokens: ["abjjad"], ...other },

  // ─── Social and messaging ───
  { slug: "snapchat_plus", name: "Snapchat+", nameAr: "سناب شات بلس", appPackage: "com.snapchat.android", website: "snapchat.com", brandColor: "#FFFC00", matchTokens: ["snapchat"], ...other },
  { slug: "telegram_premium", name: "Telegram Premium", nameAr: "تليجرام بريميوم", appPackage: "org.telegram.messenger", website: "telegram.org", brandColor: "#26A5E4", matchTokens: ["telegram"], ...other },

  // ─── Games ───
  { slug: "playstation_plus", name: "PlayStation Plus", nameAr: "بلايستيشن بلس", appPackage: "com.scee.psxandroid", website: "playstation.com", brandColor: "#003791", matchTokens: ["playstation", "sony interactive"], ...other },
  { slug: "xbox_game_pass", name: "Xbox Game Pass", nameAr: "إكس بوكس جيم باس", appPackage: "com.microsoft.xboxone.smartglass", website: "xbox.com", brandColor: "#107C10", matchTokens: ["xbox", "microsoft*xbox"], ...other },

  // ─── Delivery and rides: only the membership's own name, never the app's, which every order carries ───
  { slug: "talabat_pro", name: "talabat pro", nameAr: "طلبات برو", appPackage: "com.talabat", website: "talabat.com", brandColor: "#FF5A00", matchTokens: ["talabat pro"], ...other },
  { slug: "careem_plus", name: "Careem Plus", nameAr: "كريم بلس", appPackage: "com.careem.acma", website: "careem.com", brandColor: "#00E784", matchTokens: ["careem plus"], ...other },
  { slug: "uber_one", name: "Uber One", nameAr: "أوبر وان", appPackage: "com.ubercab", website: "uber.com", brandColor: "#000000", matchTokens: ["uber one"], ...other },

  // ─── App stores: the charge names the store, so the service is asked once and remembered ───
  { slug: "google_play", name: "Google Play", nameAr: "جوجل بلاي", kind: "store", website: "play.google.com", brandColor: "#01875F", matchTokens: ["google *", "google*", "google play"], ...other, cycle: "varies" },
  { slug: "apple_store", name: "Apple (App Store)", nameAr: "أبل (آب ستور)", kind: "store", website: "apple.com", brandColor: "#000000", matchTokens: ["apple.com/bill", "apple.com"], ...other, cycle: "varies" },
];
