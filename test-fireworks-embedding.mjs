// Comprehensive Fireworks Embedding Test for Arabic Financial Classification
// Tests qwen3-embedding-8b against real Egyptian Arabic queries

const API_KEY = "fw_VhH1Bo2oNNd8bjxGEwSXjP";
const MODEL = "accounts/fireworks/models/qwen3-embedding-8b";
const URL = "https://api.fireworks.ai/inference/v1/embeddings";

async function getEmbeddings(texts, dims) {
  const body = { model: MODEL, input: texts };
  if (dims) body.dimensions = dims;
  const resp = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.data.map((d) => d.embedding);
}

function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// ═══════════════════════════════════════════════════
// Category Descriptors (what we'd index)
// ═══════════════════════════════════════════════════

const descriptors = [
  { cat: "أكل وشرب", sub: "مطعم", text: "أكلت في مطعم" },
  { cat: "أكل وشرب", sub: "وجبات سريعة", text: "اشتريت برجر" },
  { cat: "أكل وشرب", sub: "قهوة", text: "شربت قهوة" },
  { cat: "أكل وشرب", sub: "بقالة", text: "طلبات سوبرماركت" },
  { cat: "أكل وشرب", sub: "مخبوزات", text: "عيش من الفرن" },
  { cat: "أكل وشرب", sub: "لحوم", text: "جبت لحمة وفراخ" },
  { cat: "أكل وشرب", sub: "حلويات", text: "حلويات وشيبسي" },
  { cat: "أكل وشرب", sub: "دليفري", text: "طلبت دليفري" },
  { cat: "مواصلات", sub: "بنزين", text: "ملأت بنزين" },
  { cat: "مواصلات", sub: "أوبر", text: "ركبت اوبر" },
  { cat: "مواصلات", sub: "مترو", text: "تذكرة مترو" },
  { cat: "مواصلات", sub: "أتوبيس", text: "ركبت ميكروباص" },
  { cat: "مواصلات", sub: "تاكسي", text: "ركبت تاكسي" },
  { cat: "مواصلات", sub: "صيانة", text: "صيانة العربية" },
  { cat: "مواصلات", sub: "طيران", text: "تذكرة طيران" },
  { cat: "فواتير", sub: "كهرباء", text: "فاتورة الكهرباء" },
  { cat: "فواتير", sub: "إنترنت", text: "باقة النت" },
  { cat: "فواتير", sub: "شحن", text: "شحنت رصيد موبايل" },
  { cat: "فواتير", sub: "مياه", text: "فاتورة المياه" },
  { cat: "فواتير", sub: "غاز", text: "فاتورة الغاز" },
  { cat: "فواتير", sub: "أقساط", text: "قسط فاليو" },
  { cat: "سكن", sub: "إيجار", text: "دفعت الإيجار" },
  { cat: "سكن", sub: "صيانة", text: "سباك للبيت" },
  { cat: "سكن", sub: "أثاث", text: "عفش جديد" },
  { cat: "سكن", sub: "منظفات", text: "منظفات للبيت" },
  { cat: "سكن", sub: "أجهزة", text: "غسالة جديدة" },
  { cat: "تسوق", sub: "ملابس", text: "اشتريت هدوم" },
  { cat: "تسوق", sub: "إلكترونيات", text: "موبايل جديد" },
  { cat: "تسوق", sub: "أحذية", text: "جبت جزمة" },
  { cat: "تسوق", sub: "عناية", text: "حلاق وكوافير" },
  { cat: "صحة", sub: "دكتور", text: "كشف دكتور" },
  { cat: "صحة", sub: "صيدلية", text: "دوا من الصيدلية" },
  { cat: "صحة", sub: "تحاليل", text: "تحليل دم" },
  { cat: "صحة", sub: "أسنان", text: "دكتور أسنان" },
  { cat: "صحة", sub: "مستشفى", text: "مستشفى ودفع" },
  { cat: "تعليم", sub: "مدرسة", text: "مصاريف المدرسة" },
  { cat: "تعليم", sub: "جامعة", text: "قسط الجامعة" },
  { cat: "تعليم", sub: "كورس", text: "كورس جديد" },
  { cat: "تعليم", sub: "دروس", text: "درس خصوصي" },
  { cat: "ترفيه", sub: "سينما", text: "تذكرة سينما" },
  { cat: "ترفيه", sub: "جيم", text: "اشتراك الجيم" },
  { cat: "ترفيه", sub: "سفر", text: "سفرية مصيف" },
  { cat: "ترفيه", sub: "ألعاب", text: "لعبت بلايستيشن" },
  { cat: "تدخين", sub: "سجائر", text: "علبة سجاير" },
  { cat: "تدخين", sub: "فيب", text: "ليكود فيب" },
  { cat: "تدخين", sub: "شيشة", text: "حجر شيشة" },
  { cat: "هدايا", sub: "صدقة", text: "تبرعت للجامع" },
  { cat: "هدايا", sub: "عيدية", text: "عيدية للأولاد" },
  { cat: "هدايا", sub: "فرح", text: "نقوط فرح" },
  { cat: "استثمار", sub: "ذهب", text: "اشتريت ذهب" },
  { cat: "استثمار", sub: "أسهم", text: "أسهم البورصة" },
  { cat: "استثمار", sub: "شهادات", text: "شهادات البنك" },
  { cat: "تحويل", sub: "انستاباي", text: "تحويل انستاباي" },
  { cat: "تحويل", sub: "سحب", text: "سحبت من ATM" },
  { cat: "تحويل", sub: "فودافون", text: "فودافون كاش" },
  { cat: "تحويل", sub: "ادخار", text: "وفرت وادخرت" },
  { cat: "تحويل", sub: "دين", text: "سلفت صاحب دين" },
  { cat: "مرتب", sub: "راتب", text: "قبضت المرتب" },
  { cat: "مرتب", sub: "بونص", text: "بونص الشغل" },
  { cat: "عمل حر", sub: "سبوبة", text: "سبوبة فريلانس" },
  { cat: "عمل حر", sub: "عمولة", text: "عمولة شغل" },
  { cat: "عوائد", sub: "كاش باك", text: "كاش باك" },
  { cat: "عوائد", sub: "فوائد", text: "أرباح البنك" },
];

