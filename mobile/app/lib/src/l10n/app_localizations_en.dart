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
}
