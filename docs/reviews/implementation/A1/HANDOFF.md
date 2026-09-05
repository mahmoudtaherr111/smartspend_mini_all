# HANDOFF — المرحلة A1: سلامة قرار التصنيف وعقد الـfallback

> **الحالة:** A1 منفَّذة ومُختبَرة، جاهزة لمراجعة مستقلة. **لم أنتقل إلى A2.**
> **لم أُجرِ commit ولا push ولا merge ولا deploy.** التسليم عبارة عن working tree + patch.
> **لم تتوفر مراجعة مستقلة داخل هذه الجولة** — التفاصيل في `independent-review.md`.

---

## 1. الهدف والنطاق المنفَّذ

نطاق التفويض: **A1 فقط** — سلامة قرار التصنيف وعقد الـfallback.
الأهداف الأساسية: **H01، H03، H04، H10، M06**، مع الجزء الخاص بـA1 من **H02** و**H18**.

ما نُفِّذ فعليًا:

| بند البرومبت | ما تم |
| :-- | :-- |
| A1.1 إعادة الإنتاج | كل عيب في النطاق أُعيد إنتاجه باختبار فاشل قبل الإصلاح، على `runSmartPipeline` نفسها |
| A1.2 قبول نهائي لا يمكن تجاوزه | وحدة `final-acceptance.ts` تمر بها كل مسارات الحفظ الثلاثة (cache/memory/business) + المسار العام |
| A1.3 إصلاح clause flow | مصدر واحد للمقاطع المصعّدة، معرّف ثابت لكل حدث، ومنع الطلب الشبكي بلا مقاطع |
| A1.4 ثقة وأسباب منع قابلة للتتبع | قرار لكل عنصر بدل المتوسط، blockers لاصقة، وتوحيد العتبات المتضاربة |
| A1.5 عقد مخرجات النموذج | تشديد حل الفئة، تمثيل الرد الناقص كفشل دلالي، ومنع اختراع حدث لمقطع بلا استخراج |

---

## 2. البيئة وحالة الـbaseline — **اقرأ هذا القسم أولًا**

### 2.1 عائق حرج تم اكتشافه وإصلاحه قبل أي تعديل

الـworktree الذي أنشأه الـharness كان **متأخرًا 34 commit** عن HEAD المرجعي للتدقيق:

```
worktree branch : claude/antigravity-classification-a1-233167
worktree HEAD   : 4405256  ← نقطة البداية (نفس main)
audit HEAD      : 467eada  ← المرجع في التقرير
```

`4405256` هو **جدّ** `467eada`. عند نقطة البداية:

- `api/lib/classification-decision.ts` — **غير موجود**
- `api/lib/llm-provider-chain.ts` — **غير موجود**
- `docs/reviews/` كله — **غير موجود** (ملفات غير متتبَّعة تعيش في working tree الرئيسي فقط)

أي عمل هناك كان سيصلح كودًا أُعيدت كتابته 34 مرة، وينتج diff غير قابل للدمج.
هذا بالضبط ما حذّر منه البرومبت في §2: «لا تكتفِ بمطابقة اسم الفرع».

### 2.2 إعادة بناء الـbaseline

1. `git merge --ff-only 467eada` — fast-forward خالص على worktree نظيف، بلا فقدان أي commit.
2. نسخ حالة الـworking tree الحقيقية من `E:/smartspend_V1_fixed` لكل ملفات المصدر داخل النطاق:
   **265 مسارًا** (127 معدَّل، 134 غير متتبَّع، 4 محذوف) عبر `api/ src/ contracts/ tests/ db/ docs/ scripts/` وملفات الإعداد الجذرية.
   استُثنيت مخرجات البناء فقط: `android/ ios/ dist/ public/ playwright-report/ test-results/`.
3. التحقق بالـhash على ملفات النطاق الحرجة (`smart-pipeline.ts`, `classification-decision.ts`,
   `classification-merge.ts`, `classifier-contract.ts`, `confidence-calibrator.ts`, `llm-provider-chain.ts`,
   `ai-router.ts`, `rule-engine.ts`, `ExpenseForm.tsx`) — **كلها متطابقة byte-for-byte** مع working tree المستخدم.
