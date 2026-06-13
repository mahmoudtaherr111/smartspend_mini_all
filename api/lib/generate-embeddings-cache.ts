import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY is not defined in the environment or .env file.");
  process.exit(1);
}

const baseDir = path.resolve(process.cwd(), "api/lib");
const dictPath = path.join(baseDir, "egypt_merchants_rag.json");
const embeddingsPath = path.join(baseDir, "egypt_merchants_rag_embeddings.json");

interface GlobalMerchantEntry {
  merchant: string;
  category: string;
  subCategory: string;
  keywords: string[];
  isInstallmentCommon: boolean;
}

interface GlobalMerchantEmbedding {
  merchant: string;
  category: string;
  subCategory: string;
  keyword: string;
  vector: number[];
  isInstallmentCommon: boolean;
}

const GLOBAL_CATEGORY_MAP: Record<string, string> = {
  "Telecom": "فواتير",
  "Transport": "مواصلات",
  "Food": "أكل وشرب",
  "Groceries": "أكل وشرب",
  "Shopping": "تسوق",
  "Electronics": "تسوق",
  "Financial": "تحويل",
  "Health": "صحة",
  "Charity": "هدايا وصدقات",
  "Entertainment": "ترفيه",
  "Services": "متنوعات",
  "Bills": "فواتير",
  "Furniture": "سكن",
  "Education": "تعليم"
};

