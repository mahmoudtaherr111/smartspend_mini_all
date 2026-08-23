# SmartSpend AI — المنصة الذكية المتكاملة لإدارة وتتبع المصاريف والسلوك المالي 🚀

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&style=flat-square" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&style=flat-square" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&style=flat-square" />
  <img src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&style=flat-square" />
  <img src="https://img.shields.io/badge/tRPC-11-2596BE?logo=trpc&style=flat-square" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?logo=drizzle&style=flat-square" />
  <img src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&style=flat-square" />
  <img src="https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&style=flat-square" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.5-4285F4?logo=google&style=flat-square" />
</p>

---

## 🌟 نظرة عامة على المشروع (Overview)

**SmartSpend AI** هو نظام متكامل (Full-Stack Enterprise Web & Mobile Platform) صُمم خصيصاً لإدارة وتتبع الأمور المالية الشخصية والتجارية بطريقة فائقة الذكاء، وبتركيز كامل على **المستخدم العربي والمصري** وتفكيك المصاريف الطبيعية باللغة العامية المصرية عبر الذكاء الاصطناعي والقراءة التلقائية للرسائل البنكية.

### ✨ أبرز المميزات:
- 🧠 **محرك تصنيف هجين خماسي الطبقات (5-Layer Hybrid Pipeline):** يجمع بين ذاكرة العضلات الصفرية التكلفة (Zero-Token Cache)، ومحرك القواعد المحلية (Rule Engine)، والبحث الدلالي (Vector Embedding)، ونموذج Google Gemini AI لتحليل الجمل المصرية المعقدة وتفكيك المصاريف المتداخلة في أجزاء من الثانية.
- 📲 **التقاط تلقائي للرسائل البنكية و Apple Pay:** تطبيق أندرويد مصاحب (`android-app/`) ومستمعات iOS لالتقاط رسائل البنوك المصرية والمحافظ الإلكترونية (فودافون كاش، إنستاباي، CIB، الأهلي) وتسجيلها لحظياً.
- 💬 **مساعد مالي ذكي عبر الـ WhatsApp:** تسجيل المصاريف أو الاستعلام المالي عبر إرسال رسائل صوتية أو نصية مباشرة لبوت الـ WhatsApp.
- 🔐 **أمان فائق ومصادقة مزدوجة:** دعم كامل لتسجيل الدخول عبر Google OAuth 2.0، و **WebAuthn Passkeys** (بصمة الإصبع والوجه)، ونظام صلاحيات متقدم (RBAC: Admin vs Pro vs User).

---

## 📚 الدليل البرمجي الموحد والشروحات التخصصية (`docs/`)

> **ملاحظة هامة للمطورين ولأنظمة الذكاء الاصطناعي (AI Single Source of Truth):**
> تم بناء وتصميم شروحات المشروع وفق أحدث معايير هندسة السياق البرمجي للذكاء الاصطناعي (AI Context Packing). بدلاً من حشو آلاف السطور في ملف واحد، تم تقسيم المعمارية وقاعدة البيانات إلى **9 ملفات مرجعية متخصصة في مجلد `docs/`**.
> 
> **يرجى قراءة الملف المعني مباشرة بمهمتك:**

