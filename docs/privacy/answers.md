# Statutory Privacy Disclosures & App Store Questionnaire Answers

## 1. Statutory Data Categories & Retention Policy (Egypt Law 151/2020)

Under Egyptian Personal Data Protection Law No. 151 of 2020 (Articles 4 & 12), SmartSpend AI collects and processes only the personal and financial data strictly required to deliver ledger, budgeting, and account security services. Each category enforces explicit statutory retention limits and legal bases:

| Category | Collected | Purpose | Retention | Legal Basis | Code Citations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `financial_transactions` | Yes (`true`) | `ledger_recording` | `3650` days (10 years) | `Egypt Law 151/2020 Art. 4 (User Consent)` | `api/expense-router.ts`, `api/services/ledger-writer.ts`, `db/schema.ts` (`expenses`) |
| `device_identifiers` | Yes (`true`) | `account_security` | `180` days (6 months) | `Fraud prevention and session security` | `api/session-router.ts`, `db/schema.ts` (`sessions`, `audit_logs`) |
| `contact_support` | Yes (`true`) | `support` | `365` days (1 year) | `Customer service request fulfillment` | `api/support-router.ts`, `db/schema.ts` (`support_tickets`) |

### Detailed Category Notes:
1. **Financial Transactions (`financial_transactions`)**:
   - **Retention (3650 days / 10 years)**: In accordance with Egyptian commercial and tax accounting statutory retention obligations, user financial transaction records are retained for active bookkeeping and tax compliance. Users retain the right to delete their transactions or purge their account at any time.
   - **Legal Basis**: Explicit consent granted at registration under Egypt Law 151/2020 Article 4.
2. **Device Identifiers (`device_identifiers`)**:
   - **Retention (180 days)**: Device identifiers, installation UUIDs, and trusted session metadata are retained to prevent brute-force attacks, detect suspicious concurrent logins, and verify session authenticity.
   - **Legal Basis**: Legitimate security interests under fraud prevention and session integrity standards.
3. **Customer Support (`contact_support`)**:
   - **Retention (365 days)**: Support conversations, inquiries, and ticket resolutions are retained for customer service continuity and dispute resolution.
   - **Legal Basis**: Egypt Law 151/2020 Article 4 & 12 (fulfillment of user-requested service agreements).

---

## 2. Apple App Store Privacy Manifest (`PrivacyInfo.xcprivacy`)

The iOS client declares its privacy practices in `mobile/app/ios/Runner/PrivacyInfo.xcprivacy`:

### 2.1 Tracking & Domains
- **Tracking (`NSPrivacyTracking`)**: `false`. The application does not track users across third-party apps or websites.
- **Tracking Domains (`NSPrivacyTrackingDomains`)**: Empty (`[]`).

### 2.2 Accessed API Reasons (`NSPrivacyAccessedAPITypes`)
- **`NSPrivacyAccessedAPICategoryUserDefaults`**: Reason `CA92.1` (storing app preferences and local onboarding status).
- **`NSPrivacyAccessedAPICategoryFileTimestamp`**: Reason `C617.1` (verifying local receipt cache and SQLite ledger timestamps).
- **`NSPrivacyAccessedAPICategorySystemBootTime`**: Reason `35F9.1` (calculating relative elapsed time for biometric security timeouts).

### 2.3 Collected Data Types (`NSPrivacyCollectedDataTypes`)
- **Financial Info (`NSPrivacyCollectedDataTypeFinancialInfo`)**: Linked: `true`, Tracking: `false`, Purpose: `NSPrivacyCollectedDataTypePurposeAppFunctionality`.
- **Contact Info (`NSPrivacyCollectedDataTypePhoneNumber`, `NSPrivacyCollectedDataTypeName`, `NSPrivacyCollectedDataTypeCustomerSupport`)**: Linked: `true`, Tracking: `false`, Purpose: `NSPrivacyCollectedDataTypePurposeAppFunctionality`.
- **User Identifiers (`NSPrivacyCollectedDataTypeUserID`, `NSPrivacyCollectedDataTypeDeviceID`)**: Linked: `true`, Tracking: `false`, Purpose: `NSPrivacyCollectedDataTypePurposeAppFunctionality`.
- **Audio Data (`NSPrivacyCollectedDataTypeAudioData`)**: Linked: `true`, Tracking: `false`, Purpose: `NSPrivacyCollectedDataTypePurposeAppFunctionality` (real-time voice streaming for expense dictation, immediately converted to text and never stored as raw audio files).

---

## 3. Google Play Data Safety Declaration

### 3.1 Data Collection & Sharing
- **Data Shared**: None. User data is never sold or shared with external third-party advertisers or data brokers.
- **Data Collected**:
  - Financial info (Purchase history, expenses, budget targets).
  - Personal info (Name, Phone number for OTP authentication).
  - Audio (Voice recordings streamed solely during active dictation).
  - Device or other IDs (Device ID, Firebase FCM token for notifications).

### 3.2 Security Practices
- **Data Encrypted in Transit**: All data transmitted between the mobile application, web client, and backend server is encrypted using TLS 1.3 over HTTPS.
- **Account Deletion Mechanism**:
  - **In-App Deletion**: Users can delete their account directly within the app under `Settings -> Account -> Delete Account` (`auth.deleteAccount` / `localAuth.deleteAccount`).
  - **Public Web Deletion URL**: `https://smartspend.ai/delete-account` allows users to request full account deletion without reinstalling the app.
  - **Data Purge Lifecycle**: The account is immediately deactivated and scheduled for permanent hard deletion via `api/services/user-purge-service.ts` within 30 days.