4. لقطة baseline غير قابلة للتغيير كـgit tree object، **بدون تحريك أي ref وبدون commit**:

```
BASE_TREE = 14a315bac48711eda19169c3a922f4ed8e4fa370
NOW_TREE  = a2e7072063e063fc3d23dcdb6dac460ab83e5b2c
```

`scope-diff.patch` هو `git diff-tree -p BASE_TREE NOW_TREE` — أي تغييرات هذه الجولة **وحدها**،
وليس `git diff HEAD` على working tree متسخ.

### 2.3 حماية العمل القائم

- لم أستخدم `reset --hard` ولا `clean` ولا `checkout` لاسترجاع ملفات، ولا `git stash`.
- لم أعدّل ولا ملفًا واحدًا خارج `api/lib/` (انظر §4).
- **حادثة واحدة وتصحيحها:** `CLASSIFY_BENCH_REPORT=1` يكتب فوق
  `docs/CLASSIFICATION_BENCHMARK_LAST_RESULT.md`، وهو ملف متتبَّع عليه تعديلات غير ملتزمة للمستخدم.
  استُعيد فورًا من `BASE_TREE` وتم التحقق أنه **byte-identical**. نسخ التقارير المولَّدة
  محفوظة خارج المستودع في scratchpad الجلسة. `scratch/benchmarks/` مُتجاهَل في `.gitignore`.
- `node_modules` عبارة عن junction للمجلد الرئيسي (قراءة فقط، نفس `package.json`).

---

## 3. مصفوفة الملاحظات — ما ثبت وما أُصلح

| ID | الحالة | الدليل الحالي |
| :-- | :-- | :-- |
| **H01** | **fixed** | `smart-pipeline.ts:927-1101` — يعمل الآن بعد التطبيع وبوابة القبول، مشروط بـ`businessMode===true`، يرفض النص متعدد المبالغ، والاتجاه من الفعل لا من نوع الفئة، والقرار من `gateShortcutResult`. اختبارات: `classification-acceptance.test.ts` (5 حالات) + `financial-event-pipeline.test.ts` (حالتان) |
| **H02** | **partially fixed (A1 part)** | تجاوز فحوص القبول أُغلق: `smart-pipeline.ts:786-880` — muscle memory تمر بالبوابة ولا تجيب إلا إذا غطّت كل مبالغ الجملة. **أهلية التعلم نفسها (الربط بقبول محفوظ مثبت) ما زالت عمل A5.** |
| **H03** | **fixed** | `smart-pipeline.ts:1157-1200` مصدر تسجيل واحد `registerEscalation`، و`:1486` تسجيل المسار المفرد، و`:1625` منع الطلب بلا مقاطع. الـprompt صار «صنّف 1 جملة» بمحتواها |
| **H04** | **fixed** | المقطع المنفي لا يُصعَّد أصلًا (`smart-pipeline.ts:1186-1204`)، و`classification-merge.ts:50-60` لا يُنتج عنصرًا لمقطع بلا استخراج ويُبلّغ عنه كـ`unresolvedClauseIds` |
| **H05** | **unchanged — A4** | يبقى فاشلًا: `keeps a missing-amount event separate from its priced sibling` |
| **H06** | **unchanged — A4** | يبقى فاشلًا: 4 حالات `binds only monetary amounts` (كمية/سنة/كسر/«إلا»/تصحيح) |
| **H07** | **unchanged — A4** | يبقى فاشلًا: `بكرة هدفع` / `مش هدفع غير` / `هو أنا دفعت…؟` |
| **H08** | **unchanged — A4** | لم يُلمس |
| **H09** | **unchanged — A4** | لم يُلمس |
| **H10** | **fixed** | قرار لكل عنصر بدل المتوسط (`final-acceptance.ts:154`, `smart-pipeline.ts:2110`)، توحيد العتبات (`:966-1000`)، معايرة قديمة تُلغى عند تغيّر الفئة (`classification-merge.ts:84`)، `unpriced` مستقر عبر عدة تمريرات، و`needsReview` لا يُمحى (`post-classifier-verifier.ts:480`) |
| **H11** | **unchanged — A2** | لم يُلمس |
| **H12** | **unchanged — A2** | لم يُلمس |
| **H13–H17** | **unchanged — A3** | لم يُلمس |
| **H18** | **partially fixed (A1 part)** | 65 اختبار regression جديد للإصلاحات الداخلة في A1. **لم أُعِد تنظيم CI ولا `npm test`** — ما زال لا يشمل اختبارات التصنيف (بند A5) |
| **H19** | **unchanged — A4** | لم يُلمس |
| **H20** | **unchanged — A4** | جزئيًا فقط: اتجاه مسار الأعمال صار من الفعل (H01)، لكن المشكلة العامة باقية |
| **M06** | **fixed** | `classifier-contract.ts:149` حل صارم للفئة، `classification-merge.ts` يعيد `unansweredClauseIds`/`unresolvedClauseIds`، و`smart-pipeline.ts:1749` يحوّل النقص الدلالي إلى blocker |
| **M01–M05, M07–M20, L01–L02** | **unchanged** | خارج A1 — انظر `progress.md` |

