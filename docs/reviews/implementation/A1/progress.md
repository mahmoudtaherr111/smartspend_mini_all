# Tracking matrix — كل الـ42 ملاحظة

آخر تحديث: بعد إنجاز A1، قبل بدء A2.

**اصطلاح الحالة:**

- **fixed** — السبب الجذري أُعيد إنتاجه، أُصلح من entry point الفعلي، ومُغطّى باختبار regression أخضر.
- **partially fixed** — أحد مساراته أُغلق فقط. **لا يُقرأ كـfixed.**
- **unchanged** — لم يُلمس في هذه الجولة. المرحلة المالكة مذكورة.
- **not reproduced** — حاولت وفشلت في إعادة الإنتاج. (لا يوجد أي بند بهذه الحالة في A1.)

المرحلة المالكة من §7 في البرومبت. لم أنقل أي بند إلى مرحلة أخرى لتسهيل الإغلاق.

---

## High

| ID | العنوان | المالك | الحالة | الدليل / لماذا |
| :-- | :-- | :-- | :-- | :-- |
| H01 | مسار الأعمال يتجاوز النفي والتعدد والتحقق | **A1** | **fixed** | `smart-pipeline.ts:927-1101`. 7 اختبارات: businessMode، نفي، تعدد مبالغ، انقلاب اتجاه، + positive control |
| H02 | الذاكرة تتعلم من ناتج غير مؤكَّد | A1 (bypass) + **A5** (learning) | **partially fixed** | تجاوز القبول أُغلق (`:786-880`). **أهلية التعلم نفسها لم تُلمس** — تحتاج مسار قبول محفوظ في A5 |
| H03 | تصعيد الجملة المفردة يرسل zero clauses | **A1** | **fixed** | `registerEscalation` مصدر واحد (`:1157`)، تسجيل المسار المفرد (`:1486`)، حارس قبل الشبكة (`:1625`). llmCalls في الـbenchmark 13→8 |
| H04 | category-only fallback قد يعيد rejected event | **A1** | **fixed** | المقطع المنفي لا يُصعَّد (`:1186`)، والـmerge لا يُنتج عنصرًا لمقطع بلا استخراج |
| H05 | اكتمال العمليات يعد الأرقام بدل التحقق من الارتباط | **A4** | **unchanged** | يبقى فاشلًا: `keeps a missing-amount event separate from its priced sibling`. الدفتر يعمل في بوابة الاختصارات لكن الربط source-span عمل A4 |
| H06 | الكميات والتواريخ وصيغ الأرقام تتحول إلى أموال | **A4** | **unchanged** | 4 حالات `binds only monetary amounts` + `دفعت حوالي 200` ما زالت حمراء |
| H07 | نفي/مستقبل/تصحيح المتكلم لا يحفظ دلالته | **A4** | **unchanged** | 3 حالات `non-realized event` + `لا قصدي` ما زالت حمراء. **رفض المقطع المنفي في A1 لا يعالج المستقبل ولا السؤال ولا نطاق النفي** |
| H08 | العملات تضيع | **A4** | **unchanged** | لم يُلمس |
| H09 | التواريخ المنطوقة لا تصل للسجل | **A4** | **unchanged** | لم يُلمس |
| H10 | معايرة stale وunpriced ومتوسط يخفي ضعف عنصر | **A1** | **fixed** | قرار لكل عنصر، توحيد العتبات، إبطال المعايرة عند تغيّر الفئة، unpriced مستقر، needsReview لا يُمحى. 15 اختبارًا |
| H11 | preferred provider يفقد route الصحيحة | **A2** | **unchanged** | لم يُلمس |
| H12 | فحص الصوت والميزانية قبل STT | **A2** | **unchanged** | لم يُلمس |
| H13 | clarification قابلة لإعادة التنفيذ | **A3** | **unchanged** | لم يُلمس |
| H14 | جواب جزئي يصبح إذن حفظ كامل | **A3** | **unchanged** | لم يُلمس. **ملاحظة:** `answerClarification` مسار منفصل ولا يمر ببوابة A1 |
| H15 | الواجهة لا تحمل idempotency | **A3** | **unchanged** | لم يُلمس |
| H16 | duplicate catch في batch يخفي partial rollback | **A3** | **unchanged** | لم يُلمس |
| H17 | wallet/business ownership غير مكتملة | **A3** | **unchanged** | لم يُلمس |
| H18 | tests خضراء دون gates للدقة | A1 (gates) + **A5** (CI) | **partially fixed** | 65 اختبار regression جديد لإصلاحات A1. **`npm test` ما زال لا يشمل أي اختبار تصنيف** |
| H19 | meta-instructions تلوّث التصنيف المحلي | **A4** | **unchanged** | لم يُلمس |
| H20 | اتجاه دخل/صرف ينقلب | **A4** | **unchanged** | جزئي جدًا فقط: اتجاه اختصار الأعمال صار من الفعل (ضمن H01). المشكلة العامة قائمة |

