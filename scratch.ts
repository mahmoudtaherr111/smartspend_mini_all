import { scoreCategories } from "./api/lib/category-scorer";
import { getLocalRAGEngine } from "./api/lib/local-rag-engine";
getLocalRAGEngine();
console.log("TEST 1", JSON.stringify(scoreCategories("خرجت مع صحابي اكلنا شاورما ب 200"), null, 2));
console.log("TEST 2", JSON.stringify(scoreCategories("عملية غريبة شوية", [{ category: "تعليم", count: 8 }, { category: "صحة", count: 2 }]), null, 2));
console.log("TEST 3", JSON.stringify(scoreCategories("كلام فاضي"), null, 2));