**نتيجة إضافية غير مطلوبة صراحةً، مُصلَحة لأنها في مسار A1.5:**
`canonicalCategoryId("business")` كان يُرجع `"transport"` — مسح substring غير مثبّت
(`"bus"` داخل `"business"`)، فكانت فئة مخترعة من النموذج «تُصلَّح» إلى فئة حقيقية لم يخترها أحد
وتُسجَّل كأنها إجابته. أُضيف `exactCategoryId` واستُخدم في `validateClassifierReply` فقط؛
`canonicalCategoryId` لم يتغيّر سلوكه لبقية المستهلكين.

---

## 4. الملفات التي غيّرتها ولماذا

ثمانية ملفات، كلها داخل `api/lib/`. **صفر تعديلات خارجها.**

| الملف | +/− | ماذا ولماذا |
| :-- | --: | :-- |
| `api/lib/final-acceptance.ts` | **+296** *(جديد)* | الحد الأدنى من منطق القبول المشترك: `gateShortcutResult` (قبول + دفتر مبالغ + قرار)، `decidePerItem` (الأضعف يحكم، لا المتوسط)، `withBlocker`/`mergeReviewState` (الأسباب لا تُمحى)، وثوابت `BlockerReason` |
| `api/lib/smart-pipeline.ts` | +550/−203 | نقل التطبيع والعتبات وبوابة القبول قبل الاختصارات؛ تمرير memory/business/embedding عبر البوابة؛ `registerEscalation`/`registerAccepted` بمعرّف حدث ثابت؛ منع الطلب بلا مقاطع؛ إعادة الترتيب السردي بعد الـmerge؛ توحيد العتبات؛ القرار النهائي لكل عنصر؛ رفض المقطع المنفي؛ تمريرة حتمية أخيرة بدل استدعاء مزود فارغ |
| `api/lib/classification-merge.ts` | +80/−26 | يعيد `MergeOutcome` بدل مصفوفة: يميّز «لم يُجب» عن «لا يوجد حدث»، ويحمل `sourceEventId`، ويستخدم `withBlocker` |
| `api/lib/post-classifier-verifier.ts` | +26/−8 | `needsReview` صار disjunction لا إسناد؛ العتبة من `DEFAULT_THRESHOLDS` بدل 85 محلية |
| `api/lib/classifier-contract.ts` | +8/−3 | `exactCategoryId` بدل `canonicalCategoryId` في تحقق رد النموذج |
| `api/lib/category-registry.ts` | +16/−0 | إضافة `exactCategoryId` فقط. **`canonicalCategoryId` لم يُمَس** |
| `api/lib/classification-acceptance.test.ts` | **+672** *(جديد)* | 65 اختبار قبول يغطي بنود §8 الاثني عشر الداخلة في A1 |
| `api/lib/classifier-contract.test.ts` | +23/−8 | **تصحيح عقد، معروض منفصلًا — انظر §7** |

---

## 5. السلوك قبل/بعد لكل إصلاح

### H03 — تصعيد بصفر مقاطع

