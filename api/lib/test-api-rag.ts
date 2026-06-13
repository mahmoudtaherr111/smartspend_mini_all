import { findSimilarPastTransactions } from "./embedding-engine";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const ragModel = "gemini-embedding-2";

const mockPastTransactions = [
  { description: "قهوة من ستاربكس", category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  { description: "اشتريت بلايستيشن 5", category: "ترفيه", subCategory: "ألعاب" },
  { description: "دفعت قسط الشقة", category: "سكن", subCategory: "إيجار" },
  { description: "شحنت رصيد فودافون", category: "فواتير", subCategory: "شحن رصيد" },
  { description: "كشري التحرير", category: "أكل وشرب", subCategory: "مطعم" }
];

async function runTest() {
  console.log("=== API RAG Diagnostic Test ===");
  console.log(`Using API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`Using Model: ${ragModel}\n`);



  console.log("2. Testing findSimilarPastTransactions with Personalized RAG...");
  const queries = [
    "ستاربكس",
    "بلايستيشن",
    "شحنت موبايلي"
  ];

  for (const query of queries) {
    console.log(`\n🔍 Query: "${query}"`);
    try {
      const matches = await findSimilarPastTransactions(query, mockPastTransactions, apiKey, ragModel);
      if (matches.length > 0) {
        console.log("   Top Match:");
        console.log(`   Description: "${matches[0].description}"`);
        console.log(`   Category:    ${matches[0].category} / ${matches[0].subCategory}`);
        console.log(`   Similarity:  ${(matches[0].similarity * 100).toFixed(2)}%`);
      } else {
        console.log("   ❌ No matches returned or error occurred.");
      }
    } catch (e) {
      console.log(`   ❌ Error finding similarities:`, e);
    }
  }
}

runTest();
