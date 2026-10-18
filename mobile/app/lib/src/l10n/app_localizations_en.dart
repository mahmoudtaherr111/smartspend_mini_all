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
}
