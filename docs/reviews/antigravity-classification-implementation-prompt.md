/boost نفّذ إصلاحات SmartSpend AI وفق مواصفات العمل التالية. نفّذ المرحلة A1 فقط في هذه الجولة، ثم سلّم التغييرات والأدلة لمراجعة مستقلة قبل بدء المرحلة التالية.

# 0. المهمة وحدود الجولة

أنت مهندس مسؤول عن تنفيذ إصلاحات فعلية في نظام تصنيف المصروفات، مع اختبارها وشرحها بدقة. هذه مهمة تنفيذ، وليست إعادة كتابة تقرير أو تقديم اقتراحات فقط.

WORKSPACE = E:/smartspend_V1_fixed
ACTIVE_MILESTONE = A1
DELIVERY_LANGUAGE = Arabic
PRODUCT_CODE_AND_COMMENTS = English, following repository conventions
EXECUTION_STYLE = Incremental, evidence-driven, independently reviewed

المهمة الكاملة تمتد إلى A1–A6، لكن التفويض الحالي لتنفيذ A1 فقط. اقرأ خريطة العمل كلها حتى لا تصمم إصلاحًا يعوق المراحل التالية. لا تعتبر اكتمال A1 اكتمال المنظومة كلها.

توقف بعد إنجاز نطاق A1 والتحقق منه وتسليم حزمة المراجعة. لا تطلب موافقة جديدة قبل الخطوات المحلية العادية الضرورية داخل هذا النطاق. إذا كان شرط جوهري ناقصًا، أنجز ما لا يعتمد عليه، وحدد السؤال أو العائق بدقة. لا تعتبر الصمت تفويضًا لبدء مرحلة أخرى.

Gemini المستخدم لتنفيذ البرمجة في Antigravity ليس بالضرورة نموذج المنتج وقت التشغيل. لا تغير نماذج SmartSpend لأنك تعمل بـGemini 3.8 Flash. كل نماذج المنتج تظل خاضعة للـregistry والـmapping والإعدادات المعتمدة.

# 1. مصادر الحقيقة الإلزامية

اقرأ، بالترتيب:

1. E:/smartspend_V1_fixed/AGENTS.md، وأي AGENTS.md إضافي ينطبق على الملفات التي ستعدلها.
2. E:/smartspend_V1_fixed/docs/reviews/2026-09-05-expense-classification-audit.md
3. E:/smartspend_V1_fixed/docs/reviews/2026-09-05-expense-classification-evidence.json
4. docs/03-AI_CLASSIFICATION_ENGINE.md، ثم الوثائق المتصلة مباشرة بالمرحلة فقط.
5. الكود الحالي والاستدعاءات الفعلية والاختبارات ذات الصلة.

التقرير يضم 42 ملاحظة: H01–H20، M01–M20، L01–L02. اقرأ سجل المشكلات وخريطة التنفيذ وحدود الإثبات وخطة الإصلاح كاملة. افحص ملف JSON برمجيًا وانتقِ الأقسام المطلوبة؛ لا تملأ السياق بطباعة الملف كله.

التقرير دليل مراجعة، وليس أمرًا بتطبيق كل استنتاج دون فحص:
- الكود الحالي هو المرجع النهائي للسلوك.
- أرقام الأسطر وhashes قد تكون تغيّرت؛ ابحث عن الدالة والسبب الجذري.
- أعد إنتاج الملاحظة التي ستصلحها.
- إذا كانت أُصلحت بالفعل، أثبت ذلك باختبار.
- إذا اختلفت مع الملاحظة، قدم دليلًا وسيناريو مضادًا؛ لا تختلق مشكلة لإرضاء التقرير.
- ميّز confirmed / conditional / not reproduced / already fixed.
- لا تعدّل التقرير أو دليل نتائجه الأصلي لتوافق تنفيذك.

مرجع التدقيق السابق HEAD:
467eada85af1ed99f2a8949f94cbbb79be921f09

لكن الفحص كان على working tree ذات تعديلات سابقة؛ لا تبدأ من HEAD وحده وتفقد تلك التعديلات.

# 2. حماية العمل القائم وبيئة الاختبار

