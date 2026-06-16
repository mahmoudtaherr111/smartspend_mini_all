# SmartSpend AI Center Implementation Tasks

هذا الملف هو لوحة تنفيذ الخطة. كل مهمة يجب أن تظل غير مكتملة حتى يتم تنفيذها فعليا ومراجعتها. بعد كل مهمة مكتملة، يتم تعديل هذا الملف ووضع علامة `[x]` بجانبها مع ملاحظة قصيرة إن لزم.

## حالة ما قبل التنفيذ

- [x] مراجعة محادثة التخطيط وتثبيت المتطلبات الأساسية.
- [x] قراءة ملفات مركز AI الحالية: الشات، الصوت، التقارير، الأهداف، Redis، schema، وRAG التصنيف.
- [x] كتابة الخطة المعمارية الشاملة في `docs/AI_CENTER_REDEVELOPMENT_MASTER_PLAN.md`.
- [x] بدء تنفيذ الكود.

## المرحلة 0: تثبيت خط الأساس وإزالة العوائق

هدف المرحلة: قبل إدخال المعمارية الجديدة، نثبت الوضع الحالي ونصلح الأخطاء التي قد تمنع البناء الآمن.

- [x] تشغيل `npm run check` وتوثيق أخطاء TypeScript الحالية المرتبطة بالـ AI.
- [x] إصلاح import/use of `db` داخل `api/services/ai-chat-service.ts`.
- [x] إصلاح typing الخاص بـ `conversationId` داخل `api/chat-router.ts`.
- [x] إصلاح مشكلة tool result في الصوت حيث `executeTool` يرجع نصا بينما `voice-call-service.ts` يحاول `JSON.parse`.
- [x] إضافة اختبار smoke للشات الحالي يثبت أن `sendMessage` يحفظ user/assistant messages.
- [x] إضافة اختبار smoke للصوت على مستوى tool adapter بدون فتح مكالمة حقيقية.
- [x] إضافة feature flag عام مثل `ai_kernel_enabled` في `systemSettings` للتشغيل التدريجي.
- [x] توثيق current behavior في ملف قصير داخل `docs` قبل تغيير التدفق.

## المرحلة 1: عقود AI Kernel والهيكل الأساسي

هدف المرحلة: إنشاء طبقة تشغيل مركزية بدون تغيير السلوك النهائي دفعة واحدة.

- [x] إنشاء مجلد `api/services/ai-kernel/`.
- [x] تعريف types الأساسية: `AIRequest`, `AIResponse`, `IntentResult`, `DataNeed`, `ResolvedFact`, `Artifact`, `ActionDraft`.
- [x] إنشاء `ai-kernel/index.ts` كمدخل موحد.
- [x] إنشاء `intent-router.ts` بقواعد deterministic أولية للأسئلة المالية الشائعة.
- [x] إنشاء `data-need-compiler.ts` يحول intent إلى data needs.
- [x] إنشاء `context-packer.ts` بحدود توكنز واضحة لكل channel.
- [x] إنشاء `response-normalizer.ts` يحول رد LLM إلى contract موحد.
- [x] إنشاء `ai-trace-logger.ts` لتسجيل route/cost/dataNeeds/cacheHits.
- [x] تشغيل الشات في shadow mode: يستدعي Kernel للتسجيل فقط ثم يرد بالنظام القديم.
- [x] مقارنة نتائج shadow mode مع النظام الحالي في logs.

## المرحلة 2: Finance Semantic Layer وRedis Hot Cache

هدف المرحلة: جعل البيانات المالية تأتي من طبقة دقيقة ومختصرة بدل أدوات خام كثيرة.

- [x] إنشاء مجلد `api/services/finance-semantic-layer/`.
- [x] إنشاء resolver موحد للفترات الزمنية يدعم today, yesterday, current_month, previous_month, salary-cycle.
- [x] نقل منطق salaryDay من الأدوات الحالية إلى resolver مشترك.
- [x] إنشاء `finance.summary` لإجمالي دخل/مصروف/صافي/عدد عمليات.
- [x] إنشاء `finance.categoryTotal` لفئة محددة مثل الأكل.
- [x] إنشاء `finance.breakdown` حسب category/subCategory/person/wallet/merchant.
- [x] إنشاء `finance.transactions` لإرجاع evidence rows بحدود صارمة.
- [x] إنشاء `finance.goalProgress` للأهداف النشطة.
- [x] إنشاء `finance.chartData` لإحصائيات ورسوم جاهزة للواجهة.
- [x] إضافة Redis cache keys للـ today/month/category summaries.
- [x] تحديث invalidation عند create/update/delete expenses.
- [x] تحديث invalidation عند create/update goals.
- [x] استبدال أدوات `ai-chat-tools.ts` تدريجيا بـ capability واحدة `finance.query` كأداة مفضلة فوق Finance Semantic Layer مع بقاء الأدوات القديمة fallback.
- [x] جعل كل نتائج `executeTool` في الشات JSON منظمة وليست text/CSV.
- [x] إضافة tests للأسئلة: صرفت كام النهارده، أكل الشهر ده، مقارنة الشهر، أعلى فئة.

