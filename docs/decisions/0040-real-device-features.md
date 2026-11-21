# 0040. Device features are real or hidden

The app must never show a feature that only looks like it works. Voice recording, receipts, sharing and store purchases
now use maintained plugins, and the live call stays hidden until it carries real audio (`liveCallsEnabled`).

| Package | Why |
| --- | --- |
| `record` | Microphone, compressed mono audio to a temporary file that is deleted once read |
| `image_picker` | System camera and gallery, which scale and compress the photo and ask for their own permission |
| `share_plus` | The system share sheet |
| `in_app_purchase` | The Flutter team's plugin for Google Play Billing and StoreKit |

These run only on a device, so widget tests use fakes kept in `mobile/app/test/support/device_fakes.dart`. A fake in
`lib/` is not allowed. A feature counts as finished only after it has run on a real device.