قبل أي تعديل:
- افحص git status وdiff ونسخة الملفات الداخلة في النطاق.
- سجل baseline واضحًا للتغييرات الموجودة مسبقًا.
- احتفظ بلقطة مقارنة للملفات المستهدفة لكي يمكن فصل تغييراتك عن عمل المستخدم.
- لا تستخدم reset --hard أو clean أو checkout لاسترجاع الملفات، ولا تستبدل ملفات كاملة اعتمادًا على نسخة أقدم.
- إذا أنشأ Boost worktrees معزولة، تحقق أن محتوى البداية يشمل النسخة الحالية والتعديلات ذات الصلة، بما فيها ملفات التقرير غير الملتزمة. لا تكتفِ بمطابقة اسم الفرع.
- لا تعمل على المجلد نفسه بالتزامن مع منفّذ آخر. اجعل لكل ملف كاتبًا واحدًا، أو نفّذ التغييرات المتداخلة بالتتابع.
- لا commit أو push أو merge أو deploy في هذه الجولة؛ سلّم diff قابلة للمراجعة.
- لا تشغّل db:push أو migration أو seed ضد قاعدة المستخدم.
- استخدم بيانات اصطناعية وقاعدة اختبار معزولة إن احتاجت المرحلة DB.
- لا تستخدم مفاتيح AI التشغيلية أو ترسل بيانات مالية/صوتية حقيقية إلى مزود خارجي في الاختبارات.
- لا تغيّر .env أو تفعّل crons/WhatsApp لتجاوز فشل اختبار.
- لا تخفِ العوائق عبر mocks تتحكم في الوظيفة المطلوب اختبارها.

هذه القيود تخص الأفعال التشغيلية؛ كتابة كود واختبارات محلية ضمن المرحلة مطلوبة ومصرّح بها.

# 3. هدف المنتج وترتيب الأولويات

المنتج عربي أولًا وموجّه للمصريين. المستخدم قد يتكلم باللهجة المصرية، وبأي ترتيب، مع تردد أو تصحيح أو عدة عمليات أو معلومات ناقصة.

الرحلة:
Voice → STT → normalization → financial event/entity extraction → segmentation and binding → classification → evidence/calibration → selective LLM fallback → validation → review/clarification → persistence → display/correction/learning.

الأولويات:
1. صحة الحدث والمبلغ والعملة والاتجاه والتاريخ والفئة.
2. سرعة ظهور نتيجة مفيدة، وسرعة الإكمال.
3. تقليل كلفة النموذج بشرط عدم التضحية بالدقة.
4. استخدام المحلي عندما تكون الأدلة كافية.
5. استخدام LLM عندما يمكنه إضافة معلومة استنتاجية مدعومة بالنص.
6. سؤال المستخدم عندما تكون المعلومة غير موجودة أصلًا.

لا تعد بدقة100%. المطلوب اكتشاف عدم المعرفة ومنع الثقة الزائفة، مع قياس الدقة والتغطية. تحويل كل شيء إلى review أو LLM ليس إصلاحًا مقبولًا وحده.

# 4. ثوابت المشروع

- Full-stack TypeScript: React/Vite/Hono/tRPC v11/Drizzle/MySQL.
- استخدم ctx.user داخل procedures؛ userId وحده لا يعرّف tenant. احفظ userType مع كل scope/cache/idempotency/reference.
- users وlocalUsers منفصلان؛ role للصلاحيات وplan للاشتراك.
- استخدم procedure factories القائمة، وZod للتحقق runtime؛ لا توسّع الأنواع أو تضف any/ts-ignore لإسكات أخطاء.
- العقود المشتركة الجديدة مكانها contracts/ عندما تعبر FE/BE.
- استخدم ExpenseInputLimits بدل نسخ الحدود الرقمية.
- استخدم getSystemSettings وinvalidateSettingsCache؛ لا تفتح مسار إعدادات موازٍ.
- نماذج المنتج تمر عبر model-mapper وai-provider-registry، مع قدرات مزود صريحة؛ لا hardcoding لنموذج جديد في route.
- UI عربي وRTL، والأخطاء TRPCError برسالة عربية وكود ثابت، دون stack/provider secrets.
- التزم بأسلوب الملفات القائمة. لا formatting شامل أو refactor تجميلي خارج النطاق.
- لا تعتبر sms-router كودًا ميتًا؛ هو Hono sub-app فعّال.
- حافظ على معاملات expense/details/rollups وضمانات الملكية الموجودة؛ لا تضعفها لتسهيل التصنيف.