## المرحلة 3: الذاكرة والـ Embeddings

هدف المرحلة: بناء ذاكرة متعددة الطبقات قليلة التكلفة بدل إرسال history طويل.

- [x] تصميم جداول جديدة للذاكرة: conversation summaries, memory items, memory embeddings metadata, action memory.
- [x] إضافة migration للجداول بعد مراجعة schema الحالية.
- [x] إنشاء `embedding-client.ts` يدعم Fireworks Qwen3 Embedding 8B و`dimensions`.
- [x] إضافة إعدادات systemSettings للموديل والأبعاد: 256, 768, 1024.
- [x] إنشاء `memory-writer.ts` لاستخراج memories بعد كل محادثة أو task.
- [x] إنشاء running summary للمحادثة الحالية.
- [x] إنشاء conversation capsules لآخر 10 محادثات بحد 15-30 كلمة.
- [x] إنشاء semantic memory extraction للحقائق والاتفاقات المهمة فقط.
- [x] إنشاء memory retrieval يجمع capsules + semantic search + action memory.
- [x] إنشاء vector store interface مستقل عن backend.
- [x] تنفيذ backend أولي بسيط بدون Qdrant إن أمكن لتقليل التعقيد.
- [x] إضافة Qdrant adapter لاحقا خلف نفس الواجهة عند الحاجة.
- [x] إضافة Redis cache للـ recent capsules وhot memories.
- [x] إضافة tests لسؤال "فاكر الخطة اللي اتكلمنا عنها؟".

## المرحلة 4: Structured Chat UI وAction Runtime

هدف المرحلة: جعل الشات قادر يعرض بطاقات ويفعل عمليات بعد تأكيد المستخدم.

- [x] تعديل `chat.sendMessage` ليرجع `AIResponse` structured بجانب النص.
- [x] تحديث `AIChatbot.tsx` ليدعم artifacts.
- [x] إضافة message renderer لأنواع: text, metric_card, table, chart, action_confirmation, quick_replies.
- [x] إنشاء `api/services/action-runtime/`.
- [x] تعريف action lifecycle: draft, pending_confirmation, confirmed, executed, cancelled, failed.
- [x] إنشاء pending action store في DB أو Redis مع TTL.
- [x] إنشاء audit log للأفعال.
- [x] إنشاء validators لكل action حسب userId/userType/plan.
- [x] تنفيذ `goal.create` كأول action كامل.
- [x] إضافة confirmation card لإنشاء هدف.
- [x] إضافة endpoint `chat.confirmAction`.
- [x] تنفيذ cancel action.
- [x] حفظ action outcome في memory.
- [x] إضافة tests لمسار: ناقش هدف -> draft -> confirm -> create goal.

## المرحلة 5: تطوير الصوت فوق الـ Kernel

هدف المرحلة: جعل المكالمة الصوتية سريعة ورخيصة وقادرة على استخدام نفس الذاكرة والأفعال.

- [x] إنشاء voice session state في Redis عند بداية المكالمة.
- [x] تجهيز hot context: profile snapshot, today summary, month summary, active goals, recent capsules.
- [x] تقليل `voiceSystemPrompt` إلى persona + قواعد + hot facts مختصرة.
- [x] إنشاء voice tool adapter يرجع JSON فقط.
- [x] ربط Gemini tool calls بـ AI Kernel Data Resolver بدل `executeTool` الخام.
- [x] دعم voice pending action في Redis.
- [x] دعم تأكيد صوتي للأفعال low/medium risk.
- [x] جعل high-risk actions تحتاج UI confirmation.
- [x] بعد انتهاء المكالمة: إنشاء call summary، semantic memories، action outcomes.
- [x] منع حفظ transcript الصوت كنظام message عشوائي داخل آخر محادثة إلا كأرشيف واضح.
- [x] إضافة tests لمسار صوتي محاكى: سؤال مالي -> tool result -> answer.

