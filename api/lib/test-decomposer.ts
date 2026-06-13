/**
 * Diagnostic: Test the decomposer with complex Egyptian Arabic sentences
 * Run: npx tsx api/lib/test-decomposer.ts
 */
import { decomposeHeuristic } from "./narrative-decomposer";

const testCases = [
  // The user's original example
  "صرفت 1500 أكل و 450 فطورة مياه و 230 بلايستيشن و 50 حسام",
  
  // No connectors at all
  "اديت حسام 500 سارة 300 مروان 200",
  
  // Food items without verbs
  "فطار 50 غدا 80 عشا 120",
  
  // Mixed context positions
  "أكل 1500 فطورة مياه 450 بلايستيشن 230",
  
  // Very long narrative
  "صرفت النهارده كتير أكل ب 200 وشربت قهوة ب 50 وركبت اوبر ب 80 ودفعت فاتورة الكهربا 450 واديت البواب 100",
  
  // Simple sentence (should NOT split)
  "بنزين 200",
  
  // Amounts before and after context
  "1500 أكل 450 مياه 230 بلايستيشن",
  
  // Person with no verb
  "500 حسام 300 سارة",
];

console.log("=== Decomposer Diagnostic ===\n");

for (const text of testCases) {
  const result = decomposeHeuristic(text);
  console.log(`📝 Input: "${text}"`);
  console.log(`   Method: ${result.method} | Complex: ${result.isComplex} | Segments: ${result.segments.length}`);
  for (const seg of result.segments) {
    console.log(`   [${seg.segmentIndex}] "${seg.text}" → amount=${seg.amount}, dir=${seg.direction}, verb=${seg.linkedVerb}, person=${seg.personMentioned}`);
  }
  console.log("");
}