# 5. الخريطة التي يجب التحقق منها

المسار المعتاد يبدأ في:
src/components/expenses/ExpenseForm.tsx
→ api/ai-router.ts: parseVoiceExpense أو parseExpense
→ runSTTPipeline للصوت
→ api/lib/smart-pipeline.ts: runSmartPipeline
→ cache / muscle-memory / business shortcut
→ normalizer-v2 / admissibility-gate / narrative-decomposer
→ rule-engine / entity-extractor / intent-detector / negation-detector
→ correction-rules / person-resolver / confidence-calibrator
→ embedding-engine عند الحاجة
→ classifier-contract / classification-prompt / llm-provider-chain / llm-router
→ classification-merge / amount-ledger / post-classifier-verifier
→ قرار النتيجة وclassificationLogs
→ ExpenseForm.saveItems
→ expense.create / batchCreate
→ expenses + expenseDetails + rollups.

answerClarification مسار منفصل يعيد التحليل وقد يحفظ مباشرة.
المكالمة الحية voice-kernel/action-runtime مسار آخر.
speechToText المستقلة ليست هي نفسها parseVoiceExpense المجمعة.
لا تنقل ضمانًا من مسار إلى آخر لمجرد تشابه الاسم.

# 6. سجل المتطلبات الكامل — خريطة المتابعة

أنشئ tracking matrix لكل IDs مع: الحالة، الدليل الحالي، المرحلة، الاختبار، والقيود المتبقية. التفاصيل والسيناريوهات في التقرير الأصلي.

H01: business shortcut يتجاوز النفي/التعدد/التحقق.
H02: memory تتعلم من auto-save logs غير مرتبطة بقبول مثبت.
H03: تصعيد الجملة المفردة يرسل zero clauses.
H04: category-only fallback لا يصلح الاستخراج وقد يعيد rejected event.
H05: اكتمال العمليات يعد الأرقام بدل التحقق من ارتباطها بالأحداث.
H06: الكميات والتواريخ وصيغ الأرقام تتحول إلى أموال.
H07: نفي/مستقبل/تصحيح المتكلم لا يحفظ دلالته.
H08: العملات تضيع.
H09: التواريخ المنطوقة لا تصل للسجل.
H10: معايرة stale وunpriced مفقودة ومتوسط يخفي ضعف عنصر.
H11: preferred provider يفقد route الصحيحة.
H12: فحص الصوت والميزانية غير موحد وقبل STT غير كافٍ.
H13: clarification قابلة لإعادة التنفيذ.
H14: جواب جزئي يصبح إذن حفظ كامل.
H15: الواجهة لا تحمل idempotency لكل إدخال معتاد.
H16: duplicate catch في batch قد يخفي partial rollback.
H17: wallet/business ownership غير مكتملة.
H18: tests خضراء دون gates للدقة.
H19: meta-instructions تلوّث التصنيف المحلي.
H20: اتجاه دخل/صرف ينقلب بكلمات أو فعل موروث.

M01: سقوط صفوف/فقد review/مصدر الصوت في UI.
M02: لا quality metadata فعالة للـSTT.
M03: تطبيع مغير للمعنى وArabizi/Latin codes.
M04: lexical ties وترجيح التاجر على المنتج.
M05: verifier يقص/يغير قيمة أو يحذف تشابهًا دون إثبات.
M06: مخرجات LLM جزئية وفرعيات/أشخاص غير مثبتة.
M07: timeouts جزئية وبلا deadline شامل.
M08: breaker لا يعزل open routes فعلًا.
M09: thinking control/output cap غير متوافقين مع كل مزود.
M10: attribution/usage/cost/cache billing غير صحيحة.
M11: result cache غير مرتبط بكل context/version ويحتفظ بالفشل.
M12: معايرة صغيرة/مشروطة وقد يتسرب إليها evaluation data.
M13: التصحيحات ناقصة أو مربوطة بـlog غير صحيح.
M14: context شخصي زائد وinjection defense غير شامل.
M15: retention/logging متعددة ومشروطة بـcrons.
M16: I/O وembeddings/rollups متسلسلة.
M17: budget races وRedis fallback والضغط.
M18: عقود FE/BE/DB ومراجع العناصر غير متوافقة بالكامل.
M19: taxonomy تخلط الغرض والشخص والتدفق المالي.
M20: offline queue بلا owner صريح داخل عناصرها.
L01: وثائق وتعليقات ومسارات غير نافذة.
L02: رسائل نجاح وأسئلة لا تعكس مرحلة الفهم والحفظ.

