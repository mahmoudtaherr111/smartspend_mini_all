# دليل بناء وتثبيت تطبيق SmartSpend AI الموحّد على الآيفون (Flutter iOS + Liquid Glass)

الدليل ده بيشرح بالتفصيل إزاي تبني ملف `.ipa` لتطبيق **SmartSpend AI** الموحّد المبني بـ **Flutter (`mobile/app/ios/`)** مع تصميم **iOS Liquid Glass** الأصلي وتثبّته على الآيفون ليك ولصحابك **من غير ما تحتاج Mac خالص** — سواء مجاناً دلوقتي (من غير اشتراك Apple Developer بـ 99 دولار) أو لما تقرر ترفعه على **TestFlight** و **App Store**.

> **التوحيد المعماري (قرار 0022 وقرار 0050):**
> تطبيق الآيفون والأندرويد بيتبنوا الآن من نفس كود **Flutter** في `mobile/` لضمان تطابق 100% في كل المزايا (الالتزامات بشعاراتها الحقيقية، محرك الفهم الجديد، المحافظ، القفل بالـ Keychain و Face ID، اختصارات iOS App Intents، وتصميم **Liquid Glass** الأصلي عبر حزمة `mobile/packages/ios_liquid_glass`).
>
> **مهم:** خط البناء الرسمي الآن هو **`.github/workflows/ios-release.yml`** (`iOS Release`). خط البناء القديم `.github/workflows/build-ios-ipa.yml` (الذي كان يغلّف موقع `src/` الموقوف بـ Capacitor 8) أصبح **مهجوراً (Deprecated)** ولا يُنصح باستخدامه.

---

## نظرة سريعة: تختار أنهي مسار؟

| المسار (`distribution_mode`) | التكلفة | هل تحتاج Mac؟ | مناسب لمين؟ | مدة الصلاحية |
| --- | --- | --- | --- | --- |
| **`unsigned-sideload`** | **مجاني ($0)** | لا (GitHub Actions بيبني على macOS مجاناً) | ليك ولصحابك للتجربة والاستخدام اليومي فوراً | 7 أيام (يتجدد بضغطة واحدة لاسلكياً عبر SideStore من غير كمبيوتر) |
| **`app-store-testflight`** | اشتراك Apple Developer ($99 / سنة) | لا (البناء والتوقيع والرفع كله على GitHub Actions) | النشر الرسمي على TestFlight (حتى 10,000 مختبر) و App Store | بدون انتهاء صلاحية (TestFlight لمدة 90 يوم، App Store دائم) |

---

## التجهيز المشترك قبل البناء (مرة واحدة فقط)

تطبيق Flutter على الآيفون بيكلم السيرفر الإنتاجي مباشرة عبر HTTPS باستخدام `SMARTSPEND_API_URL` (وبيحفظ التوكن في Apple Keychain عبر `SessionStore` و `device_lock`).

1. تأكد إن السيرفر الإنتاجي شغال على رابط **HTTPS** (مثلاً `https://api.your-domain.com` من غير `/` في الآخر).
2. على GitHub، افتح المستودع وادخل على:
   **Settings ← Secrets and variables ← Actions ← Variables**
3. أضف Repository Variable باسم **`SMARTSPEND_API_URL`** وقيمته رابط السيرفر الإنتاجي (الـ workflow بيدعم أيضاً `VITE_API_URL` كاحتياطي، أو تقدر تكتبه يدوي في خانة `api_url` وقت التشغيل).

### المتغيرات الاختيارية (Variables & Secrets)

- **تسجيل الدخول بـ Google (اختياري — Variables):**
  - `GOOGLE_SERVER_CLIENT_ID`: معرّف عميل الويب على السيرفر (`GOOGLE_CLIENT_ID`).
  - `GOOGLE_IOS_CLIENT_ID`: معرّف عميل iOS من Google Cloud.
  - `GOOGLE_REVERSED_CLIENT_ID` *(اختياري)*: لو سبته فاضي، خط البناء بيعكس `GOOGLE_IOS_CLIENT_ID` تلقائياً ويكتبه في `mobile/app/ios/Flutter/GoogleSignIn.xcconfig`.
- **التحقق البشري عند التسجيل (اختياري — Variable):**
  - `TURNSTILE_SITE_KEY`: مفتاح Cloudflare Turnstile العام.
- **إشعارات Firebase Push على iOS (اختياري — Secret):**
  - `GOOGLE_SERVICE_INFO_PLIST_B64`: محتوى ملف `GoogleService-Info.plist` محوّل إلى Base64؛ خط البناء بيفكه تلقائياً داخل مجلد `mobile/app/ios/Runner/` ويسجّله في Xcode Resources.

---

## المسار الأول: تثبيت مجاني من غير Mac ومن غير حساب مطور ($0)

