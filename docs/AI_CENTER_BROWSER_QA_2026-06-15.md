# AI Center Browser QA - 2026-06-15

## Scope

تم الاختبار على `http://127.0.0.1:5173` باستخدام المستخدم المحلي:

- الاسم: Codex AI Tester
- الخطة: ultra
- الدور: admin

الاختبار شمل:

- Dashboard / تسجيل العمليات
- AI Center / الشات
- AI Center / المكالمة الصوتية
- AI Center / التقرير الشهري
- Dashboard / الإحصائيات
- فحص تكاليف الشات من `user_analytics`
- فحص حالة embeddings والذاكرة من قاعدة البيانات

## ملاحظة على أداة المتصفح

الـ in-app browser فشل في الكتابة داخل الحقول بسبب:

```text
Browser Use virtual clipboard is not installed
```

لذلك تم اختبار النقر والتنقل والـ quick actions من المتصفح، وتم اختبار أسئلة الكتابة غير المتاحة عبر محاكاة API مباشرة لنفس المستخدم.

## نتائج مهمة

### P0 - التقرير الشهري stale ولا يتحدث

Dashboard يعرض:

- دخل الشهر: `17,000 ج.م`
- مصروف الشهر: `2,166 ج.م`

لكن تقرير AI الشهري يعرض:

- دخل: `15,000.00 ج.م`
- مصروفات: `255.50 ج.م`
- تقرير قديم يقول "أول يوم ليك في SmartSpend"

الضغط على `تحديث التحليل` لم يغير التقرير، ورجع نفس الأرقام القديمة.

الاستنتاج: monthly report cache غير مربوط بنسخة/تغير بيانات الشهر، وزر التحديث لا يعمل كـ force refresh حقيقي.

### P0 - مقارنة الشهر رجعت إجابة غلط

Quick action:

```text
قارن مصاريفي الشهر ده بالشهر اللي فات
```

الرد بعد حوالي 24 ثانية قال إن الشهر الحالي هو `مايو 2026` وإن البيانات كلها صفر، رغم أن التاريخ الحالي `15 يونيو 2026` والـ dashboard فيه بيانات يونيو.

الاستنتاج: مسار `finance_analysis` ما زال يعتمد على LLM responder بشكل يسمح بسوء تفسير facts/period، أو أن comparison data needs غير كافية.

### P0 - `/ai` direct route غير مستقر

الذهاب المباشر إلى:

```text
/ai
```

أعاد المتصفح إلى:

```text
/dashboard?month=2026-06
```

لكن الضغط على لينك `مركز AI` من الواجهة فتح الصفحة بشكل صحيح.

الاستنتاج: مشكلة routing/deep-link في app initialization أو auth redirect.

### P0 - Dashboard tab query لا يفتح tab المطلوب

فتح:

```text
/dashboard?tab=stats&month=2026-06
```

عرض تبويب `تسجيل` بدلا من `إحصائيات`. الضغط اليدوي على tab `إحصائيات` يعمل.

الاستنتاج: query params لا تتم مزامنتها مع tab state عند التحميل.

### P0 - زر المحافظ في الشات يعطي ملخص مصاريف بدل أرصدة

Quick action:

```text
فاضل كام في محافظي؟
```

رجع:

```text
في 2026-06-15..2026-06-15، صرفت ٢٬١٦٦ جنيه...
```

بدل أرصدة المحافظ.

الاستنتاج: intent/data needs لا يوجد بها `wallet.summary`، وزر المحافظ موجه خطأ إلى `finance.summary`.

### P1 - الصوت يعرض خطأ خام للمستخدم

عند بدء المكالمة بدون إذن ميكروفون، الواجهة عرضت:

```text
Permission denied
```

ولا توجد رسالة عربية توضح للمستخدم يفتح إذن الميكروفون.

الاستنتاج: `AIVoiceCall/useVoiceCall` يحتاج error mapping لـ `NotAllowedError`.

### P1 - فئات الإحصائيات مختلطة عربي وإنجليزي

الإحصائيات تعرض فئات مثل:

- `فواتير`
- `تسوق`
- `اشتراكات`
- `مواصلات`
- `food`
- `transport`

الاستنتاج: لا توجد canonical taxonomy موحدة بين التسجيل القديم/الجديد والـ AI. هذا سيؤثر على التقارير والشات والتحليل.

### P1 - الشات لا يعرض محادثات قديمة

عند فتح مركز AI، الواجهة تعرض welcome + quick actions فقط، ولا تظهر قائمة محادثات قديمة رغم وجود `chat_conversations` و`chat_messages`.