# 7. خطة المراحل ونطاق التفويض

## A1 — سلامة قرار التصنيف وعقد الـfallback، وهي الجولة الحالية

أهداف الإغلاق الأساسية: H01، H03، H04، H10، M06.
H02: أصلح تجاوز فحوص القبول النهائي الآن، وسجل أهلية تعلم memory كعمل متبقٍ إن احتاج مسار قبول محفوظ جديدًا في A5.
H18: أضف regression gates حقيقية للإصلاحات الداخلة في A1؛ لا يلزم إعادة تنظيم CI كله الآن.

المطلوب تنفيذه:

A1.1 — إعادة الإنتاج
- اختبارات تفشل على السلوك الحالي للـzero-clause، business bypass، resurrection، stale calibration، ضياع unpriced، ومسح needsReview.
- اختبر الوظائف الفعلية، ومنها runSmartPipeline→طلب المزود الوهمي→merge→القرار.
- إذا لم تُعد المشكلة، افحص تغير النسخة أو إعداد العتبة وقدم النتيجة قبل وصفها fixed.

A1.2 — قبول نهائي لا يمكن تجاوزه
- cache/memory/business/rules/LLM لا تمنح نفسها إذن الحفظ النهائي.
- يمر كل ناتج قابل للحفظ بفحوص مشتركة للحالة والاكتمال والتعارض.
- حافظ على rejected/incomplete/ambiguous بوصفها حالات منفصلة عن «لم تُعرف الفئة».
- لا تعد عملية منفية إلى candidate مالي في fallback أو recovery.
- احترم business scope؛ لا تجعل وجود businessCategories يختطف إدخالًا شخصيًا.
- multi-business-match لا يسقط بقية العمليات ولا يأخذ أول مبلغ ويعلن اكتمال النص.
- لا يلزم إعادة بناء pipeline كله؛ استخرج الحد الأدنى من منطق القبول المشترك مع حفاظ على العقود القائمة.

A1.3 — إصلاح clause flow
- مصدر واحد منظم للمقاطع المصعّدة مع معرفات ثابتة.
- الجملة المفردة تصعّد بمحتواها الفعلي.
- لا طلب شبكة بلا مقاطع.
- حافظ على ربط المبلغ والفعل والسياق، وعلى ترتيب العناصر الأصلية بعد merge.
- لا تستخدم مجرد index جديد قابل للتبدل كهوية مالية.
- إذا كان حل نوع من الاستخراج خارج A1، أعد draft/review/question صريحًا؛ لا تختلق اكتماله.

A1.4 — ثقة وأسباب منع قابلة للتتبع
- الثقة تتبع evidence والنتيجة الحالية؛ تغيير الفئة/المصدر يبطل المعايرة القديمة أو يعيد حسابها بشكل صحيح.
- المرور الثاني يحافظ على معنى support=0/unpriced.
- لا يمحو verifier needsReview أو blocking reasons الموجودة.
- eligible auto-save يُفحص لكل عنصر؛ المتوسط لا يجيز عنصرًا غير مؤهل.
- no evidence أو unpriced لا يتحول إلى إذن silent save.
- تجنب conditionals مبنية على درجات سحرية مثل95 أو100 لتخمين مصدر التصنيف.
- لا تعاير جدولًا جديدًا على بيانات التقييم لتجميل نتائج هذه الجولة.
- أي threshold افتراضي متضارب داخل النطاق يُوحَّد مع احترام إعداد الإدارة الصالح، ويُختبر الافتراضي والإعداد الصريح.