المسار ده بيخليك تبني ملف `SmartSpend-AI-iOS-unsigned.ipa` مجاناً على سيرفرات GitHub macOS وتثبّته على الآيفون من جهاز **Windows**.

### الخطوة 1: بناء ملف الـ IPA على GitHub Actions

1. افتح المستودع على GitHub واضغط على تبويب **Actions**.
2. من القائمة على الشمال اختار **iOS Release** (`.github/workflows/ios-release.yml`).
3. اضغط على زر **Run workflow** واملأ الخيارات:
   - **distribution_mode**: اختار `unsigned-sideload` (الافتراضي).
   - **api_url**: اكتب رابط السيرفر الإنتاجي `https://...` (أو سيبه فاضي لو حفظت `SMARTSPEND_API_URL` في الـ Variables).
   - **marketing_version**: اختياري (لو فاضي بياخد رقم الإصدار من `mobile/app/pubspec.yaml`).
   - **build_number**: اختياري (لو فاضي بياخد رقم تشغيل GitHub تلقائياً).
4. اضغط **Run workflow** واستنى حوالي 6–10 دقائق لحد ما البناء يخلص أخضر.
5. افتح التشغيل اللي خلص، وانزل تحت لقسم **Artifacts**، واضغط على `SmartSpend-AI-iOS-unsigned` عشان تحمّل الملف المضغوط، وفكّه هيطلعلك ملف `SmartSpend-AI-iOS-unsigned.ipa`.

---

### الخطوة 2: تثبيت الـ IPA على الآيفون من Windows

#### الخيار المفضّل: SideStore (تجديد لاسلكي من الموبايل نفسه من غير كمبيوتر!)

