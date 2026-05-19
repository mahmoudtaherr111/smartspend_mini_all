# SmartSpend Sync — Android App Build Guide

## الملفات الجاهزة

جميع الـ Source Code موجود في `android-app/`:
```
android-app/
├── build.gradle                              ← root config
├── app/
│   ├── build.gradle                          ← dependencies + minSdk
│   └── src/main/
│       ├── AndroidManifest.xml               ← Deep Link + permissions
│       ├── java/com/smartspend/sync/
│       │   ├── DeepLinkActivity.kt           ← Entry point + setup UI
│       │   └── SyncService.kt                ← NotificationListenerService
│       └── res/layout/
│           └── activity_main.xml             ← UI layout
```

## بناء الـ APK

### الطريقة 1: Android Studio (الأسهل)
1. افتح Android Studio
2. File → Open → اختر مجلد `android-app`
3. انتظر Gradle sync (أول مرة فقط)
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. الـ APK هتلاقيه في: `app/build/outputs/apk/release/app-release.apk`

### الطريقة 2: Command Line
```bash
cd android-app
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

## بعد البناء

انسخ الـ APK لـ:
```
smartspend_V1_fixed/public/downloads/smartspend-sync.apk
```

## بدائل APK (لو مش عندك Android Studio دلوقتي)

يمكن بناء الـ APK أونلاين عبر:
- **GitHub Actions** — ضع الكود على GitHub + workflow يبني APK تلقائياً
- **Codemagic.io** — CI/CD مجاني لـ Android
- **Appetize.io** — للتجربة فقط (بدون تحميل)