A1.5 — عقد مخرجات النموذج
- runtime validation فعلية: root/items/row types، null rows، indices فريدة وضمن النطاق، واكتمال الإجابات.
- فئة من registry، فرعية تابعة لها؛ الحقل المفقود لا يتحول تلقائيًا لأول فرعية ذات معنى.
- لا تقبل اسم شخص مختلق كحقيقة موثقة.
- الرد الناقص/غير الصالح ليس نجاحًا دلاليًا؛ لا يسقط بقية الأحداث ولا يعيد rejected event.
- ضع invalid/partial response في حالة قابلة للمراجعة مع الأسباب؛ استكمال شبكة retries/capabilities الشامل في A2.
- لا تطلب من LLM invent missing amount أو split لا دليل عليه.

حدود A1:
- لا DB migration، ولا إعادة كتابة محاسبة العملات/الديون، ولا تبديل مزودي الإنتاج.
- لا حل عام كامل للأرقام والتواريخ/ASR هنا؛ تلك A4.
- لا تدّعِ أن تأجيل تلك الوظائف أصلح H05–H09/H20.
- إذا احتاجت سلامة A1 سبب رفض/منع صغيرًا في عقد مشترك، نفّذ أقل إضافة typed مع اختبارات.
- أصلح آثارك على consumers، لكن لا توسع الجولة تلقائيًا إلى بقية42 مشكلة.

## A2 — STT والـprovider route والاعتمادية والمحاسبة

بعد مراجعة A1: H11/H12 وM02/M06–M11/M14/M17 بالقدر المتصل بالمزود.

- Route كوحدة متماسكة: provider/protocol/baseURL/model/key/capabilities/priority.
- preferred DB route لا تُستبدل بتركيب مفاتيح builtin.
- default model/mapping مركزيان؛ لا تستنتج مزودًا من بادئة ambiguous وحدها.
- DeepSeek V4 Flash: تحقق من الدعم الحقيقي في registry والإعدادات وcapabilities. لا تثبت availability من الاسم فقط.
- category classification وstructured refinement لهما قدرات واضحة وحدود.
- deadline شامل، abort لكامل body، circuit breaker يمنع routes المفتوحة وhalf-open probe محدود.
- retry بسبب معلوم وبميزانية زمن/محاولات، مع احترام Retry-After.
- structured-output failure يدخل قرار fallback، لا transport success فقط.
- STT quota قبل التكلفة، مدة مثبتة، MIME صحيح وحد حجم/صيغة.
- attempt-level actual tokens/provider/model/cache/reasoning/latency/finish reason/audio seconds.
- cache hit يستهلك صفر tokens جديدة. الخصم ذري/reserve-and-settle حيث يلزم.
- live tests اصطناعية فقط بعد تفويض منفصل صريح باستخدام الحساب والتكلفة.

## A3 — الحفظ والواجهة ومنع التكرار والهوية

بعد مراجعة A2: H13–H17 وM01/M18/M20.

- utterance/draft/item IDs ثابتة لكل القنوات، وليست فقط offline.
- retry يعيد نفس النتيجة والأثر المالي.
- clarification state transition ذري وقابل للتكرار بأمان.
- جواب عن حقل لا يعتمد بقية الحقول بلا تحقق.
- batch overlap لا يعلن اكتمال دفعة لم تُحفظ كلها.
- تحقق ملكية contact/log/wallet/business بـuserId/userType.
- سجل/details/rollups متسقة داخل المعاملة؛ لا افتراض IDs من firstInsertId+i.
- لا filtering صامت للصفوف. اعرض partial failure بوضوح أو ارفض الدفعة كاملة.
- review للصوت والنص تستعيد draft بعد فشل الحفظ، وتحافظ على source.
- offline queue مربوطة بالمالك، مع auth expiry/account switching tests.

## A4 — استخراج مالي مصري صحيح وعقد حقول متكامل

بعد مراجعة A3: H05–H09/H19/H20 وM03–M05/M18/M19/L02.

