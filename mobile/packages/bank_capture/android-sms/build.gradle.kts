// The SMS build only (plan v6 §6.1): this module adds nothing but the SMS permissions and the receiver to the app's
// merged manifest. The default build never includes it, so it declares no SMS permission and reads no SMS. Build it
// with `flutter build apk --android-project-arg=smartspend.sms=true` once Google Play approved the declaration.
plugins {
    id("com.android.library")
}

android {
    namespace = "com.smartspend.bank_capture.sms"
    compileSdk = 36
    defaultConfig {
        minSdk = 24
    }
}
