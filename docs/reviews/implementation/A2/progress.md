# Tracking matrix — كل الـ42 ملاحظة، بعد A1 + A2

آخر تحديث: بعد إنجاز A2 جزئيًا. **لم تتوفر مراجعة مستقلة لأي من الجولتين.**

هذا الملف يحلّ محل `../A1/progress.md` بوصفه الحالة الحالية؛ ملف A1 يبقى كما هو سجلًا لتلك الجولة.

**اصطلاح الحالة:**

- **fixed** — السبب الجذري أُعيد إنتاجه، أُصلح من entry point الفعلي، ومُغطّى باختبار regression أخضر.
- **partially fixed** — أحد مساراته أُغلق فقط. **لا يُقرأ كـfixed.**
- **unchanged** — لم يُلمس. المرحلة المالكة مذكورة.
- **not reproduced** — حاولت وفشلت في إعادة الإنتاج. (لا يوجد أي بند بهذه الحالة.)

---

## High

| ID | العنوان | المالك | الحالة | الجولة | الدليل |
| :-- | :-- | :-- | :-- | :-- | :-- |
| H01 | مسار الأعمال يتجاوز النفي والتعدد والتحقق | A1 | **fixed** | A1 | 7 اختبارات |
| H02 | الذاكرة تتعلم من ناتج غير مؤكَّد | A1+**A5** | **partially fixed** | A1 | تجاوز القبول أُغلق. **أهلية التعلم لم تُلمس** |
| H03 | تصعيد الجملة المفردة يرسل zero clauses | A1 | **fixed** | A1 | llmCalls في الـbenchmark 13→8 |
| H04 | category-only fallback قد يعيد rejected event | A1 | **fixed** | A1 | المقطع المنفي لا يُصعَّد |
| H05 | اكتمال العمليات يعد الأرقام | **A4** | unchanged | — | اختبار أحمر معلن |
| H06 | الكميات والتواريخ تتحول إلى أموال | **A4** | unchanged | — | 5 اختبارات حمراء معلنة |
| H07 | نفي/مستقبل/تصحيح المتكلم | **A4** | unchanged | — | 4 اختبارات حمراء معلنة |
| H08 | العملات تضيع | **A4** | unchanged | — | |
| H09 | التواريخ المنطوقة | **A4** | unchanged | — | |
| H10 | معايرة stale ومتوسط يخفي ضعف عنصر | A1 | **fixed** | A1 | 15 اختبارًا |
| H11 | preferred provider يفقد route الصحيحة | **A2** | **fixed** | **A2** | 8 اختبارات؛ route كوحدة، dedupe بـslug+model، تعارض النموذج |
| H12 | فحص الصوت والميزانية قبل STT | **A2** | **fixed** | **A2** | 30 اختبارًا؛ بوابة واحدة يستدعيها الـendpointان |
| H13 | clarification قابلة لإعادة التنفيذ | **A3** | unchanged | — | |
| H14 | جواب جزئي يصبح إذن حفظ كامل | **A3** | unchanged | — | **`answerClarification` لا يمر ببوابة A1** |
| H15 | الواجهة لا تحمل idempotency | **A3** | unchanged | — | |
| H16 | duplicate catch في batch | **A3** | unchanged | — | |
| H17 | wallet/business ownership | **A3** | unchanged | — | |
| H18 | tests خضراء دون gates | A1+**A5** | **partially fixed** | A1 | 126 اختبار regression جديد. **`npm test` ما زال لا يشمل التصنيف** |
| H19 | meta-instructions تلوّث التصنيف | **A4** | unchanged | — | |
| H20 | اتجاه دخل/صرف ينقلب | **A4** | **partially fixed** | A1 | اتجاه اختصار الأعمال من الفعل. المشكلة العامة قائمة |

## Medium