- normalization محافظ مع source span mapping.
- أرقام منطوقة/Arabic/Persian/Latin والكسور والفواصل و«إلا».
- تمييز amount عن quantity/year/time/phone/product code/total.
- scope للنفي والتصحيح والمستقبل والأسئلة والاقتباسات/meta-instructions.
- event segmentation ومبلغ/عملة/تاريخ لكل حدث، مع draft ناقص عند الحاجة.
- مجموع مشترك بلا توزيع → سؤال، لا مساواة افتراضية بين أشخاص أو أصناف.
- original currency وoriginal amount لا يضيعان؛ conversion metadata منفصلة إن احتاجها المنتج.
- reference time/timezone عند الإدخال؛ relative dates ثابتة عبر retries/clarification.
- افصل category عن person/relationship/merchant/business/transaction kind.
- قدم قرار المنتج المطلوب عند غموض سياسة الديون/refunds/transfers؛ لا تخترع سياسة محاسبية.
- migrations additive تُراجع وتُختبر على DB اختبار؛ لا تطبقها على بيانات المستخدم تلقائيًا.

## A5 — التعلّم والمعايرة والقياس وrelease gates

بعد مراجعة A4: H02/H18 وM12/M13.

- learning من accepted/corrected events مثبتة، لا كثرة self-generated logs.
- كل field correction مرتبطة بالـdraft/segment/expense/log الصحيح.
- train/dev/calibration/test منفصلة بحسب المستخدم والمتكلم والقالب.
- لا تدريب على frozen test ثم وصفها مستقلة.
- per-category/type/field precision/recall/F1 وconfusion matrices.
- risk-coverage، auto-save precision denominator الصحيح، calibrated support وintervals.
- دقة قبل/بعد LLM على نفس العينات، actual calls، rescue/regression rate.
- STT corpus حقيقي يحتاج تجميعًا وموافقة؛ fixtures النصية لا تساوي WER صوتي.
- CI يتضمن area tests والبوابات الدلالية، لا taxonomy legality فقط.

## A6 — تحسين الأداء والخصوصية والصيانة على قياس موثوق

بعد مراجعة A5: M14–M17/L01 وبقية المتابعة.

- traces آمنة لكل مرحلة وcold/warm/replica/outage.
- batching وتوازٍ محدود حيث يسمح الاعتماد؛ no races on files/DB/quota.
- cache versioning وإبطال موزع وsingle-flight مناسب.
- queue bounded/backpressure.
- minimum necessary context، redaction، retention monitoring وحذف نسخ النص.
- توثيق المسار الفعلي، وحذف dead code فقط بعد إثبات انعدام consumers.
- تحسين latency/cost مشروط بعدم regression للدقة.

# 8. مصفوفة قبول A1 — اختبارات إلزامية

اختبر على الأقل ما يلي باستخدام source الحقيقي ومزود scripted عند الحاجة:

1. «دفعت 120 عمل غريب»:
   طلب LLM يحتوي الجملة، clauseCount=1، ولا يوجد طلب «صنّف0جملة».
   الجواب الصحيح لا يُسقط بسبب قائمة تصعيد فارغة.

2. Empty escalation set:
   صفر network attempts؛ لا كلفة نموذج ولا model-success مزيف.

3. businessMode=false مع فئات أعمال موجودة:
   «ماشتريتش خامات ب500» لا ينتج expense auto_save.
   «دفعت500 خامات و300معدات» لا يعود auto-save لأول مبلغ مع ضياع الثاني.
   «قبضت500 خامات» لا يتحول إلى expense لمجرد أن نوع category expense.
   وإذا كانت سياسة scope تمنع الأعمال في هذا الوضع، طبّقها بوضوح مع positive test لوضع الأعمال الصحيح.

4. «ماشتريتش جزمة ب500 ودفعت200بنزين» و«كنت هشتري جزمة500 بس اشتريت أكل80»:
   جواب LLM بفئة قانونية للجزء المرفوض لا يعيد العملية غير الواقعة.
   احتفظ بالعملية الفعلية، أو draft واضح إن كان الاستخراج غير مكتمل.

5. عنصر strong-rule انتقلت فئته عبر LLM:
   لا يحتفظ بمعايرة/ثقة المصدر القديم دون إعادة تقييم.
   disagreement يُمثل إذا كانت الطبقات اختلفت؛ لا invent corroboration.

6. support=0:
   تطبيق calibration مرتين لا يحوّل unpriced إلى priced.
   cache/memory لا يسمحان بالقفز فوق هذا الشرط.

7. group confidence:
   عنصر يحتاج review لا تصبح مجموعته auto_save بسبب متوسط عناصر مرتفعة.
   اختبر حالات فردية ومجموعات وعدة thresholds، لا مثالًا عدديًا واحدًا.

