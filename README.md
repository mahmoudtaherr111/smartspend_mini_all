# SmartSpend AI — نظام إدارة المصاريف الذكي

SmartSpend هو تطبيق ويب متكامل لإدارة المصاريف الشخصية بالذكاء الاصطناعي، مصمم خصيصاً للمستخدم المصري. يدعم الإدخال بالعامية المصرية (نص + صوت)، ويصنف المصاريف تلقائياً باستخدام pipeline هجين متعدد الطبقات (Rule Engine → Embedding → LLM). يتضمن نظام اشتراكات (Free/Pro/Ultra)، لوحة إدارة كاملة، تقارير مالية شهرية ذكية مخصصة لكل مستخدم، ونظام onboarding تكيفي.

**Tech Stack:** React 18 + TypeScript + Vite (Frontend) | Hono + tRPC + Drizzle ORM + MySQL (Backend) | Gemini API (AI)

---

## بنية المشروع (Project Structure)

```
smartspend_V1_fixed/
├── api/                    # الـ Backend بالكامل (Hono + tRPC)
│   ├── lib/                # المكتبات الداخلية (AI، NLP، Classification)
│   ├── services/           # خدمات الأعمال (Profile، Behavior، Reports)
│   └── queries/            # اتصال قاعدة البيانات
├── src/                    # الـ Frontend بالكامل (React + Vite)
│   ├── components/         # مكونات واجهة المستخدم
│   ├── pages/              # صفحات التطبيق
│   ├── hooks/              # React Hooks مخصصة
│   ├── providers/          # Context Providers (tRPC)
│   └── lib/                # أدوات مساعدة (utils)
├── db/                     # تعريف قاعدة البيانات (Drizzle Schema)
├── contracts/              # ثوابت وأنواع مشتركة بين Frontend و Backend
├── scripts/                # سكريبتات الترحيل (Migrations)
└── package.json            # تعريف المشروع والتبعيات
```

---

## ملفات الـ Backend (`api/`)

### `api/boot.ts` — نقطة دخول السيرفر (Monorepo Mode)
- يُستخدم عند تشغيل المشروع بـ `vite` (Frontend + Backend معاً).
- ينشئ سيرفر Hono مع CORS، error handling، Google OAuth callback، و tRPC endpoint.
- يُصدّر `fetch` function لـ Vite dev server.
- **يرتبط بـ:** `router.ts`، `context.ts`، `lib/env.ts`.

### `api/server.ts` — نقطة دخول السيرفر (Standalone Mode)
- يُستخدم عند نشر الـ Backend بشكل مستقل (`npm run backend:dev`).
- نفس منطق `boot.ts` لكن مع `serve()` من `@hono/node-server`.
- يدعم `FRONTEND_URL` منفصل عن `APP_URL`.

### `api/router.ts` — المجمع الرئيسي للـ Routes
- يجمع كل الـ routers الفرعية تحت `appRouter` واحد.
- يُصدّر `AppRouter` type الذي يستخدمه الـ Frontend لعمل type-safe API calls.
- **Sub-routers:** auth, localAuth, expense, ai, analytics, admin, support, export, session, pro, ads, referral, seo, profile.

### `api/context.ts` — tRPC Context (المصادقة)
- يستخرج المستخدم من الـ request (Google OAuth cookie أو Bearer token).
- يتحقق من صلاحية الـ JWT ويبحث في الـ DB عن المستخدم.
- يُرجع `UnifiedUser` object موحد لـ OAuth و Local users.
- **يرتبط بـ:** `lib/env.ts`، `db/schema.ts`.

### `api/middleware.ts` — tRPC Middleware (الصلاحيات + Rate Limiting)
- يعرّف مستويات الصلاحيات: `publicProcedure`، `authedProcedure`، `adminProcedure`، `proProcedure`، `ultraProcedure`.
- يتضمن rate limiting لكل مستخدم (100 req/min) ولكل IP (400 req/min).
- **يرتبط بـ:** `context.ts`، `lib/rate-limit.ts`.

### `api/ai-router.ts` — محرك الذكاء الاصطناعي (أكبر ملف)
**هذا هو قلب التطبيق.** يحتوي على:
1. **`parseExpense`**: يأخذ نص عامية مصرية → يمرره عبر الـ classification pipeline → يُرجع معاملات مصنفة.
2. **`speechToText`**: يستقبل audio base64 → يحوله لنص عبر Gemini multimodal → يتحقق من حدود الصوت الشهرية.
3. **`generateMonthlyInsights`**: ينشئ تقرير مالي شهري ذكي مخصص. يحسب الإحصائيات في الـ Backend ثم يرسلها لـ Gemini لتوليد تحليل مفصل. يتضمن:
   - نظام rate limiting للتقارير حسب الخطة (Free: كل 30 يوم، Pro: كل 14 يوم).
   - حسابات backend: categories breakdown، subcategories، daily average، financial personality.
   - تكامل مع Smart Profile لتخصيص التقرير لكل مستخدم.
   - fallback ذكي في حالة فشل الـ AI (يولد تقرير من الـ backend).
   - حفظ behavior snapshot للتعلم المستمر.
