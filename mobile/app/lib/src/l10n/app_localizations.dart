import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In ar, this message translates to:
  /// **'SmartSpend'**
  String get appTitle;

  /// No description provided for @navRecord.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل'**
  String get navRecord;

  /// No description provided for @navStats.
  ///
  /// In ar, this message translates to:
  /// **'إحصائيات'**
  String get navStats;

  /// No description provided for @navAi.
  ///
  /// In ar, this message translates to:
  /// **'مركز AI'**
  String get navAi;

  /// No description provided for @navCalendar.
  ///
  /// In ar, this message translates to:
  /// **'تقويم'**
  String get navCalendar;

  /// No description provided for @navMore.
  ///
  /// In ar, this message translates to:
  /// **'المزيد'**
  String get navMore;

  /// Shown on a tab whose screen is not built yet.
  ///
  /// In ar, this message translates to:
  /// **'الشاشة دي لسه بتتبني في التطبيق الجديد.'**
  String get screenInProgress;

  /// No description provided for @captureAndroidTitle.
  ///
  /// In ar, this message translates to:
  /// **'إشعارات البنك والمحفظة'**
  String get captureAndroidTitle;

  /// No description provided for @captureAndroidBody.
  ///
  /// In ar, this message translates to:
  /// **'التطبيق بيقرا إشعارات البنك والمحفظة ويسجّل المصروف لوحده.'**
  String get captureAndroidBody;

  /// No description provided for @captureIosTitle.
  ///
  /// In ar, this message translates to:
  /// **'رسايل البنك من الاختصارات'**
  String get captureIosTitle;

  /// No description provided for @captureIosBody.
  ///
  /// In ar, this message translates to:
  /// **'أتمتة في تطبيق الاختصارات بتبعت رسايل البنك للتطبيق أول ما توصل.'**
  String get captureIosBody;

  /// No description provided for @captureOn.
  ///
  /// In ar, this message translates to:
  /// **'شغّالة'**
  String get captureOn;

  /// No description provided for @captureOff.
  ///
  /// In ar, this message translates to:
  /// **'مش شغّالة'**
  String get captureOff;

  /// No description provided for @captureOpenSettings.
  ///
  /// In ar, this message translates to:
  /// **'افتح الإعدادات'**
  String get captureOpenSettings;

  /// No description provided for @captureOpenShortcuts.
  ///
  /// In ar, this message translates to:
  /// **'افتح الاختصارات'**
  String get captureOpenShortcuts;

  /// No description provided for @captureStatusFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نعرف حالتها دلوقتي. جرّب تاني.'**
  String get captureStatusFailed;

  /// No description provided for @signInTitle.
  ///
  /// In ar, this message translates to:
  /// **'أهلاً بيك في SmartSpend'**
  String get signInTitle;

  /// No description provided for @signInSubtitle.
  ///
  /// In ar, this message translates to:
  /// **'ادخل برقم تليفونك أو بحساب Google.'**
  String get signInSubtitle;

  /// No description provided for @phoneLabel.
  ///
  /// In ar, this message translates to:
  /// **'رقم التليفون'**
  String get phoneLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In ar, this message translates to:
  /// **'الباسورد'**
  String get passwordLabel;

  /// No description provided for @showPassword.
  ///
  /// In ar, this message translates to:
  /// **'اظهر الباسورد'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In ar, this message translates to:
  /// **'اخفي الباسورد'**
  String get hidePassword;

  /// No description provided for @signInButton.
  ///
  /// In ar, this message translates to:
  /// **'ادخل'**
  String get signInButton;

  /// No description provided for @orSeparator.
  ///
  /// In ar, this message translates to:
  /// **'أو'**
  String get orSeparator;

  /// No description provided for @signInWithGoogle.
  ///
  /// In ar, this message translates to:
  /// **'ادخل بحساب Google'**
  String get signInWithGoogle;

  /// No description provided for @noAccountPrompt.
  ///
  /// In ar, this message translates to:
  /// **'معندكش حساب؟'**
  String get noAccountPrompt;

  /// No description provided for @createAccount.
  ///
  /// In ar, this message translates to:
  /// **'اعمل حساب جديد'**
  String get createAccount;

  /// Shown on the sign-in screen after the server refused the stored session token.
  ///
  /// In ar, this message translates to:
  /// **'الجلسة خلصت. سجّل دخولك تاني.'**
  String get sessionEnded;

  /// No description provided for @enterPhoneAndPassword.
  ///
  /// In ar, this message translates to:
  /// **'اكتب رقم التليفون والباسورد.'**
  String get enterPhoneAndPassword;

  /// Under the sign-in button while the server asks the phone to wait after failed attempts.
  ///
  /// In ar, this message translates to:
  /// **'{seconds, plural, =1{جرّب تاني بعد ثانية.} =2{جرّب تاني بعد ثانيتين.} few{جرّب تاني بعد {seconds} ثواني.} other{جرّب تاني بعد {seconds} ثانية.}}'**
  String tryAgainIn(int seconds);

  /// No description provided for @googleFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نكمّل الدخول بحساب Google. جرّب تاني.'**
  String get googleFailed;

  /// No description provided for @registerTitle.
  ///
  /// In ar, this message translates to:
  /// **'حساب جديد'**
  String get registerTitle;

  /// No description provided for @registerSubtitle.
  ///
  /// In ar, this message translates to:
  /// **'سجّل برقم تليفونك المصري.'**
  String get registerSubtitle;

  /// No description provided for @nameLabel.
  ///
  /// In ar, this message translates to:
  /// **'اسمك'**
  String get nameLabel;

  /// No description provided for @passwordHint.
  ///
  /// In ar, this message translates to:
  /// **'6 حروف على الأقل'**
  String get passwordHint;

  /// No description provided for @referralLabel.
  ///
  /// In ar, this message translates to:
  /// **'كود دعوة (لو معاك)'**
  String get referralLabel;

  /// No description provided for @registerButton.
  ///
  /// In ar, this message translates to:
  /// **'اعمل الحساب'**
  String get registerButton;

  /// No description provided for @haveAccountPrompt.
  ///
  /// In ar, this message translates to:
  /// **'عندك حساب؟'**
  String get haveAccountPrompt;

  /// No description provided for @goToSignIn.
  ///
  /// In ar, this message translates to:
  /// **'ادخل'**
  String get goToSignIn;

  /// No description provided for @enterRegisterFields.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسمك ورقم التليفون والباسورد.'**
  String get enterRegisterFields;

  /// No description provided for @nameTooShort.
  ///
  /// In ar, this message translates to:
  /// **'الاسم لازم يكون حرفين على الأقل.'**
  String get nameTooShort;

  /// No description provided for @passwordTooShort.
  ///
  /// In ar, this message translates to:
  /// **'الباسورد لازم يكون 6 حروف على الأقل.'**
  String get passwordTooShort;

  /// The Cloudflare Turnstile check has not produced a token yet.
  ///
  /// In ar, this message translates to:
  /// **'استنى لحظة لحد ما التحقق يخلص.'**
  String get humanCheckPending;

  /// No description provided for @verifyTitle.
  ///
  /// In ar, this message translates to:
  /// **'أكّد رقمك من واتساب'**
  String get verifyTitle;

  /// No description provided for @verifyBody.
  ///
  /// In ar, this message translates to:
  /// **'ابعت الكود ده لبوت SmartSpend من واتساب الرقم اللي كتبته. أول ما يوصل هنكمّل إنشاء حسابك.'**
  String get verifyBody;

  /// No description provided for @verifyCodeLabel.
  ///
  /// In ar, this message translates to:
  /// **'كود التأكيد'**
  String get verifyCodeLabel;

  /// No description provided for @verifySendOnWhatsApp.
  ///
  /// In ar, this message translates to:
  /// **'ابعته من واتساب'**
  String get verifySendOnWhatsApp;

  /// No description provided for @verifyCopyCode.
  ///
  /// In ar, this message translates to:
  /// **'انسخ الكود'**
  String get verifyCopyCode;

  /// No description provided for @verifyCodeCopied.
  ///
  /// In ar, this message translates to:
  /// **'الكود اتنسخ.'**
  String get verifyCodeCopied;

  /// No description provided for @verifyWaiting.
  ///
  /// In ar, this message translates to:
  /// **'مستنيين رسالتك…'**
  String get verifyWaiting;

  /// Time left before the confirmation code expires, as minutes:seconds.
  ///
  /// In ar, this message translates to:
  /// **'فاضل {time}'**
  String verifyTimeLeft(String time);

  /// No description provided for @verifyWrongSender.
  ///
  /// In ar, this message translates to:
  /// **'الكود وصل من رقم واتساب غير الرقم اللي بتسجّل بيه. ابعته من نفس الرقم.'**
  String get verifyWrongSender;

  /// No description provided for @verifyExpired.
  ///
  /// In ar, this message translates to:
  /// **'وقت التأكيد خلص. اطلب كود جديد.'**
  String get verifyExpired;

  /// No description provided for @verifyDone.
  ///
  /// In ar, this message translates to:
  /// **'الرقم اتأكد. بنجهّز حسابك…'**
  String get verifyDone;

  /// No description provided for @verifyBack.
  ///
  /// In ar, this message translates to:
  /// **'رجوع وتعديل'**
  String get verifyBack;

  /// No description provided for @verifyBotUnavailable.
  ///
  /// In ar, this message translates to:
  /// **'بوت الواتساب مش شغّال دلوقتي. جرّب كمان شوية، أو ادخل بطريقة تانية.'**
  String get verifyBotUnavailable;

  /// The WhatsApp message the person sends to the bot. The bot reads the code from it.
  ///
  /// In ar, this message translates to:
  /// **'تفعيل حسابي: {code}'**
  String verifyWhatsAppText(String code);

  /// No description provided for @whatsappNotOpened.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نفتح واتساب. انسخ الكود وابعته للبوت بنفسك.'**
  String get whatsappNotOpened;

  /// No description provided for @accountTitle.
  ///
  /// In ar, this message translates to:
  /// **'حسابك'**
  String get accountTitle;

  /// No description provided for @signOut.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل الخروج'**
  String get signOut;

  /// No description provided for @summarySpentIn.
  ///
  /// In ar, this message translates to:
  /// **'صرفت في {month}'**
  String summarySpentIn(String month);

  /// No description provided for @summaryIncome.
  ///
  /// In ar, this message translates to:
  /// **'دخل'**
  String get summaryIncome;

  /// No description provided for @summaryNet.
  ///
  /// In ar, this message translates to:
  /// **'الصافي'**
  String get summaryNet;

  /// No description provided for @summaryCount.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =0{مفيش عمليات} =1{عملية واحدة} =2{عمليتين} few{{count} عمليات} many{{count} عملية} other{{count} عملية}}'**
  String summaryCount(int count);

  /// No description provided for @summaryLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب ملخص الشهر دلوقتي.'**
  String get summaryLoadFailed;

  /// No description provided for @recentTitle.
  ///
  /// In ar, this message translates to:
  /// **'آخر العمليات'**
  String get recentTitle;

  /// No description provided for @seeAll.
  ///
  /// In ar, this message translates to:
  /// **'الكل'**
  String get seeAll;

  /// No description provided for @ledgerEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش عمليات'**
  String get ledgerEmptyTitle;

  /// No description provided for @ledgerEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'اكتب أول مصروف تحت بالعامية، وإحنا هنصنّفه لوحدنا.'**
  String get ledgerEmptyBody;

  /// No description provided for @ledgerLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب العمليات دلوقتي. اتأكد من النت وجرّب تاني.'**
  String get ledgerLoadFailed;

  /// No description provided for @retry.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تاني'**
  String get retry;

  /// No description provided for @composerHint.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اللي صرفته… مثلاً: قهوة 50 وأوبر 120'**
  String get composerHint;

  /// No description provided for @composerSend.
  ///
  /// In ar, this message translates to:
  /// **'ابعت'**
  String get composerSend;

  /// After a sentence the server saved without asking.
  ///
  /// In ar, this message translates to:
  /// **'اتحفظت لوحدها: {summary}'**
  String savedAuto(String summary);

  /// No description provided for @savedManual.
  ///
  /// In ar, this message translates to:
  /// **'اتحفظت: {summary}'**
  String savedManual(String summary);

  /// Several items saved from one sentence, and their total.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =2{عمليتين} few{{count} عمليات} other{{count} عملية}} · {total}'**
  String savedItemsSummary(int count, String total);

  /// No description provided for @undo.
  ///
  /// In ar, this message translates to:
  /// **'تراجع'**
  String get undo;

  /// No description provided for @undone.
  ///
  /// In ar, this message translates to:
  /// **'اترجعت.'**
  String get undone;

  /// No description provided for @undoFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نرجعها، امسحها من القايمة.'**
  String get undoFailed;

  /// No description provided for @nothingToSave.
  ///
  /// In ar, this message translates to:
  /// **'مش لاقيين مبلغ في الجملة. اكتب المبلغ وجرّب تاني.'**
  String get nothingToSave;

  /// No description provided for @offlineKeepText.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نوصل للسيرفر. الجملة لسه مكتوبة، ابعتها تاني لما النت يرجع.'**
  String get offlineKeepText;

  /// No description provided for @reviewTitle.
  ///
  /// In ar, this message translates to:
  /// **'راجع قبل ما نحفظ'**
  String get reviewTitle;

  /// No description provided for @reviewSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ'**
  String get reviewSave;

  /// No description provided for @reviewEdit.
  ///
  /// In ar, this message translates to:
  /// **'عدّل الجملة'**
  String get reviewEdit;

  /// No description provided for @clarifyDefault.
  ///
  /// In ar, this message translates to:
  /// **'ممكن توضح أكتر؟'**
  String get clarifyDefault;

  /// No description provided for @clarifyAnswerLabel.
  ///
  /// In ar, this message translates to:
  /// **'ردّك'**
  String get clarifyAnswerLabel;

  /// No description provided for @clarifySend.
  ///
  /// In ar, this message translates to:
  /// **'ابعت الرد'**
  String get clarifySend;

  /// No description provided for @clarifyLater.
  ///
  /// In ar, this message translates to:
  /// **'بعدين'**
  String get clarifyLater;

  /// No description provided for @transactionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'كل العمليات'**
  String get transactionsTitle;

  /// No description provided for @entryDeleted.
  ///
  /// In ar, this message translates to:
  /// **'اتمسحت العملية.'**
  String get entryDeleted;

  /// No description provided for @deleteFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نمسحها. جرّب تاني.'**
  String get deleteFailed;

  /// No description provided for @deleteAction.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get deleteAction;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
