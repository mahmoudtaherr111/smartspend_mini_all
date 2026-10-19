package com.smartspend.device_lock

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.view.WindowManager
import androidx.annotation.RequiresApi
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Answers the Dart side of device_lock (pigeons/device_lock_api.dart) on Android.
 *
 * Biometrics are bound to a key, not to a callback (OWASP MASTG-BEST-0036): an AES key in the Android Keystore that
 * only a class 3 biometric can use, once per use, and that the Keystore destroys when someone enrols a new
 * fingerprint or face (MASTG-BEST-0037). Unlocking means decrypting a secret with that key; a hooked "success"
 * callback cannot do it. The framework BiometricPrompt needs Android 11 (API 30) for class 3 only, so older phones
 * open with the PIN.
 */
class DeviceLockPlugin : FlutterPlugin, ActivityAware, DeviceLockHostApi {
    private var context: Context? = null
    private var activity: Activity? = null
    private var coverEnabled = false

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        DeviceLockHostApi.setUp(binding.binaryMessenger, this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        DeviceLockHostApi.setUp(binding.binaryMessenger, null)
        context = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        applyCover()
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = onAttachedToActivity(binding)

    override fun onDetachedFromActivityForConfigChanges() {
        activity = null
    }

    override fun onDetachedFromActivity() {
        activity = null
    }

    override fun capabilities(): LockCapabilities {
        val context = requireContext()
        val kind = biometricKind(context.packageManager)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return LockCapabilities(kind, BiometricAvailability.UNSUPPORTED)
        }
        val manager = context.getSystemService(BiometricManager::class.java)
        val availability = when (manager?.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricAvailability.READY
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricAvailability.NOT_ENROLLED
            else -> BiometricAvailability.UNSUPPORTED
        }
        return LockCapabilities(kind, availability)
    }

