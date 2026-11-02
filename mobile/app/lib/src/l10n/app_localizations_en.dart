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
  String get captureSettingsTitle => 'Bank message settings';

  @override
  String get captureSettingsFailed => 'We couldn\'t save that. Try again.';

  @override
  String get captureDevicesTitle => 'Phones that send';

  @override
  String get captureDevicesEmpty => 'No phone is connected.';

  @override
  String get captureThisPhone => 'This phone';

  @override
  String get captureOtherPhone => 'Another phone';

  @override
  String get captureDeviceStop => 'Stop';

  @override
  String get captureIgnoredTitle => 'Cards we ignore';

  @override
  String get captureIgnoredBody =>
      'These cards\' messages are never kept, like a family member\'s card or a work card.';

  @override
  String get captureIgnoredRemove => 'Stop ignoring';

  @override
  String get captureIgnoreDigitsLabel => 'Last 3 or 4 digits';

  @override
  String get captureIgnoreDigitsNeeded =>
      'Type the last 3 or 4 digits of the card.';

  @override
  String get captureIgnoreAdd => 'Ignore';

  @override
  String get captureDeleteTitle => 'Delete bank message data';

  @override
  String get captureDeleteBody =>
      'We delete the messages we keep and everything learned from them, and stop capture on all your phones. The transactions in your ledger stay as they are.';

  @override
  String get captureDeleteButton => 'Delete my data';

  @override
  String get captureDeleteConfirmTitle => 'Delete bank message data?';

  @override
  String get captureDeleteConfirmBody =>
      'You can\'t get it back, and capture stops until you turn it on again.';

  @override
  String get captureDeleteCancel => 'Back';

  @override
  String get captureDeleteConfirm => 'Delete';

  @override
  String get captureDeleted => 'Bank message data deleted.';

  @override
  String get captureWalletOfferBody =>
      'Its payments will be recorded on it, and its balance will follow the bank messages.';

  @override
  String get captureWalletAdd => 'Add it';

  @override
  String get captureWalletNo => 'No';

  @override
  String captureIgnoredCard(String digits) {
    return 'Card ending $digits';
  }

  @override
  String captureIgnoreThisCard(String digits) {
    return 'Ignore card ending $digits';
  }

  @override
  String captureHeldUntil(String date) {
    return 'The first of them is kept until $date.';
  }

  @override
  String captureWalletOffer(String bank, String digits) {
    return 'We found a $bank card ending $digits. Add it to your wallets?';
  }

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
  String get verifyTitle => 'Confirm your number';

  @override
  String get verifyBody =>
      'We sent a 6-digit code to the WhatsApp of the number you entered. Type it here.';

  @override
  String get verifyCodeField => 'Confirmation code';

  @override
  String get verifyConfirm => 'Confirm';

  @override
  String get verifyCodeIncomplete => 'The code is 6 digits.';

  @override
  String get verifyResend => 'Send a new code';

  @override
  String verifyResendIn(int seconds) {
    return 'Send a new code in $seconds s';
  }

  @override
  String get verifyResent => 'We sent you a new code.';

  @override
  String verifyTimeLeft(String time) {
    return 'The code is valid for $time';
  }

  @override
  String get verifyExpired => 'The code expired. Ask for a new one.';

  @override
  String get verifyDone => 'Number confirmed. Setting up your account…';

  @override
  String get verifyBack => 'Change the number';

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

  @override
  String statsLessThanLastMonth(String percent) {
    return '$percent less than last month.';
  }

  @override
  String statsMoreThanLastMonth(String percent) {
    return '$percent more than last month.';
  }

  @override
  String get statsSameAsLastMonth => 'The same as last month.';

  @override
  String statsLessThanLastWeek(String percent) {
    return 'This week is $percent less than the same week last month.';
  }

  @override
  String statsMoreThanLastWeek(String percent) {
    return 'This week is $percent more than the same week last month.';
  }

  @override
  String get statsNoComparison => 'No earlier month to compare with yet.';

  @override
  String get statsDailyAverage => 'Daily average';

  @override
  String get statsLastMonth => 'Last month';

  @override
  String get statsByCategory => 'Where it went';

  @override
  String get statsOther => 'Other';

  @override
  String get statsHabits => 'Your month';

  @override
  String statsTopDay(String day, String amount) {
    return 'Your biggest day: $day, $amount.';
  }

  @override
  String statsMostRecurring(String name, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count times',
      one: 'once',
    );
    return 'Most repeated: $name, $_temp0.';
  }

  @override
  String statsEmptyTitle(String month) {
    return 'No spending in $month';
  }

  @override
  String get statsEmptyBody =>
      'Record your spending on the Record tab, and here you\'ll see where it went and how it changes month to month.';

  @override
  String get statsEmptyAction => 'Record an expense';

  @override
  String get statsLoadFailed =>
      'We can\'t load this month\'s statistics right now.';

  @override
  String get statsPreviousMonth => 'Previous month';

  @override
  String get statsNextMonth => 'Next month';

  @override
  String get moreMoneySection => 'Your money';

  @override
  String get moreAppSection => 'App';

  @override
  String get walletsTitle => 'Wallets and cards';

  @override
  String get walletsEntry =>
      'Balances, and what comes in and goes out each month';

  @override
  String get walletsTotal => 'Your money in wallets and cards';

  @override
  String get walletsTotalStory => 'The sum of the balances you entered.';

  @override
  String get walletsEmptyTitle => 'No wallets or cards yet';

  @override
  String get walletsEmptyBody =>
      'Add your card or wallet to see its balance and what comes in and goes out each month.';

  @override
  String get walletsAdd => 'Add a wallet or card';

  @override
  String get walletsLoadFailed => 'We can\'t load your wallets right now.';

  @override
  String walletUpdated(String date) {
    return 'Updated $date';
  }

  @override
  String get walletUpdatedUnknown => 'Not known when it was updated';

  @override
  String walletBalanceStory(String date) {
    return 'The balance you entered $date. Update it when it changes.';
  }

  @override
  String get walletBalanceStoryUnknown =>
      'The balance you entered, at a time we don\'t know. Update it to keep it right.';

  @override
  String get walletMonthIn => 'In this month';

  @override
  String get walletMonthOut => 'Out this month';

  @override
  String get walletRecent => 'Latest transactions';

  @override
  String get walletNoTransactions =>
      'No transactions on this wallet yet. When you record something you paid from it, it shows here.';

  @override
  String get walletEdit => 'Edit balance and name';

  @override
  String get walletDelete => 'Delete wallet';

  @override
  String walletDeleteTitle(String name) {
    return 'Delete $name?';
  }

  @override
  String get walletDeleteBody =>
      'The wallet is deleted. Its transactions stay in your records without a wallet. This can\'t be undone.';

  @override
  String get walletDeleteConfirm => 'Delete it';

  @override
  String get walletDeleteKeep => 'No, keep it';

  @override
  String get walletDeleted => 'Wallet deleted.';

  @override
  String get walletFormAddTitle => 'New wallet or card';

  @override
  String walletFormEditTitle(String name) {
    return 'Edit $name';
  }

  @override
  String get walletKindLabel => 'Kind';

  @override
  String get walletNameLabel => 'Name';

  @override
  String get walletNameHint => 'e.g. My CIB card or my Vodafone Cash';

  @override
  String get walletNameRequired => 'Give the wallet a name.';

  @override
  String get walletLastFourLabel => 'Last 4 digits (for a card)';

  @override
  String get walletLastFourInvalid => 'Enter exactly the last 4 digits.';

  @override
  String get walletBalanceLabel => 'Balance now';

  @override
  String get walletBalanceInvalid =>
      'The balance must be a number, like 1500 or 1500.50.';

  @override
  String get walletSave => 'Save';

  @override
  String get walletSaved => 'Saved.';

  @override
  String get walletNotFound => 'This wallet isn\'t here';

  @override
  String get walletKindCard => 'Bank card';

  @override
  String get walletKindVodafoneCash => 'Vodafone Cash';

  @override
  String get walletKindInstaPay => 'InstaPay';

  @override
  String get walletKindCib => 'CIB';

  @override
  String get walletKindNbe => 'National Bank of Egypt';

  @override
  String get walletKindBanqueMisr => 'Banque Misr';

  @override
  String get walletKindQnb => 'QNB';

  @override
  String get walletKindFawry => 'Fawry';

  @override
  String get walletKindOrangeCash => 'Orange Cash';

  @override
  String get walletKindEtisalatCash => 'e& cash';

  @override
  String get walletNotFoundBody =>
      'It may have been deleted on another device or on the website.';

  @override
  String get walletsBack => 'Back to wallets';

  @override
  String walletsLastFour(String digits) {
    return 'ending $digits';
  }

  @override
  String get statsRefund => 'Refund';

  @override
  String statsCategoryInMonth(String month) {
    return 'In $month';
  }

  @override
  String statsCategoryRefundInMonth(String month) {
    return 'Net refund in $month';
  }

  @override
  String get statsCategoryEmptyTitle => 'No transactions in this category';

  @override
  String statsCategoryEmptyBody(String category, String month) {
    return 'Nothing recorded under «$category» in $month.';
  }

  @override
  String get transactionTitle => 'Transaction';

  @override
  String get transactionKindExpense => 'Expense';

  @override
  String get transactionKindRefund => 'Refund';

  @override
  String get transactionKindIncome => 'Income';

  @override
  String get transactionKindTransfer => 'Transfer';

  @override
  String get transactionKindInvestment => 'Investment';

  @override
  String get transactionDetailsSection => 'Details';

  @override
  String get transactionCategoryLabel => 'Category';

  @override
  String get transactionDateLabel => 'Date and time';

  @override
  String get transactionWalletLabel => 'Wallet or card';

  @override
  String get transactionPersonLabel => 'Person';

  @override
  String get transactionNoteLabel => 'Note';

  @override
  String get transactionSourceLabel => 'Recorded from';

  @override
  String get transactionSourceTyped => 'Typed sentence';

  @override
  String get transactionSourceManual => 'Entered by hand';

  @override
  String get transactionSourceVoice => 'Voice';

  @override
  String get transactionSourceSms => 'Bank or wallet message';

  @override
  String get transactionSourceImage => 'Receipt photo';

  @override
  String get transactionSentenceLabel => 'Original text';

  @override
  String get transactionEditAction => 'Edit transaction';

  @override
  String get transactionEditOffline =>
      'Connect to the internet to edit this transaction.';

  @override
  String get transactionDeleteAction => 'Delete transaction';

  @override
  String get transactionDeleteOffline =>
      'Connect to the internet to delete this transaction.';

  @override
  String get transactionLoadFailed =>
      'We can\'t load this transaction right now. Check your connection and try again.';

  @override
  String get transactionNotFoundTitle => 'This transaction isn\'t here';

  @override
  String get transactionNotFoundBody =>
      'It may have been deleted on another device or on the website.';

  @override
  String get transactionBack => 'Go back';

  @override
  String personTransactionsTitle(String name) {
    return 'Transactions with $name';
  }

  @override
  String get personTransactionsEmpty =>
      'No transactions shown for this person right now.';

  @override
  String get editTransactionTitle => 'Edit transaction';

  @override
  String get editTransactionSubtitle =>
      'If you change the category, the app remembers your choice for similar sentences.';

  @override
  String get editKindLabel => 'Kind';

  @override
  String get editAmountLabel => 'Amount';

  @override
  String get editAmountInvalid =>
      'Enter an amount above zero, like 150 or 150.50.';

  @override
  String get editCategoryLabel => 'Category';

  @override
  String get editSubCategoryLabel => 'Subcategory';

  @override
  String get editDateLabel => 'Date';

  @override
  String get editNoteLabel => 'Note';

  @override
  String get editWalletLabel => 'Wallet or card';

  @override
  String get editWalletNone => 'No wallet';

  @override
  String get editPersonLabel => 'Person';

  @override
  String get editPersonNone => 'No person';

  @override
  String get editSave => 'Save changes';

  @override
  String get editCancel => 'Back';

  @override
  String get editSaved => 'Transaction updated.';

  @override
  String get editFailed => 'We couldn\'t save your changes. Try again.';

  @override
  String get pendingQuestionsTitle => 'Waiting for your answer';

  @override
  String get pendingQuestionsSubtitle =>
      'Sentences that stopped at a question and aren\'t recorded yet.';

  @override
  String get pendingQuestionsReply => 'Reply';

  @override
  String get pendingQuestionsDismiss => 'Dismiss';

  @override
  String get pendingQuestionsNext => 'Got it, one more question left.';

  @override
  String get pendingQuestionDismissed => 'Question dismissed.';

  @override
  String get pendingQuestionsFailed =>
      'We couldn\'t record it right now. Try again.';

  @override
  String get transactionWalletUnknown => 'Unknown wallet';

  @override
  String get transactionPersonUnknown => 'Unknown person';

  @override
  String signOutPendingOutboxWarning(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          'You have $count transactions recorded offline that haven\'t synced yet. If you sign out now, they will be lost.',
      one: 'You have 1 transaction recorded offline that hasn\'t synced yet. If you sign out now, it will be lost.',
    );
    return '$_temp0';
  }

  @override
  String get signOutConfirmAnyway => 'Sign out anyway';

  @override
  String get signOutCancel => 'Stay';

  @override
  String get refreshFailedNotice =>
      'Could not refresh right now. Showing your last saved data.';

  @override
  String get discardChangesTitle => 'Discard changes?';

  @override
  String get discardChangesBody =>
      'If you go back now, your unsaved changes will be lost.';

  @override
  String get discardChangesConfirm => 'Discard';

  @override
  String get discardChangesCancel => 'Keep editing';

  @override
  String get walletOfflinePartial =>
      'Transactions and month summary are unavailable offline.';

  @override
  String get manualRecordTitle => 'Manual Record';

  @override
  String get manualRecordAmountHint => '0';

  @override
  String get manualRecordTypeExpense => 'Expense';

  @override
  String get manualRecordTypeIncome => 'Income';

  @override
  String get manualRecordTypeTransfer => 'Transfer';

  @override
  String get manualRecordCategory => 'Category';

  @override
  String get manualRecordSelectCategory => 'Select category';

  @override
  String get manualRecordDate => 'Date';

  @override
  String get manualRecordWallet => 'Wallet (optional)';

  @override
  String get manualRecordNoWallet => 'No wallet';

  @override
  String get manualRecordNote => 'Note (optional)';

  @override
  String get manualRecordNoteHint => 'Additional details...';

  @override
  String get manualRecordSave => 'Save transaction';

  @override
  String get manualRecordAmountRequired => 'Enter an amount first';

  @override
  String get manualRecordCategoryRequired => 'Select a category';

  @override
  String get manualRecordSavedNotice => 'Transaction saved successfully';

  @override
  String get manualRecordQueuedNotice =>
      'Saved to phone, will send when online';

  @override
  String get searchTitle => 'Search transactions';

  @override
  String get searchHint => 'Search by name, category, or note...';

  @override
  String searchEmptyTitle(String query) {
    return 'No results for \"$query\"';
  }

  @override
  String get searchEmptyBody =>
      'Try searching with a different word or check spelling.';

  @override
  String get searchOfflineNotice =>
      'Searching only transactions saved on this device.';

  @override
  String get searchNoTransactions => 'No transactions to search yet.';

  @override
  String get deleteAccountTitle => 'Delete Account';

  @override
  String get deleteAccountBody =>
      'All your personal transactions, ledger entries, and records will be deleted immediately and permanently. In accordance with Egyptian Personal Data Protection Law 151/2020, certain statutory compliance logs may be retained only for the legally mandated period.';

  @override
  String get deleteAccountPhraseInstruction =>
      'To confirm deletion, type \'delete my account\' below:';

  @override
  String get deleteAccountPasswordLabel => 'Current Password';

  @override
  String get deleteAccountPasswordHint =>
      'Enter your password to verify your identity';

  @override
  String get deleteAccountConfirmButton => 'Delete My Account Permanently';

  @override
  String get deleteAccountCancelButton => 'Cancel';

  @override
  String get deleteAccountSuccess =>
      'Your account has been deleted successfully.';

  @override
  String get deleteAccountFailed =>
      'Failed to delete account. Please verify your details or contact support.';

  @override
  String get deleteAccountContactSupport => 'Contact Support';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileName => 'Name';

  @override
  String get profilePhone => 'Phone Number';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileChangePhone => 'Change Phone';

  @override
  String get profileSave => 'Save Changes';

  @override
  String get profileSaved => 'Profile updated successfully';

  @override
  String get phoneChangeTitle => 'Change Phone Number';

  @override
  String get phoneChangeBody =>
      'We will send a verification code via WhatsApp to your new number.';

  @override
  String get phoneChangeNewNumber => 'New Phone Number';

  @override
  String get phoneChangeSendCode => 'Send Verification Code';

  @override
  String get phoneChangeEnterCode => 'Enter Verification Code';

  @override
  String get phoneChangeSuccess => 'Phone number updated successfully';

  @override
  String get moneyPrefsTitle => 'Money Preferences';

  @override
  String get moneyPrefsSalaryDay => 'Payday (Start of Financial Month)';

  @override
  String get moneyPrefsSalaryDayBody =>
      'The day your financial month begins. In shorter months such as February, the last day of the month is used automatically.';

  @override
  String get moneyPrefsCurrency => 'Currency';

  @override
  String get moneyPrefsDecimalPlaces => 'Decimal Places';

  @override
  String get moneyPrefsSaved => 'Preferences saved';

  @override
  String get onboardingQuestionsTitle => 'Personalization Questions';

  @override
  String get onboardingSkip => 'Skip for now';

  @override
  String get onboardingSubmit => 'Save & Continue';

  @override
  String get onboardingDone => 'Thanks for your answers!';

  @override
  String get sessionsTitle => 'Active Sessions & Devices';

  @override
  String get sessionsCurrentDevice => 'Current Device';

  @override
  String get sessionsRevoke => 'Revoke Session';

  @override
  String get sessionsRevokeConfirm =>
      'Are you sure you want to revoke this session?';

  @override
  String get sessionsRevokeCurrentWarning =>
      'Revoking this session will sign you out of this phone immediately.';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsEmpty => 'No notifications right now';

  @override
  String get notificationsMarkAllRead => 'Mark All as Read';

  @override
  String get notificationsFilterAll => 'All';

  @override
  String get notificationsFilterUnread => 'Unread';

  @override
  String get notificationsToday => 'Today';

  @override
  String get notificationsYesterday => 'Yesterday';

  @override
  String get notificationsThisWeek => 'This Week';

  @override
  String get notificationsOlder => 'Older';

  @override
  String get notificationSettingsTitle => 'Notification Settings';

  @override
  String get notificationSettingsMaster => 'Enable Notifications';

  @override
  String get notificationSettingsBudget => 'Budget Alerts';

  @override
  String get notificationSettingsDaily => 'Daily Reminder';

  @override
  String get notificationSettingsStreak => 'Streak Alerts';

  @override
  String get notificationSettingsMonthly => 'Monthly Report';

  @override
  String get helpCenterTitle => 'Help & Support';

  @override
  String get helpFaqSection => 'Frequently Asked Questions';

  @override
  String get helpTicketSection => 'Contact Support';

  @override
  String get helpTicketSubject => 'Subject';

  @override
  String get helpTicketMessage => 'Message details';

  @override
  String get helpTicketSubmit => 'Submit Ticket';

  @override
  String get helpTicketSuccess =>
      'Ticket submitted successfully, we\'ll get back to you soon.';

  @override
  String get helpMyTickets => 'My Tickets';

  @override
  String get helpTicketOpen => 'Open';

  @override
  String get helpTicketClosed => 'Closed';

  @override
  String get helpTicketReplied => 'Replied';

  @override
  String get planTitle => 'Plans & Subscription';

  @override
  String get planCurrent => 'Current Plan';

  @override
  String get planFree => 'Free Plan';

  @override
  String get planPro => 'Pro Plan';

  @override
  String get planUpgrade => 'Upgrade to Pro';

  @override
  String get planFeaturesTitle => 'Pro Plan Features';

  @override
  String get cancelPlanTitle => 'Cancel Subscription';

  @override
  String get cancelPlanConfirm => 'Confirm Cancellation';

  @override
  String get cancelPlanRetainNotice =>
      'Your Pro plan features will remain active until the end of your billing cycle.';

  @override
  String get inviteTitle => 'Invite Friends';

  @override
  String get inviteYourCode => 'Your Referral Code';

  @override
  String get inviteShare => 'Share Code';

  @override
  String inviteShareText(String code) {
    return 'Try SmartSpend AI to manage your spending! Use my referral code: $code';
  }

  @override
  String get inviteCopy => 'Copy Code';

  @override
  String get inviteCopied => 'Code copied!';

  @override
  String get appearanceTitle => 'Appearance';

  @override
  String get appearanceSystem => 'System Default';

  @override
  String get appearanceLight => 'Light';

  @override
  String get appearanceDark => 'Dark';

  @override
  String get termsTitle => 'Terms of Service';

  @override
  String get dataStoredTitle => 'Data & Privacy';

  @override
  String get appInfoTitle => 'App Information';

  @override
  String get appVersion => 'Version';

  @override
  String get appUpdateRequired => 'Update Required';

  @override
  String get appUpdateBody =>
      'A required update is available. Please update the app to continue.';

  @override
  String get appUpdateNow => 'Update Now';

  @override
  String get offlineRetryBanner =>
      'No internet connection. Changes will be saved locally.';

  @override
  String get forgotPassword => 'Forgot password?';

  @override
  String get resetPasswordTitle => 'Reset Password';

  @override
  String get resetPasswordNew => 'New Password';

  @override
  String get resetPasswordConfirm => 'Confirm Password';

  @override
  String get resetPasswordSubmit => 'Change Password & Sign In';

  @override
  String get resetPasswordSuccess => 'Password reset successfully';

  @override
  String planBuy(String price) {
    return 'Get Pro for $price';
  }

  @override
  String get planStoreSoon => 'Subscribing inside the app is coming soon.';

  @override
  String get planActivated => 'Pro is on.';

  @override
  String get planPurchasePending =>
      'Your payment is still being reviewed. Pro turns on once it is confirmed.';

  @override
  String get planPurchaseFailed =>
      'The subscription did not go through. Please try again.';

  @override
  String get planRestore => 'Restore my purchases';

  @override
  String get planRestored => 'Your subscription is back.';

  @override
  String get planNothingToRestore =>
      'We can\'t find a past subscription in the store for this account.';

  @override
  String get exportShare => 'Share the file';

  @override
  String get calendarLoadFailed => 'We can\'t load your plan right now.';

  @override
  String calTransactionsOfDayP0(String p0) {
    return 'Transactions of day $p0';
  }

  @override
  String calTransactionsOfDayP02(String p0) {
    return 'Transactions of day $p0';
  }

  @override
  String get calPayday => '· Payday';

  @override
  String get calNoSpending => 'No spending';

  @override
  String get calAddACommitmentOrIncome => 'Add a commitment or income';

  @override
  String calYourFinancialMonthStartsOn(String p0, String p1) {
    return 'Your financial month starts on day $p0 and ends on day $p1.';
  }

  @override
  String calP0DaysToPaydayDay(String p0, String p1) {
    return '$p0 days to payday (day $p1). After your commitments you have:';
  }

  @override
  String calP0DaysToTheEnd(String p0) {
    return '$p0 days to the end of your financial month. After your commitments you have:';
  }

  @override
  String get calLeftUntilPayday => 'Left until payday';

  @override
  String get calNoWalletsYetSoThe =>
      'No wallets yet, so the count starts from zero.';

  @override
  String get calOneBalanceHasNoKnown =>
      'One balance has no known date. Update it from your wallets.';

  @override
  String calCommitmentsWithNoKnownAmount(String p0) {
    return 'Commitments with no known amount: $p0.';
  }

  @override
  String calCommitmentsWithNoDateSo(String p0) {
    return 'Commitments with no date, so not counted: $p0.';
  }

  @override
  String get calTotalCommitments => 'Total commitments';

  @override
  String get calWalletBalances => 'Wallet balances';

  @override
  String get calNotRecorded => 'Not recorded';

  @override
  String get calThisMonthSSpending => 'This month\'s spending';

  @override
  String get calTapADayToSee => 'Tap a day to see what you spent.';

  @override
  String get calCommitmentsAndExpectedIncome =>
      'Commitments and expected income';

  @override
  String get calAdd => 'Add';

  @override
  String get calNoCommitmentsThisMonthAdd =>
      'No commitments this month.\nAdd your bills and installments to see what is left until payday.';

  @override
  String get calPaid => 'Paid';

  @override
  String get calPartlyPaid => 'Partly paid';

  @override
  String get calOverdue => 'Overdue';

  @override
  String get calDue => 'Due';

  @override
  String calDueOnDayP0(String p0) {
    return 'Due on day $p0';
  }

  @override
  String get calSettle => 'Settle';

  @override
  String get calPaidTapToUndo => 'Paid (tap to undo)';

  @override
  String get calActiveSavingPlan => 'Active saving plan';

  @override
  String get calEndThePlan => 'End the plan';

  @override
  String get calPlanSteps => 'Plan steps:';

  @override
  String get calReminderOn => 'Reminder on';

  @override
  String get calTurnOnAReminder => 'Turn on a reminder';

  @override
  String get calReminderCancelled => 'Reminder cancelled';

  @override
  String get calReminderSetCairoTime => 'Reminder set, Cairo time';

  @override
  String get calSkipThisStep => 'Skip this step';

  @override
  String get calRent => 'Rent';

  @override
  String get calBill => 'Bill';

  @override
  String get calSubscription => 'Subscription';

  @override
  String get calSchoolFees => 'School fees';

  @override
  String get calInstallment => 'Installment';

  @override
  String get calDebtOrLoan => 'Debt or loan';

  @override
  String get calSavingsCircle => 'Savings circle';

  @override
  String get calSalary => 'Salary';

  @override
  String get calFreelance => 'Freelance';

  @override
  String get calSomethingElse => 'Something else';

  @override
  String get calEveryMonth => 'Every month';

  @override
  String get calEveryWeek => 'Every week';

  @override
  String get calEveryYear => 'Every year';

  @override
  String get calOnce => 'Once';

  @override
  String get calEnterAName => 'Enter a name';

  @override
  String get calEnterAValidAmount => 'Enter a valid amount';

  @override
  String get calWeCouldnTAddIt => 'We couldn\'t add it. Try again.';

  @override
  String get calAddACommitmentOrExpected =>
      'Add a commitment or expected income';

  @override
  String get calCommitment => 'Commitment';

  @override
  String get calExpectedIncome => 'Expected income';

  @override
  String get calNameLikeTheRent => 'Name (like: the rent)';

  @override
  String get calAmountOptionalIfItChanges => 'Amount (optional if it changes)';

  @override
  String get calKind => 'Kind';

  @override
  String get calDueDay => 'Due day';

  @override
  String calDayP0(String p0) {
    return 'Day $p0';
  }

  @override
  String get calRepeats => 'Repeats';

  @override
  String get calSave => 'Save';

  @override
  String get calWeCouldnTRecordThe =>
      'We couldn\'t record the payment. Try again.';

  @override
  String calSettleP0(String p0) {
    return 'Settle: $p0';
  }

  @override
  String calAmountDueP0(String p0) {
    return 'Amount due: $p0';
  }

  @override
  String get calAmountPaidPartOfIt => 'Amount paid (part of it is fine)';

  @override
  String get calMatchingTransactions => 'Matching transactions:';

  @override
  String get calNoRecentMatchingTransactionYou =>
      'No recent matching transaction. You can settle with the amount directly.';

  @override
  String get calConfirmPayment => 'Confirm payment';

  @override
  String get calClose => 'Close';

  @override
  String get calWeCouldnTLoadThis => 'We couldn\'t load this day.';

  @override
  String get calNothingRecordedOnThisDay => 'Nothing recorded on this day.';

  @override
  String get calWorkAccount => 'Work account';

  @override
  String get calKeepWorkSpendingApartFrom =>
      'Keep work spending apart from personal';

  @override
  String get calPeopleAndDebts => 'People and debts';

  @override
  String get calWhoOwesYouAndWho => 'Who owes you and who you owe';

  @override
  String get calMonthlyBudgets => 'Monthly budgets';

  @override
  String get calSetALimitAndSee => 'Set a limit and see what is left';

  @override
  String get calSavingGoals => 'Saving goals';

  @override
  String get calPlanWhatYouAreSaving => 'Plan what you are saving for';

  @override
  String get calInstallments => 'Installments';

  @override
  String get calMonthlyInstallmentsAndWhatIs =>
      'Monthly installments and what is left';

  @override
  String get calSeasons => 'Seasons';

  @override
  String get calRamadanFeastsSchoolAndSummer =>
      'Ramadan, feasts, school and summer';

  @override
  String get calExportMyData => 'Export my data';

  @override
  String get calDownloadACopyOfYour => 'Download a copy of your transactions';

  @override
  String get calAccount => 'Account';

  @override
  String get calProfile => 'Profile';

  @override
  String get calYourNameAndPhoneNumber => 'Your name and phone number';

  @override
  String get calMoneyPreferences => 'Money preferences';

  @override
  String get calWhenYourFinancialMonthStarts =>
      'When your financial month starts';

  @override
  String get calSignedInDevices => 'Signed-in devices';

  @override
  String get calSeeAndSignOutYour => 'See and sign out your devices';

  @override
  String get calPersonalQuestions => 'Personal questions';

  @override
  String get calHelpTheAssistantUnderstandYou =>
      'Help the assistant understand you';

  @override
  String get calDeleteMyAccount => 'Delete my account';

  @override
  String get calDeleteYourDataForGood => 'Delete your data for good';

  @override
  String get calPlanAndRewards => 'Plan and rewards';

  @override
  String get calMyPlan => 'My plan';

  @override
  String get calComparePlansAndManageYour =>
      'Compare plans and manage your subscription';

  @override
  String get calInviteFriends => 'Invite friends';

  @override
  String get calShareYourInviteCode => 'Share your invite code';

  @override
  String get calWhatTheAppStoresAbout => 'What the app stores about me';

  @override
  String get calYourDataAndYourRights => 'Your data and your rights';

  @override
  String get calTermsAndPrivacy => 'Terms and privacy';

  @override
  String get calTermsOfUseAndPrivacy => 'Terms of use and privacy policy';

  @override
  String get calNotificationsAndAppearance => 'Notifications and appearance';

  @override
  String get calNotifications => 'Notifications';

  @override
  String get calAlertsAboutYourTransactionsAnd =>
      'Alerts about your transactions and budgets';

  @override
  String get calNotificationSettings => 'Notification settings';

  @override
  String get calChooseWhatReachesYou => 'Choose what reaches you';

  @override
  String get calAppearance => 'Appearance';

  @override
  String get calLightDarkOrLikeYour => 'Light, dark, or like your phone';

  @override
  String get calHelp => 'Help';

  @override
  String get calHelpCenter => 'Help center';

  @override
  String get calCommonQuestionsAndSupportTickets =>
      'Common questions and support tickets';

  @override
  String get calAboutSmartspend => 'About SmartSpend';

  @override
  String get calVersionAndLicenses => 'Version and licenses';

  @override
  String get monMonthlyBudgets => 'Monthly budgets';

  @override
  String get monAddABudget => 'Add a budget';

  @override
  String get monWeCanTLoadYour => 'We can\'t load your budgets';

  @override
  String get monCheckYourConnectionAndTry =>
      'Check your connection and try again';

  @override
  String get monTryAgain => 'Try again';

  @override
  String get monNoBudgetsYet => 'No budgets yet';

  @override
  String get monSetAMonthlyLimitFor =>
      'Set a monthly limit for your spending or for a category, and see what is left as you go.';

  @override
  String get monAddAMonthlyBudget => 'Add a monthly budget';

  @override
  String get monAllBudgets => 'All budgets';

  @override
  String monSpentP0(String p0) {
    return 'Spent: $p0';
  }

  @override
  String monOverByP0(String p0) {
    return 'Over by $p0';
  }

  @override
  String monLeftP0(String p0) {
    return 'Left: $p0';
  }

  @override
  String get monBudgetDetails => 'Budget details';

  @override
  String get monEdit => 'Edit';

  @override
  String get monDelete => 'Delete';

  @override
  String get monDeleteTheBudget => 'Delete the budget';

  @override
  String monDeleteTheBudgetP0(String p0) {
    return 'Delete the budget \"$p0\"?';
  }

  @override
  String get monCancel => 'Cancel';

  @override
  String monBudgetP0Deleted(String p0) {
    return 'Budget \"$p0\" deleted';
  }

  @override
  String get monUndo => 'Undo';

  @override
  String monSpentP0OfP1(String p0, String p1) {
    return 'Spent $p0 of $p1';
  }

  @override
  String monOverBudgetP0(String p0) {
    return 'Over budget ($p0%)';
  }

  @override
  String monAlmostUsedP0(String p0) {
    return 'Almost used ($p0%)';
  }

  @override
  String monLeftP02(String p0) {
    return 'Left: $p0';
  }

  @override
  String get monOverallBudget => 'Overall budget';

  @override
  String get monEnterTheMonthlyAmount => 'Enter the monthly amount';

  @override
  String get monWeCouldnTSaveIt =>
      'We couldn\'t save it. Try again in a moment.';

  @override
  String get monEditTheBudget => 'Edit the budget';

  @override
  String get monNewMonthlyBudget => 'New monthly budget';

  @override
  String get monClose => 'Close';

  @override
  String get monCategory => 'Category';

  @override
  String get monOverallBudgetAllSpending => 'Overall budget (all spending)';

  @override
  String get monBudgetName => 'Budget name';

  @override
  String get monLikeFoodAndDrink => 'Like: food and drink';

  @override
  String get monMonthlyLimit => 'Monthly limit';

  @override
  String get monAlertMeAt => 'Alert me at';

  @override
  String get monSaving => 'Saving...';

  @override
  String get monSaveChanges => 'Save changes';

  @override
  String get monAddTheBudget => 'Add the budget';

  @override
  String get monSavingGoals => 'Saving goals';

  @override
  String get monNewGoal => 'New goal';

  @override
  String get monWeCanTLoadYour2 => 'We can\'t load your goals';

  @override
  String get monNoSavingGoalsYet => 'No saving goals yet';

  @override
  String get monSetAGoalLikeUmrah =>
      'Set a goal, like Umrah, a new laptop or an emergency fund, and follow it step by step.';

  @override
  String get monCreateASavingGoal => 'Create a saving goal';

  @override
  String get monCurrentGoals => 'Current goals';

  @override
  String get monGoalsReached => 'Goals reached';

  @override
  String get monPausedGoals => 'Paused goals';

  @override
  String monTargetP0(String p0) {
    return 'Target: $p0';
  }

  @override
  String get monSmartPlan => 'Smart plan';

  @override
  String monTargetDateP0P1P2(String p0, String p1, String p2) {
    return 'Target date: $p0/$p1/$p2';
  }

  @override
  String get monWeCouldnTRunThe =>
      'We couldn\'t run the analysis. Check your connection and try again.';

  @override
  String get monCongratulations => 'Congratulations!';

  @override
  String monYouReachedYourGoalP0(String p0) {
    return 'You reached your goal \"$p0\". A big step forward!';
  }

  @override
  String get monReached => 'Reached';

  @override
  String get monActive => 'Active';

  @override
  String get monPaused => 'Paused';

  @override
  String monDateP0P1P2(String p0, String p1, String p2) {
    return 'Date: $p0/$p1/$p2';
  }

  @override
  String get monGoalAnalysis => 'Goal analysis';

  @override
  String get monRefresh => 'Refresh';

  @override
  String get monStepsToYourGoal => 'Steps to your goal:';

  @override
  String get monSuggestedWeeklyActions => 'Suggested weekly actions:';

  @override
  String monLastAnalysisP0P1P2(String p0, String p1, String p2) {
    return 'Last analysis: $p0/$p1/$p2';
  }

  @override
  String get monRunTheAnalysisToGet =>
      'Run the analysis to get a plan based on your spending.';

  @override
  String get monGoalAnalysisComesWithPro => 'Goal analysis comes with Pro.';

  @override
  String get monAnalyzing => 'Analyzing...';

  @override
  String get monAnalyzeThisGoal => 'Analyze this goal';

  @override
  String get monUpgradeToProForThe => 'Upgrade to Pro for the analysis';

  @override
  String get monGoalReached => 'Goal reached!';

  @override
  String get monPause => 'Pause';

  @override
  String get monResumeTheGoal => 'Resume the goal';

  @override
  String get monDeleteTheGoal => 'Delete the goal';

  @override
  String get monEnterANameForThe => 'Enter a name for the goal';

  @override
  String get monEnterTheTargetAmount => 'Enter the target amount';

  @override
  String get monWeCouldnTCreateThe =>
      'We couldn\'t create the goal. Check your connection and try again.';

  @override
  String get monNewSavingGoal => 'New saving goal';

  @override
  String get monGoalName => 'Goal name';

  @override
  String get monLikeUmrahANewLaptop => 'Like: Umrah, a new laptop, car repairs';

  @override
  String get monTargetAmountRequired => 'Target amount (required)';

  @override
  String get monLike25000 => 'Like: 25000';

  @override
  String get monTargetDateOptional => 'Target date (optional)';

  @override
  String get monChooseADate => 'Choose a date';

  @override
  String get monNotesOptional => 'Notes (optional)';

  @override
  String get monAnythingThatHelpsYouRemember =>
      'Anything that helps you remember your plan...';

  @override
  String get monCreating => 'Creating...';

  @override
  String get monCreateTheGoal => 'Create the goal';

  @override
  String get monClear => 'Clear';

  @override
  String get monVoiceRecordingNeedsInternetYou =>
      'Voice recording needs internet. You can type it for now.';

  @override
  String get monWeNeedMicrophoneAccessTo =>
      'We need microphone access to record your voice.';

  @override
  String get monWeCouldnTStartRecording =>
      'We couldn\'t start recording. Try again.';

  @override
  String get monRecordingCancelled => 'Recording cancelled';

  @override
  String get monBalance => 'balance';

  @override
  String get monSeconds => 'seconds';

  @override
  String get monPlan => 'plan';

  @override
  String get monWeCouldnTProcessThe =>
      'We couldn\'t process the recording. Try again.';

  @override
  String get monWeCouldnTHearAny => 'We couldn\'t hear any spending in that.';

  @override
  String get monVoiceRecording => 'Voice recording';

  @override
  String get monModeSingleTap => 'Mode: single tap';

  @override
  String get monModeHold => 'Mode: hold';

  @override
  String get monPhotographAReceipt => 'Photograph a receipt';

  @override
  String get monSlideToCancel => 'Slide to cancel';

  @override
  String get monCancelRecording => 'Cancel recording';

  @override
  String get monListeningToTheRecording => 'Listening to the recording...';

  @override
  String get monStopRecording => 'Stop recording';

  @override
  String get monRecordByVoiceTapTo => 'Record by voice (tap to start)';

  @override
  String get monRecordByVoiceHold => 'Record by voice (hold)';

  @override
  String get monHoldTheMicToRecord => 'Hold the mic to record';

  @override
  String get monReadingReceiptsNeedsInternet =>
      'Reading receipts needs internet.';

  @override
  String get monWeCanTOpenThe =>
      'We can\'t open the camera. Allow it in your phone\'s settings, or choose a photo from the gallery.';

  @override
  String get monThisPhotoIsTooLarge =>
      'This photo is too large. Try another one closer to the receipt.';

  @override
  String get monThePhotoIsnTClear =>
      'The photo isn\'t clear, or we can\'t read the amount. Try in better light.';

  @override
  String get monReceipt => 'Receipt';

  @override
  String get monThePhotoIsnTClear2 =>
      'The photo isn\'t clear. Try a sharper one in better light.';

  @override
  String get monReadingTheReceipt => 'Reading the receipt...';

  @override
  String get monFindingTheAmountAndDetails => 'Finding the amount and details';

  @override
  String get monReviewTheReceipt => 'Review the receipt';

  @override
  String get monReceiptTotal => 'Receipt total';

  @override
  String get monCategory2 => 'Category:';

  @override
  String monDetailsP0(String p0) {
    return 'Details: $p0';
  }

  @override
  String get monSave => 'Save';

  @override
  String get monEditInTheBox => 'Edit in the box';

  @override
  String get monPhotographTheReceipt => 'Photograph the receipt';

  @override
  String get monTakeAPhotoOfThe =>
      'Take a photo of the receipt or choose one from your gallery, and we\'ll read it for you.';

  @override
  String get monCamera => 'Camera';

  @override
  String get monTakeAClearPhotoOf => 'Take a clear photo of the receipt';

  @override
  String get monChooseFromTheGallery => 'Choose from the gallery';

  @override
  String get monPickAPhotoSavedOn => 'Pick a photo saved on your phone';

  @override
  String get monRecordByVoice => 'Record by voice';

  @override
  String get monToRecordYourSpendingBy =>
      'To record your spending by voice we need the microphone. Your voice is turned into text and not kept.';

  @override
  String get monAllowTheMicrophone => 'Allow the microphone';

  @override
  String get monNotNow => 'Not now';

  @override
  String get monAll => 'All';

  @override
  String get monRecordedMonthlyIncome => 'Recorded monthly income';

  @override
  String get monTotalIncomeThisMonth => 'Total income this month';

  @override
  String get monHowYouSpend => 'How you spend';

  @override
  String get monRecordMoreThisMonthTo =>
      'Record more this month to see your pattern clearly.';

  @override
  String get monYourSpendingJumpsOnCertain =>
      'Your spending jumps on certain days instead of spreading evenly.';

  @override
  String get monYourSpendingRisesOnWeekends =>
      'Your spending rises on weekends or special occasions.';

  @override
  String get monMostOfYourSpendingGoes =>
      'Most of your spending goes to one category.';

  @override
  String get monFrequentPurchasesWithoutPlanning =>
      'Frequent purchases without planning.';

  @override
  String get monYouSpendCautiouslyAndKeep =>
      'You spend cautiously and keep a safety margin.';

  @override
  String get monYouStickToYourBudget =>
      'You stick to your budget and spend in an organized way.';

  @override
  String get monYourSpendingIsBalancedWith =>
      'Your spending is balanced with no sudden jumps.';

  @override
  String monYourBiggestSpendingDayP0(String p0, String p1) {
    return 'Your biggest spending day: $p0 ($p1)';
  }

  @override
  String get monYourSpendingByWeekday => 'Your spending by weekday';

  @override
  String get monSpendingDays => 'Spending days';

  @override
  String monChartOfSpendingByWeekday(String p0, String p1) {
    return 'Chart of spending by weekday. The highest day is $p0 with $p1.';
  }

  @override
  String get monChartOfSpendingByWeekday2 => 'Chart of spending by weekday.';

  @override
  String get monRecordMoreToSeeYour =>
      'Record more to see your weekly pattern.';

  @override
  String get monMonthlyBudget => 'Monthly budget';

  @override
  String get monSetAMonthlyBudgetTo =>
      'Set a monthly budget to always know what is left.';

  @override
  String get monSetABudget => 'Set a budget';

  @override
  String get monOverallMonthlyBudget => 'Overall monthly budget';

  @override
  String get monComparedWithYourRecordedMonthly =>
      'Compared with your recorded monthly income (no budget set)';

  @override
  String get monComparedWithThisMonthS => 'Compared with this month\'s income';

  @override
  String get monBudgetAndSpending => 'Budget and spending';

  @override
  String monSpentP02(String p0) {
    return 'Spent: $p0';
  }

  @override
  String monOverBudgetByP0(String p0) {
    return 'Over budget by $p0';
  }

  @override
  String monLeftP03(String p0) {
    return 'Left: $p0';
  }

  @override
  String get monRecordedAutomatically => 'Recorded automatically';

  @override
  String get monFromBanksAndWallets => 'From banks and wallets';

  @override
  String get monByHandOrCash => 'By hand or cash';

  @override
  String get monTheseCameFromYourBank =>
      'These came from your bank and wallet messages.';

  @override
  String get monMoneyWithPeople => 'Money with people';

  @override
  String get monNoDebtsOrLoansYet =>
      'No debts or loans yet. Say or type: \"I lent Ahmed 200\".';

  @override
  String get monMoneyWithPeopleDebtsAnd =>
      'Money with people (debts and loans)';

  @override
  String get monOwedToYou => 'Owed to you';

  @override
  String get monYouOwe => 'You owe';

  @override
  String monOwesYouP0(String p0) {
    return 'Owes you $p0';
  }

  @override
  String monYouOweP0(String p0) {
    return 'You owe $p0';
  }

  @override
  String get monSeeAllPeopleAndDebts => 'See all people and debts';

  @override
  String monThisYearYourHighestMonth(String p0, String p1) {
    return 'This year: your highest month was $p0 ($p1)';
  }

  @override
  String monYourSpendingInP0(String p0) {
    return 'Your spending in $p0';
  }

  @override
  String monThisYearP0(String p0) {
    return 'This year ($p0)';
  }

  @override
  String monChartOfTheYearS(String p0) {
    return 'Chart of the year\'s spending. Total $p0.';
  }

  @override
  String get monYourSmartProfileAndPrivacy => 'Your smart profile and privacy';

  @override
  String get monWhatTheAppLearnedAbout =>
      'What the app learned about you is used only to serve you, and you can change it here.';

  @override
  String monYourSavedPaydayDayP0(String p0) {
    return 'Your saved payday: day $p0 of each month.';
  }
}
