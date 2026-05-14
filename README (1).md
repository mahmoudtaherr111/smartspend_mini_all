# SmartSpend AI — تتبع المصاريف بالذكاء الاصطناعي


<p align="center">
  <strong>تطبيق ويب متكامل لتتبع المصاريف اليومية باللهجة المصرية باستخدام الذكاء الاصطناعي</strong>
</p>

---

## 📋 جدول المحتويات

- [نظرة عامة](#-نظرة-عامة)
- [المميزات الرئيسية](#-المميزات-الرئيسية)
- [الهيكل التقني](#-الهيكل-التقني)
- [شجرة المشروع](#-شجرة-المشروع)
- [الملفات والمجلدات بالتفصيل](#-الملفات-والمجلدات-بالتفصيل)
- [قاعدة البيانات](#-قاعدة-البيانات)
- [API & tRPC Routers](#-api--trpc-routers)
- [نظام المصادقة المزدوج](#-نظام-المصادقة-المزدوج)
- [نظام الصلاحيات (RBAC)](#-نظام-الصلاحيات-rbac)
- [الإعداد والتشغيل](#-الإعداد-والتشغيل)
- [متغيرات البيئة](#-متغيرات-البيئة)
- [السكريبتات المتاحة](#-السكريبتات-المتاحة)
- [الدعم الفني](#-الدعم-الفني)

---

## 🔭 نظرة عامة

**SmartSpend AI** هو تطبيق ويب متكامل (Full-Stack) مبني بتقنيات حديثة يتيح للمستخدمين:

- تسجيل المصاريف والدخل يدوياً أو بالصوت أو بالذكاء الاصطناعي
- تحليل مالي ذكي باللهجة المصرية باستخدام Google Gemini
- لوحة تحكم إدارية متكاملة مع نظام صلاحيات متدرج
- نظام اشتراكات Pro مع مميزات متقدمة
- نظام إحالات (Referral) وكوبونات خصم
- نظام إعلانات متكامل مع تتبع النقرات والظهور
- تصدير البيانات بصيغ JSON / CSV / XLSX
- دعم كامل للغة العربية (RTL) واللهجة المصرية

### إحصائيات المشروع

| المقياس | القيمة |
|---------|--------|
| **إجمالي الملفات** | ~110+ ملف |
| **إجمالي المجلدات** | 22+ مجلد |
| **ملفات TypeScript/TSX** | ~70+ ملف |
| **مكونات UI (shadcn/ui)** | 50+ مكون |
| **جداول قاعدة البيانات** | 14 جدول |
| **tRPC Routers** | 12 router |
| **صفحات React** | 7 صفحات |

---

## ✨ المميزات الرئيسية

### 💰 إدارة المصاريف
- إضافة مصاريف/دخل يدوياً أو بالصوت
- تحليل نصوص باللهجة المصرية باستخدام Hybrid Parser + Gemini AI
- تصنيف تلقائي للفئات (أكل وشرب، مواصلات، فواتير، إلخ)
- إحصائيات شهرية وسنوية مع رسوم بيانية تفاعلية
- متوسط يومي ذكي يعتمد على تاريخ أول مصروف

### 🤖 الذكاء الاصطناعي (Google Gemini)
- تحليل مصاريف الشهر بالعامية المصرية
- مقارنة بين شهرين مالياً
- ملخص سنوي وتوقعات
- Hybrid Parser: مزيج بين Regex محلي + Gemini API
- حد يومي 10 طلبات للمستخدمين المجانيين

### 👥 نظام المصادقة المزدوج
- **Google OAuth 2.0**: تسجيل دخول سريع عبر Google
- **Local Auth**: تسجيل بالهاتف والباسورد مع تحقق ذكي من أرقام مصرية
- JWT Tokens مع صلاحية 7 أيام
- إدارة الجلسات (Sessions) مع إمكانية الإلغاء

### 🛡️ نظام الصلاحيات المتدرج (RBAC)
- `user` — مستخدم عادي
- `moderator` — مراقب (يمكنه رؤية التذاكر والمستخدمين)
- `admin` — أدمن كامل (كل الصلاحيات)
- `free` / `pro` — خطط الاشتراك

### 📊 لوحة تحكم الأدمن
- إحصائيات شاملة (مستخدمين، مصاريف، جلسات، تذاكر)
- إدارة المستخدمين (تعديل دور/خطة، حذف)
- إدارة الجلسات (إلغاء جلسة)
- سجل الأنشطة (Activity Log)
- إدارة الإعلانات

### 🎟️ نظام الدعم الفني
- إنشاء تذاكر دعم بأولويات (low/medium/high/urgent)
- ردود من المشرفين
- تعيين تذاكر لمسؤولين محددين
- إغلاق التذاكر

### 📈 الإعلانات
- إعلانات Sidebar / Banner / Popup
- تتبع الظهور (Impressions) والنقرات (Clicks)
- استهداف حسب الخطة (free / all)
- إدارة كاملة من لوحة الأدمن

### 🔄 نظام الإحالات
- كود إحالة فريد لكل مستخدم
- تطبيق كود إحالة عند التسجيل
- تتبع الإحالات الناجحة

### 💎 Pro Subscriptions
- ترقية لخطة Pro (شهري/سنوي)
- مميزات Pro: طلبات AI غير محدودة، تصدير، إحصائيات متقدمة، دعم أولوي، بدون إعلانات

### 🌐 SEO
- إدارة meta tags ديناميكية لكل صفحة
- توليد Sitemap XML
- Canonical URLs

---

## 🏗️ الهيكل التقني

### Stack التقني

| الطبقة | التقنية | الاستخدام |
|--------|---------|-----------|
| **Frontend** | React 18 + TypeScript | واجهة المستخدم |
| **Build Tool** | Vite 7 | البناء والتطوير |
| **Styling** | Tailwind CSS 3.4 + shadcn/ui | التصميم والمكونات |
| **Backend** | Hono 4 (Node.js) | خادم HTTP |
| **API** | tRPC 11 | APIs type-safe |
| **ORM** | Drizzle ORM + mysql2 | قاعدة البيانات |
| **Auth** | Google OAuth + JWT + bcryptjs | المصادقة |
| **AI** | Google Generative AI (Gemini) | الذكاء الاصطناعي |
| **Charts** | Recharts | الرسوم البيانية |
| **Export** | xlsx | تصدير Excel |
| **Validation** | Zod | التحقق من البيانات |
| **Query** | TanStack Query (React Query) | إدارة الحالة والطلبات |

### معمارية المشروع

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  React 18 + Vite + Tailwind + shadcn/ui + TanStack Query   │
│                    tRPC Client (HTTP)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP /api/trpc
┌──────────────────────────▼──────────────────────────────────┐
│                      Hono Server (Node.js)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  tRPC Router│  │ Google OAuth│  │  Health Check       │  │
│  │  (/api/trpc)│  │  (/api/auth)│  │  (/health)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Middleware (Auth, CORS, Logger)            │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              12 tRPC Routers (Business Logic)           │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Drizzle ORM + MySQL Connection Pool        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🌳 شجرة المشروع

```smartspend_mini_all/
│
├── 📁 api/                          # الخادم الخلفي (Backend)
│   ├── boot.ts                      # نقطة دخول الخادم (Hono app)
│   ├── router.ts                    # تجميع كل tRPC Routers
│   ├── context.ts                   # بناء سياق الطلب (Auth + User)
│   ├── middleware.ts                # صلاحيات tRPC (public/authed/admin/mod/pro)
│   ├── auth-router.ts               # مصادقة Google OAuth
│   ├── local-auth-router.ts         # مصادقة محلية (تسجيل/دخول/أدمن)
│   ├── local-auth-utils.ts          # أدوات المصادقة (hash, JWT, sessions, phone validation)
│   ├── expense-router.ts            # إدارة المصاريف والفئات والإحصائيات
│   ├── ai-router.ts                 # تحليل AI بـ Gemini (Hybrid Parser)
│   ├── ai-keywords.json             # كلمات مفتاحية للـ Hybrid Parser
│   ├── analytics-router.ts          # تتبع الأحداث وإحصائيات المستخدمين
│   ├── admin-router.ts              # لوحة تحكم الأدمن (CRUD + Stats)
│   ├── support-router.ts            # نظام تذاكر الدعم الفني
│   ├── export-router.ts             # تصدير البيانات (JSON/CSV/XLSX)
│   ├── session-router.ts            # إدارة الجلسات والأحداث
│   ├── pro-router.ts                # إدارة الاشتراكات Pro
│   ├── ads-router.ts                # إدارة الإعلانات والنقرات
│   ├── referral-router.ts           # نظام الإحالات والأكواد
│   ├── seo-router.ts                # إدارة SEO الديناميكي + Sitemap
│   ├── 📁 lib/
│   │   └── env.ts                   # التحقق من متغيرات البيئة (Zod)
│   └── 📁 queries/
│       └── connection.ts            # اتصال MySQL عبر Drizzle ORM
│
├── 📁 db/                           # قاعدة البيانات
│   ├── schema.ts                    # تعريف الجداول (14 جدول)
│   ├── relations.ts                 # علاقات Drizzle Relations
│   ├── seed.ts                      # بيانات أولية
│   └── 📁 migrations/               # ترحيلات Drizzle Kit
│       ├── 0000_loving_big_bertha.sql
│       └── 📁 meta/
│           ├── 0000_snapshot.json
│           └── _journal.json
│
├── 📁 contracts/                    # العقود المشتركة (Shared Contracts)
│   ├── constants.ts                 # الثوابت العامة
│   ├── errors.ts                    # هيكل الأخطاء الموحد
│   └── types.ts                     # الأنواع المشتركة
│
├── 📁 scripts/                      # سكريبتات المساعدة
│   └── create_local_db.sql          # إنشاء قاعدة بيانات محلية
│
├── 📁 src/                          # الواجهة الأمامية (Frontend)
│   ├── main.tsx                     # نقطة دخول React
│   ├── App.tsx                      # المكون الجذري + التوجيه
│   ├── App.css                      # أنماط خاصة بالتطبيق
│   ├── index.css                    # أنماط Tailwind + CSS Variables
│   ├── 3d-effects.css               # تأثيرات 3D
│   ├── print.css                    # أنماط الطباعة
│   │
│   ├── 📁 components/               # المكونات
│   │   ├── Sidebar.tsx              # الشريط الجانبي للتنقل
│   │   ├── 📁 ads/
│   │   │   └── AdBanner.tsx         # مكون الإعلانات
│   │   ├── 📁 dashboard/
│   │   │   ├── ExpenseChart.tsx     # رسم بياني للمصاريف
│   │   │   └── MonthlyStats.tsx     # إحصائيات شهرية
│   │   ├── 📁 expenses/
│   │   │   ├── ExpenseForm.tsx      # نموذج إضافة مصروف
│   │   │   └── RecentExpenses.tsx   # قائمة المصاريف الأخيرة
│   │   ├── 📁 insights/
│   │   │   └── AIInsights.tsx       # رؤى الذكاء الاصطناعي
│   │   ├── 📁 seo/
│   │   │   └── SEOMeta.tsx          # مكون Meta Tags الديناميكية
│   │   └── 📁 ui/                   # مكونات shadcn/ui (50+ مكون)
│   │       ├── button.tsx, card.tsx, dialog.tsx, form.tsx, ...
│   │       └── sidebar.tsx, table.tsx, tabs.tsx, chart.tsx, ...
│   │
│   ├── 📁 hooks/                    # Hooks مخصصة
│   │   ├── useAuth.ts               # إدارة حالة المصادقة (OAuth + Local)
│   │   ├── useAdmin.ts              # صلاحيات الأدمن
│   │   ├── usePro.ts                # حالة الاشتراك Pro
│   │   ├── useAds.ts                # إدارة الإعلانات
│   │   └── use-mobile.ts            # كشف الجوال
│   │
│   ├── 📁 lib/
│   │   └── utils.ts                 # دوال مساعدة (cn, format)
│   │
│   ├── 📁 pages/                    # صفحات التطبيق
│   │   ├── Home.tsx                 # الصفحة الرئيسية (Dashboard)
│   │   ├── Login.tsx                # تسجيل الدخول والتسجيل
│   │   ├── AuthCallback.tsx         # معالجة رد Google OAuth
│   │   ├── Admin.tsx                # لوحة تحكم الأدمن
│   │   ├── Pro.tsx                  # صفحة الاشتراك Pro
│   │   ├── Support.tsx              # صفحة الدعم الفني
│   │   └── NotFound.tsx             # صفحة 404
│   │
│   └── 📁 providers/                # موفري الخدمة
│       ├── trpc.ts                  # إعداد tRPC Client (مع معالجة JSON)
│       └── trpc.tsx                 # موفر tRPC لـ React
│
├── 📁 dist/                         # ملفات الإنتاج (Build Output)
│   ├── boot.js                      # الخادم المبني
│   └── 📁 public/                   # الملفات العامة المبنية
│       ├── index.html
│       └── 📁 assets/
│           ├── index-*.js
│           └── index-*.css
│
├── package.json                     # تبعيات NPM + سكريبتات
├── vite.config.ts                   # إعداد Vite (alias + dev server)
├── tsconfig.json                    # إعداد TypeScript الرئيسي
├── tsconfig.app.json                # إعداد TypeScript للتطبيق
├── tsconfig.node.json               # إعداد TypeScript لـ Vite config
├── tsconfig.server.json             # إعداد TypeScript للخادم
├── tailwind.config.js               # إعداد Tailwind + Theme
├── postcss.config.js                # إعداد PostCSS
├── eslint.config.js                 # إعداد ESLint
├── drizzle.config.ts                # إعداد Drizzle Kit
├── vitest.config.ts                 # إعداد Vitest (Testing)
├── components.json                  # إعداد shadcn/ui
├── index.html                       # نقطة دخول HTML
├── Dockerfile                       # Docker Multi-stage Build
├── .env                             # متغيرات البيئة (مثال)
├── .gitignore                       # ملفات Git المستبعدة
├── info.md                          # ملاحظات إعداد المشروع
├── untitled-plan-smartspendAi.prompt.md  # خطة/تعليمات AI
└── README.md                        # هذا الملف
```

---

## 📁 الملفات والمجلدات بالتفصيل

### `api/` — الخادم الخلفي (Backend Server)

| الملف | الوظيفة |
|-------|---------|
| `boot.ts` | نقطة دخول التطبيق. ينشئ خادم Hono، يضبط CORS، Logger، ويوجه الطلبات إلى tRPC أو Google OAuth Callback. يعمل على المنفذ 3000. |
| `router.ts` | يجمع كل tRPC routers في router واحد (`appRouter`) ويصدر نوع `AppRouter`. |
| `context.ts` | يبني سياق كل طلب: يتحقق من Google Session (cookie) أولاً، ثم من Bearer Token (Local Auth). يعيد `UnifiedUser` أو null. |
| `middleware.ts` | يعرف 5 أنواع من procedures: `publicProcedure`, `authedProcedure`, `moderatorProcedure`, `adminProcedure`, `proProcedure`. |
| `auth-router.ts` | مصادقة Google OAuth: توليد رابط Google، معالجة Callback، إنشاء/تحديث المستخدم، توليد JWT. |
| `local-auth-router.ts` | مصادقة محلية: تسجيل (register)، دخول (login)، ملف شخصي (me)، خروج (logout)، إدارة المستخدمين للأدمن. |
| `local-auth-utils.ts` | دوال مساعدة: `hashPassword`, `comparePassword`, `generateToken`, `createSession`, `validatePhone` (مصري)، `generateReferralCode`. |
| `expense-router.ts` | CRUD كامل للمصاريف + إحصائيات شهرية وسنوية + فئات مخصصة + day trend + week breakdown + category breakdown. |
| `ai-router.ts` | Hybrid Parser (Regex + Keywords) + Google Gemini API. يحلل النصوص المصرية ويستخرج مصاريف منظمة بصيغة JSON. يدعم 4 نماذج (flash/pro/ultra/gemma). |
| `ai-keywords.json` | قاعدة بيانات كلمات مفتاحية مصرية للـ Hybrid Parser (فئات، دخل، مصروفات). |
| `analytics-router.ts` | تتبع الأحداث (trackEvent)، إحصائيات المستخدمين الشخصية، إحصائيات Dashboard للمشرفين. |
| `admin-router.ts` | لوحة تحكم الأدمن: إحصائيات Dashboard، قائمة المستخدمين مع pagination + search، تعديل دور/خطة، حذف مستخدم مع بياناته، إدارة الجلسات، Activity Log. |
| `support-router.ts` | نظام تذاكر الدعم: إنشاء، قائمة، تفاصيل، رد، تعيين، إغلاق. |
| `export-router.ts` | تصدير بيانات المستخدم أو كل المستخدمين (للمشرفين) بصيغ JSON / CSV / XLSX. |
| `session-router.ts` | إدارة الجلسات: قائمة جلساتي، إلغاء جلسة، إحصائيات الجلسات (للمشرفين). |
| `pro-router.ts` | إدارة الاشتراكات: معرفة خطتي، ترقية لـ Pro، إلغاء الاشتراك، قائمة الاشتراكات (للأدمن). |
| `ads-router.ts` | إدارة الإعلانات: قائمة الإعلانات النشطة، تتبع ظهور/نقر، إنشاء/تعديل/حذف (أدمن)، إحصائيات. |
| `referral-router.ts` | نظام الإحالات: الحصول على كود الإحالة، تطبيق كود، قائمة إحالاتي، قائمة الكل (أدمن). |
| `seo-router.ts` | إدارة SEO: getPage (public)، upsert (admin)، list، delete، توليد Sitemap XML. |
| `lib/env.ts` | التحقق من متغيرات البيئة باستخدام Zod schema. يضمن وجود كل المتغيرات المطلوبة. |
| `queries/connection.ts` | إنشاء connection pool لـ MySQL باستخدام mysql2/promise وتوصيله بـ Drizzle ORM مع schema. |

### `db/` — قاعدة البيانات

| الملف | الوظيفة |
|-------|---------|
| `schema.ts` | تعريف 14 جدول باستخدام Drizzle ORM MySQL: users, localUsers, expenses, expenseCategories, monthlyReports, sessions, userAnalytics, supportTickets, discountCodes, aiSummaries, ads, adClicks, referrals, proSubscriptions, seoPages. |
| `relations.ts` | علاقات Drizzle: users → expenses, localUsers → expenses, expenseCategories → user, sessions → user. |
| `seed.ts` | بيانات أولية (placeholder). |
| `migrations/0000_loving_big_bertha.sql` | ترحيل SQL الأولي لإنشاء كل الجداول والفهارس. |
| `migrations/meta/` | ملفات metadata للترحيلات (snapshot + journal). |

### `contracts/` — العقود المشتركة

| الملف | الوظيفة |
|-------|---------|
| `constants.ts` | الثوابت العامة للتطبيق. |
| `errors.ts` | هيكل `AppError` الموحد مع دوال factory: badRequest, unauthorized, forbidden, notFound, internal. |
| `types.ts` | الأنواع المشتركة بين Frontend وBackend. |

### `src/` — الواجهة الأمامية

#### المكونات (`src/components/`)

| الملف | الوظيفة |
|-------|---------|
| `Sidebar.tsx` | الشريط الجانبي للتنقل مع قائمة المصاريف والإحصائيات والإعدادات. |
| `ads/AdBanner.tsx` | عرض إعلانات Banner/Sidebar مع تتبع الظهور والنقر. |
| `dashboard/ExpenseChart.tsx` | رسم بياني تفاعلي للمصاريف باستخدام Recharts. |
| `dashboard/MonthlyStats.tsx` | بطاقات إحصائيات شهرية (إجمالي، متوسط، أعلى يوم، إلخ). |
| `expenses/ExpenseForm.tsx` | نموذج إضافة/تعديل مصروف مع دعم الصوت والذكاء الاصطناعي. |
| `expenses/RecentExpenses.tsx` | قائمة المصاريف الأخيرة مع فلترة وتعديل وحذف. |
| `insights/AIInsights.tsx` | عرض تحليلات AI الشهرية/السنوية ومقارنة الأشهر. |
| `seo/SEOMeta.tsx` | مكون Helmet لتحديث meta tags ديناميكياً حسب الصفحة. |
| `ui/*.tsx` | 50+ مكون من shadcn/ui: button, card, dialog, form, table, tabs, sidebar, chart, calendar, select, toast, ... |

#### الصفحات (`src/pages/`)

| الملف | الوظيفة |
|-------|---------|
| `Home.tsx` | الصفحة الرئيسية: Dashboard مع إحصائيات، رسوم بيانية، نموذج مصروف، مصاريف أخيرة. |
| `Login.tsx` | صفحة تسجيل الدخول: تبويبان (تسجيل دخول / إنشاء حساب) مع Google OAuth + Local Auth. |
| `AuthCallback.tsx` | معالجة رد Google OAuth بعد التسجيل، استخراج token من URL. |
| `Admin.tsx` | لوحة تحكم الأدمن الكاملة: إحصائيات، جدول المستخدمين، الجلسات، Activity Log. |
| `Pro.tsx` | صفحة الاشتراك Pro: عرض المميزات والأسعار ونموذج الترقية. |
| `Support.tsx` | صفحة الدعم: قائمة التذاكر، إنشاء تذكرة جديدة، تفاصيل التذكرة. |
| `NotFound.tsx` | صفحة 404. |

#### Hooks (`src/hooks/`)

| الملف | الوظيفة |
|-------|---------|
| `useAuth.ts` | Hook مركزي للمصادقة: يتحقق من OAuth وLocal Auth، يدير حالة المستخدم، logout. |
| `useAdmin.ts` | التحقق من صلاحيات الأدمن/المشرف. |
| `usePro.ts` | التحقق من حالة الاشتراك Pro. |
| `useAds.ts` | جلب الإعلانات النشطة. |
| `use-mobile.ts` | كشف ما إذا كان الجهاز محمولاً. |

#### Providers (`src/providers/`)

| الملف | الوظيفة |
|-------|---------|
| `trpc.ts` | إعداد tRPC Client مع `httpBatchLink`، معالجة JSON غير صالح، إضافة Bearer Token للطلبات. |
| `trpc.tsx` | موفر React Query + tRPC للتطبيق. |

### ملفات الإعدادات في الجذر

| الملف | الوظيفة |
|-------|---------|
| `vite.config.ts` | إعداد Vite: alias (@, @contracts, @db, db), dev server (Hono entry: api/boot.ts), build outDir. |
| `tailwind.config.js` | إعداد Tailwind: darkMode class، ألوان shadcn، animations، sidebar colors. |
| `tsconfig.app.json` | إعداد TypeScript للتطبيق: target ES2022, paths aliases, strict mode. |
| `tsconfig.node.json` | إعداد TypeScript لملفات Node (Vite config). |
| `tsconfig.server.json` | إعداد TypeScript للخادم. |
| `drizzle.config.ts` | إعداد Drizzle Kit: schema, out, dialect (mysql). |
| `eslint.config.js` | إعداد ESLint: recommended + TypeScript + React Hooks + React Refresh. |
| `vitest.config.ts` | إعداد Vitest للاختبارات. |
| `components.json` | إعداد shadcn/ui. |
| `Dockerfile` | بناء Docker متعدد المراحل (deps → build → production). |
| `.env` | متغيرات البيئة (DATABASE_URL, GOOGLE_CLIENT_ID, JWT_SECRET, GEMINI_API_KEY, ...). |

---

## 🗄️ قاعدة البيانات

### الجداول (14 جدول)

| الجدول | الوصف | الفهارس |
|--------|-------|---------|
| `users` | مستخدمي Google OAuth | role, plan, referral_code |
| `local_users` | مستخدمي المصادقة المحلية | role, plan |
| `expenses` | المصاريف والدخل | user_id + user_type, date, type |
| `expense_categories` | فئات المصاريف المخصصة | — |
| `monthly_reports` | تقارير شهرية مجمعة | — |
| `sessions` | جلسات المستخدمين | user_id + user_type, token |
| `user_analytics` | تتبع الأحداث | user_id + user_type, event |
| `support_tickets` | تذاكر الدعم الفني | user_id + user_type, status, assigned_to |
| `discount_codes` | أكواد الخصم | code (unique) |
| `ai_summaries` | ملخصات AI المخزنة | user_id + user_type, period (unique) |
| `ads` | الإعلانات | — |
| `ad_clicks` | نقرات الإعلانات | — |
| `referrals` | الإحالات | referrer + referred (unique) |
| `pro_subscriptions` | اشتراكات Pro | user_id + user_type |
| `seo_pages` | صفحات SEO | path (unique) |

### العلاقات

```
users (1) ────────► (*) expenses
local_users (1) ──► (*) expenses
local_users (1) ──► (*) expenseCategories
local_users (1) ──► (*) sessions
```

---

## 🔌 API & tRPC Routers

| Router | المسار | الصلاحية | الوظيفة |
|--------|--------|----------|---------|
| `auth` | `auth.*` | Public | Google OAuth URL, Callback, Me, Logout |
| `localAuth` | `localAuth.*` | Public/Admin | Register, Login, Me, Logout, List Users, Stats, Delete, Update Role |
| `expense` | `expense.*` | Authed | Create, List, GetById, Update, Delete, Monthly Stats, Yearly Stats, Categories |
| `ai` | `ai.*` | Authed/Pro | Parse Expense (Hybrid), Monthly Insights, Compare Months, Yearly Insights |
| `analytics` | `analytics.*` | Authed/Moderator | Track Event, My Analytics, All User Stats, Dashboard Stats |
| `admin` | `admin.*` | Admin/Moderator | Dashboard Stats, List Users, Update Role/Plan, Delete User, Sessions, Activity Log |
| `support` | `support.*` | Authed/Moderator | Create Ticket, List, GetById, Respond, Assign, Close |
| `export` | `export.*` | Authed/Moderator | My Expenses (JSON/CSV/XLSX), All Users |
| `session` | `session.*` | Authed/Moderator | My Sessions, Revoke, Stats, List All, Track Event |
| `pro` | `pro.*` | Authed/Admin | My Plan, Upgrade, Cancel, List Subscriptions |
| `ads` | `ads.*` | Public/Admin | List Active, Impression, Click, Create/Update/Delete/Stats |
| `referral` | `referral.*` | Authed/Admin | My Code, Apply Code, My Referrals, List All |
| `seo` | `seo.*` | Public/Admin | Get Page, Upsert, List, Delete, Sitemap |

---

## 🔐 نظام المصادقة المزدوج

### 1. Google OAuth 2.0
- يولد `auth.googleUrl` رابط Google OAuth
- المستخدم يُعادل إلى Google ثم يعود إلى `/api/auth/google/callback`
- الخادم يستبدل `code` بـ `access_token`، يجلب بيانات المستخدم
- يُنشئ/يُحدث المستخدم في `users` ويولد JWT
- يُخزن JWT في `google_session` cookie (HttpOnly, SameSite=Lax, 7 أيام)

### 2. Local Auth (Phone + Password)
- التسجيل: اسم + هاتف (11 رقم مصري) + باسورد + إيميل اختياري + كود إحالة
- التحقق من الهاتف: يجب أن يبدأ بـ 010/011/012/015
- الباسورد يُhash بـ bcrypt (12 rounds)
- توليد JWT + إنشاء session في `sessions`
- التوكن يُخزن في `localStorage` ويُرسل كـ `Bearer Token`

### 3. التحقق المزدوج (Context)
1. يتحقق من `google_session` cookie أولاً
2. إذا فشل، يتحقق من `Authorization: Bearer <token>`
3. يتحقق من صلاحية الجلسة في قاعدة البيانات

---

## 🛡️ نظام الصلاحيات (RBAC)

```
publicProcedure      ← لا يحتاج تسجيل دخول
    ↓
authedProcedure      ← أي مستخدم مسجل
    ↓
proProcedure         ← مستخدم Pro أو Admin
    ↓
moderatorProcedure   ← Moderator أو Admin
    ↓
adminProcedure       ← Admin فقط
```

| الدور | الصلاحيات |
|-------|-----------|
| `user` | إدارة مصاريفه، تذاكره، جلساته |
| `pro` | + طلبات AI غير محدودة، تصدير، إحصائيات متقدمة |
| `moderator` | + رؤية كل المستخدمين والتذاكر والجلسات، الرد على التذاكر |
| `admin` | + تعديل أدوار/خطط، حذف مستخدمين، إدارة إعلانات، SEO، إحصائيات Dashboard |

---

## ⚙️ الإعداد والتشغيل

### المتطلبات
- Node.js 20+
- MySQL 8.0+
- Google OAuth Credentials
- Google Gemini API Key

### 1. استنساخ المشروع

```bash
git clone https://github.com/mahmoudtaherr111/smartspend_mini_all.git
cd smartspend_mini_all
```

### 2. تثبيت التبعيات

```bash
npm install
```

### 3. إعداد قاعدة البيانات

```bash
# إنشاء قاعدة البيانات
mysql -u root -p < scripts/create_local_db.sql

# تشغيل الترحيلات
npm run db:push
```

### 4. إعداد متغيرات البيئة

أنشئ ملف `.env` في الجذر:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/smartspend

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# JWT
JWT_SECRET=your_super_secret_jwt_key

# AI
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL_DEFAULT=gemini-1.5-flash
GEMINI_MODEL_PRO=gemini-1.5-pro

# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:5173

# Owner
OWNER_EMAIL=admin@example.com
```

### 5. التشغيل في وضع التطوير

```bash
npm run dev
```
- الواجهة الأمامية: http://localhost:5173
- الخادم: http://localhost:3000
- tRPC: http://localhost:3000/api/trpc

### 6. البناء للإنتاج

```bash
npm run build
npm start
```

### 7. Docker

```bash
docker build -t smartspend-ai .
docker run -p 3000:3000 --env-file .env smartspend-ai
```

---

## 🔧 متغيرات البيئة

| المتغير | مطلوب | الوصف |
|---------|-------|-------|
| `DATABASE_URL` | ✅ | رابط MySQL |
| `GOOGLE_CLIENT_ID` | ✅ | معرف Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ✅ | سر Google OAuth |
| `GOOGLE_REDIRECT_URI` | ❌ | رابط إعادة التوجيه (default: localhost) |
| `JWT_SECRET` | ✅ | مفتاح JWT |
| `GEMINI_API_KEY` | ✅ | مفتاح Google Gemini |
| `GEMINI_MODEL_DEFAULT` | ❌ | النموذج الافتراضي (flash) |
| `GEMINI_MODEL_PRO` | ❌ | نموذج Pro (pro) |
| `NODE_ENV` | ❌ | development / production |
| `PORT` | ❌ | منفذ الخادم (3000) |
| `APP_URL` | ❌ | رابط التطبيق الأمامي |
| `OWNER_EMAIL` | ❌ | إيميل المالك |

---

## 📜 السكريبتات المتاحة

| السكريبت | الوظيفة |
|----------|---------|
| `npm run dev` | تشغيل Vite dev server + Hono dev server |
| `npm run build` | بناء الواجهة الأمامية + الخادم (esbuild) |
| `npm run start` | تشغيل الخادم في الإنتاج |
| `npm run preview` | معاينة البناء |
| `npm run lint` | تشغيل ESLint |
| `npm run format` | تنسيق الكود بـ Prettier |
| `npm run check` | فحص TypeScript |
| `npm test` | تشغيل Vitest |
| `npm run db:generate` | توليد ترحيلات Drizzle |
| `npm run db:migrate` | تنفيذ الترحيلات |
| `npm run db:push` | دفع schema إلى قاعدة البيانات |

---

## 🧪 الاختبارات

- **Vitest** مُعد للاختبارات (لم تُكتب اختبارات بعد — `npm test` جاهز).
- **ESLint** + **TypeScript** + **Prettier** مُعدون لضمان جودة الكود.

---

## 🐳 Docker

يستخدم المشروع **Docker Multi-stage Build**:

1. **Stage 1 (deps)**: تثبيت `node_modules`
2. **Stage 2 (build)**: بناء المشروع بالكامل
3. **Stage 3 (production)**: نسخ `dist/` و `node_modules/` فقط

```dockerfile
# Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json .env ./
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📝 ملاحظات للمطورين

### Hybrid AI Parser
- يستخدم Regex + كلمات مفتاحية مصرية (`ai-keywords.json`) لاستخراج المبالغ والفئات
- إذا فشل الـ Hybrid أو كان النص معقد (>100 حرف)، يُرسل إلى Gemini API
- يدعم 4 نماذج: `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.0-ultra`, `gemma-3-27b-it`

### tRPC Client
- يستخدم `httpBatchLink` مع معالجة مخصصة للـ fetch
- يُصلح روابط خاطئة (يُعيد `/api/trpc/*` إلى `/api/trpc`)
- يُحاول استخراج JSON صالح من الردود غير الصالحة
- يُضيف `Authorization: Bearer <token>` تلقائياً

### Phone Validation
- يتحقق من أن الرقم 11 رقم ويبدأ بـ 01
- يتحقق من البادئة: 010, 011, 012, 015 (شبكات مصر)
- يزيل المسافات و+2 تلقائياً

---

## 🙋 الدعم الفني

- **GitHub Issues**: [افتح issue](https://github.com/mahmoudtaherr111/smartspend_mini_all/issues)
- **Email**: `OWNER_EMAIL` في `.env`
- **نظام التذاكر**: متاح داخل التطبيق للمستخدمين المسجلين

---

## 📄 الترخيص

هذا المشروع خاص. جميع الحقوق محفوظة.

---

<p align="center">
  <strong>تم بناءه بـ ❤️ باستخدام React + Hono + Drizzle + Gemini</strong>
</p>