    override suspend fun enrollBiometrics(text: BiometricPromptText): BiometricResult {
        val activity = activity
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || activity == null) {
            return BiometricResult(BiometricOutcome.UNAVAILABLE)
        }
        forgetBiometrics()
        val cipher = try {
            Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, newBiometricKey()) }
        } catch (e: GeneralSecurityException) {
            // No secure lock screen, or no class 3 biometric enrolled: the Keystore refuses such a key.
            forgetBiometrics()
            return BiometricResult(BiometricOutcome.UNAVAILABLE)
        }
        val (outcome, unlocked) = authenticate(activity, text, cipher)
        if (unlocked == null) {
            forgetBiometrics()
            return BiometricResult(outcome)
        }
        return try {
            val secret = ByteArray(SECRET_BYTES).also { SecureRandom().nextBytes(it) }
            val sealed = unlocked.iv + unlocked.doFinal(secret)
            BiometricResult(BiometricOutcome.SUCCESS, secret = secret, sealed = sealed)
        } catch (e: GeneralSecurityException) {
            forgetBiometrics()
            BiometricResult(BiometricOutcome.FAILED)
        }
    }

    override suspend fun unlockWithBiometrics(text: BiometricPromptText, sealed: ByteArray?): BiometricResult {
        val activity = activity
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || activity == null) {
            return BiometricResult(BiometricOutcome.UNAVAILABLE)
        }
        if (sealed == null || sealed.size <= IV_BYTES) return BiometricResult(BiometricOutcome.FAILED)
        val key = keyStore().getKey(BIOMETRIC_KEY, null) as? SecretKey
            ?: return BiometricResult(BiometricOutcome.CHANGED)
        val cipher = try {
            Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
            }
        } catch (e: KeyPermanentlyInvalidatedException) {
            // A fingerprint or face was added or removed since the key was made.
            forgetBiometrics()
            return BiometricResult(BiometricOutcome.CHANGED)
        } catch (e: GeneralSecurityException) {
            return BiometricResult(BiometricOutcome.FAILED)
        }
        val (outcome, unlocked) = authenticate(activity, text, cipher)
        if (unlocked == null) return BiometricResult(outcome)
        return try {
            val secret = unlocked.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
            BiometricResult(BiometricOutcome.SUCCESS, secret = secret)
        } catch (e: GeneralSecurityException) {
            BiometricResult(BiometricOutcome.FAILED)
        }
    }

    override fun forgetBiometrics() {
        val store = keyStore()
        if (store.containsAlias(BIOMETRIC_KEY)) store.deleteEntry(BIOMETRIC_KEY)
    }

    override fun pinTag(input: ByteArray, create: Boolean): ByteArray {
        val store = keyStore()
        val key = store.getKey(PIN_KEY, null) as? SecretKey
            ?: if (create) newPinKey() else throw FlutterError("no-pin-key", "the PIN key is gone", null)
        return Mac.getInstance("HmacSHA256").apply { init(key) }.doFinal(input)
    }

    override fun forgetPinKey() {
        val store = keyStore()
        if (store.containsAlias(PIN_KEY)) store.deleteEntry(PIN_KEY)
    }

    override fun setSwitcherCover(enabled: Boolean) {
        coverEnabled = enabled
        applyCover()
    }

    private fun applyCover() {
        val activity = activity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Recents shows the window background instead of a screenshot; screenshots stay possible.
            activity.setRecentsScreenshotEnabled(!coverEnabled)
        } else if (coverEnabled) {
            // Before Android 13 the only way to keep the content out of Recents, which also blocks screenshots.
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private suspend fun authenticate(
        activity: Activity,
        text: BiometricPromptText,
        cipher: Cipher,
    ): Pair<BiometricOutcome, Cipher?> = suspendCancellableCoroutine { continuation ->
        val cancel = CancellationSignal()
        continuation.invokeOnCancellation { cancel.cancel() }
        var finished = false
        fun finish(outcome: BiometricOutcome, unlocked: Cipher?) {
            if (finished) return
            finished = true
            continuation.resume(outcome to unlocked)
        }
        val prompt = BiometricPrompt.Builder(activity)
            .setTitle(text.title)
            .setSubtitle(text.reason)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setConfirmationRequired(false)
            .setNegativeButton(text.usePin, activity.mainExecutor) { _, _ ->
                finish(BiometricOutcome.CANCELLED, null)
            }
            .build()
        prompt.authenticate(
            BiometricPrompt.CryptoObject(cipher),
            cancel,
            activity.mainExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val unlocked = result.cryptoObject?.cipher
                    finish(if (unlocked == null) BiometricOutcome.FAILED else BiometricOutcome.SUCCESS, unlocked)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    finish(outcomeOf(errorCode), null)
                }
                // onAuthenticationFailed is one finger or face not recognised; the prompt stays open for another try.
            },
        )
    }

    private fun outcomeOf(errorCode: Int) = when (errorCode) {
        BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
        BiometricPrompt.BIOMETRIC_ERROR_CANCELED,
        BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT -> BiometricOutcome.CANCELLED
        BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT,
        BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT -> BiometricOutcome.LOCKED_OUT
        BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS,
        BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT,
        BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE,
        BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL -> BiometricOutcome.UNAVAILABLE
        else -> BiometricOutcome.FAILED
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun newBiometricKey(): SecretKey {
        val spec = KeyGenParameterSpec.Builder(
            BIOMETRIC_KEY,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            // 0 seconds: every use of the key needs its own biometric prompt.
            .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(true)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
            .apply { init(spec) }
            .generateKey()
    }

    private fun newPinKey(): SecretKey {
        val spec = KeyGenParameterSpec.Builder(PIN_KEY, KeyProperties.PURPOSE_SIGN).build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KEYSTORE)
            .apply { init(spec) }
            .generateKey()
    }

    private fun biometricKind(packages: PackageManager): BiometricKind {
        val kinds = buildList {
            if (packages.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) add(BiometricKind.FINGERPRINT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (packages.hasSystemFeature(PackageManager.FEATURE_FACE)) add(BiometricKind.FACE)
                if (packages.hasSystemFeature(PackageManager.FEATURE_IRIS)) add(BiometricKind.IRIS)
            }
        }
        return when (kinds.size) {
            0 -> BiometricKind.NONE
            1 -> kinds.single()
            else -> BiometricKind.SEVERAL
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    private fun requireContext(): Context =
        context ?: throw FlutterError("detached", "device_lock is not attached to an engine", null)

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val BIOMETRIC_KEY = "smartspend.lock.biometric"
        const val PIN_KEY = "smartspend.lock.pin"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
        const val SECRET_BYTES = 32
    }
}
