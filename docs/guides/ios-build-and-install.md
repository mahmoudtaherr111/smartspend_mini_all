# دليل بناء وتثبيت تطبيق SmartSpend AI على الآيفون (iOS)

الدليل ده بيشرح بالتفصيل إزاي تبني ملف `.ipa` حقيقي لتطبيق **SmartSpend AI** وتثبّته على الآيفون ليك ولصحابك **من غير ما تحتاج Mac خالص** — سواء مجاناً دلوقتي (من غير اشتراك Apple Developer بـ 99 دولار) أو لما تقرر ترفعه على **TestFlight** و **App Store**.

> المبني في هذا الدليل يعتمد على `.github/workflows/build-ios-ipa.yml` و `capacitor.config.ts` و `ios/App/App.xcodeproj`. راجع [دليل النشر](deploy.md) لتشغيل السيرفر الإنتاجي أولاً.

---

## نظرة سريعة: تختار أنهي مسار؟

| المسار | التكلفة | هل تحتاج Mac؟ | مناسب لمين؟ | مدة الصلاحية |
| --- | --- | --- | --- | --- |
| **المسار الأول: `unsigned-sideload`** | **مجاني ($0)** | لا (GitHub Actions بيبني على macOS مجاناً) | ليك ولصحابك للتجربة والاستخدام اليومي فوراً | 7 أيام (يتجدد بضغطة واحدة لاسلكياً عبر SideStore من غير كمبيوتر) |
| **المسار الثاني: `app-store-testflight`** | اشتراك Apple Developer ($99 / سنة) | لا (البناء والتوقيع والرفع كله على GitHub Actions) | النشر الرسمي على TestFlight (حتى 10,000 مختبر) و App Store | بدون انتهاء صلاحية (TestFlight لمدة 90 يوم، App Store دائم) |

---

## التجهيز المشترك قبل البناء (مرة واحدة فقط)

تطبيق الآيفون بيعمل بواجهة محلية داخل Capacitor (`capacitor://localhost`) وبيكلم السيرفر الإنتاجي بتاعك عبر HTTPS من خلال المتغير `VITE_API_URL`.

1. تأكد إن السيرفر الإنتاجي شغال على رابط **HTTPS** (مثلاً `https://api.your-domain.com` من غير `/` في الآخر).
2. على GitHub، افتح المستودع بتاعك وادخل على:
   **Settings ← Secrets and variables ← Actions ← Variables**
3. أضف Repository Variable باسم `VITE_API_URL` وقيمته رابط السيرفر الإنتاجي (أو تقدر تكتبه يدوي كل مرة وانت بتشغّل البناء).

### المتغيرات الاختيارية للواجهة (Variables)

لو شغال عندك Firebase Push Notifications على السيرفر، تقدر تضيف المتغيرات دي كـ Repository Variables (كلها اختيارية — راجع [قائمة المتغيرات](../atlas/env.md)):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`
- `VITE_VAPID_PUBLIC_KEY`

> **ملاحظة تقنية مهمة:**
> - لا تضبط `VITE_CDN_URL` في بناء الآيفون؛ لازم يفضل فاضي عشان ملفات الواجهة تتحمّل محلياً من جوه التطبيق.
> - الـ workflow بيسيب `VITE_TURNSTILE_SITE_KEY` فاضي في بناء الآيفون عشان Cloudflare Turnstile ما يمنعش الطلبات من `capacitor://localhost` إلا لو ضفت الدومين ده صراحة في إعدادات Cloudflare.

---

## المسار الأول: تثبيت مجاني من غير Mac ومن غير حساب مطور ($0)

المسار ده بيخليك تبني ملف `SmartSpend-AI-iOS-unsigned.ipa` مجاناً على سيرفرات GitHub macOS وتثبّته على الآيفون من جهاز **Windows**.

### الخطوة 1: بناء ملف الـ IPA على GitHub Actions

1. افتح المستودع على GitHub واضغط على تبويب **Actions**.
2. من القائمة على الشمال اختار **Build iOS IPA**.
3. اضغط على زر **Run workflow** واملأ الخيارات:
   - **build_mode**: سيبها على `unsigned-sideload` (الافتراضي).
   - **api_url**: اكتب رابط السيرفر الإنتاجي `https://...` (أو سيبه فاضي لو حفظت `VITE_API_URL` في الـ Variables).
   - **marketing_version**: اختياري (لو فاضي بياخد رقم الإصدار من `package.json`).
   - **build_number**: اختياري (لو فاضي بياخد رقم تشغيل GitHub تلقائياً).
