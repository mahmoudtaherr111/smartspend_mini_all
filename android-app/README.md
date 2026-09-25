# SmartSpend Sync — Android companion

A small native Kotlin app (Android 8.0 and newer, `minSdk 26` in `app/build.gradle`) that reads bank and wallet
notifications on the phone and forwards them to the SmartSpend API, which turns them into transactions.

## How it works
- `DeepLinkActivity` opens on a smartspend://connect link carrying a webhook token and an ingest URL, and stores both.
  The server builds that link in GET /api/sms/android-connect (`api/sms-router.ts`).
- `SyncService` is a notification listener. It takes notifications from the SMS and financial apps named in its package
  lists, ignores chat apps, queues them, and posts them with the token to the stored ingest URL (POST /api/sms/ingest).

## Build
The Gradle wrapper is not committed. `settings.gradle` lists Google's Maven repository, where the Android plugin and
AndroidX live, and `gradle.properties` turns AndroidX on.

- Android Studio: open the `android-app` folder and build.
- Command line, with Gradle 8.x (8.14.3 is what CI uses), JDK 17 and an Android SDK with platform 34 (`ANDROID_HOME`, or
  `sdk.dir` in `local.properties`):

```bash
cd android-app
gradle assembleDebug
```

The debug APK is written under app/build/outputs/apk/debug/. `assembleRelease` works too, but `app/build.gradle` signs
release builds with the debug key; add a real signing configuration before publishing.

## Distribution
The web app's Android setup screen (`src/components/bank-sync/AndroidSetupFlow.tsx`) downloads
/downloads/smartspend-sync.apk. `.github/workflows/build-apk.yml` runs when `android-app/` or the workflow changes on
main: it builds the debug APK with a pinned Gradle, uploads it as a workflow artifact, and commits it under
the web app's public downloads folder, which the web build serves. Each CI build is signed with the runner's own debug
key, so a new APK does not install over an older one until a fixed release key is configured.