// ═══════════════════════════════════════════════════
// Real user queries (what users actually type)
// ═══════════════════════════════════════════════════

const queries = [
  { expected: "أكل وشرب", text: "دفعت 200 على الفطار" },
  { expected: "أكل وشرب", text: "اكلت بيتزا ب 150" },
  { expected: "أكل وشرب", text: "شربت قهوة 35" },
  { expected: "أكل وشرب", text: "طلبات البيت 300" },
  { expected: "أكل وشرب", text: "عيش من الفرن 20" },
  { expected: "أكل وشرب", text: "جبت لحمة 400" },
  { expected: "أكل وشرب", text: "شيبسي وحلويات 50" },
  { expected: "أكل وشرب", text: "دليفري 220" },
  { expected: "مواصلات", text: "بنزين 500" },
  { expected: "مواصلات", text: "ركبت اوبر 80" },
  { expected: "مواصلات", text: "مترو 10" },
  { expected: "مواصلات", text: "ميكروباص 7" },
  { expected: "مواصلات", text: "تاكسي 30" },
  { expected: "مواصلات", text: "صيانة العربية 650" },
  { expected: "مواصلات", text: "تذكرة طيران 3000" },
  { expected: "فواتير", text: "كهربا 450" },
  { expected: "فواتير", text: "باقة النت 360" },
  { expected: "فواتير", text: "شحنت رصيد 100" },
  { expected: "فواتير", text: "فاتورة المياه 120" },
  { expected: "فواتير", text: "غاز 80" },
  { expected: "فواتير", text: "قسط فاليو 1500" },
  { expected: "سكن", text: "الإيجار 5000" },
  { expected: "سكن", text: "السباك 250" },
  { expected: "سكن", text: "عفش 3000" },
  { expected: "سكن", text: "منظفات 140" },
  { expected: "سكن", text: "غسالة 4000" },
  { expected: "تسوق", text: "هدوم 900" },
  { expected: "تسوق", text: "اشتريت ايفون 15000" },
  { expected: "تسوق", text: "جزمة 350" },
  { expected: "تسوق", text: "حلاق 120" },
  { expected: "صحة", text: "كشف 400" },
  { expected: "صحة", text: "دوا 260" },
  { expected: "صحة", text: "تحليل دم 300" },
  { expected: "صحة", text: "دكتور أسنان 500" },
  { expected: "صحة", text: "مستشفى 2000" },
  { expected: "تعليم", text: "مدرسة 1200" },
  { expected: "تعليم", text: "جامعة 3000" },
  { expected: "تعليم", text: "كورس 800" },
  { expected: "تعليم", text: "درس خصوصي 250" },
  { expected: "ترفيه", text: "سينما 180" },
  { expected: "ترفيه", text: "جيم 700" },
  { expected: "ترفيه", text: "مصيف 5000" },
  { expected: "ترفيه", text: "بلايستيشن 90" },
  { expected: "تدخين", text: "سجاير 65" },
  { expected: "تدخين", text: "ليكود 180" },
  { expected: "تدخين", text: "شيشة 80" },
  { expected: "هدايا", text: "صدقة 100" },
  { expected: "هدايا", text: "عيدية 50" },
  { expected: "هدايا", text: "نقوط فرح 500" },
  { expected: "استثمار", text: "ذهب 6000" },
  { expected: "استثمار", text: "أسهم 4000" },
  { expected: "استثمار", text: "شهادات 10000" },
  { expected: "تحويل", text: "انستاباي 1000" },
  { expected: "تحويل", text: "سحبت ATM 2000" },
  { expected: "تحويل", text: "فودافون كاش 500" },
  { expected: "تحويل", text: "ادخرت 3000" },
  { expected: "تحويل", text: "سلفت صاحب 1000" },
  { expected: "مرتب", text: "المرتب 15000" },
  { expected: "مرتب", text: "بونص 3000" },
  { expected: "عمل حر", text: "سبوبة 1800" },
  { expected: "عمل حر", text: "عمولة 500" },
  { expected: "عوائد", text: "كاش باك 70" },
  { expected: "عوائد", text: "أرباح البنك 200" },
];