## المرحلة 6: Site Guide RAG والتقارير والرسوم

هدف المرحلة: توحيد شرح التطبيق والتقارير والإحصائيات داخل نفس الـ AI Kernel.

- [x] إنشاء knowledge base لشرح التطبيق: SMS, wallet, card, expenses, goals, reports, plans.
- [x] تقسيم site guide إلى chunks صغيرة.
- [x] عمل embeddings 256 للـ site guide.
- [x] إنشاء `site_guide.search`.
- [x] ربط أسئلة "إزاي أعمل..." بـ site guide retrieval.
- [x] إنشاء chart artifact contract.
- [x] ربط `finance.chartData` بواجهة Recharts.
- [x] جعل الشات يقدر يرجع chart artifact بدل نص فقط.
- [x] إعادة استخدام monthly snapshots داخل Finance Semantic Layer.
- [x] جعل monthly report generation يستخدم facts pack من الـ semantic layer.
- [x] منع إعادة توليد التقرير إذا cache صالح.
- [x] إضافة tests لشرح ربط SMS، وربط فيزا، وإنشاء رسم أكل آخر 6 شهور.

## المرحلة 7: Cost Policy والمراقبة والتقييم

هدف المرحلة: ضمان أن النظام رخيص فعلا، وليس فقط أذكى شكلا.

- [x] إنشاء `ai-cost-policy.ts` مركزي للشات والصوت والتقارير والـ embeddings.
- [x] وضع max input/output tokens حسب intent/channel/plan.
- [x] منع أكثر من tool round واحد افتراضيا إلا للـ complex analysis.
- [x] تسجيل cost لكل message/call/action.
- [x] إنشاء dashboard أو logs سهلة لمتوسط التكلفة لكل request.
- [x] إنشاء golden eval dataset لأسئلة عربية ومصرية شائعة.
- [x] قياس accuracy للأرقام: كل رقم في الرد لازم يكون موجود في facts pack.
- [x] قياس retrieval quality للذاكرة والـ site guide.
- [x] قياس latency للشات والصوت.
- [x] إضافة fallback عندما يفشل embedding أو vector store.
- [x] إضافة rollout flags: users/admin/pro/free.
- [x] تشغيل النظام الجديد لمستخدم admin فقط أولا.
- [x] تشغيله لنسبة صغيرة من المستخدمين ثم التوسع.

## المرحلة 8: تحسينات ما بعد الإطلاق

هدف المرحلة: بعد تشغيل النظام الأساسي، نضيف القوة بدون حرق تكلفة.

- [x] إضافة Qdrant long-term vector store إذا حجم memories كبر.
- [x] إضافة quantization/on-disk vectors حسب الحاجة.
- [x] إضافة reranker رخيص فقط عند retrieval الغامض.
- [x] إضافة query reformulation للمسارات المعقدة.
- [x] إضافة proactive insights من snapshots بدون LLM ثقيل.
- [x] إضافة budget actions بعد goal.create.
- [x] إضافة profile update drafts.
- [x] إضافة wallet action drafts بحذر.
- [x] إضافة undo للعمليات القابلة للرجوع.
- [x] تحسين voice prefetch بناء على أول 2 ثانية من كلام المستخدم.

## المرحلة 9: تصحيح التنفيذ الواقعي بعد QA العميق

هدف المرحلة: معالجة الفجوة بين الخطة القديمة والواقع الفعلي في الكود، بحيث لا يظل الـ AI Kernel أو الـ embeddings مجرد هياكل غير مستخدمة.