4. اضغط **Run workflow** واستنى حوالي 4–7 دقائق لحد ما البناء يخلص أخضر.
5. افتح التشغيل اللي خلص، وانزل تحت لقسم **Artifacts**، واضغط على `SmartSpend-AI-iOS-unsigned` عشان تحمّل الملف المضغوط، وفكّه هيطلعلك ملف `SmartSpend-AI-iOS-unsigned.ipa`.

---

### الخطوة 2: تثبيت الـ IPA على الآيفون من Windows

قدامك طريقتين ممتازين من Windows — **SideStore** هي الأفضل للاستخدام اليومي، و **Sideloadly** هي الأسرع لو عايز تجربة سريعة بكابل USB.

#### الخيار المفضّل: SideStore (تجديد لاسلكي من الموبايل نفسه من غير كمبيوتر!)

ليه **SideStore** هو الأفضل ليك ولصحابك؟ لأنك بتوصّل الآيفون بالكمبيوتر **مرة واحدة بس** في الأول، وبعدها تقدر تجدّد التطبيق أو تحدّثه كل أسبوع من الآيفون نفسه عن طريق Wi-Fi من غير ما تحتاج الكمبيوتر تاني.

**تجهيز Windows (مرة واحدة):**
1. نزّل وثبّت **iTunes** و **iCloud** النسخة المباشرة من موقع Apple (**مش** نسخة Microsoft Store — لو عندك نسخة Microsoft Store امسحها الأول).
2. نزّل أداة **iLoader** الرسمية من موقع [SideStore](https://sidestore.io/) على جهاز Windows.
3. نزّل تطبيق **LocalDevVPN** من الـ App Store على الآيفون (ده تطبيق شبكة محلية loopback آمن بيخلي SideStore يجدّد التطبيقات من الموبايل نفسه من غير كمبيوتر).

**تثبيت SideStore على الآيفون:**
1. وصّل الآيفون بالكمبيوتر بكابل USB، افتح شاشة الآيفون واضغط **Trust** لو ظهرتلك.
2. شغّل **iLoader** على Windows، وسجّل دخولك بحساب **Apple ID** المجاني بتاعك (حساس لحالة الأحرف).
3. اختار الآيفون بتاعك واضغط **Install SideStore (Stable)** — الأداة هتثبّت SideStore وتجهّز ملف الـ Pairing تلقائياً.
4. على الآيفون، فعّل **Developer Mode** واعمل **Trust** لملف المطور (الخطوات بالتفصيل تحت).
5. افتح تطبيق **LocalDevVPN** على الآيفون واضغط **Connect**.
6. افتح تطبيق **SideStore**، سجّل دخولك بنفس الـ Apple ID، واضغط على عدّاد **7 Days** جنب SideStore عشان يعمل أول Refresh.

**تثبيت SmartSpend AI جوه SideStore:**
1. ابعت ملف `SmartSpend-AI-iOS-unsigned.ipa` للآيفون بتاعك (عبر iCloud Drive أو Telegram أو WhatsApp أو Google Drive) واحفظه في تطبيق **Files**.
2. تأكد إن **LocalDevVPN** متصل (Connected) وإنك على Wi-Fi.
3. افتح **SideStore ← My Apps ← علامة `+` فوق ← اختار `SmartSpend-AI-iOS-unsigned.ipa`**.
4. استنى ثواني لحد ما يتوقّع ويتثبّت، ومبروك عليك **SmartSpend AI** بأيقونته الكاملة وتصميم Liquid Glass الأصلي!

> **التجديد كل 7 أيام:** قبل ما الـ 7 أيام يخلصوا، افتح **LocalDevVPN** واضغط Connect، وافتح **SideStore** واضغط **Refresh All**. العملية بتاخد 10 ثواني من غير كمبيوتر ولا كابل!

#### الخيار البديل الأسرع: Sideloadly (أبسط خطوة واحدة بالـ USB)

لو عايز تثبّت الملف فوراً بأقل خطوات:
1. نزّل **Sideloadly** من [sideloadly.io](https://sideloadly.io/) على Windows (مع وجود iTunes النسخة المباشرة).
2. وصّل الآيفون بكابل USB، واسحب ملف `SmartSpend-AI-iOS-unsigned.ipa` جوه نافذة Sideloadly.
3. اكتب الـ Apple ID المجاني بتاعك واضغط **Start** (هيطلب الباسورد وكود 2FA في أول مرة).
4. بعد ما يخلص، فعّل Developer Mode و Trust Developer Profile على الآيفون، وافتح التطبيق.
   - *(ملاحظة: Sideloadly بيدعم التجديد التلقائي Wi-Fi Auto-Refresh طول ما جهاز Windows شغال على نفس شبكة الواي فاي).*

#### خيار بديل ثالث: AltStore

لو بتستخدم [AltStore](https://altstore.io/) بالفعل على Windows مع AltServer، تقدر تثبّت نفس ملف `SmartSpend-AI-iOS-unsigned.ipa` مباشرة من داخل تطبيق AltStore على الآيفون بعلامة `+` (يتطلب تشغيل AltServer على Windows وقت التجديد كل 7 أيام).

---

### الخطوة 3: تفعيل Developer Mode و Trust على الآيفون (ضروري في أول مرة)

1. **الوثوق في شهادة المطور (Trust Developer Profile):**
   - افتح على الآيفون: **Settings ← General ← VPN & Device Management**.
   - تحت **Developer App** اضغط على إيميل Apple ID بتاعك، واضغط **Trust** ثم أكّد **Trust**.
2. **تفعيل وضع المطور (Developer Mode — مطلوب في iOS 16 والأحدث):**
   - افتح على الآيفون: **Settings ← Privacy & Security ← Developer Mode** (في آخر الصفحة).
   - *(لو مش ظاهرلك Developer Mode، هيبان تلقائياً بمجرد تثبيت أول تطبيق بـ SideStore أو Sideloadly).*
   - فعّل الزر، الآيفون هيعمل Restart، وبعد ما يفتح اضغط **Turn On** وادخل الباسكود.

---

### قيود حساب Apple ID المجاني (مهم تعرفها)

| القيد | التفاصيل | الحل العملي |
| --- | --- | --- |
| **صلاحية 7 أيام** | أي تطبيق متثبّت بحساب Apple ID مجاني صلاحيته 7 أيام فقط. | جدّده قبل ما ينتهي بضغطة زر في **SideStore** (مع LocalDevVPN) — بياناتك وتسجيل دخولك **مش بيتمسحوا** أبداً أثناء التجديد. |
| **حد 3 تطبيقات نشطة** | حساب Apple المجاني بيسمح بحد أقصى 3 تطبيقات Sideload شغالة في نفس الوقت. | SideStore بياخد خانة واحدة، و **SmartSpend AI** بياخد خانة، ويفضل عندك خانة تالتة فاضية (أو استخدم Sideloadly لو عايز الـ 3 خانات كاملة). |
| **حد 10 App IDs أسبوعياً** | Apple بتسمح بـ 10 معرّفات تطبيقات خلال 7 أيام. | SmartSpend AI تطبيق واحد من غير Extensions إضافية، فبيستهلك **App ID واحد بس**. |

---

### إزاي صحابك يثبّتوا التطبيق على موبايلاتهم؟

**نفس ملف `SmartSpend-AI-iOS-unsigned.ipa` الواحد يشتغل عند كل صحابك!**

1. نزّل ملف `SmartSpend-AI-iOS-unsigned.ipa` مرة واحدة من GitHub Actions.
2. ابعته لصحابك (Telegram / WhatsApp كملف Document / Google Drive).
3. **كل صاحب يثبّت الملف باستخدام حساب Apple ID المجاني بتاعه هو** (عبر SideStore أو Sideloadly) — أوعى تشارك إيميلك أو باسوردك مع حد!
4. كل واحد فيهم هيدخل بحسابه في SmartSpend AI عادي وكل بياناته مربوطة بالسيرفر الإنتاجي بتاعك.
5. لما تنزّل تحديث جديد، بتبني `.ipa` جديد وتبعتهولهم، ويختاروه في SideStore فبيتحدث فوق القديم من غير ما يمسح بياناتهم.

---

## المسار الثاني: النشر الرسمي على TestFlight و App Store (برضه من غير Mac!)

لما تشترك في [Apple Developer Program](https://developer.apple.com/) ($99 سنوياً)، تقدر تحوّل نفس الـ workflow عشان يوقّع التطبيق رسمياً بشهادة Apple Distribution ويرفعه أوتوماتيك على **TestFlight** ومنه للـ **App Store** من غير ما تلمس Mac.

### الخطوة 1: تجهيز ملفات التوقيع من Apple

1. من [Apple Developer Portal](https://developer.apple.com/):
   - تأكد من تسجيل App ID صريح (Explicit) بالمعرّف `com.smartspend.app`.
   - أنشئ شهادة **Apple Distribution** وصدّرها بصيغة `.p12` مع باسورد قوي.
   - أنشئ **App Store Connect Provisioning Profile** مربوط بـ `com.smartspend.app` وشهادة التوزيع، وحمّله بصيغة `.mobileprovision`.
   - انسخ **Team ID** (مكون من 10 أحرف وأرقام، موجود في Membership details).
2. *(اختياري — للرفع التلقائي على TestFlight)* من [App Store Connect](https://appstoreconnect.apple.com/):
   - أنشئ التطبيق بالمعرّف `com.smartspend.app`.
   - ادخل على **Users and Access ← Integrations ← App Store Connect API** وأنشئ مفتاح بصلاحية **App Manager** أو **Developer**.
   - حمّل ملف المفتاح `.p8` (بيتحمّل مرة واحدة بس!) واحفظ الـ **Key ID** و الـ **Issuer ID**.

### الخطوة 2: تحويل الملفات لـ Base64 على Windows PowerShell

افتح PowerShell في الفولدر اللي فيه ملفات التوقيع وشغّل الأوامر دي (كل أمر بينسخ النتيجة للـ Clipboard جاهزة للصق في GitHub):

```powershell
# 1) شهادة التوزيع (.p12) -> APPLE_CERT_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apple_distribution.p12")) | Set-Clipboard

# 2) ملف البروفايل (.mobileprovision) -> APPLE_PROVISION_PROFILE_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("SmartSpend_AppStore.mobileprovision")) | Set-Clipboard

# 3) مفتاح App Store Connect (.p8) -> APP_STORE_CONNECT_API_KEY_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

### الخطوة 3: إضافة GitHub Secrets

ادخل على المستودع في GitHub: **Settings ← Secrets and variables ← Actions ← Secrets** وأضف الـ Secrets دي:

| Secret Name | مطلوب؟ | الوصف |
| --- | --- | --- |
| `APPLE_CERT_BASE64` | مطلوب | شهادة Apple Distribution `.p12` محوّلة لـ Base64 |
| `APPLE_CERT_PASSWORD` | مطلوب | كلمة سر ملف الـ `.p12` |
| `APPLE_PROVISION_PROFILE_BASE64` | مطلوب | ملف `.mobileprovision` الخاص بـ App Store لـ `com.smartspend.app` بصيغة Base64 |
| `APPLE_TEAM_ID` | مطلوب | الـ Team ID المكون من 10 أحرف/أرقام |
| `APP_STORE_CONNECT_API_KEY_ID` | اختياري (للرفع على TestFlight) | الـ Key ID بتاع مفتاح App Store Connect API |
| `APP_STORE_CONNECT_API_ISSUER_ID` | اختياري (للرفع على TestFlight) | الـ Issuer ID الموجود أعلى قائمة المفاتيح |
| `APP_STORE_CONNECT_API_KEY_BASE64` | اختياري (للرفع على TestFlight) | ملف `.p8` محوّل لـ Base64 |

### الخطوة 4: تشغيل البناء والرفع على TestFlight

1. افتح **Actions ← Build iOS IPA ← Run workflow**.
2. اختار **build_mode**: `app-store-testflight`.
3. تأكد إن **upload_to_testflight** مفعّلة (`true`) لو ضفت مفاتيح App Store Connect API.
4. اضغط **Run workflow**:
   - الـ workflow هيفك التشفير في Keychain مؤقت، يبني Archive، يصدّر `SmartSpend-AI-iOS-appstore.ipa` باستخدام `ExportOptions.plist` (`app-store-connect`)، ويرفع الملف كـ Artifact.
   - لو مفاتيح App Store Connect API موجودة، هيرفعه مباشرة لـ **TestFlight** عبر `xcrun altool` ويمسح كل ملفات التوقيع المؤقتة فوراً بعد الانتهاء.
   - خلال 5–15 دقيقة هتلاقي النسخة ظهرت في App Store Connect جاهزة لدعوة صحابك عبر تطبيق **TestFlight** أو تقديمها لمراجعة **App Store**.

---

## المرجع التقني لخط البناء (CI Architecture)

ملف الـ workflow في `.github/workflows/build-ios-ipa.yml` بيعمل الخطوات دي بالترتيب:

1. **البيئة (`macos-latest`)**: بيشتغل على Apple Silicon macOS، ويدوّر أوتوماتيك على أحدث نسخة مستقرة من Xcode متثبّتة على السيرفر (مثلاً Xcode 26 مع iOS 26 SDK لتفعيل تأثيرات **Liquid Glass** الأصلية `UIGlassEffect`، مع توافق كامل للرجوع لـ UIKit glass fallback على iOS 15–18 أو Xcode 16).
2. **بناء الواجهة**: بيشغّل Node 22 + `npm ci` + `npm run frontend:build` مع حقن `VITE_API_URL` (والمتغيرات الاختيارية).
3. **مزامنة Capacitor 8 و Swift Package Manager**:
   - بيشغّل `npx cap sync ios` لتحديث حزم SPM في `ios/App/CapApp-SPM/Package.swift` ونسخ الإعدادات.
   - بيشغّل `npm run cap:sync` لتنظيف أصول الويب داخل `ios/App/App/public` وإزالة ملفات السيرفر المضغوطة.
   - بيحل حزم Swift Package Manager عبر `xcodebuild -resolvePackageDependencies` (المشروع بيعتمد على **SPM** فقط بدون CocoaPods).
4. **البناء والتغليف**:
   - في وضع `unsigned-sideload`: بيبني الهدف `App` من `ios/App/App.xcodeproj` لمنصة `generic/platform=iOS` بدون توقيع (`CODE_SIGNING_ALLOWED=NO`)، ويغلّف حزمة **Payload/App.app** جوه `SmartSpend-AI-iOS-unsigned.ipa`، ويتحقق من وجود الملفات الأساسية قبل رفع الـ Artifact.
   - في وضع `app-store-testflight`: بيعمل `xcodebuild archive` و `-exportArchive` بشهادة التوزيع والبروفايل، ويرفع `SmartSpend-AI-iOS-appstore.ipa` ويسلّمه اختيارياً لـ TestFlight.

---

## حل المشاكل الشائعة (Troubleshooting)

- **فشل البناء برسالة `VITE_API_URL is required`:**
  نسيت تكتب رابط السيرفر في خانة `api_url` وما ضفتش `VITE_API_URL` في Repository Variables.
- **التطبيق فتح بس مش قادر يتصل بالسيرفر:**
  تأكد إن `VITE_API_URL` بيبدأ بـ `https://` ومن غير `/` في آخره، وإن السيرفر شغال وبيرد على `/health`.
- **iLoader أو Sideloadly مش شايف الآيفون على Windows:**
  امسح نسخة iTunes / iCloud بتاعة Microsoft Store وثبّت النسخ المباشرة من موقع Apple، وتأكد إنك ضغطت **Trust** على شاشة الآيفون.
- **خطأ في SideStore أثناء التجديد (AFC / Pairing error):**
  تأكد إن تطبيق **LocalDevVPN** متصل (Connected) وإن الواي فاي شغال؛ لو استمر الخطأ، وصّل الآيفون بالكمبيوتر مرة واحدة وحدّث ملف الـ Pairing من داخل **iLoader**.
- **التطبيق مش بيفتح بعد مرور 7 أيام:**
  ده معناه شهادة Apple المجانية انتهت؛ افتح **SideStore** (مع **LocalDevVPN**) واضغط **Refresh All** وهيشتغل فوراً بكل بياناتك القديمة من غير أي فقدان.
