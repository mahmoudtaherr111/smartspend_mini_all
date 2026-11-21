# دليل إعداد حسابات المطورين للمدفوعات واشتراكات المتاجر (Owner Setup Steps)
## Google Play Console & Apple App Store Connect Configuration

توضح هذه الوثيقة الخطوات الإجرائية المطلوبة من مالك المشروع لتجهيز وتفعيل اشتراكات تطبيق SmartSpend AI على متجري Google Play و Apple App Store وربطها مع خادم التطبيق.

---

### أولاً: متجر Google Play (Google Play Console)

#### 1. إعداد حساب الخدمة (Google Cloud Service Account)
1. الدخول إلى [Google Cloud Console](https://console.cloud.google.com/) واختيار مشروع التطبيق المرتبط بـ Play Console.
2. الانتقال إلى **IAM & Admin** > **Service Accounts** وإنشاء حساب خدمة جديد باسم: `smartspend-play-billing-service`.
3. تفعيل واجهة برمجة التطبيقات: **Google Play Android Developer API**.
4. إنشاء مفتاح بصيغة JSON وتحميله، ووضعه في مسار آمن على خادم الإنتاج.
5. في **Google Play Console**، التوجه إلى **Users & Permissions** > **Invite new user** وإضافة البريد الإلكتروني لحساب الخدمة، ومنحه الصلاحيات المالية وإدارة الطلبات والاشتراكات:
   - *View financial data, orders, and cancellation survey responses*
   - *Manage orders and subscriptions*

#### 2. إعداد إشعارات المطورين الفورية (RTDN - Real-time Developer Notifications)
1. في Google Cloud Pub/Sub، إنشاء Topic جديد باسم:
   `projects/smartspend-prod/topics/play-billing-rtdn`
2. منح حساب Google Play التالي دور الناشر (Pub/Sub Publisher):
   `google-play-developer-notifications@system.gserviceaccount.com`
3. إنشاء اشتراك (Push Subscription) متصل بالـ Topic برابط Webhook الخادم:
   `https://api.smartspend.ai/api/webhooks/google-play`
4. في Google Play Console > **Monetization setup** > **Real-time developer notifications**:
   - إدخال اسم الـ Topic الكامل وحفظ الإعدادات وإرسال إشعار اختباري للتأكد من وصوله بنجاح إلى الخادم.

#### 3. إعداد منتجات الاشتراكات (In-App Subscriptions)
1. الانتقال إلى **Monetize** > **Subscriptions**.
2. إنشاء الاشتراك الشهري والسنوي:
   - **Product ID:** `pro_monthly` | السعر: 99.00 جنيه مصري / شهرياً.
   - **Product ID:** `pro_yearly` | السعر: 990.00 جنيه مصري / سنوياً.
3. ضبط فترة السماح (Grace Period) على **16 يوماً**، وتعليق الحساب (Account Hold) على **30 يوماً**.
4. إضافة حسابات مطورين في **License Testing** لاختبار عمليات الشراء دون خصم أموال حقيقية.

---

### ثانياً: متجر Apple App Store (App Store Connect)

#### 1. إعداد مجموعة الاشتراكات ومنتجات StoreKit 2
1. تسجيل الدخول إلى [App Store Connect](https://appstoreconnect.apple.com/) واختيار تطبيق SmartSpend AI.
2. التوجه إلى **Subscriptions** وإنشاء مجموعة اشتراكات جديدة باسم `smartspend_pro`.
3. إضافة خطط الاشتراك:
   - **Product ID:** `pro_monthly` | الاسم: SmartSpend Pro Monthly | المستوى: Tier 1 (99 EGP).
   - **Product ID:** `pro_yearly` | الاسم: SmartSpend Pro Yearly | المستوى: Tier 1 (990 EGP).
4. تفعيل ميزة **Billing Grace Period** لمنح المستخدم فترة سماح في حال فشل تجديد بطاقة الدفع.

#### 2. إعداد إشعارات خادم المتجر (App Store Server Notifications v2)
1. في صفحة التطبيق في App Store Connect، الانتقال إلى **App Information** > **App Store Server Notifications**.
2. ضبط رابط خادم الإشعارات للبيئة الإنتاجية وبيئة الاختبار (Sandbox):
   - **Production Server URL:** `https://api.smartspend.ai/api/webhooks/apple-asn`
   - **Sandbox Server URL:** `https://api.smartspend.ai/api/webhooks/apple-asn`
   - **Version:** Version 2 (StoreKit 2 ES256 Signed JWS).

#### 3. توليد مفاتيح الوصول لخادم التطبيق (In-App Purchase Server API Key)
1. في App Store Connect > **Users and Access** > **Integrations** > **In-App Purchase**.
2. إنشاء مفتاح جديد، وتحميل ملف المفتاح الخاص (`AuthKey_XXXXXXXXXX.p8`).
3. تسجيل القيم التالية في متغيرات البيئة للخادم:
   - `APPLE_KEY_ID`: معرّف المفتاح.
   - `APPLE_ISSUER_ID`: معرّف المصدر (Issuer UUID).
   - `APPLE_BUNDLE_ID`: `com.smartspend.app`.

#### 4. حسابات الاختبار (Sandbox Testers)
1. في **Users and Access** > **Sandbox** > **Testers**، إنشاء حسابات اختبارية لتجربة عمليات الشراء السريعة والتحقق من تجديد الاشتراك وتجربة حالات الفشل والإلغاء والاستعادة.