**قبل** — «دفعت 120 عمل غريب»: فرع الجملة المفردة يملأ قوائم الإنقاذ ولا يملأ `escalationClauses`.
الـprompt الفعلي الذي وصل المزوّد:

```
صنّف 0 جملة:
```

بميزانية `60 + 0*40 = 60` output token، ثم `validateClassifierReply(reply, 0)` يُسقط كل
إجابة لأن `i=1 > clauseCount=0`. طلب مدفوع لا يمكن أن ينجح.

**بعد** — نفس المدخل:

```
صنّف 1 جملة:
1. «دفعت 120 عمل غريب» — [120 جنيه · مصروف]
```

والإجابة تُدمج. وإذا لم يوجد أي مقطع، **لا يُرسل طلب أصلًا** — تُشغَّل تمريرة حتمية بدلًا منه.

### H01 — اختطاف مسار الأعمال

| المدخل | قبل | بعد |
| :-- | :-- | :-- |
| «ماشتريتش خامات ب500» (businessMode=true) | expense 500، ثقة 100، **auto_save** | `items: []`، ليس auto_save |
| «دفعت 500 خامات و300 معدات» | عنصر واحد 500 auto_save، **الـ300 ضاع** | لا اختصار؛ يمر بالـpipeline الكامل |
| «قبضت 500 خامات» | **expense** (من نوع الفئة) | لا يُسجَّل expense صامتًا؛ الاتجاه من الفعل |
| «دفعت 200 بنزين» (businessMode=**false**، فئات أعمال موجودة) | مشروع/بنزين + businessId | مواصلات، بلا businessId |
| «دفعت 500 خامات» (businessMode=true) — **positive control** | يعمل | **ما زال يعمل**، 0 tokens |

### H02 (جزء A1) — الذاكرة تتجاوز القبول

«ماشتريتش جزمة ب500 ودفعت 200 بنزين» مع نمط محفوظ 500/تسوق:
**قبل** `[[500, "تسوق"]]` — اخترعت الشراء المنفي وأضاعت البنزين.
**بعد** `[[200, "مواصلات"]]`. النمط الذي **يغطّي** الجملة كاملة ما زال يعمل بـ0 tokens (positive control).

### H10 — الثقة والمعايرة

- **المتوسط:** 82/87/90 عند عتبة 85 → المتوسط 86.3 → كان `auto_save`. الآن `review`؛ العنصر 82 يقرر.
- **العتبات المتضاربة:** `parser_auto_save_threshold` كان يُقرأ بافتراضَين مختلفين — 90 لبوابة المقاطع
  و85 للقرار النهائي (عبر `confidence_auto_save`). عنصر بـ87 على تثبيت لم يلمس الإعداد كان يُرفض من
  بوابة ويُقبل من الأخرى حسب ما إذا كانت الجملة قد قُسّمت. الآن قراءة واحدة وافتراض واحد
  (`DEFAULT_THRESHOLDS`)، مع احترام إعداد الإدارة الصريح والمفاتيح القديمة `confidence_*`.
- **معايرة قديمة:** عنصر strong_rule 95 نُقلت فئته عبر LLM كان يحتفظ بـ95 وبعلامة
  `calibrated:strong_rule:n=33`. الآن `calibration: undefined` وإعادة تسعير من دليله الجديد.
- **`unpriced` عبر تمريرتين:** ثابت الآن عند 1 مهما تكرّر `applyCalibration` (3 تمريرات مُختبَرة).
- **verifier يمحو needsReview:** `post-classifier-verifier.ts:483` كان **يُسند** `needsReview`.
  عنصر وصل بـ`category_reply_unresolved` وبثقة 90 وبلا اعتراض من الـverifier كان يخرج نظيفًا.
  الآن disjunction. ونفس الشيء في «Content-Based Recovery» الذي كان يضع `needsReview = false`
  على أي إنقاذ فئة.

### M06 / A1.5 — عقد الرد

- 18 شكلًا فاسدًا للرد (`null`, `{}`, `items:null`, صف `null`, صف نصي، index خارج النطاق،
  index مكرر، صفر، سالب، كسري، فئة مخترعة، فرعية غير متوافقة، شخص غير متوقع…) — بلا crash،
  وبلا حقيقة مخترعة، وبلا فقد صامت لبقية الأحداث.
