# Privacy: implementation references

This is a starting point for reviewing privacy disclosures, not a completed App Store or legal questionnaire. Code and
configuration alone do not establish legal bases, statutory retention periods, actual deployment settings, or all
third-party SDK and provider practices. Review those separately before publishing a disclosure.

## Data and retention in code

- The ledger stores transactions in `expenses` (`db/schema.ts`); `api/jobs/data-retention-job.ts` does not impose a
  ten-year expiration on that table. User-owned ledger rows are included in the account purge.
- The retention job lists individual policies in `RETENTION_POLICIES`. For example it targets captured signals after
  30 days and, where enabled with consent, redacted capture samples after 365 days. It runs only when cron jobs are
  enabled, and a failure for one policy is caught and logged. These are code thresholds, not a guarantee of deletion
  at an exact time or a statement of legal obligations.
- The Flutter account deletion screen calls `profile.deleteMyAccount`; the API verifies confirmation and, for local
  accounts, the password, then calls `purgeUserData` in a transaction and invalidates the principal. See
  [accounts](../systems/accounts.md) and `api/services/user-purge-service.ts` for scope. This is not a scheduled
  30-day deletion process. Assess backups and third-party data separately.
- Android bank-message capture and its redaction, consent and provider path are described in
  [bank messages](../systems/bank-messages.md). The app can transmit data to configured AI providers; avoid a blanket
  claim that no data is shared without examining the current provider configuration and disclosure rules.
- Flutter dictation records a temporary audio file, reads and deletes it, then sends the audio for transcription
  (`mobile/app/lib/src/features/ledger/voice/audio_recorder_service.dart`). It is not accurate to say no raw audio file
  is ever stored. Review provider processing and failure paths separately.

## iOS manifest

`mobile/app/ios/Runner/PrivacyInfo.xcprivacy` declares tracking false, no tracking domains, and the accessed API
reason codes `CA92.1`, `C617.1` and `35F9.1`. It declares financial information, phone number, name, user and device
IDs, audio data and customer support as linked, not tracking, for app functionality. Those are manifest declarations;
they are not proof that the declarations cover every app or dependency behaviour.

## Transport and account deletion

The supplied Nginx configuration permits TLS 1.2 and 1.3, not only TLS 1.3. Whether a particular deployment uses it
and how all connections are protected depend on deployment configuration. The Flutter app exposes account deletion
in settings. The parked website is not deployed by the default production build; do not promise a public deletion URL
without checking the deployed service.
