# SmartSpend AI — Native Device Prerequisites & Hardware Capabilities

This document outlines the hardware capabilities, platform permissions, and fallback mechanisms implemented across SmartSpend AI mobile clients (`CAP-04`, `CAP-06`, `SEC-F3`, `GAP-03..05`).

---

## 1. Hardware Capability Matrix & Fallback Behaviors

| Capability | Android Permission | iOS Capability / Permission | Fallback Behavior | Architecture Reference |
| :--- | :--- | :--- | :--- | :--- |
| `sms_bank_capture` | `RECEIVE_SMS` / `BIND_NOTIFICATION_LISTENER_SERVICE` | `N/A (Notification Extension)` / Shortcuts App Intent | `manual_entry` | `CAP-04`, `CAP-06`, `mobile/packages/bank_capture` |
| `biometric_lock` | `USE_BIOMETRIC` (BiometricPrompt) | `NSFaceIDUsageDescription` (LocalAuthentication) | `pin_prompt` | `SEC-F3`, `mobile/packages/device_lock` |
| `receipt_camera` | `CAMERA` | `NSCameraUsageDescription` | `gallery_upload` / `manual_entry` | `GAP-03..05`, `mobile/app/lib/src/features/receipt` |
| `microphone` | `RECORD_AUDIO` / `FOREGROUND_SERVICE_MICROPHONE` | `NSMicrophoneUsageDescription` | `text_chat` | `AI-09`, `GAP-06`, `mobile/app/lib/src/features/ai` |

---

## 2. Capability Details & Implementation

### 2.1 SMS Bank & Wallet Capture (`sms_bank_capture`)
- **Android**:
  - Requires `android.permission.RECEIVE_SMS` and optional Notification Listener Service (`android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`) to intercept incoming transactional messages from Egyptian banks (e.g. CIB, NBE, Banque Misr, QNB, AlexBank) and mobile wallets (Vodafone Cash, InstaPay, Orange Money, Etisalat Cash).
  - All parsing is performed on-device via regex rules in `mobile/packages/bank_capture`.
- **iOS**:
  - iOS sandboxing prohibits direct SMS intercept without user-configured automation. Handled via Apple Shortcuts App Intent or Notification Service Extension (`N/A (Notification Extension)`).
- **Graceful Fallback (`manual_entry`)**:
  - If permissions are denied or unsupported on the device, the app falls back to `manual_entry` where users enter expenses via natural language text or voice in the Quick Record screen.

### 2.2 Biometric Lock (`biometric_lock`)
- **Android**:
  - Requires `android.permission.USE_BIOMETRIC`. Invokes Android `BiometricPrompt` supporting Class 3 (Strong) biometrics (Fingerprint, Face Unlock).
- **iOS**:
  - Requires `NSFaceIDUsageDescription` in `Info.plist`. Invokes Apple `LocalAuthentication` framework for Face ID and Touch ID.
- **Graceful Fallback (`pin_prompt`)**:
  - When biometric authentication is unavailable, hardware is un-enrolled, or user declines biometrics, the app falls back to `pin_prompt` (secure 6-digit application PIN with cryptographic salt and PBKDF2 verification).

### 2.3 Receipt Camera (`receipt_camera`)
- **Android**:
  - Requires `android.permission.CAMERA`. Utilizes camera sensor for capturing physical paper receipts.
- **iOS**:
  - Requires `NSCameraUsageDescription`.
- **Graceful Fallback**:
  - Users can select existing images from their photo gallery (`gallery_upload`) or type expense details manually.

### 2.4 Microphone for Voice Intake (`microphone`)
- **Android**:
  - Requires `android.permission.RECORD_AUDIO` and `android.permission.FOREGROUND_SERVICE_MICROPHONE`.
- **iOS**:
  - Requires `NSMicrophoneUsageDescription`.
- **Graceful Fallback**:
  - Users can type their expenses or financial questions directly into the AI Center chat interface (`text_chat`).