| ID | العنوان | المالك | الحالة | الجولة | ملاحظة |
| :-- | :-- | :-- | :-- | :-- | :-- |
| M01 | سقوط صفوف/فقد review في UI | A3 | unchanged | — | |
| M02 | لا quality metadata للـSTT | **A2** | **unchanged** | — | **بند A2 لم يُنفَّذ** |
| M03 | تطبيع مغيّر للمعنى | A4 | unchanged | — | |
| M04 | lexical ties | A4 | unchanged | — | |
| M05 | verifier يقص/يغير قيمة | A4 | **partially fixed** | A1 | `needsReview` لم يعد يُمحى. القص/التغيير لم يُلمسا |
| M06 | مخرجات LLM جزئية | A1 | **fixed** | A1 | 18 شكل رد فاسد |
| M07 | timeouts جزئية وبلا deadline | **A2** | **fixed** | **A2** | مهلة تغطي الـbody + deadline للرحلة |
| M08 | breaker لا يعزل | **A2** | **fixed** | **A2** | probe مفرد، قراءة نقية، مفتاح route، Retry-After |
| M09 | thinking control/output cap | **A2** | **partially fixed** | **A2** | اللهجة وكشف القطع. **القدرات والـtokenizer لم يُنفَّذا** |
| M10 | attribution/usage/cost/cache billing | **A2** | **partially fixed** | **A2** | محاسبة لكل محاولة + كاش بصفر. **ledger الـrouter لم يُلمس** |
| M11 | result cache غير مرتبط بالسياق | **A2** | **fixed** | **A2** | نسخة + نموذج + عتبات + businessId + tenant |
| M12 | معايرة صغيرة وتسرّب evaluation | A5 | unchanged | — | لم أُعِد توليد الجدول |
| M13 | التصحيحات مربوطة بـlog غير صحيح | A5 | unchanged | — | |
| M14 | context شخصي زائد وinjection | **A2**/A6 | **unchanged** | — | **بند A2 لم يُنفَّذ** |
| M15 | retention/logging | A6 | unchanged | — | |
| M16 | I/O متسلسلة | A6 | unchanged | — | |
| M17 | budget races وRedis fallback | **A2**/A6 | **unchanged** | — | **بند A2 لم يُنفَّذ** |
| M18 | عقود FE/BE/DB | A3/A4 | unchanged | — | |
| M19 | taxonomy تخلط الغرض والشخص | A4 | unchanged | — | |
| M20 | offline queue بلا owner | A3 | unchanged | — | |

## Low

| ID | المالك | الحالة |
| :-- | :-- | :-- |
| L01 | A6 | unchanged |
| L02 | A4 | unchanged |

---

## الحساب

| الحالة | العدد | التفصيل |
| :-- | --: | :-- |
| **fixed** | **11** | H01 H03 H04 H10 M06 (A1) · H11 H12 M07 M08 M11 (A2) · إصلاح `exactCategoryId` ضمن M06 |
| **partially fixed** | **7** | H02 H18 H20 M05 (A1) · M09 M10 (A2) |
| **unchanged** | **24** | |
| not reproduced | 0 | |

**11 من 42 مغلقة.** الباقي معلن ولم يُعرض كأنه أُصلح.

---

## ما لن تُغلقه المرحلة المخصَّصة له وحدها

- **A2 نفسها غير مكتملة.** خمسة من بنودها لم تُنفَّذ: M02 كاملة، M10 (ledger)، M14، M17، وتحقق DeepSeek.
  انظر `HANDOFF.md` §6. **لا تُقرأ هذه الجولة كإغلاق لـA2.**
- **H02** يحتاج مسار «حفظ مؤكَّد» يصل من `expense.create` إلى `classificationLogs` — عبور بين A3 وA5.
- **H14** مسار حفظ منفصل تمامًا لا يمر ببوابة `final-acceptance`. **بعد A1 و A2 هو على الأرجح
  الثغرة الوحيدة الباقية من صنف «طبقة تمنح نفسها إذن الحفظ».**
- **H18** يحتاج قرار ترتيب عمل: إدراج اختبارات التصنيف في `npm test` سيجعل السويت أحمر حتى A4،
  لأن `financial-event-pipeline.test.ts` يرمّز سلوك H05–H07 المطلوب.