| الموضوع / النطاق البرمجي | الملف المرجعي المعتمد (SSoT) | محتويات الملف ومحاوره الرئيسية |
| :--- | :--- | :--- |
| **هوية الذكاء الاصطناعي والدستور البرمجي** | [`AGENTS.md`](file:///e:/smartspend_V1_fixed/AGENTS.md) | **الدستور الإجباري لأي AI Agent** يدخل المشروع: التقنيات، القيود الصارمة (tRPC v11, Drizzle)، والأوامر السريعة. |
| **المعمارية الشاملة وهيكل المدخلات** | [`docs/01-ARCHITECTURE.md`](file:///e:/smartspend_V1_fixed/docs/01-ARCHITECTURE.md) | شجرة الملفات الرسمية، دور الفرونت إند والباك إند، وتدفق البيانات، كاش الإعدادات، والـ Cron jobs. |
| **قاعدة البيانات والجداول (48 جدول)** | [`docs/02-DATABASE_SCHEMA.md`](file:///e:/smartspend_V1_fixed/docs/02-DATABASE_SCHEMA.md) | المرجع الكامل لـ 48 جدولاً في `db/schema.ts` مع 100% تغطية للعلاقات في `db/relations.ts` والفهارس الـ 15. |
| **محرك التصنيف الهجين والذكاء الاصطناعي** | [`docs/03-AI_CLASSIFICATION_ENGINE.md`](file:///e:/smartspend_V1_fixed/docs/03-AI_CLASSIFICATION_ENGINE.md) | شرح الطبقات الخمس لمحرك التصنيف، ذاكرة العضلات، مفكك النصوص المصرية، وتكامل النماذج (Gemini, Groq, NVIDIA). |
| **نقاط الـ API والـ Routers والعقود** | [`docs/04-API_AND_TRPC_ROUTERS.md`](file:///e:/smartspend_V1_fixed/docs/04-API_AND_TRPC_ROUTERS.md) | فهرس الـ 21 Sub-router، المعاملات المالية الذرية (ACID Transactions)، والتقسيم المصفح (Pagination). |
| **نظام المصادقة والصلاحيات والأمان** | [`docs/05-AUTH_AND_SECURITY.md`](file:///e:/smartspend_V1_fixed/docs/05-AUTH_AND_SECURITY.md) | نظام الدخول المزدوج (Google OAuth + Passkeys)، إدارة الجلسات (`google_session`)، وصلاحيات الـ RBAC. |
| **الرسائل التلقائية و Apple Pay و WhatsApp** | [`docs/06-SMS_AND_APPLE_PAY.md`](file:///e:/smartspend_V1_fixed/docs/06-SMS_AND_APPLE_PAY.md) | التكامل مع تطبيق الأندرويد، التقاط إشعارات Apple Pay، بوت الـ WhatsApp، وإشعارات Firebase Push. |
| **مركز الذكاء الاصطناعي والشات الذكي** | [`docs/07-AI_CENTER_AGENT.md`](file:///e:/smartspend_V1_fixed/docs/07-AI_CENTER_AGENT.md) | معمارية شات البوت الذكي، مسار تجميع SQL الفائق السرعة، نظام الـ RAG، والذاكرة الدلالية. |
| **عقد بناء المنتج وخريطة التطوير** | [`docs/08-AI_AGENT_PRODUCT_AND_REBUILD_PLAN.md`](file:///e:/smartspend_V1_fixed/docs/08-AI_AGENT_PRODUCT_AND_REBUILD_PLAN.md) | خريطة الطريق، ربط جهات الاتصال، وتتبع سجلات التصنيف، وسياسات استهلاك الـ Tokens. |
| **دليل النشر والاستجابة للحوادث** | [`docs/09-RELEASE_AND_PLAYBOOK.md`](file:///e:/smartspend_V1_fixed/docs/09-RELEASE_AND_PLAYBOOK.md) | بوابات ما قبل الإطلاق، خطوات النشر، تشخيص واسترجاع قواعد البيانات وحوادث مزودي الـ AI. |

---

## 🚀 أوامر التشغيل والتهيئة السريعة (Quick Start)

### 1️⃣ تثبيت الحزم والمكتبات
```bash
npm install
```

### 2️⃣ إعداد متغيرات البيئة `.env`
قم بنسخ ملف الإعدادات وإضافة اتصال قاعدة البيانات ومفاتيح Google Gemini:
```bash
cp .env.example .env
```

### 3️⃣ تحديث ومزامنة قاعدة البيانات (Drizzle Migrations)
```bash
# توليد ملفات الـ migrations بناءً على db/schema.ts
npm run db:generate

# دفع التعديلات مباشرة إلى قاعدة بيانات MySQL 8
npm run db:push
```

### 4️⃣ تشغيل بيئة التطوير (Development Servers)
```bash
# تشغيل الفرونت إند والباك إند معاً (Vite Dev Server + Hono Plugin)
npm run dev

# أو لتشغيل خادم الباك إند منفصلاً باستخدام tsx watch:
npm run backend:dev
```

### 5️⃣ فحص الأكواد والتوافق البرمجي (Validation & Type-Checking)
```bash
# فحص توافق أنواع TypeScript لجميع ملفات الفرونت والباك (tRPC Type-Safety Check)
npm run check
```

---

## 🏛️ هيكل المجلدات الرئيسي للمشروع (Summary Tree)

```text
smartspend_V1_fixed/
├── AGENTS.md        # 🤖 دستور وموجهات الذكاء الاصطناعي (AI System Prompt)
├── README.md        # 🚀 واجهة المشروع الحالية (هذا الملف)
├── docs/            # 📚 ملفات الشروحات التخصصية الحية (6 ملفات مرجعية + أرشيف)
├── contracts/       # 📑 العقود والأنواع المشتركة (Shared Zod Schemas & Limits)
├── db/              # 🗄️ جداول Drizzle ORM (48 جدول في schema.ts + Migrations)
├── api/             # ⚙️ الباك إند (Hono Server + 21 tRPC Routers + AI Engines)
├── src/             # 💻 الفرونت إند (React 18 + Vite + Tailwind CSS + 40+ shadcn UI)
├── android-app/     # 📱 تطبيق الأندرويد المصاحب لالتقاط رسائل البنوك
└── ios/             # 🍏 إعدادات ومستمعات التقاط إشعارات Apple Pay في iOS
```

---

<p align="center">
  صُنع بشغف لتقديم أفضل تجربة إدارة مالية ذكية ومؤتمتة للمستخدم العربي والمصري 🇪🇬💡
</p>
