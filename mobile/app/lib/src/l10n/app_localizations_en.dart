// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'SmartSpend';

  @override
  String get navRecord => 'Record';

  @override
  String get navStats => 'Stats';

  @override
  String get navAi => 'AI Center';

  @override
  String get navCalendar => 'Calendar';

  @override
  String get navMore => 'More';

  @override
  String get screenInProgress =>
      'This screen is still being built in the new app.';

  @override
  String get captureAndroidTitle => 'Bank and wallet notifications';

  @override
  String get captureAndroidBody =>
      'The app reads your bank and wallet notifications and asks you about each transaction before recording it.';

  @override
  String get captureIosTitle => 'Bank messages from Shortcuts';

  @override
  String get captureIosBody =>
      'An automation in the Shortcuts app sends each bank message to the app as it arrives.';

  @override
  String get captureOn => 'On';

  @override
  String get captureOff => 'Off';

  @override
  String get captureOpenSettings => 'Open settings';

  @override
  String get captureOpenShortcuts => 'Open Shortcuts';

  @override
  String get captureStatusFailed =>
      'We can\'t tell its state right now. Try again.';

  @override
  String get captureStart => 'Turn on bank message recording';

  @override
  String get captureConsentTitle => 'Before we start';

  @override
  String get captureConsentBody =>
      'We read only the notifications and messages of bank and wallet apps. Personal messages and codes never leave your phone. A message with a transaction goes to the server to be read, with its numbers hidden, and is deleted after 30 days. Nothing is recorded until you approve it.';

  @override
  String get captureConsentAgree => 'I agree, continue';

  @override
  String get captureUnavailable =>
      'Bank message recording isn\'t available yet. We\'ll let you know when it is.';

  @override
  String get captureConnectFailed =>
      'We couldn\'t turn it on right now. Check your connection and try again.';

  @override
  String get captureNeedsAccess =>
      'One step left: open Settings and let the app read notifications.';

  @override
  String get captureNotificationsOff =>
      'Notifications are off, so we can\'t ask you about transactions from the notification shade. You\'ll find them here.';

  @override
  String captureWaiting(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count messages waiting to be sent.',
      one: 'One message waiting to be sent.',
      zero: 'No messages waiting to be sent.',
    );
    return '$_temp0';
  }

  @override
  String get captureAiReadingTitle => 'Let AI read unclear messages';

  @override
  String get captureAiReadingBody =>
      'When we can\'t read a bank message\'s amount or kind, we send it to AI with your numbers hidden, and ask you before recording anything.';

  @override
  String get captureAiReadingFailed =>
      'We couldn\'t save your choice. Try again.';

  @override
  String get captureUpdateRequired =>
      'This version of the app is too old for bank message capture. Update the app, and waiting messages will be sent after.';

  @override
  String get captureOffline => 'Waiting for a connection to send.';

  @override
  String get captureRevoked =>
      'This device was disconnected. Turn it on again here.';

  @override
  String captureReviewEntry(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count transactions waiting for you',
      one: 'One transaction waiting for you',
      zero: 'No transactions waiting for you',
    );
    return '$_temp0';
  }

  @override
  String get captureReviewTitle => 'Bank transactions';

  @override
  String get captureReviewEmpty => 'No transactions waiting for you.';

  @override
  String get captureReviewFailed =>
      'We can\'t load the transactions right now. Try again.';

  @override
  String get captureRecord => 'Record';

  @override
  String get captureDismiss => 'Not mine';

  @override
  String get captureAmountLabel => 'Amount in pounds';

  @override
  String get captureAmountNeeded =>
      'The message has an amount in another currency. Type what was charged in pounds.';

  @override
  String get captureCheckAmount =>
      'We\'re not sure about this amount; check it before recording.';

  @override
  String get captureMaybeDuplicate =>
      'This may be the same payment as the one before. If you paid twice, tap \"Record\"; if it is the same one, tap \"Not mine\".';

  @override
  String captureAutoOffer(String source) {
    return 'Record these «$source» transactions on their own from now on?';
  }

  @override
  String get captureAutoOfferBody =>
      'You confirmed the last 3 as they were read. If you agree, we record them without asking and send a notification with \"Undo\".';

  @override
  String get captureAutoYes => 'Yes';

  @override
  String get captureAutoNo => 'No, ask me';

  @override
  String captureUsage(int used, int limit) {
    return '$used of $limit recorded this month.';
  }

  @override
  String captureHeld(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count transactions saved; they are recorded if you subscribe to Pro.',
      one: 'One transaction saved; it is recorded if you subscribe to Pro.',
    );
    return '$_temp0';
  }

  @override
  String get captureAnswerFailed => 'We couldn\'t save your answer. Try again.';

  @override
  String get signInTitle => 'Welcome to SmartSpend';

  @override
  String get signInSubtitle =>
      'Sign in with your phone number or your Google account.';

  @override
  String get phoneLabel => 'Phone number';

  @override
  String get passwordLabel => 'Password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get signInButton => 'Sign in';

  @override
  String get orSeparator => 'or';

  @override
  String get signInWithGoogle => 'Continue with Google';

  @override
  String get noAccountPrompt => 'No account yet?';

  @override
  String get createAccount => 'Create one';

  @override
  String get sessionEnded => 'Your session ended. Sign in again.';

  @override
  String get enterPhoneAndPassword => 'Enter your phone number and password.';

  @override
  String tryAgainIn(int seconds) {
    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'Try again in $seconds seconds.',
      one: 'Try again in a second.',
    );
    return '$_temp0';
  }

  @override
  String get googleFailed =>
      'We couldn\'t finish signing in with Google. Try again.';

  @override
  String get registerTitle => 'New account';

  @override
  String get registerSubtitle => 'Sign up with your Egyptian mobile number.';

  @override
  String get nameLabel => 'Your name';

  @override
  String get passwordHint => 'At least 6 characters';

  @override
  String get referralLabel => 'Invite code (optional)';

  @override
  String get registerButton => 'Create account';

  @override
  String get haveAccountPrompt => 'Already have an account?';

  @override
  String get goToSignIn => 'Sign in';

  @override
  String get enterRegisterFields =>
      'Enter your name, phone number and password.';

  @override
  String get nameTooShort => 'Your name needs at least two letters.';

  @override
  String get passwordTooShort => 'The password needs at least 6 characters.';

  @override
  String get humanCheckPending => 'One moment while the check finishes.';

  @override
  String get verifyTitle => 'Confirm your number on WhatsApp';

  @override
  String get verifyBody =>
      'Send this code to the SmartSpend bot from the WhatsApp of the number you entered. As soon as it arrives we finish creating your account.';

  @override
  String get verifyCodeLabel => 'Confirmation code';

  @override
  String get verifySendOnWhatsApp => 'Send it on WhatsApp';

  @override
  String get verifyCopyCode => 'Copy the code';

  @override
  String get verifyCodeCopied => 'Code copied.';

  @override
  String get verifyWaiting => 'Waiting for your message…';

  @override
  String verifyTimeLeft(String time) {
    return '$time left';
  }

  @override
  String get verifyWrongSender =>
      'The code came from a different WhatsApp number than the one you\'re signing up with. Send it from that number.';

  @override
  String get verifyExpired => 'Time to confirm ran out. Ask for a new code.';

  @override
  String get verifyDone => 'Number confirmed. Setting up your account…';

  @override
  String get verifyBack => 'Back to edit';

  @override
  String get verifyBotUnavailable =>
      'The WhatsApp bot isn\'t running right now. Try again shortly, or sign in another way.';

  @override
  String verifyWhatsAppText(String code) {
    return 'Activate my account: $code';
  }

  @override
  String get whatsappNotOpened =>
      'We couldn\'t open WhatsApp. Copy the code and send it to the bot yourself.';

  @override
  String get accountTitle => 'Your account';

  @override
  String get signOut => 'Sign out';

  @override
  String summarySpentIn(String month) {
    return 'Spent in $month';
  }

  @override
  String get summaryIncome => 'Income';

  @override
  String get summaryNet => 'Net';

  @override
  String summaryCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count transactions',
      one: 'One transaction',
      zero: 'No transactions',
    );
    return '$_temp0';
  }

  @override
  String get summaryLoadFailed =>
      'We can\'t load this month\'s summary right now.';

  @override
  String get recentTitle => 'Latest transactions';

  @override
  String get seeAll => 'See all';

  @override
  String get ledgerEmptyTitle => 'No transactions yet';

  @override
  String get ledgerEmptyBody =>
      'Type your first expense below in your own words, and we\'ll sort it for you.';

  @override
  String get ledgerLoadFailed =>
      'We can\'t load your transactions right now. Check your connection and try again.';

  @override
  String get retry => 'Try again';

  @override
  String get composerHint => 'Type what you spent… e.g. coffee 50 and Uber 120';

  @override
  String get composerSend => 'Send';

  @override
  String savedAuto(String summary) {
    return 'Saved automatically: $summary';
  }

  @override
  String savedManual(String summary) {
    return 'Saved: $summary';
  }

  @override
  String savedItemsSummary(int count, String total) {
    return '$count transactions · $total';
  }

  @override
  String get undo => 'Undo';

  @override
  String get undone => 'Undone.';

  @override
  String get undoFailed => 'We couldn\'t undo it. Delete it from the list.';

  @override
  String get nothingToSave =>
      'We couldn\'t find an amount in that. Add the amount and try again.';

  @override
  String get reviewTitle => 'Check before we save';

  @override
  String get reviewSave => 'Save';

  @override
  String get reviewEdit => 'Edit the text';

  @override
  String get clarifyDefault => 'Could you say a bit more?';

  @override
  String get clarifyAnswerLabel => 'Your answer';

  @override
  String get clarifySend => 'Send answer';

  @override
  String get clarifyLater => 'Later';

  @override
  String get transactionsTitle => 'All transactions';

  @override
  String get entryDeleted => 'Transaction deleted.';

  @override
  String get deleteFailed => 'We couldn\'t delete it. Try again.';

  @override
  String get deleteAction => 'Delete';

  @override
  String get queuedOffline =>
      'You\'re offline. We saved it here and will send it as soon as you\'re back.';

  @override
  String get offlineBanner =>
      'You\'re offline. What you record is kept here and sent when you\'re back.';

  @override
  String offlineFull(int limit) {
    String _temp0 = intl.Intl.pluralLogic(
      limit,
      locale: localeName,
      other: '$limit entries',
      one: '1 entry',
    );
    return 'The offline list is full ($_temp0 on your plan). Connect to send them, then record again.';
  }

  @override
  String get offlineTooShort =>
      'That is too short. Write what you spent on and how much.';

  @override
  String get offlineUnreadable =>
      'We can\'t read that. Write what you spent on and how much.';

  @override
  String get offlineNoAmount =>
      'We couldn\'t find an amount. Write it in numbers or words (e.g. 50 pounds, fifty transport).';

  @override
  String get outboxTitle => 'Not recorded yet';

  @override
  String get outboxQueued => 'Waiting for the internet';

  @override
  String get outboxSending => 'Sending…';

  @override
  String get outboxNeedsReview => 'Needs your review';

  @override
  String get outboxNeedsAnswer => 'Needs your answer';

  @override
  String get outboxFailed => 'Not sent. Tap it to send it again.';

  @override
  String get outboxSendNow => 'Send it now';

  @override
  String get outboxDelete => 'Delete it';

  @override
  String get lockTitle => 'Enter your PIN';

  @override
  String lockDigitsEntered(int count, int total) {
    return '$count of $total entered';
  }

  @override
  String get lockDelete => 'Delete digit';

  @override
  String get lockWrong => 'Wrong PIN. Try again.';

  @override
  String lockWrongWarning(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tries',
      one: '1 try',
    );
    return 'Wrong PIN. $_temp0 left, then you will be signed out on this phone.';
  }

  @override
  String lockWait(String time) {
    return 'Try again in $time.';
  }

  @override
  String get lockBiometricsChanged =>
      'The biometrics on this phone changed, so unlocking with them is off. Use your PIN, then turn them on again in Security and privacy.';

  @override
  String get lockBiometricsLockedOut =>
      'The phone paused biometrics after too many tries. Use your PIN.';

  @override
  String get lockBiometricsFailed =>
      'We couldn\'t confirm it\'s you. Use your PIN.';

  @override
  String get lockDamaged =>
      'We can\'t read the app lock on this phone. Sign out and sign in again.';

  @override
  String get lockForgot => 'Forgot your PIN?';

  @override
  String get lockForgotBody =>
      'We will sign you out on this phone and remove the lock. Sign in again with your number and password or with Google, and set a new PIN. Your account and transactions stay safe.';

  @override
  String lockForgotUnsent(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count entries',
      one: '1 entry',
    );
    String _temp1 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'haven\'t',
      one: 'hasn\'t',
    );
    return '$_temp0 on this phone $_temp1 been sent yet and will be deleted.';
  }

  @override
  String get lockSignOut => 'Sign out';

  @override
  String get lockBack => 'Back';

  @override
  String get biometricFingerprint => 'fingerprint';

  @override
  String get biometricFace => 'face';

  @override
  String get biometricIris => 'iris';

  @override
  String lockUseBiometrics(String method) {
    return 'Unlock with $method';
  }

  @override
  String get biometricPromptTitle => 'Unlock SmartSpend';

  @override
  String get biometricPromptReason => 'To see your accounts.';

  @override
  String get biometricPromptUsePin => 'Use PIN';

  @override
  String get securityTitle => 'Security and privacy';

  @override
  String get securityEntryBody => 'Lock, biometrics and hidden amounts';

  @override
  String get securityLockSection => 'App lock';

  @override
  String get securityLock => 'Lock the app';

  @override
  String get securityLockBody =>
      'Asks for a PIN when you open the app, and hides its content in the app switcher.';

  @override
  String securityBiometricsNotEnrolled(String method) {
    return 'Set up your $method in the phone\'s settings first.';
  }

  @override
  String get securityRelock => 'Ask again after leaving the app';

  @override
  String get relockNow => 'At once';

  @override
  String get relockMinute => '1 minute';

  @override
  String get relockFiveMinutes => '5 minutes';

  @override
  String get securityChangePin => 'Change PIN';

  @override
  String get securityConfirm => 'Enter your PIN to change the lock settings';

  @override
  String get securityPrivacySection => 'Privacy';

  @override
  String get hideAmounts => 'Hide amounts';

  @override
  String get showAmounts => 'Show amounts';

  @override
  String get hideAmountsBody =>
      'Amounts show as •••• until you show them. The eye button on the Record tab switches it quickly.';

  @override
  String get lockTurnedOn => 'The app lock is on.';

  @override
  String get lockTurnedOff => 'The app lock is off.';

  @override
  String get pinChanged => 'Your PIN changed.';

  @override
  String biometricsTurnedOn(String method) {
    return 'Unlocking with $method is on.';
  }

  @override
  String biometricsUnavailable(String method) {
    return 'We can\'t use $method now. Check that the phone has a screen lock, and try again.';
  }

  @override
  String get pinChooseTitle => 'Choose a 6-digit PIN';

  @override
  String get pinChooseBody =>
      'You will enter it each time you open the app. Don\'t use your birthday or your phone\'s screen lock.';

  @override
  String get pinConfirmTitle => 'Enter it again to confirm';

  @override
  String get pinMismatch => 'The PINs don\'t match. Choose your PIN again.';

  @override
  String get pinGuessable => 'That PIN is easy to guess. Choose another one.';

  @override
  String pinOfferBiometricsTitle(String method) {
    return 'Also unlock with $method?';
  }

  @override
  String get pinOfferBiometricsBody =>
      'Faster than the PIN, and the PIN still works when you need it.';

  @override
  String get pinOfferYes => 'Yes, turn it on';

  @override
  String get pinOfferNo => 'Not now';

  @override
  String get languageTitle => 'App language';

  @override
  String get languageArabic => 'العربية';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageNote =>
      'Recording and categories stay in Arabic: keep typing and speaking in Egyptian Arabic.';
}
