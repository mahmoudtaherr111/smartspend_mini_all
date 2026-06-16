# AI Center Phase 0 Baseline

التاريخ: 2026-06-15

هذا الملف يثبت حالة مركز الذكاء الاصطناعي قبل بدء إعادة البناء المعمارية. الهدف منه أن نعرف بوضوح ما الذي كان موجودا، وما الذي تم إصلاحه في مرحلة 0، وما الأخطاء المتبقية التي لا يجب خلطها مع مراحل التنفيذ القادمة.

## نتيجة `npm run check` قبل إصلاحات Phase 0

تم تشغيل:

```text
npm run check
```

والنتيجة فشلت. الأخطاء كانت في أربع مجموعات:

1. أخطاء شات مباشرة:
   - `api/chat-router.ts`: `conversationId` كان يعامل كأنه ممكن يكون `undefined` عند قراءة/حفظ الرسائل وتحديث المحادثة.
   - `api/services/ai-chat-service.ts`: استخدام `db` بدون import.
   - `api/services/ai-chat-service.ts`: قيم من `SmartUserProfile` نوعها `unknown` وكانت تسند مباشرة إلى string/number.

2. خطأ صوت مباشر:
   - `api/services/voice-call-service.ts`: أثناء tool calling، الكود كان يعمل `JSON.parse(resultString)` رغم أن `executeTool` يرجع غالبا نصا مضغوطا وليس JSON.

3. أخطاء AI قديمة أوسع:
   - `api/ai-router.ts`: typing الخاص بالـ provider/routing لا يستوعب `fireworks` في عدة مواضع.
   - `api/lib/smart-pipeline.ts`: أخطاء TypeScript في متغيرات/await/أنواع داخل pipeline.
   - `api/lib/test-local-rag.ts` وبعض `api/scripts/test-*`: ملفات تجريبية داخل include الخاص بالـ server TS تسبب أخطاء build.

4. ملاحظة مهمة:
   - أخطاء المجموعة الثالثة كانت أوسع من عوائق الشات والصوت، لكنها كانت تمنع تثبيت خط الأساس. تم إصلاحها ميكانيكيا في Phase 0 بدون تغيير معماري.

## نتيجة `npm run check` بعد إصلاحات Phase 0

تم تشغيل:

```text
npm run check
```

والنتيجة أصبحت ناجحة.

تم أيضا تشغيل اختبارات مستهدفة:

```text
npm test -- api/chat-router.phase0.test.ts api/services/voice-call-service.test.ts api/ai-router.test.ts api/lib/smart-pipeline.test.ts
```

والنتيجة:

```text
Test Files  4 passed (4)
Tests       10 passed (10)
```

## السلوك الحالي للشات

المسار الحالي:

```text
src/components/ai/AIChatbot.tsx
-> trpc.chat.sendMessage
-> api/chat-router.ts
-> api/services/ai-chat-service.ts
-> OpenAI-compatible chat completion
-> api/services/ai-chat-tools.ts
```

الخصائص الحالية:

- الشات text-only.
- يحفظ المحادثات في `chat_conversations`.
- يحفظ الرسائل في `chat_messages`.
- يبني system prompt من smart profile.
- يرسل آخر 6 رسائل فقط كـ sliding window.
- يترك الموديل يختار الأدوات من `TOOL_DEFINITIONS`.
- الأدوات ترجع نصا مضغوطا لتقليل التوكنز.
- لا يوجد AI Kernel.
- لا يوجد Data Need Compiler.
- لا يوجد structured response أو action confirmation cards.

## السلوك الحالي للصوت

المسار الحالي:

```text
src/hooks/useVoiceCall.ts
-> WebSocket /api/voice/live
-> api/services/voice-call-service.ts
-> Gemini Live API
```

الخصائص الحالية:

- المتصفح يحول الميكروفون إلى PCM 16k عبر AudioWorklet.
- backend يفتح WebSocket مع Gemini Live.
- Gemini يرجع PCM 24k للمتصفح.
- يتم بناء `voiceSystemPrompt` من ملخص مالي مبدئي.
- يستخدم نفس tool definitions الخاصة بالشات.
- كان يوجد خلل في parsing نتيجة الأدوات وتم إصلاحه في Phase 0.
- لا يوجد Redis voice session state حتى الآن.
- لا يوجد confirmation flow صوتي للأفعال.

## السلوك الحالي للتقارير الشهرية

المسار الحالي:

```text
src/components/ai/AIMonthlyReport.tsx
-> src/components/insights/AIInsights.tsx
-> api/ai-router.ts generateMonthlyInsights/getCachedMonthlyInsights
```

الخصائص الحالية:

- يوجد caching في `ai_summaries`.
- يوجد `monthlyBehaviorSnapshots`.
- التقرير يعمل كنظام منفصل نسبيا عن الشات والصوت.
- المطلوب في المراحل القادمة إدخاله تدريجيا تحت Finance Semantic Layer وAI Kernel.

## السلوك الحالي للأهداف

المسار الحالي:

```text
api/goals-router.ts
```

الخصائص الحالية:

- يدعم list/create/analyze/setStatus.
- لا يدعم AI action draft.
- لا يدعم pending confirmation.
- لا يوجد audit log للأفعال الصادرة من AI.
- `goal.create` سيكون أول action ننقله إلى Action Runtime في مرحلة لاحقة.

## إصلاحات Phase 0 التي تمت

- تم جعل `conversationId` في `chat-router.ts` رقما مضمونا بعد إنشاء المحادثة.
- تم إضافة import للـ `db` في `ai-chat-service.ts`.
- تم تحويل قيم profile غير المضمونة إلى string/number آمنين.
- تم إضافة `normalizeVoiceToolResponse` في `voice-call-service.ts` لمنع كسر Gemini tool response مع النص المضغوط.
- تم إضافة قراءة feature flag باسم `ai_kernel_enabled` من `systemSettings` بدون تغيير مسار الشات الحالي.
- تم إضافة smoke tests للشات والصوت.
- تم توسيع typing الخاص بالـ routing ليستوعب `fireworks` بشكل متسق.
- تم إصلاح أخطاء TypeScript الميكانيكية في `smart-pipeline.ts`.
- تم استبعاد سكربتات التشخيص من server TypeScript build لأنها ليست production code ولا tests رسمية.

## ما لم يتم تغييره عمدا

- لم يتم بناء AI Kernel في Phase 0.
- لم يتم تغيير tools الحالية جذريا.
- لم يتم إدخال embeddings.
- لم يتم إدخال Redis session state.
- لم يتم تعديل نظام التقارير أو الأهداف.
- لم يتم تغيير منطق التصنيف أو routing بشكل معماري؛ التغييرات هنا كانت لتثبيت build وخط الأساس فقط.