**تجهيز Windows (مرة واحدة):**
1. نزّل وثبّت **iTunes** و **iCloud** النسخة المباشرة من موقع Apple (**مش** نسخة Microsoft Store).
2. نزّل أداة **iLoader** الرسمية من موقع [SideStore](https://sidestore.io/) على جهاز Windows.
3. نزّل تطبيق **LocalDevVPN** من الـ App Store على الآيفون.

**تثبيت SideStore ثم SmartSpend AI:**
1. وصّل الآيفون بالكمبيوتر بكابل USB، واضغط **Trust** على شاشة الآيفون.
2. شغّل **iLoader** على Windows، وسجّل دخولك بحساب **Apple ID** المجاني، واضغط **Install SideStore (Stable)**.
3. فعّل **Developer Mode** واعمل **Trust** لملف المطور (الخطوات تحت).
4. افتح **LocalDevVPN** واضغط **Connect**، ثم افتح **SideStore** واضغط **Refresh** مرة أولى.
5. ابعت ملف `SmartSpend-AI-iOS-unsigned.ipa` للآيفون واحفظه في **Files**، ثم افتح **SideStore ← My Apps ← `+` ← اختار `SmartSpend-AI-iOS-unsigned.ipa`**.

> **التجديد كل 7 أيام:** افتح **LocalDevVPN** واضغط Connect، وافتح **SideStore** واضغط **Refresh All** — بياناتك وجلسة Keychain مش بيتمسحوا أبداً.

#### البدائل السريعة: Sideloadly أو AltStore

- **Sideloadly** ([sideloadly.io](https://sideloadly.io/)): وصّل الآيفون بـ USB، اسحب `SmartSpend-AI-iOS-unsigned.ipa` داخل Sideloadly، اكتب الـ Apple ID واضغط **Start**.
- **AltStore** ([altstore.io](https://altstore.io/)): ثبّت نفس ملف `SmartSpend-AI-iOS-unsigned.ipa` من داخل تطبيق AltStore بعلامة `+`.

---

### الخطوة 3: تفعيل Developer Mode و Trust على الآيفون (أول مرة فقط)

1. **Trust Developer Profile:** **Settings ← General ← VPN & Device Management** ← اختار حسابك تحت **Developer App** ← **Trust**.
2. **Developer Mode (iOS 16+):** **Settings ← Privacy & Security ← Developer Mode** ← فعّل الزر وأعد تشغيل الآيفون ثم اضغط **Turn On**.

---

## ربط رسايل البنك التلقائي على الآيفون (Apple Shortcuts + App Intents)

على عكس Android، نظام iOS لا يسمح لأي تطبيق بقراءة SMS أو إشعارات التطبيقات الأخرى مباشرة. لذلك يوفّر SmartSpend AI إجراء **App Intent** أصلي (`تسجيل رسالة بنك في SmartSpend`) يعمل بصمت في الخلفية بدون فتح التطبيق:

1. افتح SmartSpend AI ← **المزيد ← التقاط رسايل البنك** وفعّل الربط (يحفظ التطبيق توكن الجهاز بأمان داخل Apple Keychain).
2. افتح تطبيق **Shortcuts (الاختصارات) ← Automation (التحكم التلقائي) ← `+` ← Message (رسالة)**.
3. اختار المرسل أو الكلمة المفتاحية للبنك/المحفظة واختار **Run Immediately (التشغيل فوراً)** بدون تأكيد.
4. أضف إجراء **تسجيل رسالة بنك في SmartSpend** ومرّر له **Shortcut Input (نص الرسالة)** واسم المرسل.
5. تقدر كمان تشارك أي نص رسالة من WhatsApp أو الرسائل عن طريق رابط `smartspend://share?text=...` أو شيت المشاركة.

---

## المسار الثاني: النشر الرسمي على TestFlight و App Store (من غير Mac)

لما تشترك في [Apple Developer Program](https://developer.apple.com/) ($99 سنوياً):

### 1. تحويل ملفات التوقيع إلى Base64 على Windows PowerShell

```powershell
# 1) شهادة التوزيع (.p12) -> APPLE_CERT_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apple_distribution.p12")) | Set-Clipboard

# 2) ملف البروفايل (.mobileprovision) -> APPLE_PROVISION_PROFILE_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("SmartSpend_AppStore.mobileprovision")) | Set-Clipboard

# 3) مفتاح App Store Connect (.p8) -> APP_STORE_CONNECT_API_KEY_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

### 2. إضافة GitHub Secrets

| Secret Name | مطلوب؟ | الوصف |
| --- | --- | --- |
| `APPLE_CERT_BASE64` | مطلوب | شهادة Apple Distribution `.p12` بصيغة Base64 (يدعم أيضاً `IOS_CERTIFICATE_BASE64`) |
| `APPLE_CERT_PASSWORD` | مطلوب | كلمة سر ملف `.p12` (يدعم أيضاً `IOS_CERTIFICATE_PASSWORD`) |
| `APPLE_PROVISION_PROFILE_BASE64` | مطلوب | ملف `.mobileprovision` لتطبيق `com.smartspend.app` بصيغة Base64 (يدعم أيضاً `IOS_PROVISION_PROFILE_BASE64`) |
| `APPLE_TEAM_ID` | مطلوب | الـ Team ID المكون من 10 أحرف/أرقام |
| `APP_STORE_CONNECT_API_KEY_ID` | اختياري (TestFlight) | الـ Key ID بتاع مفتاح App Store Connect API |
| `APP_STORE_CONNECT_API_ISSUER_ID` | اختياري (TestFlight) | الـ Issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | اختياري (TestFlight) | ملف `.p8` بصيغة Base64 |
| `GOOGLE_SERVICE_INFO_PLIST_B64` | اختياري (Push) | ملف `GoogleService-Info.plist` بصيغة Base64 |

### 3. التشغيل والرفع

1. افتح **Actions ← iOS Release ← Run workflow**.
2. اختار **`distribution_mode`: `app-store-testflight`** واترك `upload_to_testflight` مفعّلة.
3. سيبني الـ workflow حزمة Flutter، يصدّر `SmartSpend-AI-iOS-appstore.ipa` بتوقيع `app-store-connect` (مع عزل التوقيع اليدوي عن حزم SwiftPM)، ويرفعه تلقائياً لـ **TestFlight** عبر `xcrun altool` ثم يمسح كل ملفات التوقيع المؤقتة.

---

## المرجع التقني لخط البناء (`.github/workflows/ios-release.yml`)

1. **اختيار أحدث Xcode على `macos-latest`**: يختار أحدث إصدار مستقر من Xcode (بما فيها Xcode 26 / iOS 26 SDK لتفعيل `UIGlassEffect` و `UIGlassContainerEffect` الحقيقي داخل `mobile/packages/ios_liquid_glass` مع Fallback لـ `UIBlurEffect` على iOS 15–18).
2. **Flutter المثبّت**: يثبّت نفس إصدار Flutter المحدد في `mobile/pubspec.yaml` ويشغّل `flutter pub get`.
3. **التغليف الآمن للروابط الرمزية (Symlink-Safe)**: في وضع `unsigned-sideload` يستخدم `ditto` + إزالة `_CodeSignature` + `zip -qry` بدلاً من `cp -r` / `zip -r` لحماية بنية `Flutter.framework` و `App.framework`، ويتحقق من وجود كل الملفات الحرجة قبل رفع الـ Artifact.
4. **مسار Capacitor القديم (Deprecated)**: الملف `.github/workflows/build-ios-ipa.yml` ومجلد `ios/` يخصّان موقع `src/` الموقوف (قرار 0050) ويُحتفظ بهما للأرشفة فقط؛ كل التحديثات والـ IPA الرسمية تصدر الآن من `mobile/app/ios/` عبر `.github/workflows/ios-release.yml`.