8. sticky blockers:
   rejected/missing amount/ambiguous binding/unpriced/needsReview لا يمحوها verifier أو merge أو normalization التالية بلا سبب مثبت.

9. reply robustness:
   null، []، {}، items:null، item:null، string item، missing index، duplicate index، out-of-range، missing category، invalid category، missing sub، incompatible sub، unexpected person، missing clause.
   لا crashes غير مضبوطة، ولا invented default fact، ولا silent event loss.

10. ترتيب الأحداث:
    اجتماع مقاطع محلية مقبولة وأخرى يصنفها LLM لا يغيّر correspondence أو ترتيب IDs.

11. positive controls:
    «دفعت٢٠٠جنيه بنزين» و«جبت أكل للبيت بمية وخمسين» وعمليات مكتملة أخرى تظل صحيحة.
    لا تستدعِ LLM لهذه الجمل إذا كانت الأدلة المحلية كافية.
    لا تحقق الأمان بمنع كل auto-save أو تحويل الكل إلى سؤال.

12. metamorphic coverage:
    غيّر القيم وترتيب الكلمات والأرقام العربية/الإنجليزية والصياغة، مع نفس المعنى.
    لا تطبق regex خاصًا بجمل الاختبار أو تطابق النص بالكامل لإظهار النجاح.

الأمثلة الخاصة بالعملة والتاريخ والتراجع العددي في التقرير تُشغَّل baseline عندما تفيد معرفة الآثار، لكنها ليست كلها وعد إغلاق في A1. سجلها unresolved إذا بقيت، ولا تخفها.

# 9. قواعد الاختبار والقياس

- اقرأ scripts الحالية؛ npm test وحده لم يكن يشمل classification suite وقت التدقيق.
- شغّل baseline مناسبًا أولًا، ثم area tests بعد التعديل، ثم npm run check على النتيجة المجمعة.
- شغّل lint مستهدفًا، وbuild/E2E فقط عند تأثير التغيير على تلك الحدود أو وفق تعليمات المستودع.
- استخدم Vitest tests co-located وPlaywright/RTL عندما تختبر سلوك UI فعليًا.
- mock الشبكة/الساعة/DB boundary عند الحاجة، لا وظيفة القرار أو الدمج المطلوب إثباتها.
- اختبارات concurrency للحفظ تحتاج real isolated DB أو بديل يثبت transactional semantics؛ لا تعتبر mock row array إثباتًا لسباق MySQL.
- don't skip/xfail failing tests أو تقلل assertions أو تغيّر expected labels لمجرد أن implementation لا ينجح.
- لا تعدّل frozen corpus أو calibration generated أو baseline التاريخية في A1.
- أي تصحيح label حقيقي يُعرض كتغيير مستقل مع مبرر، ولا يُحسب تحسنًا للخوارزمية.
- سجل command وexit code وأعداد passed/failed/skipped ومكان output. لا تدّعِ الاختبار إذا لم تشغله.
- افصل test failure بسببك عن baseline failure موجودة، دون إسكات الاثنين.
- لا تعاود كامل suite بلا داعٍ بعد نجاحها ما لم يتغير الكود أو يظهر سبب جديد.

الأرقام القديمة للاستئناس فقط:
326 tests في15ملف نجحت؛172حالة benchmark؛TripleF1=87.31% إجماليًا،96.35% dev المقفل،78.26% frozen المقفل؛6 قرارات auto-save خاطئة من96.
كان ذلك local mock run بلا STT أو DB أو AI حي، وبإعدادات فارغة. لا تقدم تلك الأرقام بوصفها اختبارك الجديد أو دقة الإنتاج.

# 10. الاستقلالية وتنظيم Boost

استفد من Boost للتحقيق والتحقق المستقل، لكن لا تفتح فريقًا كبيرًا لمجرد وجوده.