4. **`compareMonths`**: مقارنة بين شهرين.
5. **`generateYearlyInsights`**: تحليل سنوي.
6. **`getUserLimits`**: يُرجع حدود الصوت والـ AI للمستخدم.
7. **`learnWord`**: يحفظ كلمة جديدة في قاموس المستخدم الشخصي.
- **الدوال المساعدة:** `getAiClient()` (يحدد الموديل والحدود حسب الخطة)، `hybridParse()` (parser محلي بدون AI)، `aiParse()` (يستخدم Gemini)، `trackTokens()`.
- **يرتبط بـ:** `lib/classification-pipeline.ts`، `lib/ai-classifier.ts`، `services/user-profile-service.ts`، `services/lifestyle-inference-engine.ts`، `services/report-personalization-engine.ts`.

### `api/expense-router.ts` — إدارة المصاريف (CRUD)
- عمليات إنشاء، قراءة، تحديث، حذف المصاريف.
- **`getMonthlyStats`**: إحصائيات شهرية تفصيلية تتضمن: category breakdown، subcategory breakdown، daily trend، hourly trend، weekly breakdown، day-of-week trend، recurring detection، comparative analysis مع الشهر السابق.
- **`getYearlyStats`**: إحصائيات سنوية مع بيانات شهرية.
- **`getCategoryList`** / **`createCategory`**: إدارة الفئات المخصصة.

### `api/admin-router.ts` — لوحة الإدارة
- إدارة المستخدمين (ترقية/تنزيل الخطط، تعيين الأدوار).
- إحصائيات النظام (عدد المستخدمين، المصاريف، التوكنز).
- إعدادات النظام (AI models، token limits، voice limits، report settings).
- إدارة أكواد الخصم.
- **محمي بـ:** `adminProcedure`.

### `api/auth-router.ts` — مصادقة Google OAuth
- يولد رابط Google login.
- يعالج الـ callback ويُنشئ/يحدث المستخدم في الـ DB.
- يُصدر JWT token.

### `api/local-auth-router.ts` — مصادقة محلية (رقم الهاتف)
- تسجيل حساب جديد (رقم هاتف + كلمة مرور).
- تسجيل دخول + إنشاء session.
- تغيير كلمة المرور.
- **يستخدم:** `bcryptjs` لتشفير كلمات المرور.

### `api/profile-router.ts` — إدارة الملف الشخصي الذكي
- `getSmartProfile` / `updateSmartProfile`: قراءة وتحديث الملف الشخصي المُهيكل.
- `saveOnboardingAnswers`: حفظ إجابات الـ onboarding التكيفي.
- `getNextQuestion`: يُرجع السؤال التالي في سلسلة الـ onboarding بناءً على الإجابات السابقة.
- **يرتبط بـ:** `services/user-profile-service.ts`، `services/adaptive-question-engine.ts`.

### `api/pro-router.ts` — نظام الاشتراكات
- ترقية الخطة (مع محاكاة للتطوير أو Paymob checkout).
- التحقق من حالة الاشتراك.

### `api/analytics-router.ts` — التحليلات
- تسجيل أحداث المستخدم (login، page_view، expense_create).

### `api/support-router.ts` — نظام الدعم الفني
- إنشاء تذاكر دعم + الرد عليها (من الأدمن).

### `api/session-router.ts` — إدارة الجلسات
- عرض الجلسات النشطة + إنهاء جلسة.

### `api/export-router.ts` — تصدير البيانات
- تصدير المصاريف كـ JSON أو CSV.

### `api/ads-router.ts` — نظام الإعلانات
- عرض الإعلانات النشطة + تسجيل النقرات.

### `api/referral-router.ts` — نظام الإحالات
- إنشاء أكواد إحالة + تتبع المُحالين.

### `api/seo-router.ts` — SEO
- بيانات SEO ديناميكية لكل صفحة.

---

## مكتبات الـ Backend (`api/lib/`)

