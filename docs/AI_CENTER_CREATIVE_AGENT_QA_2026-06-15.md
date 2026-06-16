# Creative Agent QA - 2026-06-15

الاختبار تم كمستخدم مصري حقيقي داخل مسار `chat.sendMessage` ثم فتح النتائج في `/ai`.

## سيناريوهات مختبرة

- مستخدم جديد يسأل عن صرف اليوم، الأكل، وتصنيف كارفور.
- مستخدم يطلب ذاكرة هدف الكاميرا/الموبايل ثم ينشئ هدف لابتوب ويؤكد نصيا.
- مستخدم يطلب رسم للأكل والمواصلات، شرح SMS، ونصيحة استثمار.
- مستخدم يطلب تسجيل مصروف قهوة ثم خطة أسبوع لتقليل القهوة والنوم أفضل.

## نتائج جيدة

- سؤال صرف اليوم deterministic: `finance.summary`, `llmCalls=0`, حوالي `123` token.
- سؤال الأكل مع evidence جيد: `finance.category_total + finance.transactions`, `llmCalls=0`, وذكر العمليات.
- ذاكرة الكاميرا/الموبايل استخدمت Fireworks embeddings فعليا: `embedding:query_embedded`, `embedding:fireworks`, `embedding:rows:9`.
- شرح ربط SMS رجع من `site_guide.search` مع text artifacts وبدون LLM.
- الرسم ظهر في الواجهة كـ Recharts artifact.

## مشاكل حرجة

### P0 - الإيجنت ادعى تنفيذ مصروف لم يحدث

السؤال:

```text
سجل عندك 45 جنيه قهوة من ستاربكس دلوقتي، ولو محتاج تأكيد اسألني.
```

الرد:

```text
تم تسجيل 45 جنيه مصروف قهوة من ستاربكس...
```

الواقع:

- لا يوجد `expense.create` action.
- لا يوجد action artifact.
- فحص DB على user `27/local` لم يجد أي expense بقيمة `45.00`.

الاستنتاج: نحتاج action guard يمنع أي رد بصيغة "تم/سجلت/عدلت" إلا لو السيرفر نفذ action فعلا أو رجع pending action واضح.

### P0 - تأكيد الهدف نصيا لا ينفذ

بعد إنشاء مسودة هدف:

```text
موافق، اعمل الهدف دلوقتي.
```

النتيجة:

- pending action `id=10` ظل `pending_confirmation`.
- لا يوجد goal جديد للابتوب.
- الرد طلب الضغط على تأكيد مرة أخرى.

الاستنتاج: النص العربي "موافق/أكد/اعمل" لا يرتبط بـ pending action الحالي. نحتاج `action.confirm` intent يقرأ آخر pending action في conversation/session.

### P1 - طلب استثمار عملي يتصنف unknown

السؤال:

```text
لو فاض معايا 5000 جنيه الشهر ده أستثمرهم في إيه؟
```

النتيجة:

- route = `unknown`
- الرد طلب توضيح بدلا من نصيحة مالية آمنة.

الاستنتاج: نحتاج intent واضح لـ `financial_advice`/`investment_guidance` مع قيود سلامة، واستخدام facts مثل الدخل، الصافي، الطوارئ، الأهداف.

### P1 - خطة القهوة والنوم اتفهمت كسؤال إجمالي أكل

السؤال:

```text
أنا بصرف كتير على القهوة عشان بنام متأخر، ساعدني بخطة أسبوع تقلل الصرف والنوم يبقى أحسن.
```

الرد:

```text
إجمالي صرفك على الأكل هو ٥٥٠٫٥ جنيه...
```

الاستنتاج: نحتاج intent لـ `budget_habit_plan` يدمج spending facts + plan generation، وليس `finance.category_total` فقط.

### P1 - follow-up تصنيف كارفور مكلف ومضلل

السؤال:

```text
كارفور الخضار واللحمة اتحسب أكل ولا تسوق؟ ولو غلط أعمل إيه؟
```

المشكلة:

- route خرج `action_request` بدل `transactions.evidence` أو `classification_explain`.
- استهلك حوالي `2187` token.
- قال "لو عاوزني أعدلها لك" رغم عدم وجود transaction update action.

### P1 - الرسم متعدد الفئات يفقد جزءا من الطلب

السؤال:

```text
ارسملي صرف الأكل والمواصلات آخر 6 شهور في رسم واحد.
```

الواقع:

- artifact chart ظهر.
- لكن `scope.category = food` فقط.
- `series` فيها سلسلة واحدة فقط.
- المواصلات اختفت من الرسم.

الاستنتاج: نحتاج `chart.data` يدعم multi-category / multi-series.

## مشاكل تكلفة ومراقبة

- goal draft استخدم حوالي `2932` token.
- رسالة التأكيد النصي استخدمت حوالي `2861` token رغم أنها كان يجب أن تكون action confirm رخيص.
- تسجيل القهوة الوهمي استخدم حوالي `1800` token.
- بعض سجلات cost تظهر `maxOutputTokens=900` لكن `outputTokens` أعلى بكثير، ما يشير إلى أن الحد غير مفروض بصرامة أو أن الحساب غير دقيق.

## مشاكل جودة أقل حدة

- رد الذاكرة صحيح تقنيا لكنه خام ومكرر، ويعرض ذكريات عربية عامة بعد سؤال محدد عن كاميرا/موبايل.
- رد "صرفت كام امبارح" صحيح رقميا لكنه يقول الدخل والصافي 0؛ الأفضل: "مفيش مصاريف مسجلة امبارح".
- عنوان الرسم عام "رسم المصاريف شهري" ولا يوضح أن المطلوب كان أكل ومواصلات.

## أولويات الإصلاح المقترحة

1. Action truth guard: ممنوع أي claim تنفيذ بدون action result.
2. Text confirmation resolver: "موافق/أكد/نفذ" يربط بآخر pending action.
3. إضافة `expense.create` draft/action أو رد صريح: "أقدر أجهز مسودة فقط".
4. Intents جديدة: `investment_guidance`, `budget_habit_plan`, `classification_explain`, `multi_category_chart`.
5. Multi-series chart contract.
6. Enforce output token cap فعليا.
7. تحسين memory answer summarization/reranking.
