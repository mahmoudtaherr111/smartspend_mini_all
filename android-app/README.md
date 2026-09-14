# SmartSpend Sync — Android companion

A small native Kotlin app (Android 8.0 and newer, `minSdk 26` in `app/build.gradle`) that reads bank and wallet
notifications on the phone and forwards them to the SmartSpend API, which turns them into transactions.

## How it works
- `DeepLinkActivity` opens on a smartspend://connect link carrying a webhook token and an ingest URL, and stores both.
  The server builds that link in GET /api/sms/android-connect (`api/sms-router.ts`).
- `SyncService` is a notification listener. It takes notifications from the SMS and financial apps named in its package
  lists, ignores chat apps, queues them, and posts them with the token to the stored ingest URL (POST /api/sms/ingest).

## Build
The Gradle wrapper is not committed.

- Android Studio: open the `android-app` folder and build.
- Command line, with Gradle and JDK 17 installed:

```bash
cd android-app
gradle wrapper
./gradlew assembleDebug
```

The debug APK is written under app/build/outputs/apk/debug/. `assembleRelease` works too, but `app/build.gradle` signs
release builds with the debug key; add a real signing configuration before publishing.

## Distribution
The web app's Android setup screen (`src/components/bank-sync/AndroidSetupFlow.tsx`) downloads /downloads/smartspend-sync.apk.
`.github/workflows/build-apk.yml` builds a debug APK on pushes to main or master, uploads it as a workflow artifact, and then
tries to commit it to public/downloads on main. That file is not in the repository today, so the download link serves the
web app's index page instead of an APK.