const GLOBAL_SUBCATEGORY_MAP: Record<string, string> = {
  // Food
  "Fast Food": "وجبات سريعة",
  "Restaurant": "مطعم",
  "Cafe": "قهوة وكافيه",
  "Bakery": "مخبوزات",
  "Delivery": "دليفري",
  "Local": "عام",
  "Nuts & Coffee": "قهوة وكافيه",
  "Nuts": "سناكس",

  // Transport
  "Ride-Hailing": "أوبر/كريم",
  "Bus": "أتوبيس",
  "Public Transport": "مترو",
  "Fuel": "بنزين",
  "Micobuses & Taxis": "عام",
  "Flight": "طيران",

  // Bills
  "Payment Gateway": "عام",
  "Electricity": "كهرباء",
  "Gas": "غاز",
  "Water": "مياه",
  "Traffic": "عام",
  "Syndicate": "عام",

  // Shopping
  "E-commerce": "عام",
  "Home & Electronics": "أجهزة إلكترونية",
  "Retail & Installments": "أجهزة إلكترونية",
  "Retail": "عام",
  "Fashion": "ملابس",
  "Cosmetics": "عناية شخصية",
  "Toys": "عام",
  "Kids": "عام",
  "Eyewear": "نظارات",
  "Pets": "عام",
  "Furniture": "أثاث",

  // Health
  "Booking": "دكتور",
  "Pharmacy": "صيدلية",
  "Consultation": "دكتور",
  "Clinics": "دكتور",
  "Hospital": "مستشفى",

  // Entertainment
  "Streaming": "منصات مشاهدة",
  "Music": "سبوتيفاي",
  "Sports": "رياضة وجيم",
  "Cinema": "سينما",
  "Theme Park": "فسحة",

  // Services
  "Maintenance": "صيانة",
  "Car Maintenance": "صيانة عربية",
  "Coworking": "مساحة عمل",

  // Financial
  "Installments": "أقساط",
  "Transfer": "انستاباي",
  "Mobile Wallet": "فودافون كاش",
  "Bank": "تحويل بنكي",
  "App": "عام",
  "Donation": "صدقة/تبرع",

  // General Slang & personal care
  "Tips": "عام",
  "Personal Care": "عناية شخصية",
  "Education": "عام",
  "Fitness": "رياضة وجيم"
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("🚀 Starting Embedding Cache Generation...");

  if (!fs.existsSync(dictPath)) {
    console.error(`❌ Consolidated dictionary not found at ${dictPath}`);
    process.exit(1);
  }

  const rawDict = fs.readFileSync(dictPath, "utf-8");
  const dict = JSON.parse(rawDict) as GlobalMerchantEntry[];
  console.log(`ℹ️ Loaded ${dict.length} merchants from dictionary.`);

  // Load existing embeddings cache if it exists
  let existingCache: GlobalMerchantEmbedding[] = [];
  const existingMap = new Map<string, GlobalMerchantEmbedding>();

  if (fs.existsSync(embeddingsPath)) {
    try {
      existingCache = JSON.parse(fs.readFileSync(embeddingsPath, "utf-8")) as GlobalMerchantEmbedding[];
      for (const e of existingCache) {
        // key by keyword
        existingMap.set(e.keyword.trim().toLowerCase(), e);
      }
      console.log(`ℹ️ Loaded ${existingCache.length} existing embeddings from cache file.`);
    } catch (e) {
      console.warn("⚠️ Failed to parse existing embeddings file, starting fresh.");
    }
  }

  const genAI = new GoogleGenerativeAI(API_KEY!);
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

  const finalEmbeddings: GlobalMerchantEmbedding[] = [];
  const pendingWords: Array<{ word: string; entry: GlobalMerchantEntry }> = [];

  // Identify new words that need to be embedded
  for (const entry of dict) {
    const categoryAr = GLOBAL_CATEGORY_MAP[entry.category] || "متنوعات";
    const subCategoryAr = GLOBAL_SUBCATEGORY_MAP[entry.subCategory] || "عام";

    const wordsToEmbed = Array.from(
      new Set([entry.merchant, ...entry.keywords])
    ).map(w => w.trim()).filter(w => w && w.length > 1);

    for (const word of wordsToEmbed) {
      const cacheKey = word.toLowerCase();
      
      if (existingMap.has(cacheKey)) {
        // Reuse cached embedding, but update properties (in case category/installment changed)
        const cached = existingMap.get(cacheKey)!;
        finalEmbeddings.push({
          ...cached,
          category: categoryAr,
          subCategory: subCategoryAr,
          isInstallmentCommon: entry.isInstallmentCommon
        });
      } else {
        pendingWords.push({ word, entry });
      }
    }
  }

  console.log(`📊 Embedding Summary:`);
  console.log(`   - Total keywords to keep: ${finalEmbeddings.length + pendingWords.length}`);
  console.log(`   - Cached keywords reused: ${finalEmbeddings.length}`);
  console.log(`   - Pending keywords to embed: ${pendingWords.length}`);

  if (pendingWords.length === 0) {
    console.log("✅ All embeddings are up to date! Writing output...");
    fs.writeFileSync(embeddingsPath, JSON.stringify(finalEmbeddings, null, 2), "utf-8");
    console.log(`🎉 Embeddings file updated successfully at ${embeddingsPath}`);
    return;
  }

  console.log(`⏳ Starting API generation for ${pendingWords.length} pending keywords...`);
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pendingWords.length; i++) {
    const item = pendingWords[i];
    const categoryAr = GLOBAL_CATEGORY_MAP[item.entry.category] || "متنوعات";
    const subCategoryAr = GLOBAL_SUBCATEGORY_MAP[item.entry.subCategory] || "عام";

    let attempts = 0;
    let success = false;
    let vector: number[] = [];

    while (attempts < 3 && !success) {
      try {
        attempts++;
        const result = await model.embedContent(item.word);
        vector = result.embedding.values;
        success = true;
      } catch (err: any) {
        console.warn(`⚠️ Attempt ${attempts} failed for "${item.word}": ${err.message || err}`);
        if (attempts < 3) {
          // Exponential backoff
          await sleep(attempts * 1000);
        }
      }
    }

    if (success) {
      finalEmbeddings.push({
        merchant: item.entry.merchant,
        category: categoryAr,
        subCategory: subCategoryAr,
        keyword: item.word,
        vector,
        isInstallmentCommon: item.entry.isInstallmentCommon
      });
      successCount++;
    } else {
      console.error(`❌ Failed completely to embed "${item.word}" after 3 attempts.`);
      failCount++;
    }

    // Print progress every 20 keywords
    if ((i + 1) % 20 === 0 || i === pendingWords.length - 1) {
      console.log(`   [Progress] ${i + 1}/${pendingWords.length} processed. Success: ${successCount}, Failed: ${failCount}`);
    }

    // Delay slightly to stay well within TPM/RPM rate limits
    await sleep(80);
  }

  // Save the result
  fs.writeFileSync(embeddingsPath, JSON.stringify(finalEmbeddings, null, 2), "utf-8");
  console.log(`\n🎉 Completed embedding generation!`);
  console.log(`   - Success: ${successCount}`);
  console.log(`   - Failed: ${failCount}`);
  console.log(`   - Saved to: ${embeddingsPath}`);
}

// Simple polyfill to avoid case issues in dynamic maps
(String.prototype as any).lowerCase = function() {
  return this.toLowerCase();
};

run().catch((err) => {
  console.error("❌ Fatal Error during Embedding Cache Generation:", err);
  process.exit(1);
});
