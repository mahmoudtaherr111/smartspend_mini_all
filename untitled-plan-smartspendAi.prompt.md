## Plan: فحص وتشخيص تشغيل المشروع واتصال قاعدة البيانات

TL;DR
- سأقوم بفحص بنيوي معياري للمشروع (ملفات الخادم، تكوين Vite/Hono، إعدادات trpc، تكوين Drizzle/DB)،
  ثم خطوات تشغيلية لإعادة إنتاج المشكلة، واختبارات اتصال قاعدة البيانات، وقائمة إصلاحات مرتبة بالأولوية.

**Steps**
1. Discovery — قراءة ثابتة لكل الملفات ذات الصلة (no edits).
   - تحقق من: `api/boot.ts`, كل ملفات الراوتر في `api/` (مثل `router.ts`, `auth-router.ts`, `local-auth-router.ts`, `seo-router.ts`, `pro-router.ts`), ملفات trpc (مزود/عميل) في `src/providers/`, إعدادات DB في `drizzle.config.ts` وملفات `db/` (`schema.ts`, `seed.ts`, `migrations/`).
   - أهداف القراءة: (أ) تأكيد مسار الإدخال (`entry`) المستخدم من قبل Hono dev server ووجود/تسجيل الراوترات، (ب) تطابق مسارات الـtrpc (`/trpc` vs `/api/trpc`) بين السيرفر والعميل، (ج) توافق نوع محرك قاعدة البيانات في `drizzle.config.ts` مع `DATABASE_URL`، (د) البحث عن أي `JSON.parse` أو ملفات JSON تالفة (مثل `components.json` أو ملفات `db/migrations/meta/*.json`) التي تعطي رسالة الخطأ "Unexpected non-whitespace character after JSON...".

2. Reproduce & capture — توجيهات تشغيل لجمع سجلات كاملة:
   - شغّل الخادم المحلي: `npm run dev` ثم احفظ سجل التيرمنال بالكامل (كل الأخطاء/stack traces).
   - تأكد من إجراء طلب يدوي إلى نقطة بسيطة لمعرفة الحالة: افتح `http://localhost:3000/api/trpc/seo.getPage?...` أو اطلب `/api/trpc` المناسب.
   - شغّل اختبار اتصال قاعدة بيانات قصير من التيرمنال باستخدام `mysql2` للتأكد أن `DATABASE_URL` فعّال.

3. تحليل 404 في الواجهات `/api/trpc/*`:
   - افتح `api/boot.ts` وتأكد من أن التطبيق (Hono) يقوم بتسجيل الراوتر العام وأنه متاح على الباث المتوقع (`/api/*` أو `/trpc`).
   - تأكد من أن `vite.config.ts`، خاصّة `devServer({ entry: 'api/boot.ts', exclude: [...] })`، تسمح بتمرير طلبات `/api` إلى التطبيق — سنبحث عن أخطاء تطابق الباث أو استثناءات وقت التشغيل تمنع التسجيل.
   - راجع `src/providers/trpc.ts` أو `src/providers/trpc.tsx` للتأكد أن `trpcClient` يستهدف نفس الباث (مثلاً `/api/trpc`).

4. فحص اتصال قاعدة البيانات وDrizzle:
   - افتح `drizzle.config.ts` وتحقق من المحرك (driver) والإعدادات؛ تأكد أنه متوافق مع `mysql://...` الموجود في `.env` (أو غيره).
   - شغّل الاختبار السريع: 

```bash
node -e "require('dotenv').config(); (async()=>{const mysql=require('mysql2/promise'); const c=await mysql.createConnection(process.env.DATABASE_URL); console.log('DB OK'); await c.end();})().catch(e=>console.error(e));"
```

   — إذا نجح، فالمشكلة في تهيئة التطبيق/ORM، وإذا فشل فراجع خدمة MySQL (هل هي قيد التشغيل، بيانات الاعتماد، منفذ، host=127.0.0.1 vs localhost).
   - إذا نجح الاتصال الخام لكن التطبيق لا يكتب/يقرأ، تحقق من: كود تهيئة Drizzle/ORM (كيف تُنشأ الجلسة/العميل)، وإن كانت الـmigrations مرفوعة (`npm run db:migrate`) وهل الجداول المطلوبة موجودة.