### `api/lib/classification-pipeline.ts` — خط أنابيب التصنيف (Pipeline Orchestrator)
**المنسق الرئيسي** الذي يدير تدفق التصنيف بالكامل:
1. **Step 1**: Text Normalization (تحويل العامية لنص موحد).
2. **Step 2**: Entity Extraction (استخراج المبالغ، الأشخاص، التجار).
3. **Step 3-4**: Rule Engine (تصنيف سريع بدون AI).
4. **Step 4.5**: Embedding Engine (تصنيف دلالي بـ text-embedding-004).
5. **Step 5**: AI Classification (Gemini LLM للحالات المعقدة).
6. **Step 5.5**: Date Hints (تطبيق إشارات التاريخ مثل "امبارح").
7. **Step 6-7**: Confidence Scoring + Decision (auto_save/review/clarify).
- **القرار:** إذا نجح Rule Engine → لا حاجة لـ AI. إذا فشل → يجرب Embedding. إذا فشل → يستخدم LLM.
- **يرتبط بـ:** جميع ملفات `lib/`.

### `api/lib/text-normalizer.ts` — معالج النصوص (Step 1)
- يحول الأرقام العربية-الهندية (٠١٢) لأرقام غربية (012).
- يحول الأرقام المكتوبة بالكلمات ("خمسمية" → 500).
- ينظف الحروف العربية (همزات، تاء مربوطة).
- يعالج التعبيرات العامية ("نص ألف" → 500).

### `api/lib/entity-extractor.ts` — مستخرج الكيانات (Step 2)
- يستخرج المبالغ المالية من النص مع مواقعها.
- يكتشف أسماء الأشخاص ("حولت لأحمد").
- يكتشف التجار (ماكدونالدز، أوبر، نتفلكس...).
- يكتشف الأماكن وطرق الدفع وإشارات التاريخ.
- يحدد هل النص يتضمن معاملات متعددة.

### `api/lib/intent-detector.ts` — كاشف النية (Step 3)
- يحدد نوع المعاملة: income vs expense vs transfer.
- يستخدم كلمات مفتاحية قوية وضعيفة لتسجيل نقاط لكل نوع.

### `api/lib/rule-engine.ts` — محرك القواعد (Step 4)
- يصنف المعاملات بدون AI باستخدام:
  1. قاموس المستخدم الشخصي (أعلى أولوية).
  2. Taxonomy Adapter (مطابقة هيكلية).
  3. خريطة الفئات الفرعية (170+ كلمة مفتاحية).
  4. القاموس العام المصري.
  5. Fuzzy matching (للأخطاء الإملائية).
- يحدد هل النص "بسيط" (يكفي Rule Engine) أو "معقد" (يحتاج AI).
- يطبق hints من ملف المستخدم الشخصي (أطفال → تعليم، عائلة → بقالة).

### `api/lib/embedding-engine.ts` — محرك التضمين (Step 4.5)
- يستخدم Gemini `text-embedding-004` للمطابقة الدلالية.
- يحتوي على 19+ فئة مع descriptors عربية لكل فئة.
- يحسب complexity score متعدد الأبعاد (text length، word count، conjunctions...).
- يستخدم LRU Cache لتجنب API calls متكررة.
- يحسب cosine similarity مع margin-based calibration.
- **القرار:** إذا complexity < 35 وconfidence ≥ 80 → يكفي بدون LLM.

### `api/lib/ai-classifier.ts` — مصنف الذكاء الاصطناعي (Step 5)
- يستخدم Gemini (Flash/Pro) مع system prompt مصمم خصيصاً للتصنيف المالي المصري.
- يدعم failover بين مفتاحين API.
- يتضمن 3 استراتيجيات لتحليل الرد JSON (direct parse، regex extract، progressive trim).
- يتضمن أيضاً `geminiSpeechToText()` للتحويل الصوتي.

### `api/lib/confidence-scorer.ts` — مسجل الثقة (Step 6)
- يعدّل نسب الثقة بناءً على سياقات ذكية:
  - "متنوعات" → يخفض الثقة.
  - مبالغ كبيرة في فئة أكل → يخفض الثقة.
  - مبالغ صغيرة في فئة أكل → يرفع الثقة.
- يولد أسئلة توضيحية ذكية عند الحاجة.
- يحدد القرار النهائي: `auto_save` | `review` | `clarify`.

### `api/lib/category-registry.ts` — سجل الفئات
- يعرّف كل الفئات والفئات الفرعية مع أيقوناتها وألوانها.
- **المصدر الوحيد للحقيقة** لأسماء الفئات في النظام.

### `api/lib/egyptian-dictionary.ts` — القاموس المصري
- 400+ كلمة عامية مصرية مربوطة بفئات مالية.
- قوائم كلمات الدخل والمصروف (قوية وضعيفة).

