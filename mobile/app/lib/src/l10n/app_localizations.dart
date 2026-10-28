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
  /// **'التطبيق بيقرا إشعارات البنك والمحفظة، وكل عملية بيسألك عنها قبل ما يسجّلها.'**
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

  /// Button on the More screen that starts the consent and setup of bank notification capture.
  ///
  /// In ar, this message translates to:
  /// **'شغّل تسجيل رسايل البنك'**
  String get captureStart;

  /// No description provided for @captureConsentTitle.
  ///
  /// In ar, this message translates to:
  /// **'قبل ما نبدأ'**
  String get captureConsentTitle;

  /// What the person agrees to before capture starts; its version is CAPTURE_CONSENT_TEXT_VERSION on the server.
  ///
  /// In ar, this message translates to:
  /// **'هنقرا إشعارات تطبيقات البنوك والمحافظ ورسايلها بس. الرسايل الشخصية والأكواد مابتخرجش من موبايلك. الرسالة اللي فيها عملية بتروح للسيرفر عشان يفهمها، وأرقامها بتتخبّى، وبتتمسح بعد 30 يوم. ومفيش عملية بتتسجل غير لما توافق عليها.'**
  String get captureConsentBody;

  /// No description provided for @captureConsentAgree.
  ///
  /// In ar, this message translates to:
  /// **'موافق، كمّل'**
  String get captureConsentAgree;

  /// No description provided for @captureUnavailable.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل رسايل البنك لسه مش متاح. هنقولك أول ما يبقى جاهز.'**
  String get captureUnavailable;

  /// No description provided for @captureConnectFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نشغّله دلوقتي. اتأكد من النت وجرّب تاني.'**
  String get captureConnectFailed;

  /// No description provided for @captureNeedsAccess.
  ///
  /// In ar, this message translates to:
  /// **'فاضل خطوة: افتح الإعدادات وفعّل قراية الإشعارات للتطبيق.'**
  String get captureNeedsAccess;

  /// No description provided for @captureNotificationsOff.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات مقفولة، فمش هنقدر نسألك عن العمليات من شريط الإشعارات. هتلاقيها هنا.'**
  String get captureNotificationsOff;

  /// How many captured notifications the phone has not sent yet.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =0{مفيش رسايل مستنية الإرسال.} =1{رسالة واحدة مستنية الإرسال.} =2{رسالتين مستنيين الإرسال.} few{{count} رسايل مستنية الإرسال.} other{{count} رسالة مستنية الإرسال.}}'**
  String captureWaiting(int count);

  /// No description provided for @captureAiReadingTitle.
  ///
  /// In ar, this message translates to:
  /// **'خلّي الذكاء الاصطناعي يقرا الرسايل المش واضحة'**
  String get captureAiReadingTitle;

  /// No description provided for @captureAiReadingBody.
  ///
  /// In ar, this message translates to:
  /// **'لو رسالة بنك ماعرفناش نقرا مبلغها أو نوعها، بنبعتها متخبّي منها أرقامك للذكاء الاصطناعي، وبنسألك قبل ما نسجّل حاجة.'**
  String get captureAiReadingBody;

  /// No description provided for @captureAiReadingFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ اختيارك. جرّب تاني.'**
  String get captureAiReadingFailed;

  /// No description provided for @captureUpdateRequired.
  ///
  /// In ar, this message translates to:
  /// **'نسخة التطبيق دي قديمة على تسجيل رسايل البنك. حدّث التطبيق، والرسايل المستنية هتتبعت بعدها.'**
  String get captureUpdateRequired;

  /// No description provided for @captureSettingsTitle.
  ///
  /// In ar, this message translates to:
  /// **'إعدادات رسايل البنك'**
  String get captureSettingsTitle;

  /// No description provided for @captureSettingsFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ ده. جرّب تاني.'**
  String get captureSettingsFailed;

  /// No description provided for @captureDevicesTitle.
  ///
  /// In ar, this message translates to:
  /// **'الموبايلات اللي بتبعت'**
  String get captureDevicesTitle;

  /// No description provided for @captureDevicesEmpty.
  ///
  /// In ar, this message translates to:
  /// **'مفيش موبايل متوصل.'**
  String get captureDevicesEmpty;

  /// No description provided for @captureThisPhone.
  ///
  /// In ar, this message translates to:
  /// **'الموبايل ده'**
  String get captureThisPhone;

  /// No description provided for @captureOtherPhone.
  ///
  /// In ar, this message translates to:
  /// **'موبايل تاني'**
  String get captureOtherPhone;

  /// No description provided for @captureDeviceStop.
  ///
  /// In ar, this message translates to:
  /// **'وقّف'**
  String get captureDeviceStop;

  /// No description provided for @captureIgnoredTitle.
  ///
  /// In ar, this message translates to:
  /// **'كروت بنتجاهلها'**
  String get captureIgnoredTitle;

  /// No description provided for @captureIgnoredBody.
  ///
  /// In ar, this message translates to:
  /// **'رسايل الكروت دي مابتتحفظش خالص، زي كارت حد من أهلك أو كارت الشغل.'**
  String get captureIgnoredBody;

  /// No description provided for @captureIgnoredRemove.
  ///
  /// In ar, this message translates to:
  /// **'بطّل تتجاهله'**
  String get captureIgnoredRemove;

  /// No description provided for @captureIgnoreDigitsLabel.
  ///
  /// In ar, this message translates to:
  /// **'آخر 3 أو 4 أرقام'**
  String get captureIgnoreDigitsLabel;

  /// No description provided for @captureIgnoreDigitsNeeded.
  ///
  /// In ar, this message translates to:
  /// **'اكتب آخر 3 أو 4 أرقام من الكارت.'**
  String get captureIgnoreDigitsNeeded;

  /// No description provided for @captureIgnoreAdd.
  ///
  /// In ar, this message translates to:
  /// **'تجاهله'**
  String get captureIgnoreAdd;

  /// No description provided for @captureDeleteTitle.
  ///
  /// In ar, this message translates to:
  /// **'امسح بيانات رسايل البنك'**
  String get captureDeleteTitle;

  /// No description provided for @captureDeleteBody.
  ///
  /// In ar, this message translates to:
  /// **'بنمسح الرسايل اللي عندنا وكل اللي اتعلمناه منها، وبنوقف التسجيل على كل موبايلاتك. العمليات اللي في دفترك بتفضل زي ما هي.'**
  String get captureDeleteBody;

  /// No description provided for @captureDeleteButton.
  ///
  /// In ar, this message translates to:
  /// **'امسح بياناتي'**
  String get captureDeleteButton;

  /// No description provided for @captureDeleteConfirmTitle.
  ///
  /// In ar, this message translates to:
  /// **'تمسح بيانات رسايل البنك؟'**
  String get captureDeleteConfirmTitle;

  /// No description provided for @captureDeleteConfirmBody.
  ///
  /// In ar, this message translates to:
  /// **'مش هتقدر ترجّعها، والتسجيل هيقف لحد ما تشغّله تاني.'**
  String get captureDeleteConfirmBody;

  /// No description provided for @captureDeleteCancel.
  ///
  /// In ar, this message translates to:
  /// **'رجوع'**
  String get captureDeleteCancel;

  /// No description provided for @captureDeleteConfirm.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get captureDeleteConfirm;

  /// No description provided for @captureDeleted.
  ///
  /// In ar, this message translates to:
  /// **'اتمسحت بيانات رسايل البنك.'**
  String get captureDeleted;

  /// No description provided for @captureWalletOfferBody.
  ///
  /// In ar, this message translates to:
  /// **'هنسجّل عملياته عليها، ورصيدها هيتحدّث من رسايل البنك.'**
  String get captureWalletOfferBody;

  /// No description provided for @captureWalletAdd.
  ///
  /// In ar, this message translates to:
  /// **'ضيفها'**
  String get captureWalletAdd;

  /// No description provided for @captureWalletNo.
  ///
  /// In ar, this message translates to:
  /// **'لا'**
  String get captureWalletNo;

  /// No description provided for @captureIgnoredCard.
  ///
  /// In ar, this message translates to:
  /// **'كارت آخره {digits}'**
  String captureIgnoredCard(String digits);

  /// No description provided for @captureIgnoreThisCard.
  ///
  /// In ar, this message translates to:
  /// **'تجاهل كارت آخره {digits}'**
  String captureIgnoreThisCard(String digits);

  /// No description provided for @captureHeldUntil.
  ///
  /// In ar, this message translates to:
  /// **'أول عملية منهم محفوظة لحد {date}.'**
  String captureHeldUntil(String date);

  /// No description provided for @captureWalletOffer.
  ///
  /// In ar, this message translates to:
  /// **'لقينا كارت {bank} آخره {digits}. نضيفه لمحافظك؟'**
  String captureWalletOffer(String bank, String digits);

  /// No description provided for @captureOffline.
  ///
  /// In ar, this message translates to:
  /// **'مستنيين النت عشان نبعت.'**
  String get captureOffline;

  /// No description provided for @captureRevoked.
  ///
  /// In ar, this message translates to:
  /// **'الجهاز ده اتفصل. شغّله تاني من هنا.'**
  String get captureRevoked;

  /// Link to the list of captured transactions waiting for the person's answer.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =0{مفيش عمليات مستنية ردك} =1{عملية واحدة مستنية ردك} =2{عمليتين مستنيين ردك} few{{count} عمليات مستنية ردك} other{{count} عملية مستنية ردك}}'**
  String captureReviewEntry(int count);

  /// No description provided for @captureReviewTitle.
  ///
  /// In ar, this message translates to:
  /// **'عمليات البنك'**
  String get captureReviewTitle;

  /// No description provided for @captureReviewEmpty.
  ///
  /// In ar, this message translates to:
  /// **'مفيش عمليات مستنية ردك.'**
  String get captureReviewEmpty;

  /// No description provided for @captureReviewFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب العمليات دلوقتي. جرّب تاني.'**
  String get captureReviewFailed;

  /// No description provided for @captureRecord.
  ///
  /// In ar, this message translates to:
  /// **'سجّل'**
  String get captureRecord;

  /// No description provided for @captureDismiss.
  ///
  /// In ar, this message translates to:
  /// **'مش مصروف'**
  String get captureDismiss;

  /// No description provided for @captureAmountLabel.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ بالجنيه'**
  String get captureAmountLabel;

  /// Shown on a captured transaction whose amount is in a foreign currency.
  ///
  /// In ar, this message translates to:
  /// **'الرسالة فيها مبلغ بعملة تانية. اكتب قيمته بالجنيه زي ما اتخصم.'**
  String get captureAmountNeeded;

  /// No description provided for @captureCheckAmount.
  ///
  /// In ar, this message translates to:
  /// **'مش متأكدين من المبلغ ده، راجعه قبل ما تسجّل.'**
  String get captureCheckAmount;

  /// No description provided for @captureMaybeDuplicate.
  ///
  /// In ar, this message translates to:
  /// **'ممكن تكون نفس العملية اللي قبلها. لو دفعت مرتين دوس «سجّل»، ولو هي نفسها دوس «مش مصروف».'**
  String get captureMaybeDuplicate;

  /// Offer to record a bank's transactions of one kind without asking, after three confirmations.
  ///
  /// In ar, this message translates to:
  /// **'نسجّل عمليات «{source}» دي لوحدها بعد كده؟'**
  String captureAutoOffer(String source);

  /// No description provided for @captureAutoOfferBody.
  ///
  /// In ar, this message translates to:
  /// **'أكّدت آخر 3 عمليات زي ما اتقرت. لو وافقت، بنسجّلها من غير ما نسألك، ويجيلك إشعار فيه «تراجع».'**
  String get captureAutoOfferBody;

  /// No description provided for @captureAutoYes.
  ///
  /// In ar, this message translates to:
  /// **'أيوه'**
  String get captureAutoYes;

  /// No description provided for @captureAutoNo.
  ///
  /// In ar, this message translates to:
  /// **'لا، اسألني'**
  String get captureAutoNo;

  /// The month's captured transactions against the free plan's limit.
  ///
  /// In ar, this message translates to:
  /// **'اتسجل {used} من {limit} الشهر ده.'**
  String captureUsage(int used, int limit);

  /// Captured transactions held over the monthly limit, recorded on an upgrade.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =1{عملية واحدة محفوظة، بتتسجل لو اشتركت في Pro.} =2{عمليتين محفوظين، بيتسجلوا لو اشتركت في Pro.} few{{count} عمليات محفوظة، بتتسجل لو اشتركت في Pro.} other{{count} عملية محفوظة، بتتسجل لو اشتركت في Pro.}}'**
  String captureHeld(int count);

  /// No description provided for @captureAnswerFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ ردك. جرّب تاني.'**
  String get captureAnswerFailed;

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

  /// No description provided for @queuedOffline.
  ///
  /// In ar, this message translates to:
  /// **'النت فاصل. حفظناها هنا وهنبعتها أول ما يرجع.'**
  String get queuedOffline;

  /// No description provided for @offlineBanner.
  ///
  /// In ar, this message translates to:
  /// **'النت فاصل. اللي بتسجّله بيتحفظ هنا وهيتبعت لما يرجع.'**
  String get offlineBanner;

  /// No description provided for @offlineFull.
  ///
  /// In ar, this message translates to:
  /// **'قايمة الأوفلاين مليانة ({limit, plural, =1{عملية واحدة} =2{عمليتين} few{{limit} عمليات} other{{limit} عملية}} في باقتك). وصّل النت عشان تتبعت، وبعدين سجّل تاني.'**
  String offlineFull(int limit);

  /// No description provided for @offlineTooShort.
  ///
  /// In ar, this message translates to:
  /// **'الجملة قصيرة. اكتب صرفت في إيه وبكام.'**
  String get offlineTooShort;

  /// No description provided for @offlineUnreadable.
  ///
  /// In ar, this message translates to:
  /// **'مش فاهمين الجملة دي. اكتب صرفت في إيه وبكام.'**
  String get offlineUnreadable;

  /// No description provided for @offlineNoAmount.
  ///
  /// In ar, this message translates to:
  /// **'مش لاقيين مبلغ في الجملة. اكتبه بالأرقام أو بالكلام (مثلاً: 50 جنيه، خمسين مواصلات).'**
  String get offlineNoAmount;

  /// No description provided for @outboxTitle.
  ///
  /// In ar, this message translates to:
  /// **'لسه ماتسجّلتش'**
  String get outboxTitle;

  /// No description provided for @outboxQueued.
  ///
  /// In ar, this message translates to:
  /// **'مستنية النت'**
  String get outboxQueued;

  /// No description provided for @outboxSending.
  ///
  /// In ar, this message translates to:
  /// **'بتتبعت…'**
  String get outboxSending;

  /// No description provided for @outboxNeedsReview.
  ///
  /// In ar, this message translates to:
  /// **'محتاجة مراجعة منك'**
  String get outboxNeedsReview;

  /// No description provided for @outboxNeedsAnswer.
  ///
  /// In ar, this message translates to:
  /// **'محتاجة رد منك'**
  String get outboxNeedsAnswer;

  /// No description provided for @outboxFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماتبعتتش. دوس عليها عشان تبعتها تاني.'**
  String get outboxFailed;

  /// No description provided for @outboxSendNow.
  ///
  /// In ar, this message translates to:
  /// **'ابعتها دلوقتي'**
  String get outboxSendNow;

  /// No description provided for @outboxDelete.
  ///
  /// In ar, this message translates to:
  /// **'امسحها'**
  String get outboxDelete;

  /// No description provided for @lockTitle.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الرمز السري'**
  String get lockTitle;

  /// No description provided for @lockDigitsEntered.
  ///
  /// In ar, this message translates to:
  /// **'اتكتب {count} من {total}'**
  String lockDigitsEntered(int count, int total);

  /// No description provided for @lockDelete.
  ///
  /// In ar, this message translates to:
  /// **'امسح رقم'**
  String get lockDelete;

  /// No description provided for @lockWrong.
  ///
  /// In ar, this message translates to:
  /// **'الرمز غلط. جرّب تاني.'**
  String get lockWrong;

  /// No description provided for @lockWrongWarning.
  ///
  /// In ar, this message translates to:
  /// **'الرمز غلط. فاضل {count, plural, =1{محاولة واحدة} =2{محاولتين} few{{count} محاولات} other{{count} محاولة}}، وبعدها هنخرجك من الحساب على الموبايل ده.'**
  String lockWrongWarning(int count);

  /// No description provided for @lockWait.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تاني بعد {time}.'**
  String lockWait(String time);

  /// No description provided for @lockBiometricsChanged.
  ///
  /// In ar, this message translates to:
  /// **'البصمات على الموبايل اتغيّرت، فوقفنا الفتح بيها. ادخل بالرمز، وشغّلها تاني من الأمان والخصوصية.'**
  String get lockBiometricsChanged;

  /// No description provided for @lockBiometricsLockedOut.
  ///
  /// In ar, this message translates to:
  /// **'الموبايل وقف البصمة شوية بعد محاولات كتير. ادخل بالرمز.'**
  String get lockBiometricsLockedOut;

  /// No description provided for @lockBiometricsFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نتأكد منك بالبصمة. ادخل بالرمز.'**
  String get lockBiometricsFailed;

  /// No description provided for @lockDamaged.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نقرأ قفل التطبيق على الموبايل ده. اخرج من الحساب وادخل تاني.'**
  String get lockDamaged;

  /// No description provided for @lockForgot.
  ///
  /// In ar, this message translates to:
  /// **'نسيت الرمز؟'**
  String get lockForgot;

  /// No description provided for @lockForgotBody.
  ///
  /// In ar, this message translates to:
  /// **'هنخرجك من الحساب على الموبايل ده ونشيل القفل. ادخل تاني برقمك وكلمة السر أو بجوجل، وحط رمز جديد. حسابك وعملياتك محفوظين.'**
  String get lockForgotBody;

  /// No description provided for @lockForgotUnsent.
  ///
  /// In ar, this message translates to:
  /// **'فيه {count, plural, =1{عملية واحدة} =2{عمليتين} few{{count} عمليات} other{{count} عملية}} على الموبايل لسه ماتبعتتش، وهتتمسح.'**
  String lockForgotUnsent(int count);

  /// No description provided for @lockSignOut.
  ///
  /// In ar, this message translates to:
  /// **'اخرج من الحساب'**
  String get lockSignOut;

  /// No description provided for @lockBack.
  ///
  /// In ar, this message translates to:
  /// **'رجوع'**
  String get lockBack;

  /// No description provided for @biometricFingerprint.
  ///
  /// In ar, this message translates to:
  /// **'البصمة'**
  String get biometricFingerprint;

  /// No description provided for @biometricFace.
  ///
  /// In ar, this message translates to:
  /// **'الوش'**
  String get biometricFace;

  /// No description provided for @biometricIris.
  ///
  /// In ar, this message translates to:
  /// **'العين'**
  String get biometricIris;

  /// No description provided for @lockUseBiometrics.
  ///
  /// In ar, this message translates to:
  /// **'افتح ب{method}'**
  String lockUseBiometrics(String method);

  /// No description provided for @biometricPromptTitle.
  ///
  /// In ar, this message translates to:
  /// **'افتح SmartSpend'**
  String get biometricPromptTitle;

  /// No description provided for @biometricPromptReason.
  ///
  /// In ar, this message translates to:
  /// **'عشان تشوف حساباتك.'**
  String get biometricPromptReason;

  /// No description provided for @biometricPromptUsePin.
  ///
  /// In ar, this message translates to:
  /// **'استخدم الرمز السري'**
  String get biometricPromptUsePin;

  /// No description provided for @securityTitle.
  ///
  /// In ar, this message translates to:
  /// **'الأمان والخصوصية'**
  String get securityTitle;

  /// No description provided for @securityEntryBody.
  ///
  /// In ar, this message translates to:
  /// **'القفل والبصمة وإخفاء المبالغ'**
  String get securityEntryBody;

  /// No description provided for @securityLockSection.
  ///
  /// In ar, this message translates to:
  /// **'قفل التطبيق'**
  String get securityLockSection;

  /// No description provided for @securityLock.
  ///
  /// In ar, this message translates to:
  /// **'اقفل التطبيق'**
  String get securityLock;

  /// No description provided for @securityLockBody.
  ///
  /// In ar, this message translates to:
  /// **'يطلب رمز سري لما تفتح التطبيق، ويخفي محتواه في قايمة التطبيقات المفتوحة.'**
  String get securityLockBody;

  /// No description provided for @securityBiometricsNotEnrolled.
  ///
  /// In ar, this message translates to:
  /// **'سجّل {method} في إعدادات الموبايل الأول.'**
  String securityBiometricsNotEnrolled(String method);

  /// No description provided for @securityRelock.
  ///
  /// In ar, this message translates to:
  /// **'يطلب الرمز تاني بعد ما تسيب التطبيق'**
  String get securityRelock;

  /// No description provided for @relockNow.
  ///
  /// In ar, this message translates to:
  /// **'على طول'**
  String get relockNow;

  /// No description provided for @relockMinute.
  ///
  /// In ar, this message translates to:
  /// **'دقيقة'**
  String get relockMinute;

  /// No description provided for @relockFiveMinutes.
  ///
  /// In ar, this message translates to:
  /// **'5 دقايق'**
  String get relockFiveMinutes;

  /// No description provided for @securityChangePin.
  ///
  /// In ar, this message translates to:
  /// **'غيّر الرمز السري'**
  String get securityChangePin;

  /// No description provided for @securityConfirm.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الرمز السري عشان تغيّر إعدادات القفل'**
  String get securityConfirm;

  /// No description provided for @securityPrivacySection.
  ///
  /// In ar, this message translates to:
  /// **'الخصوصية'**
  String get securityPrivacySection;

  /// No description provided for @hideAmounts.
  ///
  /// In ar, this message translates to:
  /// **'اخفي المبالغ'**
  String get hideAmounts;

  /// No description provided for @showAmounts.
  ///
  /// In ar, this message translates to:
  /// **'اظهر المبالغ'**
  String get showAmounts;

  /// No description provided for @hideAmountsBody.
  ///
  /// In ar, this message translates to:
  /// **'الأرقام تبان •••• لحد ما تظهرها. زرار العين في شاشة التسجيل بيغيّرها بسرعة.'**
  String get hideAmountsBody;

  /// No description provided for @lockTurnedOn.
  ///
  /// In ar, this message translates to:
  /// **'القفل اشتغل.'**
  String get lockTurnedOn;

  /// No description provided for @lockTurnedOff.
  ///
  /// In ar, this message translates to:
  /// **'وقفنا قفل التطبيق.'**
  String get lockTurnedOff;

  /// No description provided for @pinChanged.
  ///
  /// In ar, this message translates to:
  /// **'الرمز السري اتغيّر.'**
  String get pinChanged;

  /// No description provided for @biometricsTurnedOn.
  ///
  /// In ar, this message translates to:
  /// **'الفتح ب{method} اشتغل.'**
  String biometricsTurnedOn(String method);

  /// No description provided for @biometricsUnavailable.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نستخدم {method} دلوقتي. اتأكد إن الموبايل عليه رمز قفل وجرّب تاني.'**
  String biometricsUnavailable(String method);

  /// No description provided for @pinChooseTitle.
  ///
  /// In ar, this message translates to:
  /// **'اختار رمز سري من 6 أرقام'**
  String get pinChooseTitle;

  /// No description provided for @pinChooseBody.
  ///
  /// In ar, this message translates to:
  /// **'هتكتبه كل ما تفتح التطبيق. ماتستخدمش تاريخ ميلادك ولا رمز قفل الموبايل.'**
  String get pinChooseBody;

  /// No description provided for @pinConfirmTitle.
  ///
  /// In ar, this message translates to:
  /// **'اكتبه تاني للتأكيد'**
  String get pinConfirmTitle;

  /// No description provided for @pinMismatch.
  ///
  /// In ar, this message translates to:
  /// **'الرمزين مش زي بعض. اختار الرمز من الأول.'**
  String get pinMismatch;

  /// No description provided for @pinGuessable.
  ///
  /// In ar, this message translates to:
  /// **'الرمز ده سهل يتخمّن. اختار رمز تاني.'**
  String get pinGuessable;

  /// No description provided for @pinOfferBiometricsTitle.
  ///
  /// In ar, this message translates to:
  /// **'تفتح ب{method} كمان؟'**
  String pinOfferBiometricsTitle(String method);

  /// No description provided for @pinOfferBiometricsBody.
  ///
  /// In ar, this message translates to:
  /// **'أسرع من الرمز، والرمز يفضل شغال لو احتجته.'**
  String get pinOfferBiometricsBody;

  /// No description provided for @pinOfferYes.
  ///
  /// In ar, this message translates to:
  /// **'أيوه، شغّلها'**
  String get pinOfferYes;

  /// No description provided for @pinOfferNo.
  ///
  /// In ar, this message translates to:
  /// **'مش دلوقتي'**
  String get pinOfferNo;

  /// No description provided for @languageTitle.
  ///
  /// In ar, this message translates to:
  /// **'لغة التطبيق'**
  String get languageTitle;

  /// No description provided for @languageArabic.
  ///
  /// In ar, this message translates to:
  /// **'العربية'**
  String get languageArabic;

  /// No description provided for @languageEnglish.
  ///
  /// In ar, this message translates to:
  /// **'English'**
  String get languageEnglish;

  /// No description provided for @languageNote.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل والتصنيفات بيفضلوا بالعربي: اكتب واتكلم بالعامية زي ما انت.'**
  String get languageNote;
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