- [x] مراجعة الخطة القديمة وملف المهام واكتشاف أن أجزاء محورية كانت معلّمة كمكتملة لكنها تعمل shadow أو غير موصلة.
- [x] إضافة `runAIKernelActive` ليقدر ينتج ردا فعليا من ResolvedFacts بدل تسجيل shadow فقط.
- [x] ربط `chat.sendMessage` بالـ AI Kernel كمسار primary عند تفعيل `ai_kernel_enabled` مع fallback للـ legacy عند الخطأ.
- [x] إضافة flag سريع `ai_kernel_primary_enabled` يسمح بإرجاع الشات إلى shadow/legacy بدون حذف التنفيذ الجديد.
- [x] جعل الأسئلة المالية البسيطة ترد deterministic من SQL facts بدون LLM أو tool-calling.
- [x] جعل الأسئلة التحليلية/التخطيطية تستخدم LLM call واحد فقط فوق facts pack صغير.
- [x] تعديل إعدادات embeddings لاستخدام `chatbot_api_key` كـ fallback بجانب `fireworks_api_key`.
- [x] توصيل `memory.search` فعليا بجدول `ai_memory_embeddings` عند التفعيل، مع hybrid scoring: vector + lexical + recency + importance.
- [x] الحفاظ على fallback الذاكرة القديم عندما يكون embedding مغلقا أو لا توجد vectors.
- [x] توسيع aliases ومطابقة الفئات المالية لتشمل `description`, `rawText`, و`placeHint` بجانب category/subCategory.
- [x] توسيع intent routing لفئات أساسية إضافية: health, bills, income, saving.
- [x] إيقاف bypass الخاص بزر الحفظ السريع في الواجهة؛ الزر أصبح يمر عبر `ai.parseExpense` والسيرفر classifier.
- [x] تحسين استخراج عنوان `goal.create` ليقرأ الغرض من جمل مثل "عشان أجيب لابتوب" بدلا من fallback عام.
- [x] تحديث الاختبارات القديمة بحيث تختبر shadow/legacy عبر flag واضح، وإضافة اختبارات للـ active kernel واستخراج هدف لابتوب.
- [x] إضافة route/test مباشر يؤكد أن `chat.sendMessage` لا يستدعي legacy في سؤال مالي بسيط عند تفعيل primary.
- [x] إضافة test لزر الحفظ السريع أو mutation flow يؤكد أن quick save لا يستدعي `expense.create` مباشرة.
- [x] إضافة smoke فعلي للـ Fireworks embedding endpoint بعد تفعيل setting في بيئة آمنة بدون كشف المفتاح.
- [x] إضافة backfill job للـ `ai_memory_embeddings` للذكريات الموجودة قبل التفعيل.
- [x] إضافة timeout للـ embedding client حتى لا يعلق الشات أو backfill عند بطء الشبكة.
- [x] تفعيل `ai_memory_embedding_enabled` بعد نجاح smoke، وتشغيل backfill للذكريات الحالية.
- [x] إعادة تحقق فعلية بعد تهيئة Fireworks key: smoke بأبعاد `256` بدون fallback، و`9/9` vectors موجودة بأبعاد `768`، وretrieval trace يحتوي `embedding:fireworks`.
- [x] إضافة `wallet.summary` حتى لا يرد سؤال المحافظ بملخص مصاريف.
- [x] إضافة `finance.period_comparison` حتى تكون مقارنة الشهر الحالي/السابق SQL facts deterministic بدون LLM.
- [x] جعل `أعلى الفئات` finance analysis deterministic من breakdown facts.
- [x] تحويل سؤال تقدم أهداف الادخار من `goal_planning` العام إلى `finance.goal_progress` deterministic، مع facts مفصلة لكل هدف وبدون LLM.
- [x] تحسين رد category+evidence ليوضح العمليات التي دخلت في الإجمالي.
- [x] تحسين رد action draft للهدف بحيث يعرض مسودة التنفيذ والتأكيد المطلوب من السيرفر.
- [x] تحسين ranking ذاكرة الشات مع embeddings حتى لا تتصدر الكلمات العامة مثل "فاكر" أو "هدف/ادخار" النتائج، وإعطاء وزن أعلى للكلمات المحددة مثل كاميرا/موبايل.
- [x] إضافة `cacheHits` إلى debug الخاص بالـ AI Kernel response حتى يظهر في الرسالة المخزنة هل retrieval استخدم `embedding:fireworks` أو cache/fallback.
- [x] إصلاح sync تبويب/شهر الداشبورد مع query params.
- [x] إصلاح auth loading flash الذي كان يحول deep links مؤقتا إلى `/login` ويفقد query params.
- [x] توحيد عرض فئات الإحصائيات من canonical English إلى أسماء عربية أثناء aggregation.
- [x] تحويل خطأ إذن الميكروفون إلى رسالة عربية مفهومة في واجهة المكالمة الصوتية.
- [x] إضافة in-process RAM cache fallback عندما لا يكون `REDIS_URL` مهيأ، مع TTL/LRU وstatus واضح.
- [x] جعل invalidation يمسح Redis أو RAM fallback عند تغيير المصاريف أو بيانات finance cache.
- [x] إظهار آخر المحادثات في واجهة الشات وتحميل محادثة قديمة بدون فقدان الرسائل.
- [x] إعادة بناء structured artifacts/actions من `toolResults` عند فتح محادثة قديمة.
- [x] دعم قراءة `toolResults` سواء رجعت من MySQL كـ JSON object أو JSON string.
- [x] منع stale cache في تفاصيل المحادثة حتى تظهر الرسائل والكروت الجديدة بعد reload.
- [x] إصلاح `Button` ليستخدم `forwardRef` ويوقف تحذيرات Radix الخاصة بالـ refs.
- [x] توسيع voice `finance_query` ليدعم `wallet_summary` و`period_comparison` فوق نفس AI Kernel data needs.
- [x] ربط voice `goal_progress` بـ `finance.goal_progress` بدل `goals.active` حتى يرد الصوت بنفس facts الدقيقة وبدون LLM.
- [x] إضافة `cacheHits` إلى voice prefetch session state حتى يظهر هل turn الصوت استخدم embedding/cache/DB فعليا.
- [x] نقل monthly report job إلى facts pack من Finance Semantic Layer مع `MONTHLY_REPORT_CACHE_VERSION` و`forceRefresh`، وإعادة استخدام التقرير المخزن بدل agentic tools عند صلاحية الكاش.
- [x] إضافة `forceRefresh` إلى `ai.generateMonthlyInsights` وربط زر `تحديث التحليل` به، مع تحديث `ai_summaries` الحالية بدل فشل insert الصامت بسبب unique index.
- [x] تثبيت regression في `memory.search`: تجاهل stopwords حوارية مثل "اللي/اتكلمنا/عنها" حتى لا تدخل ذكريات مالية غير مرتبطة داخل نتائج Qwen embedding.
- [x] إغلاق مسار التقرير الشهري القديم في `ai.generateMonthlyInsights` الذي كان يعيد تشغيل `processAIChatMessage` لمستخدمي Pro/Ultra ويحرق tools/tokens بدل facts pack واحد.
- [x] جعل `buildMonthlyReportFactsPack` يستخدم live semantic facts افتراضيا، ويتجاوز snapshot/cache عند `forceRefresh` حتى لا يعرض التقرير أرقاما قديمة.
- [x] تقليل prompt تقرير الواجهة إلى facts pack مختصر عند توفر semantic facts؛ التحقق الفعلي أعطى `inputTokens=754`, `llmCalls=1`, `toolCalls=0`, و`factsSource=semantic_live`.
- [x] منع تقريب إجماليات التقرير الشهري لأقرب جنيه كامل؛ facts pack يحتفظ الآن بالقيم الدقيقة مثل `2337.5` و`14662.5`.
- [x] حذف مسار `monthly_report_endpoint_agentic` القديم من `ai-router.ts` نهائيا حتى لا يرجع تقرير Pro/Ultra إلى tool-loop مكلف.
- [x] إيقاف تسجيل Service Worker في وضع التطوير وتعطيل VitePWA dev SW لتقليل كاش/تحذيرات QA المحلية.
- [x] تحسين قائمة محادثات AI بإظهار وقت آخر رسالة بجانب عدد الرسائل حتى لا تبدو المحادثات المكررة متطابقة أثناء QA والاستخدام الحقيقي.

