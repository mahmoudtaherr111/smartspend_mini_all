# Mobile device capabilities

This guide describes the Flutter app in `mobile/`. Check the platform manifests and feature code when changing a
permission; a declaration alone does not establish that a feature works on a device.

| Capability | Current implementation | If unavailable |
| --- | --- | --- |
| Bank and wallet messages | Android's notification listener receives notifications from supported apps after the user enables access. The separate SMS build declares `RECEIVE_SMS` and `READ_SMS`; the store build does not. iOS capture is not implemented. | Enter the transaction manually. See [bank messages](../systems/bank-messages.md) for consent, filtering and server processing. |
| App lock | `mobile/packages/device_lock` uses native biometrics when available and enrolled. The app PIN uses a random salt and an HMAC key in the Keystore or Keychain (`mobile/app/lib/src/features/lock/lock_store.dart`). | Use the app PIN; the lock screen offers sign-out if the PIN is forgotten. |
| Receipt | `receipt_image_service.dart` opens the system camera or gallery picker; iOS declares camera and photo-library usage descriptions. | Choose an existing image or enter the transaction manually. |
| Voice recording | Android declares `RECORD_AUDIO`; iOS declares microphone usage. `audio_recorder_service.dart` records to a temporary file for speech-to-text. | Type the entry instead. |

The Flutter AI Center's live call is disabled (`liveCallsEnabled` in `ai_center_screen.dart`): microphone and speaker
audio are not yet connected. Do not treat the call screen or a manifest comment as evidence of a working background
microphone service. The parked website's voice call is described separately in [live voice assistant](../systems/voice-calls.md).

For Android build variants and release artifacts, see [deployment](deploy.md#mobile) and
`.github/workflows/android-release.yml`. Device behaviour still needs testing on real hardware.