الاستنتاج: فكرة multi-chat موجودة في backend لكن ليست مكتملة UI/UX.

### P1 - سؤال food أصبح أدق لكن الرد ناقص

API question:

```text
صرفت كام أكل الشهر ده؟ وهل كارفور الخضار واللحمة محسوبين ضمن الأكل؟
```

Resolved facts حسبت:

- `category_total_expense = 550.5`
- `transaction_count = 3`
- evidence includes `تسوق 375` لكارفور

لكن النص النهائي قال فقط:

```text
إجمالي صرفك على food هو ٥٥١ جنيه من ٣ عملية.
```

ولم يجاوب صراحة: هل كارفور محسوب؟ نعم/لا.

الاستنتاج: deterministic responder يحتاج استخدام evidence وslots للإجابة على sub-questions.

### P1 - هدف اللابتوب اتحسن لكن الرد النصي لسه متردد

API question:

```text
حطلي هدف احوش 80 الف عشان اجيب لابتوب خلال 10 شهور بس ما تنفذش غير لما أأكد
```

النتيجة الجيدة:

- pending action اتعمل بعنوان `هدف شراء لابتوب`
- `targetAmount = 80000`
- `targetDate = 2027-04-15`
- action_confirmation artifact موجود

المشكلة:

- الرد النصي طلب معرفة الدخل الشهري رغم أن facts فيها `total_income = 17000` و`net_flow = 14834.5`.

الاستنتاج: LLM responder لا يستخدم facts المالية بثقة كافية في goal planning.

### P2 - React warnings متكررة

Console يعرض warnings:

```text
Function components cannot be given refs
```

في `Button` داخل Radix Slot/Dialog/Dropdown triggers.

الاستنتاج: بعض مكونات UI تحتاج `forwardRef`.

### P2 - Service worker fails في dev

Console:

```text
sw.js unsupported MIME type text/html
dev-sw.js ServiceWorker script evaluation failed
```

الاستنتاج: PWA registration يعمل في dev بطريقة مزعجة وقد تؤثر على QA/console noise.

## نتائج جيدة

### الشات البسيط أصبح رخيصا

Quick action:

```text
كم صرفت النهاردة؟
```

رد:

```text
في 2026-06-15..2026-06-15، صرفت ٢٬١٦٦ جنيه من ١٠ عملية...
```

Cost:

- `kernelMode = active`
- `llmCalls = 0`
- `toolCalls = 0`
- `totalTokens ≈ 99`

### Site guide يعمل بدون LLM

API question:

```text
ازاي اربط SMS البنك؟
```

رجع معلومات من `site_guide.search`.

Cost:

- `llmCalls = 0`
- `totalTokens ≈ 315`

### Embedding status واضح

الإعدادات الحالية:

- `ai_embedding_model = accounts/fireworks/models/qwen3-embedding-8b`
- `ai_memory_embedding_enabled = true`
- `ai_memory_embeddings = 9`

الاستنتاج الحالي: Fireworks embeddings مفعلة فعليا، والذاكرة تعمل hybrid/vector فوق rows موجودة في `ai_memory_embeddings`.

## تكاليف مرصودة

أمثلة من `user_analytics`:

- `finance_query`: 97-133 tokens، `llmCalls=0`
- `site_help`: 315 tokens، `llmCalls=0`
- `finance_analysis`: 810-1229 tokens، `llmCalls=1`
- `goal_planning`: 1587-1864 tokens، `llmCalls=1`

مقارنة بالمسار القديم الموجود في السجلات:

- `goal_planning`: وصل سابقا إلى `16053 tokens`
- `memory_question`: وصل سابقا إلى `6588 tokens`
- `finance_query`: وصل سابقا إلى `5877 tokens`

الاستنتاج: التحسين الجديد خفض تكلفة الأسئلة البسيطة بقوة، لكن التحليل/الأهداف ما زالت تحتاج ضبط correctness وlatency.

## Retest بعد تصحيحات المرحلة 9

تمت إعادة الاختبارات على `2026-06-15` بعد التصحيحات العملية التالية:

- `/dashboard?tab=stats&month=2026-06` يظل على نفس الرابط ويفتح تبويب `الإحصائيات المالية`.
- `/ai` يفتح مركز الذكاء الاصطناعي مباشرة بدون الرجوع للداشبورد.
- زر `أرصدة المحافظ` في الشات لم يعد يرجع ملخص مصاريف؛ عندما لا توجد محافظ يعرض رسالة عربية واضحة.
- سؤال المقارنة يرجع `2026-06-01..2026-06-30` مقابل `2026-05-01..2026-05-31` من `finance.period_comparison` وبدون LLM.
- سؤال `أعلى الفئات` يرجع من `finance.breakdown` وبدون LLM.
- فئات الإحصائيات لم تعد تعرض `food` أو `transport`؛ تم توحيد العرض إلى أسماء عربية مثل `أكل وشرب` و`مواصلات`.
- رفض/منع الميكروفون في تبويب المكالمة الصوتية يعرض: `محتاج تفتح إذن الميكروفون من المتصفح عشان نبدأ المكالمة الصوتية.`
- Fireworks embedding smoke نجح على `accounts/fireworks/models/qwen3-embedding-8b` بأبعاد `256`، ثم تم تفعيل `ai_memory_embedding_enabled=true`.
- backfill للذكريات الحالية مؤكد: `9` scanned، `0` inserted، `9` skippedExisting، `0` skippedFallback، `0` failed، بأبعاد `768`.
- retrieval فعلي للذاكرة رجع `5` facts و`5` memories، وظهر في trace: `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:9`.
- Redis caching غير مفعل في البيئة الحالية لأن `REDIS_URL` غير موجود؛ تمت إضافة RAM cache fallback داخلي مع TTL/LRU وinvalidation عند تغيير المصاريف.
- واجهة الشات تعرض آخر المحادثات، وتم تحميل محادثة قديمة من الشريط ثم إنشاء goal draft جديد ببطاقة تأكيد واضحة.
- بعد reload، تم فتح محادثة بها 4 رسائل وظهر كارتا تأكيد محفوظان من `toolResults`، بعد إصلاح قراءة JSON string ومنع stale cache في `getConversation`.
- voice tool adapter أصبح يدعم `wallet_summary` و`period_comparison` حتى لا يكون الصوت أضعف من الشات في رصيد المحافظ والمقارنات.
- تم إصلاح `Button` إلى `forwardRef` لتقليل تحذيرات Radix refs في الواجهة.

آخر cost metrics من الواجهة:

- `wallet.summary`: `llmCalls=0`, `toolCalls=0`, `totalTokens≈94`.
- `finance.period_comparison`: `llmCalls=0`, `toolCalls=0`, `totalTokens≈158`.
- `finance.breakdown/top categories`: `llmCalls=0`, `toolCalls=0`, `totalTokens≈170`.

التحقق الآلي:

- `npm run check` نجح.
- `vitest run api/services/ai-kernel/intent-router.test.ts api/services/ai-kernel/phase2-resolution.test.ts api/services/ai-memory/embedding-client.test.ts api/chat-router.phase9.test.ts` نجح بعد تحديث `chat-router.phase9`: `14` tests.
- `vitest run api/lib/redis-client.test.ts` نجح لاختبار RAM cache fallback.
- `vitest run api/services/voice-kernel/voice-tool-adapter.test.ts` نجح: `3` tests.
- `vitest run src/components/expenses/ExpenseForm.quick-save.test.ts` نجح: `2` tests تؤكد أن quick save النصي يمر عبر `ai.parseExpense` ولا يستدعي `expense.create` مباشرة.
- `vitest run api/services/ai-kernel/phase2-resolution.test.ts` نجح بعد إضافة تغطية active-mode لسؤال أكل الشهر وأعلى الفئات: `5` tests.
- `vitest run api/services/ai-chat-tools.test.ts` نجح: `2` tests تؤكد أن fallback tools أصبحت ترجع JSON envelope وأن `finance_query` هو أول tool ويمر عبر Finance Semantic Layer.

## Retest دورة Agent QA بعد تفعيل المتصفح