- [x] Add Fireworks embedding model alias retry from `accounts/fireworks/models/qwen3-embedding-8b` to `fireworks/qwen3-embedding-8b`, expose alias use in memory trace, and prevent storing deterministic fallback vectors as real memory embeddings.
- [x] Preserve decimal chart values in `finance.chartData` artifacts and render accessible `chart-point` summaries under charts so QA can verify every point even when screenshots are unavailable.
- [x] Canonicalize finance category breakdown/chart/report facts so category aliases and clear descriptions such as Carrefour/coffee/food are grouped consistently with `finance.category_total`; verified `top_categories` now reports `الأكل:659.5` matching the food total query.
- [x] Return a clear chat response when an action draft is rejected by server validation, such as Free users reaching the active-goal limit, instead of silently swallowing the action error.
- [x] Add an in-chat trace panel for assistant messages showing route, data needs/tools, embedding/cache hits, token estimates, model, and selected facts so browser QA can verify the AI path without backend logs.
- [x] Route classification/explanation questions such as Carrefour food-vs-shopping to `finance.transactions + finance.breakdown` instead of generic actions, with deterministic evidence-based responses and no LLM.
- [x] Filter category totals, transactions, and charts by canonical category, not raw stored category, so evidence and totals agree after category inference.
- [x] Fill multi-category monthly chart buckets across the requested range, so "last 6 months" returns six points even when only the current month has spending.
- [x] Update `ai-center.creative-smoke.test.ts` to guard the current architecture: decimals are preserved, classification routes to evidence tools, and the expanded suite includes creative smoke.
- [x] Broaden deterministic semantic memory extraction beyond goal keywords to capture preferences, constraints, commitments, and product-help friction as embeddable memories without adding an LLM call.
- [x] Skip duplicate Fireworks embedding writes when a memory already has a vector for the same model/dimensions, reducing repeated write-side embedding cost.
- [x] Await memory persistence only for turns that contain semantic memory candidates, so immediate "remember this / do you remember?" followups are reliable without slowing every ordinary chat turn.