- رد ناقص/غير صالح ⇒ `MODEL_REPLY_INVALID` blocker ⇒ ليس `auto_save`.
- مقطع أجاب عنه النموذج ولا يملك حدثًا مستخرَجًا ⇒ `unresolvedClauseIds` ⇒ سؤال، لا سطر مخترَع.
- `"business"` من النموذج: كان يُصلَّح إلى `transport`؛ الآن يُسقَط والمقطع يحتفظ بإجابته المحلية.

### A1.3 — الترتيب السردي

«دفعت 250 لحاجة مجهولة وبعدين دفعت 200 بنزين» → **قبل** `[200, 250]` · **بعد** `[250, 200]`،
والهوية من `sourceEventId` المسجَّل بترتيب السرد، لا من موضع في مصفوفة.

---

## 6. الأوامر الفعلية ونتائجها

كل ما يلي شُغّل داخل الـworktree. الأوامر التي لم تُشغَّل مذكورة صراحةً في §8.

| # | الأمر | Exit | النتيجة |
| --: | :-- | :-- | :-- |
| 1 | `npx vitest run api/lib` (baseline، قبل أي تعديل) | 0 | 664 passed · **20 failed** · 3 skipped |
| 2 | `npx vitest run api/` (baseline، بالكود الأصلي مُستعادًا من `BASE_TREE`) | 0 | 967 passed · **38 failed** · 3 skipped (1008) |
| 3 | `npx vitest run api/` (candidate، نهائي) | 0 | **1040 passed · 30 failed** · 3 skipped (1073) |
| 4 | `npx vitest run api/lib/classification-acceptance.test.ts` | 0 | **65 passed / 65** |
| 5 | `npx vitest run api/lib/financial-event-pipeline.test.ts` | 0 | 15 passed · 9 failed (كلها A4 — §8) |
| 6 | `npx vitest run api/lib/classifier-contract.test.ts` | 0 | **22 passed / 22** |
| 7 | `npx vitest run api/lib/category-registry.integrity.test.ts` | 0 | passed — `exactCategoryId` لم يكسر التصنيف الحر |
| 8 | `npx vitest run src/lib/financial-taxonomy.contract.test.ts tests/adversarial-challenger-2.test.ts tests/m1-adversarial.test.ts` | 0 | **34 passed / 34** — كل مستهلكي الوحدات المعدَّلة عبر حدود FE/BE |
| 9 | `CLASSIFY_BENCH_REPORT=1 npx vitest run api/lib/classification-benchmark.test.ts` (baseline) | 0 | 172 passed |
| 10 | نفس الأمر (candidate) | 0 | 172 passed |
| 11 | `npx tsc -b` (= `npm run check`) | **راجع §8.1** | خطآن فقط، في ملف لم ألمسه |
| 12 | `npx vitest run` (السويت الكامل) | 0 | 1491 passed · 77 failed (147 من فوارق الـbaseline خارج api/ — بناء/DB/UI) |

### 6.1 مقارنة مجموعات الفشل — الدليل الحاسم

`comm` على قوائم الفشل المرتَّبة من الأمرين 2 و3:

```
=== NEW failures introduced by me (candidate \ baseline) ===
(فارغ)

=== FIXED by me (baseline \ candidate) — 8 ===
classifier-contract.test.ts > accepts a well-formed reply
classifier-contract.test.ts > keeps only the first answer when the model splits one clause into two
financial-event-pipeline.test.ts > does not let a stale learned suggestion invent or truncate transactions
financial-event-pipeline.test.ts > does not record a non-realized event: ماشتريتش خامات 500
financial-event-pipeline.test.ts > does not resurrect a negated event through an answering model
financial-event-pipeline.test.ts > ignores business category hints when business mode is off
financial-event-pipeline.test.ts > preserves narrative order when only the first event uses the model
financial-event-pipeline.test.ts > sends a real single clause to category fallback and retains its amount
```

مجموعة الفشل بعد التعديل **مجموعة جزئية صارمة** من مجموعة الـbaseline. **صفر regression.**

### 6.2 نتائج الـbenchmark — offline mock، 172 حالة