### `api/lib/taxonomy-adapter.ts` — محول التصنيف
- يبحث عن تطابقات في الفئات الفرعية من `category-registry`.
- يدعم synonyms والـ prefix matching.

### `api/lib/fuzzy-match.ts` — المطابقة الضبابية
- Levenshtein distance للتعامل مع الأخطاء الإملائية.

### `api/lib/env.ts` — متغيرات البيئة
- يعرّف ويتحقق من كل متغيرات البيئة المطلوبة باستخدام Zod.

### `api/lib/rate-limit.ts` — معدل الطلبات
- Rate limiter بسيط in-memory.

### `api/lib/get-client-ip.ts` — استخراج IP العميل
- يستخرج الـ IP من proxy headers.

### `api/lib/paymob.ts` — تكامل Paymob
- Placeholder لبوابة الدفع (غير مفعل حالياً).

### `api/lib/subscription-service.ts` — خدمة الاشتراكات
- أدوات مساعدة لإدارة الاشتراكات.

---

## خدمات الأعمال (`api/services/`)

### `api/services/user-profile-service.ts` — خدمة الملف الشخصي الذكي
- يدير Smart Profile V2 المُهيكل (basicInfo، financialInfo، lifestyleInfo، onboarding، AI-inferred).
- `getSmartProfile()`: يقرأ الملف الشخصي مع fallback للـ legacy schema.
- `saveSmartProfile()`: يحفظ/يحدث مع ON DUPLICATE KEY UPDATE.
- `summarizeProfileForAI()`: يحول الملف الشخصي لنص مختصر لإرساله مع prompt الـ AI.
- `recordProfileLearningEvent()`: يسجل كل تعلم جديد في audit trail.

### `api/services/lifestyle-inference-engine.ts` — محرك استنتاج أنماط الحياة
- `buildBehaviorSnapshot()`: يحلل المعاملات ويستخلص:
  - Top categories & subcategories.
  - Daily & weekday spending patterns.
  - Financial stability assessment (stable/watch/pressure).
  - Spending behavior detection (planned/spiky/emotional/concentrated).
  - Month-over-month change.
  - Expense-to-income ratio.

### `api/services/report-personalization-engine.ts` — محرك تخصيص التقارير
- `buildReportPersonalizationContext()`: يبني سياق تخصيص غني يُضاف لـ AI prompt. يتضمن: المهنة، العمر، الدخل، الهدف المالي، نمط الصرف، حالة السكن، الأطفال، الديون، الادخار.
- `buildBackendPersonalizedInsights()`: يولد alerts ذكية و saving opportunities بناءً على البيانات.

### `api/services/adaptive-question-engine.ts` — محرك الأسئلة التكيفي
- يدير 19 سؤال onboarding بترتيب ذكي.
- يتخطى الأسئلة غير المناسبة (مثلاً: لا يسأل عن الأطفال إذا عمره < 22).

---

## قاعدة البيانات (`db/`)

### `db/schema.ts` — تعريف الجداول (Drizzle ORM)
يعرّف 18 جدول MySQL:
- `users` / `local_users`: مستخدمين OAuth و محليين.
- `expenses`: المصاريف والدخل.
- `expense_categories`: فئات مخصصة.
- `sessions`: جلسات المصادقة.
- `ai_summaries`: نتائج الـ AI المحفوظة (cache).
- `classification_logs`: سجل تصنيفات مفصل (للتدقيق).
- `user_profiles`: الملف الشخصي الذكي (V2).
- `user_dictionaries`: قاموس المستخدم الشخصي.
- `voice_usage`: تتبع استخدام الصوت الشهري.
- `monthly_behavior_snapshots`: لقطات السلوك الشهرية.
- `profile_learning_events`: سجل تعلم الـ AI.
- `system_settings`: إعدادات النظام (key-value).
- `pro_subscriptions`، `support_tickets`، `ads`، `referrals`، `discount_codes`، `seo_pages`.

### `db/relations.ts` — العلاقات بين الجداول
- يعرّف العلاقات لـ Drizzle ORM query builder.

### `db/migrations/` — ملفات الترحيل

---

## الـ Frontend (`src/`)

### `src/main.tsx` — نقطة الدخول
- يُنشئ React root مع tRPC Provider و QueryClient و HelmetProvider.

### `src/App.tsx` — التوجيه (Routing)
- يعرّف كل الـ routes (Dashboard، Login، Admin، Settings، Pro...).
- يتضمن Auth guard و onboarding check.

### `src/providers/trpc.ts` — tRPC Client
- يُنشئ tRPC client مع httpBatchLink.
- يربط الـ Frontend بالـ Backend بشكل type-safe.