- [x] Add cache runtime observability to chat and voice traces so QA can see whether each response is using Redis or the in-process RAM fallback.
- [x] Add finance cache hit/miss observability to AI traces, e.g. `finance_cache:miss:memory:summary:today...` and `finance_cache:hit:memory:summary:today...`, without exposing user identifiers in the cache label.
- [x] Keep voice hot context cheap by loading recent memory hints from SQL only at call start, reserving Qwen/Fireworks embedding for explicit `memory_search` tool calls, and preserving decimal finance values in voice HOT_FACTS.
- [x] Add monthly report `ai_trace` with route/tools/facts source/LLM/embedding/risk/token fields, render it in the report UI, and remove raw finance cache keys from user-visible report JSON.
- [x] Prevent monthly report fallback from calling Groq/LLM with model `backend` after token-limit exhaustion; backend fallback now stays zero-LLM and validates numeric output against semantic/server facts.
- [x] Replace the legacy `ai.compareMonths` LLM prompt/raw-expense path with deterministic semantic `finance.summary` calls, returning `trace` with `LLM=0`, `embedding=0`, numeric validation, and cost metrics.
- [x] Replace the legacy `ai.generateYearlyInsights` LLM prompt/raw yearly expense path with deterministic semantic `finance.summary`, `chart.data`, and `finance.breakdown`, including `trace`, numeric validation, and zero LLM/embedding cost.
- [x] Make `chat.sendMessage` use AI Kernel active whenever `ai_kernel_enabled=true`, ignoring the deprecated shadow-only primary flag; legacy chat is now only an explicit rollback via disabled kernel or `ai_kernel_legacy_fallback_enabled=true`.
- [x] Reduce `ai.parseExpense` and `ai.parseVoiceExpense` context cost by replacing full current-month expense loading with semantic `finance.summary`, removing unused `recentTransactions`, and logging parse/speech cost metrics with LLM/embedding counts.
- [x] Add `parser-trace.ts` so text and voice parsers return a unified trace in API responses/logs: route, tools, parsedBy, decision, confidence, LLM calls, embedding calls, token counts, STT cost, and finance context source.
- [x] Tighten memory reranking so generic plan/goal words do not outrank the specific subject in Qwen vector retrieval; verified `فاكر الخطة اللي اتكلمنا عنها عشان الموبايل؟` selects the mobile goal only with `embedding:fireworks`.
- [x] Render parser trace in `ExpenseForm` so expense text/voice QA can verify parser route, tools, provider, LLM calls, embedding calls, token counts, finance context source, and risk directly from the UI.
- [x] Guard monthly report prompts from raw transaction expansion: hard-cap individual transaction evidence to `4`, label it as `LIMITED_TRANSACTION_EVIDENCE`, and remove instructions asking the LLM to analyze every individual transaction.
- [x] Add explicit AI Kernel `retrievalPolicy` debug output and render it in chat traces so QA can see whether a turn used `fireworks_qwen`, intentionally skipped embeddings for SQL/chart facts, or used static local site-guide vectors.
- [x] Add the same `retrievalPolicy` contract to voice tool results and voice trace UI so voice finance questions show intentional embedding skip while voice memory search shows `fireworks_qwen` with vector row evidence.
- [x] Preserve memory-search embedding provenance on Redis cache hits by returning `memory_cache:hit` plus the original `embedding:fireworks` / `embedding:rows:*` trace instead of replacing it with a raw cache key.
- [x] Make retrieval policy treat `memory.search` as a semantic retrieval path even in mixed finance+memory questions, so QA does not misread those turns as SQL-only embedding skips.
- [x] Backfill the current active semantic memories after Fireworks configuration validation; local DB now has `23/23` active memory items with Qwen3 8B `768`-dimension vectors.
- [x] Add router-level regression coverage for text action confirmation/cancellation: `موافق` executes only the latest pending action in the same conversation, `إلغاء` cancels it, and confirmations do not cross conversation boundaries.
- [x] Run backend Unicode smoke for real Arabic questions across finance, memory, chart, and site help routes; verified narrow tools, token counts, retrieval policy, and zero LLM where deterministic facts are enough.
- [x] Re-test `/ai` with the browser runtime: quick finance action shows visible `ai-trace` with `LLM 0/embed 0`, saved memory conversation shows `retrieval=fireworks_qwen`, and voice tab reaches the expected microphone-permission state.
- [x] Add `api/services/ai-kernel/agent-contract.test.ts` as a unified active-kernel contract test for real Arabic finance, memory, chart, and site-guide questions; it verifies tool selection, retrieval policy, artifacts, and zero LLM calls.
- [x] Fix category scorer ambiguity fallback so no-signal text returns the full category set instead of only `متنوعات`, preserving classification safety when the input is unclear.
- [x] Fix explicit-currency amount extraction after duration words, e.g. `لعبت بلايستيشن ساعتين 80 جنيه` now keeps `80 جنيه` as a financial amount and classifies locally as `خروجات / PlayStation` without external AI.
- [x] Update finance period resolver regression tests to verify actual `startDate/endDate` while allowing user-facing Arabic labels such as `اليوم` and `الشهر الحالي`.
- [x] Run the full Vitest suite after the latest fixes: `57` test files and `336` tests passed, followed by a successful `npm run check`.
- [x] Browser central-agent QA matrix verified finance, category evidence, chart, site guide, memory, mixed advice+memory, action draft/cancel, report traces, and voice permission UI.
- [x] Fix category evidence display so a response that says five counted operations shows up to five supporting transaction rows instead of silently showing only three.
- [x] Browser-confirm a QA wallet action end to end, verify wallet row, executed pending action, audit logs, and action memory, then clean the exact QA rows.
- [x] Fix direct wallet/card action routing when the request includes an initial balance, so it traces as `action_request` rather than `finance_query`.
- [x] Guard voice prefetch so it resolves only hot structured facts and skips `memory.search` until the explicit voice `memory_search` tool call, preventing hidden Fireworks/Qwen embedding cost.
- [x] Add a production cache safety guard: missing Redis now reports `backend=disabled` and recomputes cacheable work instead of silently using process RAM; dev/test still use RAM fallback, and explicit production override requires `AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION=true`.
- [x] Add regression coverage for configured-but-unavailable Redis so a refused/down Redis connection uses bounded connect timeout, disables reconnect loops, cleans up the failed client, and falls back by policy instead of hanging AI/voice requests.
- [x] Make voice session state obey the same Redis/RAM/disabled cache policy; production without Redis no longer stores voice call state in process RAM silently.
- [x] Route `memory.search` through the shared cache wrapper so semantic memory retrieval traces include `memory_cache:miss|hit:<backend>` while preserving `embedding:fireworks` and vector row evidence.
- [x] Invalidate semantic memory cache after writing conversation memories and after confirmed actions insert `aiActionMemory`, so recall does not serve stale cached memories after chat/voice/action updates.
- [x] Avoid over-invalidating semantic memory cache for recall-only conversations that only write low-signal summaries, so repeated memory questions can stay at `embeddingCalls=0` with `embeddingApiStatus=semantic_result_cache_hit`.
- [x] Fix the chat trace fact ordering so finance summary traces show the expense count used in the response instead of showing all transaction count first and looking inconsistent.
- [x] Separate embedding retrieval provenance from real Fireworks API call accounting in chat, voice, router traces, and kernel logs so cache-hit memory turns show `embeddingCalls=0` while still showing the semantic source evidence.
- [x] Add explicit `embeddingApiStatus` to chat and voice traces (`fireworks_live_call`, `query_embedding_cache_hit`, `semantic_result_cache_hit`, `static_local`, `skipped`, fallback/disabled) so QA can explain Fireworks dashboard usage precisely.
- [x] Add dev-only `ai.runVoiceToolQa` plus UI query routing so browser QA can run real voice `finance_query`, `memory_search`, and safe `action_draft` tool paths without microphone input.
- [x] Fix the voice QA browser path for React StrictMode by using request ids, so dev cleanup cannot abort the first request and suppress the retry.
- [x] Add dev-only local token callback support for clean-port QA when Browser Use cannot type into login fields because its virtual clipboard is unavailable.
- [x] Enforce `voicePolicy.maxToolRounds` inside the live voice WebSocket before executing Gemini-requested retrieval/draft tools, returning a structured `voice_tool_limit_exceeded` response for extra calls instead of allowing unbounded tool loops, while still allowing `action_confirm` / `action_cancel` after explicit confirmation.
- [x] Scope Fireworks embedding Redis cache keys by both `userType` and `userId`, and pass `userType` from memory retrieval, memory writing, and backfill so cached query vectors cannot cross local/OAuth user namespaces.
- [x] Add LLM prompt guards so `advice_request` excludes transaction evidence entirely, and any non-advice LLM prompt can only include bounded transaction evidence instead of raw transaction expansion.
- [x] Add a boundary regression test proving Fireworks embeddings stay out of finance/transaction resolvers and are limited to memory/vector flows.
- [x] Add an AI Kernel numeric guard that blocks unsupported LLM financial numbers from reaching the user, replacing the response with facts-only safe content while recording the blocked numbers in `numericGuard`.
- [x] Bind direct action confirmation/cancellation to `conversationId` in the chat router, action runtime, and UI cards, so an action draft cannot be executed from another conversation or by a stray confirmation.
- [x] Convert the legacy `get_app_guide` tool from a raw Arabic text blob to a structured `site.guide.v1` contract with sections/steps, and cover it with the JSON envelope tool test.
- [x] Replace broken browser automation free-text typing with a dev-only `/ai?ai_qa_prompt=...&ai_qa_new=1` path that sends a real chat message through the UI/runtime without relying on the Browser Use virtual clipboard.
- [x] Add a dev-only daily-limit bypass for `/ai?ai_qa_prompt=...` so exhausted free QA accounts still emit AI traces during automated testing; production and normal user messages still enforce plan limits.
- [x] Add a matching dev-only dashboard expense QA path, `/dashboard?tab=record&expense_qa_text=...`, that drives the real `ai.parseExpense` parser route and exposes `parser-trace` without relying on textarea typing.
- [x] Add report QA routing (`ai_tab=report`, `report_qa_month`, `report_qa_compare_month`) and fix cached period date formatting so monthly comparison shows `compare-ai-trace` reliably even when finance summaries come from cache.
- [x] Version structured chat responses with `responseSchemaVersion=2` and mark loaded pre-version responses as `historicalStructuredResponse` in trace, so old saved artifacts are visibly separated from freshly generated results.
- [x] Add `docs/AI_CENTER_REDIS_SETUP.md` as an operational Redis runbook covering local Docker/WSL setup, production `REDIS_URL`, expected trace signals, and hit/miss verification.
- [x] Add `npm run test:redis` and `api/lib/redis-client.integration.test.ts` as a real Redis integration gate for production-style miss/hit/invalidation/runtime-status checks. Current machine fails the gate until Redis is actually running on `REDIS_URL`.
- [x] Add source/behavior guard coverage for dev-only QA paths: chat prompt, voice tool QA, dashboard expense QA, report QA, local-token callback, and production rejection/ignore behavior.
- [x] Add non-mic voice contract coverage proving the live WebSocket uses the shared voice kernel rather than legacy chat tools, and the voice prompt enforces smallest-tool-first, no invented numbers, draft-before-confirmation, and UI confirmation for high-risk actions.

## قواعد تنفيذ ثابتة

- [x] لا يتم إرسال raw transactions للموديل إلا كـ evidence محدود.
- [x] لا يتم embedding لكل transaction.
- [x] كل رقم مالي في رد LLM يجب أن يأتي من ResolvedFact.
- [x] كل action يحتاج server-side validation.
- [x] كل action medium/high يحتاج confirmation.
- [x] كل vector search للذاكرة الشخصية يجب يفلتر بـ userId/userType.
- [x] كل tool/capability يرجع JSON منظم.
- [x] كل مرحلة لا تعتبر مكتملة إلا بعد tests أو smoke verification مناسب.
