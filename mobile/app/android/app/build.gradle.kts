import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.smartspend.app"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // The id the store listing keeps (capacitor.config.ts), so the Flutter build can replace the Capacitor one.
        applicationId = "com.smartspend.app"
        // Target Android 16 (API 36) with minSdk 24 (Android 7.0)
        minSdk = 24
        targetSdk = 36
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["appLabel"] = "SmartSpend"
    }

    signingConfigs {
        create("release") {
            val keyPropertiesFile = rootProject.file("key.properties")
            if (keyPropertiesFile.exists()) {
                val properties = Properties()
                keyPropertiesFile.inputStream().use { properties.load(it) }
                val keystorePath = properties.getProperty("storeFile")
                if (keystorePath != null) {
                    storeFile = file(keystorePath)
                    storePassword = properties.getProperty("storePassword")
                    keyAlias = properties.getProperty("keyAlias")
                    keyPassword = properties.getProperty("keyPassword")
                }
            }
        }
    }

    buildTypes {
        debug {
            // Installs next to a store build, and says so under its icon.
            applicationIdSuffix = ".dev"
            manifestPlaceholders["appLabel"] = "SmartSpend Dev"
        }
        release {
            val releaseSigning = signingConfigs.getByName("release")
            signingConfig = if (releaseSigning.storeFile?.exists() == true) {
                releaseSigning
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// The SMS build only; the default build has no SMS permission (see settings.gradle.kts).
if (providers.gradleProperty("smartspend.sms").orNull == "true") {
    dependencies {
        implementation(project(":bank_capture_sms"))
    }
}