> هذا تشغيل محلي بلا STT ولا DB ولا AI حي وبإعدادات فارغة. **ليس دقة إنتاج.**
> ولم أعدّل الـfrozen corpus ولا `confidence-calibration.generated.ts` ولا الـbaseline التاريخية.
> `bench:classify:calibrate` **لم يُشغَّل** (يعيد كتابة بيانات القياس).

| المقياس | baseline | candidate | Δ |
| :-- | :-- | :-- | :-- |
| triple precision / recall | 0.956 / 0.942 | 0.956 / 0.942 | — |
| amount F1 | 0.993 | 0.993 | — |
| دقة الاتجاه | 99.3% | 99.3% | — |
| دقة الفئة | 95.6% | 95.6% | — |
| تقسيم مضبوط تمامًا | 97.5% | 97.5% | — |
| دقة المجاميع | 96.5% | 96.5% | — |
| دقة القرار | 100.0% | 100.0% | — |
| **حفظ تلقائي رغم وجود خطأ** | **6 (3.5%)** | **5 (2.9%)** | **−1** |
| مخرجات فارغة رغم وجود عمليات | 5 (2.9%) | 5 (2.9%) | — |
| **llmCalls** | **13** | **8** | **−5 (−38%)** |

**صفر regression في الدقة، حفظ تلقائي خاطئ أقل بواحد، وطلبات نموذج أقل بـ38%** —
الخمسة الزائدة كانت طلبات «صنّف 0 جملة» التي لم يكن ممكنًا أن تنجح.

### 6.3 regression اكتُشف أثناء العمل وأُصلح

بعد إضافة حارس «لا طلب بلا مقاطع»، سقطت الحالة **ENT-009** («دفعت للبواب 150 بتاع الشهر»)
من 1/1 إلى 0/1، وnزل recall إلى 0.934.

السبب: التمريرة الحتمية الأخيرة على `normalized.forAI` (التطبيع الخفيف، الذي وحده يحلّ هذه الجملة)
كانت تُبلَغ **فقط عبر معالج خطأ الاستدعاء الفارغ**. أي أن الاسترداد كان يكلّف محاولة مزوّد في كل مرة،
وكان سيُتجاوز تمامًا لو نجح الطلب الفارغ يومًا. نُقل إلى المسار الحتمي حيث ينتمي
(`smart-pipeline.ts:1625`)، فعادت كل المقاييس إلى قيم الـbaseline بالضبط.

سُجّل هنا لأن اكتشافه كان بفضل الـbenchmark، وهو مثال على أن الحارس وحده لم يكن كافيًا.

---

## 7. تصحيح عقد اختبار — معروض منفصلًا، ولا يُحسب تحسنًا للخوارزمية

اختباران في `classifier-contract.test.ts` كانا **فاشلين في الـbaseline** ويرمّزان عقدًا أقدم من
التنفيذ. لم أُضعِف أي assertion ولم أستخدم skip/xfail؛ صحّحت العقد وشرحت السبب في الكود:

1. **`accepts a well-formed reply`** — كان يمرر رد بمقطع واحد و`clauseCount=3` ويتوقع
   `problems` فارغة. التنفيذ يُبلّغ عن المقاطع بلا إجابة، وهذا **مطلوب** بـA1.5 («اكتمال الإجابات»).
   قُسِم إلى اختبارين: الأصلي بـ`clauseCount=1` (يبقى صارمًا)، واختبار جديد يؤكّد صراحةً
   أن الرد الجزئي يُبلَّغ عنه بالضبط: `["missing answer for clause 2", "missing answer for clause 3"]`.
   **assertions أقوى، لا أضعف.**

2. **`keeps only the first answer when the model splits one clause into two`** — كان يتوقع
   الاحتفاظ بالإجابة الأولى عند إجابتين متناقضتين لنفس المقطع. التنفيذ يُسقط الاثنتين.
   الاحتفاظ بـ«الأولى» ليس سياسة بل قرعة: النموذج أعطى فئتين متعارضتين ولا دليل أن الأسبق أصحّ،
   والمقطع بلا إجابة يحتفظ بفئته المحلية ويُعلَّم للمراجعة. أعِدت تسمية الاختبار وتوثيق السبب.