5. تحديد مصدر رسالة الخطأ JSON: "Unexpected non-whitespace character after JSON..."
   - ابحث عن `JSON.parse(` في الكود، وافتح ملفات JSON الموجودة في الجذر أو في `db/migrations/meta/` أو `components.json` لتأكيد صلاحيتها.
   - إذا الخطأ ظهر عند طلب HTTP، قد يكون السيرفر يُرجع HTML/خطأ بدلاً من JSON — احصل على body الاستجابة الكاملة من الطلب الذي أدى للخطأ.

6. توثيق الأخطاء وإعداد قائمة إصلاحات مرتبة بالأولوية
   - بعد جمع الأدلة، سأصنف الأخطاء إلى: blocker (يمنع التشغيل كلياً)، major (يمنع وظائف أساسية مثل auth/DB)، minor (تحسينات/تنبيهات). سأقترح تغييرات محددة لكل بند (تعديل مسار، إصلاح تهيئة Drizzle، ضبط .env، أو تشغيل الميجرِيشِنز).

7. (اختياري بعد موافقتك) اقتراح تغييرات/باتشات صغيرة قابلة للتطبيق وإرشادات اختبار بعد كل تغيير.

**Relevant files**
- [api/boot.ts](api/boot.ts) — نقطة الإدخال للخادم؛ افحص تسجيل الراوترات وإجراءات التهيئة.
- [api/router.ts](api/router.ts) — تجميع الراوترات (إن وُجد).
- [api/auth-router.ts](api/auth-router.ts), [api/local-auth-router.ts](api/local-auth-router.ts), [api/seo-router.ts](api/seo-router.ts) — نقاط النهاية التي تظهر كـ404 في السجل.
- [src/providers/trpc.ts](src/providers/trpc.ts) and [src/providers/trpc.tsx](src/providers/trpc.tsx) — تحقق من `trpcClient` base URL.
- [drizzle.config.ts](drizzle.config.ts) — تكوين Drizzle/ORM.
- [db/schema.ts](db/schema.ts), [db/seed.ts](db/seed.ts), [db/migrations](db/migrations/) — تحقق من وجود الجداول والملفات.
- [vite.config.ts](vite.config.ts) — إعداد `@hono/vite-dev-server` و`entry` و`exclude`.
- [package.json](package.json) — سكربتات dev/build/start ونسخ الحزم.
- [.env](.env) — قيم `DATABASE_URL` وبيانات حسّاسة.

**Verification**
1. بعد الإصلاح، `npm run dev` يبدأ بدون 404 على نقاط `/api/trpc/*` الأساسية؛ أول اختبار: الوصول إلى `seo.getPage` يرجع 200.
2. اختبار اتصال DB الخام يطبع `DB OK` عند التشغيل التجريبي.
3. `npm run db:migrate` ينجح وتظهر الجداول الأساسية (`users`, `sessions`, `expenses`، حسب schema).

**Decisions & Assumptions**
- أفترض أن MySQL يعمل محليًا على `localhost:3306` وأن بيانات الاعتماد في `.env` صحيحة (أنت أظهرت أن `DATABASE_URL` مُحمّل).
- أفترض أن Hono/Vite dev plugin يُفترض أن يخدم مسارات `api/*` من `api/boot.ts` (حسب `vite.config.ts`).
- لن أعدل الشيفرة قبل إذنك؛ الخطة تشتمل على خطوات مسح وتشخيص واضحة ثم اقتراح باتشات.

**Further Considerations**
1. أريد إذنك لبدء المَرحلة الأولى (Discovery): أقرأ كل ملفات الخادم ذات الصلة وأخرج قائمة مشاكل مفصّلة مع خطوط ملف/وظيفة. هل أبدأ الآن؟ (نعم/لا/فقط قاعدة البيانات)
2. إذا وافقت، سأطلب منك نتائج تشغيل `npm run dev` كاملة ونتائج اختبار الاتصال بالـDB (خطأ كامل إن وُجد) — هذه السجلات تُسرّع التشخيص كثيرًا.
3. إذا تفضّل، أستطيع توليد باتشات صغيرة (إضافة logs أو إصلاحات مسارات) لكن سأحتاج موافقتك قبل كتابة أي ملفات.
