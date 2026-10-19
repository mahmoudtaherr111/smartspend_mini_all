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
      'The app reads your bank and wallet notifications and records the spending for you.';

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
}