**قرار المراجع مطلوب هنا:** إن رأى المراجع أن سياسة «keep first» هي المقصودة، فالإصلاح في
`classifier-contract.ts` لا في الاختبار — وسأعكسه.

---

## 8. ما لم يُختبر، والعوائق، والاختلاف عن الخطة

### 8.1 عائق baseline يمنع تصديق `npm run check` بالكامل

`npx tsc -b` يخرج بخطأين فقط:

```
api/lib/entity-extractor.ts(188,7): error TS7034: Variable 'match' implicitly has type 'any' …
api/lib/entity-extractor.ts(191,38): error TS7005: Variable 'match' implicitly has an 'any' type.
```

- **موجودان في الـbaseline.** `entity-extractor.ts` من تعديلات المستخدم غير الملتزمة، ولم ألمسه
  (`git diff BASE_TREE -- api/lib/entity-extractor.ts` فارغ).
- **صفر أخطاء في أي ملف غيّرته** — وهذا ما يمكنني تصديقه.
- الإصلاح سطر واحد (`let match: RegExpExecArray | null;` في السطر 188). **لم أطبّقه**: الملف
  قيد التحرير في working tree المستخدم، والتعديل عليه يخالف §2 «حماية العمل القائم».
  إن أراد المراجع، أطبّقه كتغيير مستقل.

### 8.2 لم يُشغَّل عمدًا

- `npm run test:e2e` (Playwright) — لا تغييرات في UI ولا API surface؛ يحتاج بيئة كاملة.
- `npm run build` — لا تغيير في حدود البناء.
- `npm run bench:classify:live` — يستهلك مفاتيح إنتاج وحسابًا حقيقيًا. §2 يمنعه بلا تفويض منفصل.
- `npm run bench:classify:calibrate` — يعيد كتابة `confidence-calibration.generated.ts`. §9 يمنعه في A1.
- `db:push` / `migrate` / `seed` — لا تغيير في المخطط. **لم يُلمس أي DB.**
- `npm run lint` — **لم أشغّله**؛ التزمت بأسلوب الملفات القائمة ولم أُجرِ formatting شاملًا.
  يستحق تشغيله في المراجعة.

### 8.3 لم يُختبر بشكل حقيقي

- **التزامن على MySQL**: خارج A1 (H13/H16 في A3). لم أدّعِ إثباتًا لأي دلالة معاملات.
- **STT صوتي حقيقي**: خارج A1 (A2). fixtures نصية لا تساوي WER.
- **مزوّد حي**: كل شيء scripted mock. `llmCalls` عدّاد للطلبات المُحاكاة.

### 8.4 الاختلاف عن الخطة

- **نقل بنيوي لم يُطلب صراحةً:** كتلة التطبيع + العتبات + بوابة القبول نُقلت **فوق** الاختصارات.
  بدونها، `gateShortcutResult` كان سيعيد تشغيل التطبيع لكل اختصار، وكان مسار الأعمال سيظل يرى
  نصًا لم يمر بفحص النفي. النقل خالص (بلا تغيير منطق داخل الكتلة) وواضح في الـdiff.
- **مسار embedding** لم يكن ضمن الأهداف الخمسة، لكنه كان يمنح نفسه `auto_save` على
  `embMatch.score >= 85` — وهو تشابه cosine خام يُقارن بعتبة مخصَّصة لاحتمالات معايَرة، على عنصر
  يصل بلا evidence. هذا حرفيًا بند A1.2 و«تجنّب conditionals مبنية على درجات سحرية» في A1.4، فأُدرج.
- **`exactCategoryId`** — انظر نهاية §3.

---

## 9. مخاطر الدمج والتراجع

### مخاطر

1. **تحوّل بعض القرارات من `auto_save` إلى `review`.** مقصود ومُقاس: الـbenchmark يُظهر
   حفظًا تلقائيًا خاطئًا أقل بواحد و**بلا** ارتفاع في «مخرجات فارغة». لكن معدّل الـauto-save
   الحقيقي للمستخدمين لم يُقَس (يحتاج بيانات إنتاج) — يستحق مراقبة بعد النشر.