- المنسق يفهم تبعيات الملفات ويملك الدمج النهائي.
- التنفيذ في النطاقات المتداخلة تسلسلي؛ لا أكثر من كاتب لكل ملف في الوقت نفسه.
- المراجع المستقل يقرأ diff الفعلي ويختبر failure paths، ولا يكتفي بملخص المنفّذ.
- محقق read-only أو test reviewer يمكنه العمل بالتوازي في نطاق محدد مفيد.
- لا تعِد تشغيل Boost داخل كل subagent، ولا توسّع التفويض تلقائيًا إلى Teamwork campaign.
- كل agent يبدأ من حالة ملفات متوافقة ويعرف baseline وACTIVE_MILESTONE.
- إذا لم تتوفر مراجعة مستقلة فعلًا، صرّح بذلك؛ لا تسمِّ مراجعتك لنفسك مراجعة مستقلة.
- تواصل بتحديثات عربية قصيرة عند اكتشاف مؤثر، مع ما ثبت وما بقي وما تختبره تاليًا.
- عند اقتراب حد السياق/الحصة، احفظ progress/handoff قابلًا للاستئناف، دون إعلان اكتمال غير حقيقي.

# 11. حزمة التسليم للمراجعة الخارجية

اكتب ملفات جديدة تحت:
E:/smartspend_V1_fixed/docs/reviews/implementation/A1/

ولا تكتب فوق تقرير التدقيق الأصلي.

سلّم:

1. HANDOFF.md:
   - الهدف والنطاق الذي نُفذ.
   - worktree/branch/HEAD الفعلي وحالة baseline.
   - الملفات التي تغيرت بواسطتك وما تغير بكل منها ولماذا.
   - جدول IDs: fixed / mitigated / unchanged / not reproduced، مع الأدلة والأسطر الحالية.
   - شرح السلوك قبل وبعد لكل إصلاح.
   - جميع الأوامر الفعلية ونتائجها.
   - ما لم يُختبر، والعوائق، والاختلاف عن الخطة.
   - مخاطر الدمج والتراجع وكيفية rollback لتغييراتك فقط.
   - الأسئلة التي تحتاج قرار منتج، دون افتراض إجاباتها.
   - اقتراح الجولة التالية دون تنفيذها.

2. regression-results.json:
   baseline/candidate config، test IDs، expected/actual، decisions/blockers، field diffs، source hashes، provider attempt counts.
   لا secrets ولا transcripts حقيقية.

3. scope-diff.patch:
   تغييرات هذه الجولة بالنسبة إلى snapshot البداية، لا كل عمل المستخدم غير الملتزم.
   لا تعتمد على git diff HEAD وحده في working tree dirty.
   ضمّن إضافة الملفات الجديدة الداخلة في النطاق أو سجلها بقائمة منفصلة واضحة.

4. progress.md:
   tracking matrix لكل42 ملاحظة، المرحلة المالكة والحالة الحالية.
   لا تضع fixed أمام مشكلة عالجت فقط أحد مساراتها.

5. independent-review.md إن حصلت مراجعة مستقلة:
   من راجع، ماذا فحص فعليًا، findings والإصلاحات ونتائج إعادة التحقق.
   خلاف ذلك سجل «لم تتوفر مراجعة مستقلة داخل هذه الجولة».

# 12. Definition of Done لـA1

لا تُعلن اكتمال الجولة إلا إذا:
- الأسباب الجذرية الداخلة في A1 أُعيد إنتاجها أو نُفيت بدليل.
- إصلاحها يمر من entry point الفعلي، لا في helper غير مستدعاة.
- الاختبارات الدلالية المذكورة نجحت على النسخة المجمعة.
- positive controls لا تزال صحيحة، ولم تستخدم all-review/all-LLM حيلةً لرفع الأمان.
- npm run check نجح، أو صرّحت بدقة بعائق baseline يمنع تصديق اكتمال الفحص.
- لا provider call فارغة، ولا resurrection للمنفي، ولا stale calibration أو bypass معروف داخل النطاق.
- الاختبارات وتقارير القياس لم تُضعف ولم يُضبط الكود على frozen.
- العمل السابق محفوظ، وdiff والملفات الجديدة قابلة للمراجعة.
- المتبقي في A2–A6 معلن ولم يُعرض كأنه أُصلح.
- لا claim لدقة100% أو production readiness من mocks.

ابدأ الآن بفحص حالة الملفات وقراءة المراجع، ثم إعادة إنتاج عيوب A1 وتنفيذ إصلاحاتها واختبارها. بعد تسليم A1 توقف للمراجعة الخارجية؛ لا تنتقل للمرحلة التالية تلقائيًا.