async function runTest(label, descTexts, queryTexts) {
  console.log(`\n${"═".repeat(60)}\n${label}\n${"═".repeat(60)}`);

  console.log("Fetching descriptor embeddings...");
  const descEmb = await getEmbeddings(descTexts);
  console.log(`Got ${descEmb.length} x ${descEmb[0].length} dims`);

  console.log("Fetching query embeddings...");
  const qEmb = await getEmbeddings(queryTexts);
  console.log(`Got ${qEmb.length} embeddings\n`);

  // Classification test
  let correct = 0;
  const total = queries.length;
  const results = [];

  for (let qi = 0; qi < total; qi++) {
    let bestCat = "", bestSub = "", bestSim = -1;
    for (let di = 0; di < descEmb.length; di++) {
      const sim = cosSim(qEmb[qi], descEmb[di]);
      if (sim > bestSim) { bestSim = sim; bestCat = descriptors[di].cat; bestSub = descriptors[di].sub; }
    }
    const expected = queries[qi].expected;
    const isCorrect = bestCat === expected;
    if (isCorrect) correct++;
    results.push({ query: queries[qi].text, best: `${bestCat}/${bestSub}`, sim: bestSim.toFixed(4), expected, correct: isCorrect });
    const mark = isCorrect ? "OK " : "XX ";
    console.log(`${mark} "${queries[qi].text}" -> ${bestCat}/${bestSub} (${bestSim.toFixed(4)}) expected=${expected}`);
  }

  const acc = ((correct / total) * 100).toFixed(1);
  console.log(`\n>>> ACCURACY: ${correct}/${total} = ${acc}%`);

  // Separation analysis
  let sameSum = 0, sameCount = 0, diffSum = 0, diffCount = 0, diffMin = 1, diffMax = 0;
  for (let i = 0; i < descEmb.length; i++) {
    for (let j = i + 1; j < descEmb.length; j++) {
      const sim = cosSim(descEmb[i], descEmb[j]);
      if (descriptors[i].cat === descriptors[j].cat) {
        sameSum += sim; sameCount++;
      } else {
        diffSum += sim; diffCount++;
        if (sim < diffMin) diffMin = sim;
        if (sim > diffMax) diffMax = sim;
      }
    }
  }
  const avgSame = sameCount > 0 ? (sameSum / sameCount).toFixed(4) : 0;
  const avgDiff = diffCount > 0 ? (diffSum / diffCount).toFixed(4) : 0;
  const gap = (avgSame - avgDiff).toFixed(4);

  console.log(`\nSeparation Analysis:`);
  console.log(`  Same-cat avg:  ${avgSame} (${sameCount} pairs)`);
  console.log(`  Diff-cat avg:  ${avgDiff} (${diffCount} pairs)`);
  console.log(`  Diff-cat min:  ${diffMin.toFixed(4)}`);
  console.log(`  Diff-cat max:  ${diffMax.toFixed(4)}`);
  console.log(`  Gap (same-diff): ${gap}`);

  let verdict;
  if (Math.abs(gap) < 0.05) verdict = "POOR (gap < 0.05)";
  else if (Math.abs(gap) < 0.15) verdict = "WEAK (gap < 0.15)";
  else if (Math.abs(gap) < 0.25) verdict = "MODERATE";
  else verdict = "GOOD";
  console.log(`  VERDICT: ${verdict}`);

  return { acc: parseFloat(acc), gap: parseFloat(gap), correct, total };
}