2. **`businessMode` صار شرطًا صارمًا.** إن كان هناك مستدعٍ لا يمرّر `businessMode: true`
   وهو يقصد وضع الأعمال، سيفقد اختصار الأعمال. تحققتُ من `ai-router.ts` و`ExpenseForm.tsx`؛
   **يستحق تأكيدًا من المراجع** لأنه تغيير سلوك مرئي للمستخدم.
3. **`mergeCategoryDecisions` غيّر توقيعه** من `ParsedTransaction[]` إلى `MergeOutcome`.
   المستهلك الوحيد هو `smart-pipeline.ts` (مُحقَّق بالبحث)، لكن أي عمل متوازٍ يستدعيها سينكسر.
4. **`sourceEventId`** كان معرَّفًا وغير مستخدَم؛ صار محمولًا. لا يُخزَّن في DB ولا يعبر إلى FE.

### التراجع — عن تغييراتي وحدها

```bash
git apply -R docs/reviews/implementation/A1/scope-diff.patch
```

يعيد الملفات الثمانية إلى `BASE_TREE` بالضبط ولا يمسّ أي شيء آخر في الـworking tree.
للتراجع الجزئي: كل ملف مستقل عدا أن `smart-pipeline.ts` و`classification-merge.ts`
و`final-acceptance.ts` تُتراجَع معًا (توقيع `MergeOutcome`).

**ملاحظة للدمج:** الـworktree الآن على `467eada` وليس على `4405256` الذي أنشأه الـharness.
الـpatch يُطبَّق على حالة `467eada` + تعديلات working tree المستخدم.

---

## 10. أسئلة تحتاج قرار منتج — لم أفترض إجاباتها

1. **نطاق الأعمال.** هل «فئات أعمال موجودة + `businessMode=false`» يعني (أ) تجاهل الأعمال تمامًا
   — وهو ما نفّذته لأنه ما يطلبه البرومبت — أم (ب) اقتراح الأعمال للمراجعة بلا حفظ تلقائي؟
2. **تعارض الاتجاه.** «قبضت 500 خامات» على فئة مُهيّأة كمصروف: هل الصحيح `review` (الحالي)
   أم سؤال المستخدم أم إنشاء دخل أعمال؟ لا أملك سياسة محاسبية للأعمال.
3. **إجابتان متناقضتان من النموذج لنفس المقطع** — §7 البند 2.
4. **العتبة الافتراضية.** الافتراض صار موحّدًا على 90 (`DEFAULT_THRESHOLDS.autoSave`).
   التثبيتات التي كانت تعتمد ضمنيًا على 85 في القرار النهائي ستصبح أكثر تحفظًا. مقبول؟
5. **«دفعت حوالي 200 بنزين»** — هل التقريب يجب أن يمنع الحفظ التلقائي؟ اختبار الـbaseline
   يقول نعم؛ لكن كشف التحوّط عمل استخراج (H06/A4)، فتركته unresolved بدل إضافة قائمة كلمات.

---

## 11. اقتراح الجولة التالية — **لم يُنفَّذ**

A2 كما في البرومبت: H11/H12 وM02/M06–M11/M14/M17 بقدر ما يتصل بالمزوّد.

قبل البدء أقترح على المراجع:

1. **حسم أسئلة §10** — خاصة 1 و2 و4، فهي تغييرات سلوك مرئية.
2. **تشغيل `npm run lint` مستهدفًا** للملفات الثمانية.
3. **حسم `entity-extractor.ts`** (§8.1) — سطر واحد يفتح `npm run check` بالكامل.
4. **قرار في `npm test`**: ما زال لا يشمل أي اختبار تصنيف (H18). أقترح إدراج
   `classification-acceptance` و`financial-event-pipeline` و`classification-benchmark`
   — لكن `financial-event-pipeline` سيبقى أحمر حتى A4، فيحتاج قرارًا في ترتيب العمل.

**لا تعتبر اكتمال A1 اكتمال المنظومة.** 9 اختبارات في `financial-event-pipeline.test.ts`
ما زالت حمراء عمدًا وتمثّل H05–H07، وهي A4. لم أُخفِها ولم أدّعِ إصلاحها.