- تم اختبار quick actions من المتصفح على `/ai`: صرف اليوم، مقارنة الشهر، أعلى الفئات، أرصدة المحافظ، وأهداف الادخار.
- سؤال `وصلت كام في أهداف الادخار بتاعتي؟` كان يذهب سابقا إلى `goal_planning` مع LLM واحد وتكلفة حوالي `1653` tokens، ويرد برد عام عن نقص البيانات.
- تم تغيير المسار ليستخدم `finance.goal_progress` مباشرة. نتيجة المتصفح بعد التصحيح: رد deterministic يعرض 3 أهداف، المستهدف، القدرة الشهرية المقدرة، والمدة التقديرية، مع توضيح أن التطبيق لا يسجل حاليا مبلغ محوش فعلي منفصل لكل هدف.
- trace بعد التصحيح: `dataNeeds=["finance.goal_progress"]`, `llmCalls=0`, `embeddingCalls=0`, `totalTokens≈200`, `latency≈38ms`.
- تم اختبار ذاكرة حرة عبر نفس AI Kernel بسبب تعطل كتابة النص في browser-use (`virtual clipboard is not installed`). سؤال `فاكر اتفقنا على هدف الكاميرا أو الموبايل؟` استخدم `memory.search` ورجع trace يحتوي `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:9`, و`llmCalls=0`.
- تم تحسين ranking الذاكرة حتى لا تتصدر أهداف العربية العامة سؤالا محددا عن الكاميرا/الموبايل. بعد التصحيح، أول نتيجتين أصبحتا هدف الموبايل وهدف الكاميرا، ثم باقي أهداف العربية بدرجات أقل.
- تم إرسال طلب chart عبر نفس `chat.sendMessage`: `ارسملي مصاريف الأكل آخر 6 شهور`. رجع `chart.data` وartifact من نوع `chart` بصفر LLM، ثم ظهر في المتصفح بعنوان `رسم المصاريف شهري`.
- فحص DOM للرسم أكد وجود `recharts-wrapper=1` و`recharts-surface=1` و`svgCount=34`.
- تم اختبار voice tool runtime مباشرة: `finance_query(goal_progress)` رجع `dataNeeds=[finance.goal_progress]` وحقائق الأهداف بدون LLM.
- تم اختبار voice `memory_search` مباشرة بسؤال `فاكر هدف الكاميرا أو الموبايل؟`; trace رجع `query_reformulated`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:9`، وأول النتائج كانت الكاميرا والموبايل قبل أهداف العربية العامة.
- تم اختبار voice prefetch runtime وتأكد أن `session.prefetch.cacheHits` يخزن نفس trace الخاص بالـ embedding، وليس مجرد facts preview.
- تم نقل `monthly-report-job` من agentic chat workflow إلى `buildMonthlyReportFactsPack`: التقرير يعاد استخدامه عند تطابق `MONTHLY_REPORT_CACHE_VERSION`، ويدعم `forceRefresh` لإجبار إعادة التوليد، مع LLM واحد فقط فوق facts pack أو fallback deterministic عند غياب المفتاح.
- زر `تحديث التحليل` في `AIInsights` أصبح يرسل `forceRefresh: true`، والـ backend يحدث صف `ai_summaries` الحالي عند إعادة التوليد بدل محاولة insert تفشل بصمت.
- عائق QA الحالي: إدخال النص الحر من browser-use لا يعمل بسبب `Browser Use virtual clipboard is not installed`; لذلك الأسئلة الحرة تم اختبارها من backend/chat API ثم فتح نتائجها في المتصفح.

## Retest إضافي بعد إصلاح Qwen/category/action

- تم تشغيل dev server نظيف على `http://127.0.0.1:5174/`; صفحة `/login` ظهرت بشكل صحيح بعد انتظار قصير، ولم تظهر تحذيرات Service Worker جديدة خاصة بـ `5174`. التحذيرات الموجودة في console كانت قديمة من جلسة `5173`.
- سيرفر `5173` ما زال process قديم بدأ 08:06، لذلك تحذيرات PWA القديمة ستظل تظهر عليه إلى أن يعاد تشغيله.
- تم إيقاف سيرفر `5174` بعد الاختبار لأنه يشغل `api/boot.ts` كاملا، وبالتالي يحاول فتح WhatsApp/Baileys session ثانية وقد يسبب `Stream Errored (conflict)`. يلزم flag لاحق لعزل WhatsApp عند QA/local secondary servers.
- backend smoke أكد:
  - سؤال `صرفت كام النهارده؟`: `finance.summary`, `llmCalls=0`, `embeddingCalls=0`.
  - سؤال `صرفت كام أكل الشهر ده؟`: `finance.category_total + finance.transactions`, الإجمالي `659.5`, عدد العمليات `5`, `llmCalls=0`.
  - سؤال الذاكرة عن الكاميرا/الموبايل: `memory.search`, trace يحتوي `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, و`llmCalls=0`.
  - chart جديد للأكل آخر 6 شهور يرجع آخر نقطة `2026-06 = 659.5` وليس `660`.
  - monthly facts أصبحت `semantic_live` وتحافظ على `total_expense=2337.5`, `net_flow=14662.5`, و`daily_average_expense=155.83`.
- تم إصلاح خلط الفئات في `top_categories`: بعد canonicalization أصبح `الأكل:659.5` مطابقا لسؤال الأكل، بدلا من انقسامها بين `food/shopping/uncategorized`.
- تم اختبار `voice_finance` و`voice_memory` backend: الصوت يستخدم نفس facts/embedding trace وليس مسارا منفصلا.
- تم اختبار action runtime:
  - مسار `goal.create` في context pro أنشأ `action_confirmation` ثم تم إلغاؤه بدون تنفيذ.
  - عند رفض السيرفر لمسودة هدف بسبب حد أهداف Free، الشات أصبح يرجع رسالة واضحة للمستخدم بدلا من ابتلاع الخطأ.
- فحص المتصفح على `5173/ai` أكد وجود تبويبات AI ومربع الكتابة. فتح محادثة chart قديمة أظهر `chart-point` cards، لكنها تعرض `660` لأنها artifact محفوظ قبل إصلاح الكسور؛ artifact جديد من backend يرجع `659.5`.

## Retest trace/category بعد إصلاح productization

- Fireworks Qwen smoke مباشر نجح على `accounts/fireworks/models/qwen3-embedding-8b` بأبعاد `256` بدون fallback، والـ config الحالي: `ai_memory_embedding_enabled=true`, `ai_embedding_model=accounts/fireworks/models/qwen3-embedding-8b`, وmemory dimensions `768`.
- حالة قاعدة البيانات الحالية: `23` memory items و`22` memory embeddings مخزنة على `accounts/fireworks/models/qwen3-embedding-8b|768`.
- تم إضافة trace panel داخل رسائل الشات. من المتصفح، فتح محادثة ذاكرة محفوظة أظهر:
  - `ai-trace route=memory_question tools=memory.search embedding=embedding:query_embedded, embedding:fireworks, embedding:rows:21`.
  - عند فتح التفاصيل ظهر `memory.search`, `query_reformulated:conversation_memory_query`, model `accounts/fireworks/models/deepseek-v4-flash`, وselected memory facts.
- من المتصفح، quick action `صرفت كام النهاردة؟` رجع trace:
  - `ai-trace route=finance_query tools=finance.summary embedding=none`.
  - Summary: `LLM 0`, `embed 0`, والرد من `finance.summary` مباشرة.
- إدخال نص عربي حر داخل browser-use ما زال يفشل بسبب `Browser Use virtual clipboard is not installed`; لذلك الأسئلة الحرة الجديدة تم اختبارها backend smoke، بينما المتصفح استخدم quick actions ومحادثات محفوظة.
- تم إصلاح route سؤال: `كارفور الخضار واللحمة اتحسب أكل ولا تسوق؟ ولو غلط أعمل إيه؟`
  - قبل الإصلاح كان يذهب إلى `action_request`.
  - بعد الإصلاح يذهب إلى `finance_analysis` مع `finance.transactions + finance.breakdown`.
  - الرد deterministic بلا LLM ويعرض evidence من العمليات.
- تم إصلاح فلترة التصنيف لتستخدم canonical category بدل raw category. بعد الإصلاح، سؤال كارفور أخرج عملية الصيدلية من evidence، وأبقى عمليات الأكل فقط مثل كارفور/قهوة/كشري/ستاربكس.
- Smoke chart جديد لسؤال `ارسملي صرف الأكل والمواصلات آخر 6 شهور في رسم واحد` رجع:
  - `chart.data`, `LLM 0`, `embedding 0`.
  - points كاملة من `2026-01` إلى `2026-06`.
  - آخر نقطة: `food=659.5`, `transport=260`, `value=919.5`, `count=7`.
- ملاحظة مهمة: محادثات chart القديمة في الشريط الجانبي قد تعرض artifact محفوظ قديم مثل `660` ونقطة واحدة فقط؛ هذا لا يمثل المسار الجديد. يلزم إرسال رسالة chart جديدة أو إعادة توليد artifact لعرض البيانات بعد الإصلاح.
- تم إصلاح `api/services/ai-center.creative-smoke.test.ts`: كان يحرس rounding قديم للـ chart artifacts، والآن يحرس الحفاظ على الكسور مثل `1200.4` و`950.8`.
- تم نقل منطق multi-category chart إلى aggregator قابل للاختبار، وإضافة regression يثبت أن آخر 6 شهور ترجع 6 buckets وأن فلترة canonical تمنع دخول عملية صيدلية في شارت food/transport.
- expanded verification بعد ذلك نجح: `17` test files و`59` tests، ويشمل creative smoke والذاكرة والتمويل والشات والصوت والأكشن والتقرير والكاش.
- live smoke بعد النقل أكد:
  - memory: `memory.search`, `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:22`, `LLM 0`.
  - classification: `finance.transactions + finance.breakdown`, `LLM 0`, evidence للأكل فقط.
  - chart: `chart.data`, `6` points, آخر نقطة `food=659.5`, `transport=260`, `value=919.5`.