async function main() {
  const descTexts = descriptors.map(d => d.text);
  const queryTexts = queries.map(q => q.text);
  const instr = "Instruct: Classify this Egyptian Arabic financial transaction. Query: ";

  // Phase A: Raw Arabic
  const raw = await runTest("PHASE A: Raw Arabic (no prefix)", descTexts, queryTexts);

  // Phase B: With Instruct prefix
  const instrResult = await runTest("PHASE B: With Instruct Prefix",
    descTexts.map(t => `${instr} ${t}`),
    queryTexts.map(t => `${instr} ${t}`));

  // Phase C: Raw + 256 dims
  console.log(`\n${"═".repeat(60)}\nPHASE C: Raw Arabic + 256 dims\n${"═".repeat(60)}`);
  const desc256 = await getEmbeddings(descTexts, 256);
  const q256 = await getEmbeddings(queryTexts, 256);
  let correct256 = 0;
  for (let qi = 0; qi < queries.length; qi++) {
    let bestCat = "", bestSim = -1;
    for (let di = 0; di < desc256.length; di++) {
      const sim = cosSim(q256[qi], desc256[di]);
      if (sim > bestSim) { bestSim = sim; bestCat = descriptors[di].cat; }
    }
    if (bestCat === queries[qi].expected) correct256++;
  }
  const acc256 = ((correct256 / queries.length) * 100).toFixed(1);
  console.log(`>>> 256-DIM ACCURACY: ${correct256}/${queries.length} = ${acc256}%`);

  // Final Summary
  console.log(`\n${"═".repeat(60)}\nFINAL SUMMARY\n${"═".repeat(60)}`);
  console.log(`Raw Arabic:         ${raw.acc}% (gap: ${raw.gap})`);
  console.log(`Instruct prefix:    ${instrResult.acc}% (gap: ${instrResult.gap})`);
  console.log(`256-dim:            ${acc256}%`);
  console.log(`Rule engine (local): ~80% (0 API calls)`);
  console.log("");
  const bestAcc = Math.max(raw.acc, instrResult.acc, parseFloat(acc256));
  if (bestAcc >= 80) {
    console.log(">>> RECOMMENDATION: USE Fireworks embedding (matches/beats rule engine)");
  } else if (bestAcc >= 70) {
    console.log(">>> RECOMMENDATION: MAYBE — borderline, test with more data");
  } else {
    console.log(">>> RECOMMENDATION: REJECT — local engine is better and free");
  }
}

main().catch(err => { console.error("Test failed:", err); process.exit(1); });