### `src/hooks/`
- `useAuth.ts`: إدارة المصادقة (login، logout، token refresh).
- `useAdmin.ts`: التحقق من صلاحية الأدمن.
- `usePro.ts`: التحقق من خطة الاشتراك.
- `useAds.ts`: جلب الإعلانات.
- `useSessionTracker.ts`: تتبع الجلسات.
- `use-mobile.ts`: كشف الأجهزة المحمولة.

### `src/pages/`
- `Home.tsx`: الداشبورد الرئيسي (إدخال مصاريف + إحصائيات).
- `Admin.tsx`: لوحة الإدارة الكاملة.
- `Login.tsx`: صفحة تسجيل الدخول (Google OAuth + Local).
- `Landing.tsx`: صفحة الهبوط.
- `Pro.tsx`: صفحة الاشتراكات.
- `Settings.tsx`: إعدادات المستخدم.
- `Support.tsx`: الدعم الفني.

### `src/components/`
- `expenses/ExpenseForm.tsx`: فورم إدخال المصاريف (نص + صوت + AI).
- `expenses/RecentExpenses.tsx`: قائمة المصاريف الأخيرة.
- `dashboard/ExpenseChart.tsx`: الرسوم البيانية.
- `dashboard/MonthlyStats.tsx`: إحصائيات شهرية.
- `insights/AIInsights.tsx`: عرض التقارير الذكية.
- `profile/SmartProfileView.tsx` + `SmartProfileSettings.tsx`: الملف الشخصي.
- `OnboardingCard.tsx`: بطاقة الـ onboarding التكيفي.
- `Sidebar.tsx`: القائمة الجانبية.
- `ui/`: 53 مكون UI (Radix UI + shadcn/ui).

---

## الملفات المشتركة (`contracts/`)

### `contracts/constants.ts`
- `ExpenseInputLimits`: حدود الإدخال المشتركة (أقصى طول نص، أقصى مبلغ...).
- `Session`: إعدادات الجلسات.
- `Paths`: مسارات التطبيق.

### `contracts/errors.ts`
- رسائل الخطأ المشتركة.

---

## سكريبتات الترحيل (`scripts/`)

- `create-voice-usage-table.cjs`: ينشئ جدول `voice_usage` إذا لم يكن موجوداً.
- `fix-user-profiles-table.cjs`: يضيف أعمدة جديدة لجدول `user_profiles`.
- `add-avatar-column.cjs`: يضيف عمود `avatar` لجدول `local_users`.
- `create_local_db.sql`: SQL لإنشاء الداتابيز.

---

## ملفات الإعداد

| ملف | وظيفته |
|---|---|
| `package.json` | التبعيات + السكريبتات (`dev`, `build`, `backend:dev`) |
| `vite.config.ts` | إعداد Vite مع tRPC dev server plugin |
| `tsconfig.json` | إعداد TypeScript |
| `drizzle.config.ts` | إعداد Drizzle ORM (MySQL connection) |
| `tailwind.config.js` | إعداد Tailwind CSS |
| `.env` | متغيرات البيئة (DATABASE_URL, GEMINI_API_KEY, JWT_SECRET...) |
| `.env.frontend.example` | مثال لمتغيرات الـ Frontend |
| `Dockerfile` | بناء Docker image |
| `DEPLOYMENT.md` | دليل النشر |

---

## تدفق التصنيف (Classification Flow)

```
نص المستخدم (عامية مصرية)
        ↓
[1] Text Normalizer → تحويل أرقام + تنظيف
        ↓
[2] Entity Extractor → مبالغ + أشخاص + تجار
        ↓
[3] Intent Detector → income vs expense
        ↓
[4] Rule Engine → user dict → taxonomy → dictionary → fuzzy
        ↓ (إذا فشل أو confidence منخفض)
[4.5] Embedding Engine → cosine similarity مع category descriptors
        ↓ (إذا فشل أو complexity عالي)
[5] AI Classifier (Gemini) → LLM classification
        ↓
[6] Confidence Scorer → تعديل + قرار
        ↓
[7] النتيجة: auto_save | review | clarify
```

---

## التشغيل

```bash
# تثبيت التبعيات
npm install

# تشغيل في وضع التطوير (Frontend + Backend)
npm run dev

# تشغيل الـ Backend فقط
npm run backend:dev

# بناء المشروع
npm run build
```

---

## متغيرات البيئة المطلوبة

```env
DATABASE_URL=mysql://user:pass@host:3306/smartspend
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
GEMINI_API_KEY=...
```
