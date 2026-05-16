# SmartSpend AI — دليل المشروع الشامل

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/Hono-4-E36002?logo=hono" />
  <img src="https://img.shields.io/badge/tRPC-11-2596BE?logo=trpc" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?logo=drizzle" />
  <img src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql" />
  <img src="https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.0-4285F4?logo=google" />
</p>

---

## فهرس المحتويات

1. [نظرة عامة على المشروع](#-نظرة-عامة-على-المشروع)
2. [ما هو SmartSpend AI؟](#-ما-هو-smartspend-ai)
3. [المميزات الرئيسية](#-المميزات-الرئيسية)
4. [التقنيات المستخدمة](#-التقنيات-المستخدمة)
5. [خريطة المشروع الكاملة](#-خريطة-المشروع-الكاملة)
6. [شرح تفصيلي لكل مجلد وملف](#-شرح-تفصيلي-لكل-مجلد-وملف)
7. [هيكل قاعدة البيانات](#-هيكل-قاعدة-البيانات)
8. [نظام المصادقة والصلاحيات](#-نظام-المصادقة-والصلاحيات)
9. [نظام الذكاء الاصطناعي](#-نظام-الذكاء-الاصطناعي)
10. [كيفية التشغيل](#-كيفية-التشغيل)

---

## نظرة عامة على المشروع

**SmartSpend AI** هو تطبيق ويب متكامل (Full-Stack) لإدارة وتتبع المصاريف الشخصية باللغة العربية واللهجة المصرية. يستخدم التطبيق الذكاء الاصطناعي (Google Gemini) لتحليل النصوص المكتوبة بالعامية المصرية واستخراج العمليات المالية منها تلقائياً. يدعم التطبيق إدخال البيانات يدوياً أو بالصوت، ويقدم تحليلات مالية ذكية وتقارير شهرية وسنوية.

**الجمهور المستهدف:** المستخدمون في مصر والدول العربية الذين يريدون تتبع مصاريفهم اليومية بسهولة باستخدام لغتهم الطبيعية.

**المشروع مفتوح المصدر:** [GitHub Repository](https://github.com/mahmoudtaherr111/smartspend_mini_all)

---

## ما هو SmartSpend AI؟

التطبيق يحل مشكلة شائعة: صعوبة تتبع المصاريف اليومية. بدلاً من التطبيقات المعقدة التي تتطلب إدخال يدوي ممل، يتيح SmartSpend AI للمستخدم:

- **الكتابة بلغة طبيعية:** "صرفت 150 جنيه فاتورة كهربا واشتريت لقمة 40 جنيه"
- **التحدث بالصوت:** تسجيل صوتي يُحول تلقائياً لنص ثم لعمليات مالية
- **الحصول على تحليل ذكي:** تقارير شهرية بالعامية المصرية مع توصيات مالية
- **تصنيف تلقائي:** الفئات والفئات الفرعية تُستخرج تلقائياً من النص

---

## المميزات الرئيسية

| الميزة | الوصف |
|--------|-------|
| **التحليل الذكي بالعامية** | تحليل نصوص مصرية باستخدام Hybrid Parser (Regex + Gemini AI) |
| **الإدخال الصوتي** | تسجيل صوتي يُحول لنص ثم لعمليات مالية عبر Gemini STT |
| **التقارير الشهرية** | تقارير مفصلة بإجمالي المصاريف والدخل والفئات والمتوسط اليومي |
| **التنبؤات المالية** | توقعات بناءً على الأنماط السلوكية ومعدل الإنفاق |
| **نظام الاشتراكات** | خطط Free/Pro/Ultra مع حدود يومية وشهرية |
| **لوحة تحكم الأدمن** | إدارة المستخدمين والجلسات والإعلانات والإعدادات |
| **نظام الدعم الفني** | تذاكر دعم بأولويات وردود من المشرفين |
| **نظام الإحالات** | أكواد إحالة فريدة لمكافآت التسجيل |
| **نظام الإعلانات** | إعلانات Banner/Sidebar/Popup مع تتبع النقرات والظهور |
| **التصدير** | تصدير البيانات بصيغ JSON / CSV / XLSX |
| **SEO كامل** | Meta tags ديناميكية وSitemap XML |
| **الوضع الداكن** | دعم كامل للـ Dark Mode |
| **التوثيق المزدوج** | تسجيل دخول عبر Google OAuth أو رقم الهاتف + كلمة المرور |

---

## التقنيات المستخدمة

### الطبقة الأمامية (Frontend)
| التقنية | الاستخدام |
|---------|-----------|
| **React 18** | مكتبة واجهة المستخدم |
| **TypeScript 5.7** | Typing آمن للكود |
| **Vite 6** | أداة البناء والتطوير السريع |
| **Tailwind CSS 3.4** | التنسيق والتصميم |
| **shadcn/ui** | مكونات UI جاهزة (50+ مكون) |
| **TanStack Query v5** | إدارة حالة البيانات والـ Caching |
| **tRPC Client** | استدعاء API type-safe |
| **React Router v7** | التنقل بين الصفحات |
| **Recharts** | الرسوم البيانية التفاعلية |
| **next-themes** | إدارة Light/Dark Mode |

### الطبقة الخلفية (Backend)
| التقنية | الاستخدام |
|---------|-----------|
| **Hono 4** | إطار عمل HTTP خفيف و سريع |
| **tRPC 11** | API procedures type-safe |
| **Drizzle ORM 0.38** | ORM لقاعدة البيانات |
| **mysql2** | اتصال MySQL |
| **Google Generative AI** | Gemini API للتحليل الذكي |
| **bcryptjs** | تشفير كلمات المرور |
| **hono/jwt** | إنشاء والتحقق من JWT tokens |
| **Zod** | التحقق من صحة البيانات |
| **xlsx** | تصدير ملفات Excel |

### قاعدة البيانات
| التقنية | الاستخدام |
|---------|-----------|
| **MySQL 8** | قاعدة البيانات العلائقية |
| **Drizzle Kit** | ترحيلات قاعدة البيانات |
| **20+ جدول** | هيكل شامل لتخزين جميع البيانات |

---

## خريطة المشروع الكاملة

```
smartspend_mini_all/
│
├── 📁 api/                              # الخلفية (Backend Server)
│   ├── boot.ts                          # نقطة دخول الخادم (Hono App)
│   ├── router.ts                        # تجميع كل tRPC Routers
│   ├── context.ts                       # سياق المصادقة لكل طلب
│   ├── middleware.ts                    # صلاحيات RBAC (public/authed/admin/mod/pro)
│   ├── server.ts                        # إعداد خادم التطوير
│   │
│   ├── auth-router.ts                   # Google OAuth (تسجيل/دخول/معالجة Callback)
│   ├── local-auth-router.ts             # المصادقة المحلية (تسجيل/دخول/أدمن)
│   ├── local-auth-utils.ts              # أدوات المصادقة (bcrypt/JWT/sessions/phone)
│   ├── expense-router.ts                # CRUD المصاريف والإحصائيات الشهرية
│   ├── ai-router.ts                     # تحليل AI + Hybrid Parser + STT + تقارير
│   ├── ai-keywords.json                 # قاموس كلمات مفتاحية مصرية
│   ├── analytics-router.ts              # تتبع الأحداث والإحصائيات
│   ├── admin-router.ts                  # لوحة تحكم الأدمن (إعدادات/مستخدمين/إحصائيات)
│   ├── support-router.ts                # نظام تذاكر الدعم الفني
│   ├── export-router.ts                 # تصدير البيانات (JSON/CSV/XLSX)
│   ├── session-router.ts                # إدارة الجلسات والأحداث
│   ├── pro-router.ts                    # إدارة اشتراكات Pro
│   ├── ads-router.ts                    # إدارة الإعلانات والنقرات
│   ├── referral-router.ts               # نظام الإحالات والأكواد
│   ├── seo-router.ts                    # إدارة SEO الديناميكي + Sitemap
│   ├── profile-router.ts                # إدارة ملفات المستخدمين الذكية
│   │
│   ├── 📁 lib/
│   │   ├── env.ts                       # التحقق من متغيرات البيئة (Zod)
│   │   ├── category-registry.ts         # سجل الفئات المتاحة
│   │   ├── classification-pipeline.ts   # خط أنابيب التصنيف الذكي
│   │   ├── egyptian-dictionary.ts       # القاموس المصري للكلمات المالية
│   │   └── fuzzy-match.ts               # البحث الضبابي للفئات
│   │
│   ├── 📁 queries/
│   │   └── connection.ts                # اتصال MySQL عبر Drizzle ORM
│   │
│   └── 📁 services/                     # خدمات الذكاء الاصطناعي
│       ├── user-profile-service.ts      # إدارة ملف المستخدم الذكي
│       ├── lifestyle-inference-engine.ts# محرك استنتاج نمط الحياة
│       ├── report-personalization-engine.ts # تخصيص التقارير
│       ├── adaptive-question-engine.ts  # محرك الأسئلة التكيفي (Onboarding)
│       ├── *.test.ts                    # اختبارات وحدة للخدمات
│
├── 📁 db/                               # قاعدة البيانات
│   ├── schema.ts                        # تعريف الجداول (20+ جدول)
│   ├── relations.ts                     # العلاقات بين الجداول
│   ├── index.ts                         # نقطة دخول Drizzle ORM
│   ├── seed.ts                          # بيانات أولية
│   ├── check-db.ts                      # فحص اتصال قاعدة البيانات
│   ├── apply-migrations.ts              # تطبيق الترحيلات
│   └── 📁 migrations/                   # ترحيلات Drizzle Kit
│       ├── 0000_loving_big_bertha.sql   # الترحيل الأولي
│       └── 📁 meta/
│
├── 📁 contracts/                        # العقود المشتركة (Front + Back)
│   ├── constants.ts                     # الثوابت العامة
│   ├── errors.ts                        # هيكل الأخطاء الموحد
│   └── types.ts                         # الأنواع المشتركة TypeScript
│
├── 📁 scripts/
│   └── create_local_db.sql              # إنشاء قاعدة بيانات محلية
│
├── 📁 src/                              # الواجهة الأمامية (Frontend)
│   ├── main.tsx                         # نقطة دخول React
│   ├── App.tsx                          # المكون الجذري + التوجيه + Layout
│   ├── App.css                          # أنماط عامة للتطبيق
│   ├── index.css                        # أنماط Tailwind + CSS Variables
│   ├── 3d-effects.css                   # تأثيرات ثلاثية الأبعاد
│   └── print.css                        # أنماط الطباعة
│   │
│   ├── 📁 pages/                        # صفحات التطبيق
│   │   ├── Home.tsx                     # الصفحة الرئيسية (Dashboard)
│   │   ├── Login.tsx                    # تسجيل الدخول والتسجيل
│   │   ├── AuthCallback.tsx             # معالجة رد Google OAuth
│   │   ├── Admin.tsx                    # لوحة تحكم الأدمن
│   │   ├── Pro.tsx                      # صفحة الاشتراك Pro
│   │   ├── Support.tsx                  # صفحة الدعم الفني
│   │   ├── Settings.tsx                 # إعدادات المستخدم
│   │   └── NotFound.tsx                 # صفحة 404
│   │
│   ├── 📁 components/                   # المكونات
│   │   ├── Sidebar.tsx                  # الشريط الجانبي للتنقل
│   │   ├── OnboardingCard.tsx           # بطاقة الترحيب التفاعلية
│   │   ├── MobileHeader.tsx             # الهيدر للجوال
│   │   ├── SEOMeta.tsx                  # مكون Meta Tags الديناميكية
│   │   ├── AdBanner.tsx                 # مكون الإعلانات
│   │   ├── UserAvatar.tsx               # صورة المستخدم الشخصية
│   │   ├── 📁 dashboard/
│   │   │   ├── MonthlyStats.tsx         # إحصائيات شهرية
│   │   │   ├── ExpenseChart.tsx         # رسوم بيانية للمصاريف
│   │   │   ├── CategoryPieChart.tsx     # رسم دائري للفئات
│   │   │   ├── UserIntelligencePanel.tsx# لوحة ذكاء المستخدم
│   │   │   ├── BehaviorInsights.tsx     # رؤى سلوكية
│   │   │   ├── MonthlyCalendar.tsx      # تقويم مالي شهري
│   │   │   └── SpendingHeatmap.tsx      # خريطة حرارية للإنفاق
│   │   ├── 📁 expenses/
│   │   │   ├── ExpenseForm.tsx          # نموذج إضافة/تحليل مصروف
│   │   │   ├── RecentExpenses.tsx       # قائمة المصاريف الأخيرة
│   │   │   └── ExpenseFilters.tsx       # فلاتر المصاريف
│   │   ├── 📁 insights/
│   │   │   ├── AIInsights.tsx           # تحليلات AI الشهرية
│   │   │   ├── AICompare.tsx            # مقارنة بين شهري
│   │   │   └── AIYearly.tsx             # تقارير سنوية
│   │   ├── 📁 admin/
│   │   │   ├── AdminStatsCards.tsx      # بطاقات إحصائيات الأدمن
│   │   │   ├── UsersTable.tsx           # جدول المستخدمين
│   │   │   ├── SessionsTable.tsx        # جدول الجلسات
│   │   │   ├── TicketsTable.tsx         # جدول التذاكر
│   │   │   ├── AdManager.tsx            # إدارة الإعلانات
│   │   │   ├── ReferralsTable.tsx       # جدول الإحالات
│   │   │   ├── SettingsPanel.tsx        # إعدادات النظام
│   │   │   ├── AIClassificationLogs.tsx # سجل تصنيفات AI
│   │   │   └── VoiceUsageStats.tsx      # إحصائيات الاستخدام الصوتي
│   │   ├── 📁 support/
│   │   │   ├── TicketList.tsx           # قائمة التذاكر
│   │   │   └── TicketDetail.tsx         # تفاصيل التذكرة
│   │   ├── 📁 pro/
│   │   │   └── ProFeatures.tsx          # عرض مميزات Pro
│   │   ├── 📁 auth/
│   │   │   ├── LoginForm.tsx            # نموذج تسجيل الدخول
│   │   │   └── RegisterForm.tsx         # نموذج التسجيل
│   │   ├── 📁 settings/
│   │   │   ├── ProfileSettings.tsx      # إعدادات الملف الشخصي
│   │   │   └── AccountSettings.tsx      # إعدادات الحساب
│   │   └── 📁 ui/                       # مكونات shadcn/ui (50+)
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── form.tsx
│   │       ├── input.tsx
│   │       ├── table.tsx
│   │       ├── tabs.tsx
│   │       ├── toast.tsx
│   │       ├── chart.tsx
│   │       ├── calendar.tsx
│   │       ├── select.tsx
│   │       ├── sidebar.tsx
│   │       └── ... (50+ مكون)
│   │
│   ├── 📁 hooks/                        # Hooks مخصصة
│   │   ├── useAuth.ts                   # إدارة المصادقة (OAuth + Local)
│   │   ├── useAdmin.ts                  # صلاحيات الأدمن والمشرف
│   │   ├── usePro.ts                    # حالة الاشتراك Pro
│   │   ├── useAds.ts                    # إدارة الإعلانات
│   │   ├── use-mobile.ts               # كشف الجوال
│   │   └── useSessionTracker.ts        # تتبع الجلسات
│   │
│   ├── 📁 providers/                    # موفري الخدمة
│   │   ├── trpc.ts                      # إعداد tRPC Client
│   │   └── trpc.tsx                     # موفر tRPC لـ React
│   │
│   └── 📁 lib/                          # أدوات مساعدة
│       └── utils.ts                     # دوال cn و format
│
├── 📁 dist/                             # ملفات الإنتاج (Build)
│   └── ...
│
├── package.json                         # تبعيات NPM + سكريبتات
├── vite.config.ts                       # إعداد Vite
├── tailwind.config.js                   # إعداد Tailwind + Theme
├── tsconfig.json                        # إعداد TypeScript
├── tsconfig.app.json                    # إعداد TypeScript للتطبيق
├── tsconfig.node.json                   # إعداد TypeScript لـ Vite
├── tsconfig.server.json                 # إعداد TypeScript للخادم
├── drizzle.config.ts                    # إعداد Drizzle Kit
├── eslint.config.js                     # إعداد ESLint
├── vitest.config.ts                     # إعداد Vitest (اختبارات)
├── components.json                      # إعداد shadcn/ui
├── index.html                           # نقطة دخول HTML
├── Dockerfile                           # Docker Multi-stage Build
├── .env                                 # متغيرات البيئة
├── .env.frontend.example                # مثال لمتغيرات البيئة الأمامية
├── .gitignore                           # ملفات Git المستبعدة
├── info.md                              # ملاحظات المشروع
├── smartspend_architecture_plan.md      # خطة معمارية
├── DEPLOYMENT.md                        # دليل النشر
├── new_updat.txt                        # ملف التحديثات
└── README.md                            # ملف README الأساسي
```

---

## شرح تفصيلي لكل مجلد وملف

### 📁 `api/` — الخادم الخلفي (Backend)

هذا المجلد يحتوي على كامل الكود الخلفي للتطبيق. يُبنى على إطار **Hono** ويستخدم **tRPC** للتواصل بين الأمامي والخلفي.

#### الملفات الرئيسية في `api/`

| الملف | الشرح التفصيلي |
|-------|---------------|
| **`boot.ts`** | **قلب التطبيق الخلفي.** ينشئ خادم Hono، يضبط CORS، Logger، ويوجه الطلبات. يستمع على المنفذ 3000 ويتعامل مع tRPC endpoint و Google OAuth callback. |
| **`router.ts`** | **موجه tRPC الرئيسي.** يجمع كل الـ Routers الفرعية (auth, expense, ai, admin, ...) في router واحد (`appRouter`) ويصدر نوع `AppRouter` للاستخدام في الأمامي. |
| **`context.ts`** | **سياق المصادقة.** يبني سياق كل طلب: يتحقق أولاً من Google Session (cookie)، ثم من Bearer Token (Local Auth). يعيد كائن `UnifiedUser` يحتوي على بيانات المستخدم أو null. |
| **`middleware.ts`** | **نظام الصلاحيات RBAC.** يعرف 5 أنواع من procedures: `publicProcedure` (للجميع)، `authedProcedure` (للمستخدمين المسجلين)، `proProcedure` (لـ Pro/Ultra)، `moderatorProcedure` (للمراقبين)، `adminProcedure` (للأدمن فقط). |
| **`server.ts`** | إعداد خادم التطوير الإضافي. |

#### ملفات الـ Routers في `api/`

| الملف | الشرح التفصيلي |
|-------|---------------|
| **`auth-router.ts`** | **مصادقة Google OAuth.** يولد رابط Google OAuth، يعالج Callback بعد الموافقة، يُنشئ أو يُحدث المستخدم في جدول `users`، ويولد JWT token ويخزنه في cookie (`google_session`). |
| **`local-auth-router.ts`** | **المصادقة المحلية.** يتعامل مع التسجيل (register) بالهاتف والباسورد، تسجيل الدخول (login)، الملف الشخصي (me)، الخروج (logout)، وإدارة المستخدمين للأدمن (list/delete/update role). |
| **`local-auth-utils.ts`** | **أدوات المصادقة.** يحتوي على دوال `hashPassword` و `comparePassword` باستخدام bcrypt، `generateToken` لإنشاء JWT، `createSession` لإنشاء جلسة، `validatePhone` للتحقق من أرقام مصرية (010/011/012/015)، و `generateReferralCode`. |
| **`expense-router.ts`** | **إدارة المصاريف.** CRUD كامل للمصاريف: إنشاء، قائمة، بحث، تحديث، حذف. يقدم إحصائيات شهرية (getMonthlyStats) تشمل: إجمالي المصاريف والدخل، المتوسط اليومي، أعلى يوم، تحليل الفئات والفئات الفرعية، تحليل الوقت (الساعة/اليوم)، المقارنة مع الشهر السابق، والTrend. |
| **`ai-router.ts`** | **الذكاء الاصطناعي — أهم ملف.** يحتوي على: Hybrid Parser (Regex + كلمات مفتاحية مصرية)، محلل Gemini API، Speech-to-Text للإدخال الصوتي، توليد تقارير شهرية، مقارنة بين شهري، تقارير سنوية، وتعلم كلمات جديدة. يدير حدود الاستخدام حسب الخطة. |
| **`ai-keywords.json`** | قاعدة بيانات الكلمات المفتاحية المصرية للـ Hybrid Parser. يحتوي على فئات المصاريف الشائعة باللهجة المصرية. |
| **`analytics-router.ts`** | تتبع أحداث المستخدمين (trackEvent) وتجميع إحصائيات الاستخدام. |
| **`admin-router.ts`** | **لوحة تحكم الأدمن.** إحصائيات Dashboard شاملة، قائمة المستخدمين مع pagination + search، تعديل دور/خطة المستخدمين، حذف مستخدم مع بياناته، إدارة الجلسات، Activity Log، إعدادات AI (نماذج/حدود)، وإحصائيات التصنيف والاستخدام الصوتي. |
| **`support-router.ts`** | **نظام تذاكر الدعم.** إنشاء تذكرة، قائمة تذاكري، قائمة كل التذاكر (للمشرفين)، الرد على تذكرة، تعيين تذكرة لمسؤول، إغلاق تذكرة. |
| **`export-router.ts`** | **تصدير البيانات.** تصدير مصاريف المستخدم بصيغ JSON / CSV / XLSX، وتصدير كل المستخدمين (للمشرفين). |
| **`session-router.ts`** | **إدارة الجلسات.** قائمة جلساتي، إلغاء جلسة، إحصائيات الجلسات (للمشرفين)، تتبع الأحداث. |
| **`pro-router.ts`** | **إدارة الاشتراكات.** معرفة خطتي الحالية، ترقية لـ Pro (شهري/سنوي)، إلغاء الاشتراك، قائمة الاشتراكات (للأدمن). |
| **`ads-router.ts`** | **إدارة الإعلانات.** قائمة الإعلانات النشطة حسب المكان (sidebar/banner/popup) والخطة، تتبع الظهور (impression) والنقرات (click)، إنشاء/تعديل/حذف إعلان (أدمن)، إحصائيات الإعلانات. |
| **`referral-router.ts`** | **نظام الإحالات.** الحصول على كود الإحالة الخاص بي، تطبيق كود إحالة، قائمة إحالاتي، قائمة كل الإحالات (أدمن). |
| **`seo-router.ts`** | **إدارة SEO.** getPage (عام)، upsert (أدمن)، list، delete، وتوليد Sitemap XML. |
| **`profile-router.ts`** | **إدارة ملف المستخدم الذكي.** إنشاء/تحديث الملف الشخصي، الإجابة على أسئلة Onboarding، تحديث الاستنتاجات، وإعادة حساب الاستنتاجات. |

#### المجلدات الفرعية في `api/`

| المجلد | الشرح |
|--------|-------|
| **`api/lib/`** | أدوات مساعدة: `env.ts` للتحقق من متغيرات البيئة بـ Zod، `category-registry.ts` لتعريف الفئات، `classification-pipeline.ts` لخط أنابيب التصنيف الذكي، `egyptian-dictionary.ts` للقاموس المصري، `fuzzy-match.ts` للبحث الضبابي. |
| **`api/queries/`** | `connection.ts` — إنشاء connection pool لـ MySQL باستخدام mysql2/promise وتوصيله بـ Drizzle ORM مع schema. |
| **`api/services/`** | خدمات الذكاء الاصطناعي المتقدمة: `user-profile-service.ts` لإدارة ملف المستخدم الذكي، `lifestyle-inference-engine.ts` لاستنتاج نمط الحياة من البيانات، `report-personalization-engine.ts` لتخصيص التقارير، `adaptive-question-engine.ts` لمحرك الأسئلة التكيفي في Onboarding. |

---

### 📁 `db/` — قاعدة البيانات

| الملف | الشرح |
|-------|-------|
| **`schema.ts`** | تعريف **20+ جدول** باستخدام Drizzle ORM MySQL: users، localUsers، expenses، expenseCategories، monthlyReports، sessions، userAnalytics، supportTickets، discountCodes، aiSummaries، ads، adClicks، referrals، proSubscriptions، seoPages، systemSettings، userProfiles، profileLearningEvents، monthlyBehaviorSnapshots، onboardingQuestions، userDictionaries، classificationLogs، voiceUsage. |
| **`relations.ts`** | تعريف العلاقات بين الجداول (users → expenses، localUsers → expenses، إلخ). |
| **`index.ts`** | نقطة دخول Drizzle ORM — يصدر `db` instance. |
| **`migrations/`** | ترحيلات Drizzle Kit لإنشاء الجداول والفهارس. |

---

### 📁 `contracts/` — العقود المشتركة

| الملف | الشرح |
|-------|-------|
| **`constants.ts`** | الثوابت العامة للتطبيق. |
| **`errors.ts`** | هيكل `AppError` الموحد مع دوال factory: badRequest, unauthorized, forbidden, notFound, internal. |
| **`types.ts`** | الأنواع المشتركة TypeScript بين Frontend وBackend. |

---

### 📁 `src/` — الواجهة الأمامية (Frontend)

#### `src/pages/` — الصفحات

| الملف | الشرح |
|-------|-------|
| **`Home.tsx`** | الصفحة الرئيسية. Dashboard متكامل يحتوي على: بطاقات الإحصائيات الشهرية (دخل/مصروف/صافي)، نموذج المصروفات، قائمة المصاريف الأخيرة، رسوم بيانية، تحليل AI، تقويم مالي. يدعم التنقل عبر Tabs (تسجيل/إحصائيات/AI/تقويم). |
| **`Login.tsx`** | صفحة تسجيل الدخول. تحتوي على تبويبين: تسجيل الدخول وإنشاء حساب. تدعم Google OAuth والمصادقة المحلية برقم الهاتف. |
| **`AuthCallback.tsx`** | معالجة رد Google OAuth بعد التسجيل. تستخرج token من URL params وتخزنه. |
| **`Admin.tsx`** | لوحة تحكم الأدمن الكاملة. إحصائيات Dashboard، جدول المستخدمين مع بحث وفلترة، جدول الجلسات، التذاكر، إدارة الإعلانات، الإحالات، إعدادات النظام. |
| **`Pro.tsx`** | صفحة الاشتراك Pro. عرض المميزات والأسعار ونموذج الترقية. |
| **`Support.tsx`** | صفحة الدعم الفني. قائمة التذاكر، إنشاء تذكرة جديدة، تفاصيل التذكرة والردود. |
| **`Settings.tsx`** | إعدادات المستخدم. تعديل الملف الشخصي والحساب. |
| **`NotFound.tsx`** | صفحة 404. |

#### `src/components/` — المكونات

| الملف | الشرح |
|-------|-------|
| **`Sidebar.tsx`** | الشريط الجانبي للتنقل. يحتوي على قائمة المصاريف والإحصائيات وتحليل AI والتقويم. يظهر/يختفي على الجوال. يدعم الوضع الداكن. |
| **`OnboardingCard.tsx`** | بطاقة ترحيب تفاعلية للمستخدمين الجدد تشرح مميزات التطبيق. |
| **`MobileHeader.tsx`** | الهيدر المخصص للجوال مع زر فتح القائمة الجانبية. |
| **`AdBanner.tsx`** | مكون عرض الإعلانات (Banner/Sidebar) مع تتبع الظهور والنقر. |

#### `src/components/dashboard/`

| الملف | الشرح |
|-------|-------|
| **`MonthlyStats.tsx`** | بطاقات إحصائيات شهرية: إجمالي المصاريف، الدخل، الصافي، المتوسط اليومي، أعلى يوم، عدد العمليات. |
| **`ExpenseChart.tsx`** | رسم بياني تفاعلي (Bar/Line/Pie) للمصاريف باستخدام Recharts. يعرض التوزيع الشهري والفئوي. |
| **`CategoryPieChart.tsx`** | رسم دائري (Pie Chart) لتوزيع المصاريف حسب الفئات. |
| **`UserIntelligencePanel.tsx`** | لوحة ذكاء المستخدم. تظهر الاستنتاجات الذكية: stability flags، توصيات التوفير، نمط الإنفاق. |
| **`BehaviorInsights.tsx`** | رؤى سلوكية مفصلة: نمط الإنفاق، الأيام الأعلى، الفئات الأعلى، المقارنة مع الشهر السابق. |
| **`MonthlyCalendar.tsx`** | تقويم مالي شهري يعرض المصاريف اليومية على شكل تقويم ملون. |
| **`SpendingHeatmap.tsx`** | خريطة حرارية (Heatmap) لأنماط الإنفاق حسب اليوم والساعة. |

#### `src/components/expenses/`

| الملف | الشرح |
|-------|-------|
| **`ExpenseForm.tsx`** | **أهم مكون.** نموذج إضافة مصروف ذكي. يدعم: إدخال نصي عادي (يدوي)، التسجيل الصوتي (Mic button)، والتحليل الذكي. يعرض نتائج الـ Hybrid Parser للمراجعة قبل الحفظ. يدعم التصحيح اليدوي للفئات والمبالغ. |
| **`RecentExpenses.tsx`** | قائمة المصاريف الأخيرة مع إمكانية التعديل والحذف والفلترة. |
| **`ExpenseFilters.tsx`** | فلاتر المصاريف حسب التاريخ والفئة والنوع. |

#### `src/components/insights/`

| الملف | الشرح |
|-------|-------|
| **`AIInsights.tsx`** | عرض تحليلات AI الشهرية. يستدعي `ai.generateMonthlyInsights` ويعرض التقرير بالعامية المصرية. |
| **`AICompare.tsx`** | مقارنة مصاريف شهرين مختلفين باستخدام AI. |
| **`AIYearly.tsx`** | تقارير سنوية مفصلة باستخدام AI. |

#### `src/components/admin/`

| الملف | الشرح |
|-------|-------|
| **`AdminStatsCards.tsx`** | بطاقات إحصائيات سريعة للأدمن (إجمالي المستخدمين، المصاريف، الجلسات النشطة). |
| **`UsersTable.tsx`** | جدول المستخدمين مع pagination، بحث، فلترة بالدور والخطة. |
| **`SessionsTable.tsx`** | جدول الجلسات النشطة مع إمكانية الإلغاء. |
| **`TicketsTable.tsx`** | جدول تذاكر الدعم مع الحالة والأولوية. |
| **`AdManager.tsx`** | إنشاء وإدارة الإعلانات (عنوان، محتوى، مكان، تاريخ). |
| **`ReferralsTable.tsx`** | جدول الإحالات مع الأكواد والحالات. |
| **`SettingsPanel.tsx`** | إعدادات النظام: نماذج AI، حدود الاستخدام، مفاتيح API. |
| **`AIClassificationLogs.tsx`** | سجل تصنيفات AI لمراجعة الأداء. |
| **`VoiceUsageStats.tsx`** | إحصائيات الاستخدام الصوتي حسب الخطة. |

#### `src/hooks/` — Hooks مخصصة

| الملف | الشرح |
|-------|-------|
| **`useAuth.ts`** | Hook مركزي للمصادقة. يتحقق من OAuth (cookie) وLocal Auth (localStorage token). يدير حالة المستخدم (user/isAdmin/isModerator/isPro). يوفر دالة logout. |
| **`useAdmin.ts`** | التحقق من صلاحيات الأدمن والمشرف. يستخدم `admin.me` و `admin.stats`. |
| **`usePro.ts`** | التحقق من حالة الاشتراك Pro وجلب المميزات المتاحة. |
| **`useAds.ts`** | جلب الإعلانات النشطة حسب المكان (sidebar/banner/popup) وخطة المستخدم. |
| **`use-mobile.ts`** | كشف ما إذا كان الجهاز محمولاً باستخدام media query. |
| **`useSessionTracker.ts`** | تتبع الجلسات: يرسل حدث `session_start` عند بدء الجلسة. |

#### `src/providers/`

| الملف | الشرح |
|-------|-------|
| **`trpc.ts`** | إعداد tRPC Client: يستخدم `httpBatchLink`، يضيف `Authorization: Bearer <token>` للطلبات، يعالج الأخطاء. |
| **`trpc.tsx`** | موفر React لـ tRPC: يلف التطبيق بـ TRPCProvider. |

#### `src/lib/`

| الملف | الشرح |
|-------|-------|
| **`utils.ts`** | دوال مساعدة: `cn()` للدمج بين class names باستخدام tailwind-merge، ودوال format للأرقام والتواريخ. |

---

### 📁 ملفات الإعدادات في الجذر

| الملف | الشرح |
|-------|-------|
| **`package.json`** | 50+ dependency: React, Hono, tRPC, Drizzle, Tailwind, shadcn/ui, Recharts, xlsx, Zod, وغيرها. يحتوي على سكريبتات: dev, build, start, lint, format, check, test, db:push, db:migrate. |
| **`vite.config.ts`** | إعداد Vite: aliases (`@`, `@contracts`, `@db`), dev server مع Hono entry، build outDir. |
| **`tailwind.config.js`** | إعداد Tailwind: darkMode بالـ class، ألوان shadcn، animations مخصصة، ألوان sidebar. |
| **`tsconfig.json`** | إعداد TypeScript الرئيسي مع references للـ app و node و server. |
| **`drizzle.config.ts`** | إعداد Drizzle Kit: schema، migrations folder، dialect (mysql). |
| **`vitest.config.ts`** | إعداد Vitest للاختبارات الوحدوية. |
| **`Dockerfile`** | بناء Docker متعدد المراحل: deps → build → production. يعمل على المنفذ 3000. |
| **`.env`** | متغيرات البيئة: DATABASE_URL، GOOGLE_CLIENT_ID/SECRET، JWT_SECRET، GEMINI_API_KEY، PORT، APP_URL، OWNER_EMAIL. |

---

## هيكل قاعدة البيانات

### الجداول الرئيسية (20+ جدول)

```
┌──────────────────────────────────────────────────────────────┐
│                    users (OAuth Users)                        │
├──────────────┬────────────────────────────────────────────────┤
│ id           │ Primary Key, Auto Increment                    │
│ union_id     │ Google ID (Unique)                             │
│ name, email  │ بيانات المستخدم                                 │
│ role         │ user | moderator | admin                        │
│ plan         │ free | pro | ultra                              │
│ referralCode │ كود الإحالة (Unique)                            │
│ aiTokensUsed │ عدد التوكنز المستخدمة                           │
└──────────────┴────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  local_users (Local Auth)                     │
├──────────────┬────────────────────────────────────────────────┤
│ id           │ Primary Key                                     │
│ name, phone  │ اسم ورقم هاتف (Unique)                          │
│ password     │ bcrypt hashed                                   │
│ role, plan   │ نفس نظام OAuth                                  │
│ referralCode │ كود الإحالة                                     │
└──────────────┴────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     expenses (المصاريف)                        │
├──────────────┬────────────────────────────────────────────────┤
│ id           │ Primary Key                                     │
│ userId       │ رابط للمستخدم (OAuth أو Local)                  │
│ userType     │ oauth | local                                   │
│ type         │ income | expense | transfer | investment        │
│ amount       │ Decimal(12,2)                                   │
│ category     │ فئة المصروف (أكل وشرب، مواصلات، ...)           │
│ subCategory  │ فئة فرعية                                       │
│ rawText      │ النص الأصلي المُدخل                              │
│ source       │ manual | voice | ai_parsed                      │
│ date         │ تاريخ العملية                                    │
└──────────────┴────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    sessions (الجلسات)                         │
├──────────────┬────────────────────────────────────────────────┤
│ id, token    │ مفتاح الجلسة                                    │
│ userId       │ رابط للمستخدم                                   │
│ expiresAt    │ تاريخ الانتهاء (7 أيام)                          │
└──────────────┴────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                 user_profiles (الملف الذكي)                   │
├──────────────┬────────────────────────────────────────────────┤
│ id           │ Primary Key                                     │
│ userId       │ رابط للمستخدم                                   │
│ monthlyIncome│ الدخل الشهري                                    │
│ financialGoal│ هدف مالي (توفير/سداد ديون/استثمار/ميزانية)     │
│ basicInfo    │ JSON: بيانات أساسية                              │
│ financialInfo│ JSON: بيانات مالية (مصادر دخل، نمط إنفاق)       │
│ lifestyleInfo│ JSON: نمط الحياة (أطفال، مسؤوليات، سكن)         │
│ onboardingAnswers   │ JSON: إجابات Onboarding                  │
│ aiInferredAttributes│ JSON: سمات مستنتجة بالAI                 │
│ preferences  │ JSON: تفضيلات المستخدم                          │
└──────────────┴────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              classification_logs (سجل التصنيفات)              │
├──────────────┬────────────────────────────────────────────────┤
│ id           │ Primary Key                                     │
│ userId       │ المستخدم                                        │
│ originalText │ النص الأصلي                                     │
│ parsedBy     │ rule_engine | ai | hybrid | manual               │
│ finalResult  │ JSON: النتيجة النهائية                           │
│ confidence   │ نسبة الثقة (0-100)                              │
│ modelUsed    │ نموذج AI المستخدم                               │
│ tokensUsed   │ عدد التوكنز المستخدمة                           │
└──────────────┴────────────────────────────────────────────────┘
```

### باقي الجداول
- **`expense_categories`** — فئات مصاريف مخصصة لكل مستخدم
- **`monthly_reports`** — تقارير شهرية مجمعة
- **`user_analytics`** — تتبع أحداث المستخدمين
- **`support_tickets`** — تذاكر الدعم الفني
- **`discount_codes`** — أكواد خصم
- **`ai_summaries`** — ملخصات AI المخزنة
- **`ads`, `ad_clicks`** — الإعلانات والنقرات
- **`referrals`** — الإحالات
- **`pro_subscriptions`** — اشتراكات Pro
- **`seo_pages`** — صفحات SEO
- **`system_settings`** — إعدادات النظام
- **`profile_learning_events`** — سجل تعلم AI
- **`monthly_behavior_snapshots`** — لقطات سلوكية شهرية
- **`onboarding_questions`** — أسئلة الترحيب
- **`user_dictionaries`** — قواميس المستخدمين الشخصية
- **`voice_usage`** — استخدام الصوت

---

## نظام المصادقة والصلاحيات

### التوثيق المزدوج (Dual Auth)

1. **Google OAuth 2.0**
   - المستخدم يضغط "تسجيل دخول بـ Google"
   - يُوجه إلى Google للموافقة
   - يعود بـ `code` إلى `/api/auth/google/callback`
   - الخادم يستبدل `code` بـ `access_token`
   - يجلب بيانات المستخدم من Google
   - يُنشئ/يُحدث المستخدم في جدول `users`
   - يولد JWT ويخزنه في `google_session` cookie (7 أيام)

2. **Local Auth (Phone + Password)**
   - التسجيل: اسم + هاتف (11 رقم مصري) + باسورد + إيميل اختياري
   - التحقق من الهاتف: يجب أن يبدأ بـ 010/011/012/015
   - الباسورد يُhash بـ bcrypt (12 rounds)
   - توليد JWT + إنشاء session في `sessions`
   - التوكن يُخزن في `localStorage` ويُرسل كـ `Bearer Token`

3. **التحقق المزدوج (Context)**
   - يتحقق من `google_session` cookie أولاً
   - إذا فشل، يتحقق من `Authorization: Bearer <token>`
   - يتحقق من صلاحية الجلسة في قاعدة البيانات

### نظام الصلاحيات RBAC (5 مستويات)

```
publicProcedure      ← لا يحتاج تسجيل دخول
    ↓
authedProcedure      ← أي مستخدم مسجل (user/pro/moderator/admin)
    ↓
proProcedure         ← مستخدم Pro أو Ultra أو Admin
    ↓
moderatorProcedure   ← Moderator أو Admin
    ↓
adminProcedure       ← Admin فقط
```

| الدور | الصلاحيات |
|-------|-----------|
| **user** | إدارة مصاريفه، تذاكره، جلساته |
| **pro** | + طلبات AI غير محدودة، تصدير، إحصائيات متقدمة |
| **moderator** | + رؤية كل المستخدمين والتذاكر والجلسات، الرد على التذاكر |
| **admin** | + تعديل أدوار/خطط، حذف مستخدمين، إدارة إعلانات، SEO، إحصائيات Dashboard |

---

## نظام الذكاء الاصطناعي

### Hybrid Parser — المحلل الهجين

المحلل يعمل بثلاث مراحل:

1. **القاموس المحلي (Regex + Keywords):**
   - يستخدم `egyptian-dictionary.ts` و `ai-keywords.json`
   - يبحث عن كلمات مفتاحية مصرية: "أكل"، "مواصلات"، "فاتورة"، "كهربا"، "مية"، "إنترنت"، "مطعم"، ...
   - يستخرج المبالغ بالأرقام العربية والإنجليزية
   - يحدد نوع العملية (مصروف/دخل) من السياق

2. **البحث الضبابي (Fuzzy Match):**
   - إذا لم يجد تطابقاً دقيقاً، يستخدم `fuzzy-match.ts`
   - يقيس المسافة بين الكلمات (Levenshtein distance)
   - يقترح أقرب فئة من الفئات المعروفة

3. **Google Gemini API:**
   - إذا فشل الـ Hybrid Parser أو كان النص معقداً (>100 حرف)
   - يرسل النص إلى Gemini مع prompt مخصص يطلب JSON مُهيكل
   - يدعم 4 نماذج: flash (مجاني)، pro، ultra، gemma
   - يُرجع: المبلغ، الفئة، الفئة الفرعية، الوصف، النوع

### محرك الاستنتاج (Lifestyle Inference Engine)

يحلل بيانات المستخدم لاستنتاج:
- **الاستقرار المالي:** stable / watch / pressure
- **نمط الإنفاق:** planned / spiky / emotional / concentrated
- **التنبؤ:** معدل الإنفاق المتوقع بنهاية الشهر
- **التوصيات:** فرص التوفير الممكنة

### محرك التخصيص (Report Personalization Engine)

يخصص التقارير بناءً على:
- **بيانات Onboarding:** الدخل، الأطفال، المسؤوليات، نمط الإنفاق
- **الاستنتاجات:** stability، top categories
- **التفضيلات:** مستوى التفصيل (summary/detailed)

### محرك الأسئلة التكيفي (Adaptive Question Engine)

- 10+ سؤال ذكي يتكيف بناءً على إجابات المستخدم
- يتخطى الأسئلة غير المناسبة (مثلاً لا يسأل عن الأطفال إذا قال ليس مسؤولاً عن عائلة)
- يخزن الإجابات في `user_profiles` لاستخدامها في التقارير المستقبلية

---

## كيفية التشغيل

### المتطلبات
- Node.js 20+
- MySQL 8.0+
- Google OAuth Credentials
- Google Gemini API Key

### الخطوات

```bash
# 1. استنساخ المشروع
git clone https://github.com/mahmoudtaherr111/smartspend_mini_all.git
cd smartspend_mini_all

# 2. تثبيت التبعيات
npm install

# 3. إعداد قاعدة البيانات
mysql -u root -p < scripts/create_local_db.sql
npm run db:push

# 4. إعداد متغيرات البيئة
cp .env.frontend.example .env
# عدل .env بمفاتيحك

# 5. التشغيل في وضع التطوير
npm run dev

# 6. البناء للإنتاج
npm run build
npm start
```

**الواجهة الأمامية:** http://localhost:5173
**الخادم:** http://localhost:3000

---

<p align="center">
  <strong>تم بناءه بـ React + Hono + Drizzle + Gemini</strong><br/>
  <small>© 2026 SmartSpend AI — جميع الحقوق محفوظة</small>
</p>