## Medium

| ID | العنوان | المالك | الحالة |
| :-- | :-- | :-- | :-- |
| M01 | سقوط صفوف/فقد review/مصدر الصوت في UI | A3 | unchanged |
| M02 | لا quality metadata للـSTT | A2 | unchanged |
| M03 | تطبيع مغيّر للمعنى وArabizi | A4 | unchanged |
| M04 | lexical ties وترجيح التاجر على المنتج | A4 | unchanged |
| M05 | verifier يقص/يغير قيمة أو يحذف تشابهًا | A4 | **partially fixed** — `needsReview` لم يعد يُمحى (`post-classifier-verifier.ts:480`). قص/تغيير القيمة والحذف بلا إثبات **لم يُلمسا** |
| M06 | مخرجات LLM جزئية وفرعيات/أشخاص غير مثبتة | **A1** | **fixed** — 18 شكل رد فاسد، حل فئة صارم، فشل دلالي يصبح blocker |
| M07 | timeouts جزئية وبلا deadline شامل | A2 | unchanged |
| M08 | breaker لا يعزل open routes | A2 | unchanged |
| M09 | thinking control/output cap | A2 | unchanged |
| M10 | attribution/usage/cost/cache billing | A2 | unchanged |
| M11 | result cache غير مرتبط بكل context/version | A2 | **partially fixed** — الكاش لم يعد يخزّن قرار اختصار لم يمر بالبوابة. **الربط بالإصدار/السياق والاحتفاظ بالفشل لم يُلمسا** |
| M12 | معايرة صغيرة/مشروطة وتسرّب evaluation data | A5 | unchanged — لم أُعِد توليد جدول المعايرة |
| M13 | التصحيحات ناقصة أو مربوطة بـlog غير صحيح | A5 | unchanged |
| M14 | context شخصي زائد وinjection defense | A2/A6 | unchanged |
| M15 | retention/logging متعددة ومشروطة بـcrons | A6 | unchanged |
| M16 | I/O وembeddings/rollups متسلسلة | A6 | unchanged |
| M17 | budget races وRedis fallback | A2/A6 | unchanged |
| M18 | عقود FE/BE/DB غير متوافقة | A3/A4 | unchanged |
| M19 | taxonomy تخلط الغرض والشخص والتدفق | A4 | unchanged |
| M20 | offline queue بلا owner صريح | A3 | unchanged |

## Low

| ID | العنوان | المالك | الحالة |
| :-- | :-- | :-- | :-- |
| L01 | وثائق وتعليقات ومسارات غير نافذة | A6 | unchanged |
| L02 | رسائل نجاح وأسئلة لا تعكس مرحلة الفهم | A4 | unchanged |

---

## الحساب

| الحالة | العدد |
| :-- | --: |
| fixed | **6** (H01, H03, H04, H10, M06, + إصلاح `exactCategoryId` ضمن M06) |
| partially fixed | **5** (H02, H18, H20, M05, M11) |
| unchanged | **31** |
| not reproduced | 0 |

**6 من 42 مغلقة.** الباقي معلن ولم يُعرض كأنه أُصلح.

---

## ملاحظات لن تُغلق بالمرحلة المخصَّصة لها وحدها

- **H02** يحتاج مسار «حفظ مؤكَّد» يصل من `expense.create` إلى `classificationLogs`. هذا عبور بين A3 وA5،
  وليس عمل A5 وحدها.
- **H18** يحتاج قرارًا في `package.json`: إدراج اختبارات التصنيف في `npm test` سيجعل السويت أحمر
  حتى A4، لأن `financial-event-pipeline.test.ts` يرمّز سلوك H05–H07 المطلوب. **قرار ترتيب عمل، لا قرار تقني.**
- **H14** (`answerClarification`) مسار حفظ منفصل تمامًا لا يمر ببوابة `final-acceptance`.
  إغلاقه في A3 يجب أن يوجّهه إلى نفس البوابة، وإلا تكرّرت مشكلة «طبقة تمنح نفسها إذن الحفظ».
