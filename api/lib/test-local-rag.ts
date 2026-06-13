/**
 * Quick diagnostic script to test the Local RAG Engine
 * Run: npx tsx api/lib/test-local-rag.ts
 */
import { localRAGSearch, getLocalRAGEngine } from "./local-rag-engine";

const engine = getLocalRAGEngine();
const stats = engine.getStats();
console.log("\n=== Local RAG Engine Stats ===");
console.log(`Loaded: ${stats.loaded}`);
console.log(`Total entries: ${stats.entryCount}`);
console.log(`Files: ${stats.files.join(", ")}\n`);

// Test cases
const testQueries = [
  // Exact matches (should be instant, score = 100)
  "بي تك",
  "فودافون",
  "كشري ابو طارق",
  "كنتاكي",
  "اوبر",
  "كارفور",
  
  // Near-matches / spelling variations (should use TF-IDF or fuzzy)
  "بيتيك",         // misspelling of بي تك
  "فوادفون",       // variant
  "كشرى ابو طارق", // alternate ya/alef
  "كنتاكى",        // variant
  
  // Full sentences (should extract the keyword)
  "دفعت قسط بي تك 1000",
  "شحنت فودافون 100",
  "طلبت من طلبات 220",
  
  // Things NOT in the knowledge base (should return null or low score)
  "حسام",
  "صاحبي",
  "مروان أخويا",

  // Edge cases
  "بلايستيشن",
  "بلاستيشن",  // common misspelling
  "ميكروباص",
];

console.log("=== Search Results ===\n");
console.log("Query".padEnd(30) + "Match".padEnd(25) + "Category".padEnd(15) + "Method".padEnd(8) + "Sim".padEnd(6) + "Score");
console.log("-".repeat(100));

for (const query of testQueries) {
  const result = localRAGSearch(query, 0.40); // Lower threshold to see everything
  if (result) {
    console.log(
      query.padEnd(30) +
      result.merchant.padEnd(25) +
      result.category.padEnd(15) +
      result.matchMethod.padEnd(8) +
      result.similarity.toFixed(2).padEnd(6) +
      result.score
    );
  } else {
    console.log(query.padEnd(30) + "❌ NO MATCH");
  }
}

// Also test the dictionary items count
const dictItems = engine.getDictionaryItems();
console.log(`\n=== Dictionary Injection Stats ===`);
console.log(`Total items for Rule Engine: ${dictItems.length}`);

// Count by category
const catCounts: Record<string, number> = {};
for (const item of dictItems) {
  catCounts[item.category] = (catCounts[item.category] || 0) + 1;
}
console.log("\nItems per category:");
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
