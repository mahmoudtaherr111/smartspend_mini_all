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
  /// **'أكّد رقمك'**
  String get verifyTitle;

  /// No description provided for @verifyBody.
  ///
  /// In ar, this message translates to:
  /// **'بعتنا كود من 6 أرقام على واتساب الرقم اللي كتبته. اكتبه هنا.'**
  String get verifyBody;

  /// Label of the field where the six-digit WhatsApp code is typed; the keyboard can suggest it.
  ///
  /// In ar, this message translates to:
  /// **'كود التأكيد'**
  String get verifyCodeField;

  /// No description provided for @verifyConfirm.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد'**
  String get verifyConfirm;

  /// No description provided for @verifyCodeIncomplete.
  ///
  /// In ar, this message translates to:
  /// **'الكود 6 أرقام.'**
  String get verifyCodeIncomplete;

  /// No description provided for @verifyResend.
  ///
  /// In ar, this message translates to:
  /// **'ابعت كود جديد'**
  String get verifyResend;

  /// The resend button while it waits before another code may be asked for.
  ///
  /// In ar, this message translates to:
  /// **'ابعت كود جديد بعد {seconds} ثانية'**
  String verifyResendIn(int seconds);

  /// No description provided for @verifyResent.
  ///
  /// In ar, this message translates to:
  /// **'بعتنالك كود جديد.'**
  String get verifyResent;

  /// Time left before the confirmation code expires, as minutes:seconds.
  ///
  /// In ar, this message translates to:
  /// **'الكود صالح لمدة {time}'**
  String verifyTimeLeft(String time);

  /// No description provided for @verifyExpired.
  ///
  /// In ar, this message translates to:
  /// **'الكود انتهى. اطلب كود جديد.'**
  String get verifyExpired;

  /// No description provided for @verifyDone.
  ///
  /// In ar, this message translates to:
  /// **'الرقم اتأكد. بنجهّز حسابك…'**
  String get verifyDone;

  /// No description provided for @verifyBack.
  ///
  /// In ar, this message translates to:
  /// **'تعديل الرقم'**
  String get verifyBack;

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

  /// The percentage, already written with its sign (12%).
  ///
  /// In ar, this message translates to:
  /// **'أقل من الشهر اللي فات بـ {percent}.'**
  String statsLessThanLastMonth(String percent);

  /// The percentage, already written with its sign (12%).
  ///
  /// In ar, this message translates to:
  /// **'أكتر من الشهر اللي فات بـ {percent}.'**
  String statsMoreThanLastMonth(String percent);

  /// No description provided for @statsSameAsLastMonth.
  ///
  /// In ar, this message translates to:
  /// **'زي الشهر اللي فات بالظبط.'**
  String get statsSameAsLastMonth;

  /// The percentage, already written with its sign (12%).
  ///
  /// In ar, this message translates to:
  /// **'الأسبوع ده أقل من نفس الأسبوع الشهر اللي فات بـ {percent}.'**
  String statsLessThanLastWeek(String percent);

  /// The percentage, already written with its sign (12%).
  ///
  /// In ar, this message translates to:
  /// **'الأسبوع ده أكتر من نفس الأسبوع الشهر اللي فات بـ {percent}.'**
  String statsMoreThanLastWeek(String percent);

  /// No description provided for @statsNoComparison.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش شهر قبله نقارن بيه.'**
  String get statsNoComparison;

  /// No description provided for @statsDailyAverage.
  ///
  /// In ar, this message translates to:
  /// **'متوسط يومي'**
  String get statsDailyAverage;

  /// No description provided for @statsLastMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر اللي فات'**
  String get statsLastMonth;

  /// No description provided for @statsByCategory.
  ///
  /// In ar, this message translates to:
  /// **'صرفت على إيه'**
  String get statsByCategory;

  /// No description provided for @statsOther.
  ///
  /// In ar, this message translates to:
  /// **'حاجات تانية'**
  String get statsOther;

  /// No description provided for @statsHabits.
  ///
  /// In ar, this message translates to:
  /// **'عاداتك في الشهر'**
  String get statsHabits;

  /// The day with the most spending and its amount, already written.
  ///
  /// In ar, this message translates to:
  /// **'أكتر يوم صرفت فيه: {day}، {amount}.'**
  String statsTopDay(String day, String amount);

  /// No description provided for @statsMostRecurring.
  ///
  /// In ar, this message translates to:
  /// **'أكتر حاجة بتتكرر: {name}، {count, plural, =1{مرة واحدة} =2{مرتين} few{{count} مرات} other{{count} مرة}}.'**
  String statsMostRecurring(String name, int count);

  /// No description provided for @statsEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مصاريف في {month}'**
  String statsEmptyTitle(String month);

  /// No description provided for @statsEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'سجّل مصاريفك من تبويب التسجيل، وهنا هتشوف صرفت على إيه وإزاي بيتغيّر من شهر لشهر.'**
  String get statsEmptyBody;

  /// No description provided for @statsEmptyAction.
  ///
  /// In ar, this message translates to:
  /// **'سجّل مصروف'**
  String get statsEmptyAction;

  /// No description provided for @statsLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب إحصائيات الشهر دلوقتي.'**
  String get statsLoadFailed;

  /// No description provided for @statsPreviousMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر اللي قبله'**
  String get statsPreviousMonth;

  /// No description provided for @statsNextMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر اللي بعده'**
  String get statsNextMonth;

  /// No description provided for @moreMoneySection.
  ///
  /// In ar, this message translates to:
  /// **'فلوسك'**
  String get moreMoneySection;

  /// No description provided for @moreAppSection.
  ///
  /// In ar, this message translates to:
  /// **'التطبيق'**
  String get moreAppSection;

  /// No description provided for @walletsTitle.
  ///
  /// In ar, this message translates to:
  /// **'المحافظ والكروت'**
  String get walletsTitle;

  /// No description provided for @walletsEntry.
  ///
  /// In ar, this message translates to:
  /// **'الأرصدة واللي داخل وخارج كل شهر'**
  String get walletsEntry;

  /// No description provided for @walletsTotal.
  ///
  /// In ar, this message translates to:
  /// **'فلوسك في المحافظ والكروت'**
  String get walletsTotal;

  /// No description provided for @walletsTotalStory.
  ///
  /// In ar, this message translates to:
  /// **'مجموع الأرصدة اللي إنت كاتبها.'**
  String get walletsTotalStory;

  /// No description provided for @walletsEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'مفيش محافظ ولا كروت لسه'**
  String get walletsEmptyTitle;

  /// No description provided for @walletsEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'ضيف كارتك أو محفظتك علشان تعرف رصيدها واللي داخل وخارج منها كل شهر.'**
  String get walletsEmptyBody;

  /// No description provided for @walletsAdd.
  ///
  /// In ar, this message translates to:
  /// **'ضيف محفظة أو كارت'**
  String get walletsAdd;

  /// No description provided for @walletsLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب المحافظ دلوقتي.'**
  String get walletsLoadFailed;

  /// When the balance was given, already written (النهارده، امبارح، الخميس 16 أكتوبر).
  ///
  /// In ar, this message translates to:
  /// **'اتحدّث {date}'**
  String walletUpdated(String date);

  /// No description provided for @walletUpdatedUnknown.
  ///
  /// In ar, this message translates to:
  /// **'مش معروف اتحدّث إمتى'**
  String get walletUpdatedUnknown;

  /// When the balance was given, already written (النهارده، امبارح، الخميس 16 أكتوبر).
  ///
  /// In ar, this message translates to:
  /// **'ده الرصيد اللي كتبته {date}. حدّثه لما يتغيّر.'**
  String walletBalanceStory(String date);

  /// No description provided for @walletBalanceStoryUnknown.
  ///
  /// In ar, this message translates to:
  /// **'ده الرصيد اللي كتبته، ومش معروف إمتى. حدّثه علشان يبقى مظبوط.'**
  String get walletBalanceStoryUnknown;

  /// No description provided for @walletMonthIn.
  ///
  /// In ar, this message translates to:
  /// **'دخل الشهر ده'**
  String get walletMonthIn;

  /// No description provided for @walletMonthOut.
  ///
  /// In ar, this message translates to:
  /// **'خرج الشهر ده'**
  String get walletMonthOut;

  /// No description provided for @walletRecent.
  ///
  /// In ar, this message translates to:
  /// **'آخر العمليات'**
  String get walletRecent;

  /// No description provided for @walletNoTransactions.
  ///
  /// In ar, this message translates to:
  /// **'مفيش عمليات على المحفظة دي لسه. لما تسجّل مصروف وتقول دفعته منها، هيظهر هنا.'**
  String get walletNoTransactions;

  /// No description provided for @walletEdit.
  ///
  /// In ar, this message translates to:
  /// **'تعديل الرصيد والاسم'**
  String get walletEdit;

  /// No description provided for @walletDelete.
  ///
  /// In ar, this message translates to:
  /// **'مسح المحفظة'**
  String get walletDelete;

  /// No description provided for @walletDeleteTitle.
  ///
  /// In ar, this message translates to:
  /// **'تمسح {name}؟'**
  String walletDeleteTitle(String name);

  /// No description provided for @walletDeleteBody.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة هتتمسح. العمليات اللي كانت عليها هتفضل في سجلك من غير محفظة. المسح مابيترجعش.'**
  String get walletDeleteBody;

  /// No description provided for @walletDeleteConfirm.
  ///
  /// In ar, this message translates to:
  /// **'امسحها'**
  String get walletDeleteConfirm;

  /// No description provided for @walletDeleteKeep.
  ///
  /// In ar, this message translates to:
  /// **'لأ، سيبها'**
  String get walletDeleteKeep;

  /// No description provided for @walletDeleted.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة اتمسحت.'**
  String get walletDeleted;

  /// No description provided for @walletFormAddTitle.
  ///
  /// In ar, this message translates to:
  /// **'محفظة أو كارت جديد'**
  String get walletFormAddTitle;

  /// No description provided for @walletFormEditTitle.
  ///
  /// In ar, this message translates to:
  /// **'تعديل {name}'**
  String walletFormEditTitle(String name);

  /// No description provided for @walletKindLabel.
  ///
  /// In ar, this message translates to:
  /// **'النوع'**
  String get walletKindLabel;

  /// No description provided for @walletNameLabel.
  ///
  /// In ar, this message translates to:
  /// **'الاسم'**
  String get walletNameLabel;

  /// No description provided for @walletNameHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: كارت CIB أو فودافون كاش بتاعي'**
  String get walletNameHint;

  /// No description provided for @walletNameRequired.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم للمحفظة.'**
  String get walletNameRequired;

  /// No description provided for @walletLastFourLabel.
  ///
  /// In ar, this message translates to:
  /// **'آخر 4 أرقام (لو كارت)'**
  String get walletLastFourLabel;

  /// No description provided for @walletLastFourInvalid.
  ///
  /// In ar, this message translates to:
  /// **'اكتب آخر 4 أرقام بالظبط.'**
  String get walletLastFourInvalid;

  /// No description provided for @walletBalanceLabel.
  ///
  /// In ar, this message translates to:
  /// **'الرصيد دلوقتي'**
  String get walletBalanceLabel;

  /// No description provided for @walletBalanceInvalid.
  ///
  /// In ar, this message translates to:
  /// **'الرصيد لازم يكون رقم، زي 1500 أو 1500.50.'**
  String get walletBalanceInvalid;

  /// No description provided for @walletSave.
  ///
  /// In ar, this message translates to:
  /// **'حفظ'**
  String get walletSave;

  /// No description provided for @walletSaved.
  ///
  /// In ar, this message translates to:
  /// **'اتحفظ.'**
  String get walletSaved;

  /// No description provided for @walletNotFound.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة دي مش موجودة'**
  String get walletNotFound;

  /// No description provided for @walletKindCard.
  ///
  /// In ar, this message translates to:
  /// **'كارت بنكي'**
  String get walletKindCard;

  /// No description provided for @walletKindVodafoneCash.
  ///
  /// In ar, this message translates to:
  /// **'فودافون كاش'**
  String get walletKindVodafoneCash;

  /// No description provided for @walletKindInstaPay.
  ///
  /// In ar, this message translates to:
  /// **'إنستاباي'**
  String get walletKindInstaPay;

  /// No description provided for @walletKindCib.
  ///
  /// In ar, this message translates to:
  /// **'البنك التجاري الدولي'**
  String get walletKindCib;

  /// No description provided for @walletKindNbe.
  ///
  /// In ar, this message translates to:
  /// **'البنك الأهلي'**
  String get walletKindNbe;

  /// No description provided for @walletKindBanqueMisr.
  ///
  /// In ar, this message translates to:
  /// **'بنك مصر'**
  String get walletKindBanqueMisr;

  /// No description provided for @walletKindQnb.
  ///
  /// In ar, this message translates to:
  /// **'QNB'**
  String get walletKindQnb;

  /// No description provided for @walletKindFawry.
  ///
  /// In ar, this message translates to:
  /// **'فوري'**
  String get walletKindFawry;

  /// No description provided for @walletKindOrangeCash.
  ///
  /// In ar, this message translates to:
  /// **'أورنج كاش'**
  String get walletKindOrangeCash;

  /// No description provided for @walletKindEtisalatCash.
  ///
  /// In ar, this message translates to:
  /// **'اتصالات كاش'**
  String get walletKindEtisalatCash;

  /// No description provided for @walletNotFoundBody.
  ///
  /// In ar, this message translates to:
  /// **'يمكن اتمسحت من جهاز تاني أو من الموقع.'**
  String get walletNotFoundBody;

  /// No description provided for @walletsBack.
  ///
  /// In ar, this message translates to:
  /// **'ارجع للمحافظ'**
  String get walletsBack;

  /// The last four digits of a card, already isolated left to right.
  ///
  /// In ar, this message translates to:
  /// **'آخره {digits}'**
  String walletsLastFour(String digits);

  /// No description provided for @statsRefund.
  ///
  /// In ar, this message translates to:
  /// **'مرتجع'**
  String get statsRefund;

  /// No description provided for @statsCategoryInMonth.
  ///
  /// In ar, this message translates to:
  /// **'في {month}'**
  String statsCategoryInMonth(String month);

  /// No description provided for @statsCategoryRefundInMonth.
  ///
  /// In ar, this message translates to:
  /// **'صافي مرتجع في {month}'**
  String statsCategoryRefundInMonth(String month);

  /// No description provided for @statsCategoryEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'مفيش عمليات في التصنيف ده'**
  String get statsCategoryEmptyTitle;

  /// No description provided for @statsCategoryEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مصاريف متسجّلة تحت «{category}» في {month}.'**
  String statsCategoryEmptyBody(String category, String month);

  /// No description provided for @transactionTitle.
  ///
  /// In ar, this message translates to:
  /// **'تفاصيل العملية'**
  String get transactionTitle;

  /// No description provided for @transactionKindExpense.
  ///
  /// In ar, this message translates to:
  /// **'مصروف'**
  String get transactionKindExpense;

  /// No description provided for @transactionKindRefund.
  ///
  /// In ar, this message translates to:
  /// **'مرتجع'**
  String get transactionKindRefund;

  /// No description provided for @transactionKindIncome.
  ///
  /// In ar, this message translates to:
  /// **'دخل'**
  String get transactionKindIncome;

  /// No description provided for @transactionKindTransfer.
  ///
  /// In ar, this message translates to:
  /// **'تحويل'**
  String get transactionKindTransfer;

  /// No description provided for @transactionKindInvestment.
  ///
  /// In ar, this message translates to:
  /// **'استثمار'**
  String get transactionKindInvestment;

  /// No description provided for @transactionDetailsSection.
  ///
  /// In ar, this message translates to:
  /// **'التفاصيل'**
  String get transactionDetailsSection;

  /// No description provided for @transactionCategoryLabel.
  ///
  /// In ar, this message translates to:
  /// **'التصنيف'**
  String get transactionCategoryLabel;

  /// No description provided for @transactionDateLabel.
  ///
  /// In ar, this message translates to:
  /// **'التاريخ والوقت'**
  String get transactionDateLabel;

  /// No description provided for @transactionWalletLabel.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة أو الكارت'**
  String get transactionWalletLabel;

  /// No description provided for @transactionPersonLabel.
  ///
  /// In ar, this message translates to:
  /// **'الشخص'**
  String get transactionPersonLabel;

  /// No description provided for @transactionNoteLabel.
  ///
  /// In ar, this message translates to:
  /// **'ملاحظة'**
  String get transactionNoteLabel;

  /// No description provided for @transactionSourceLabel.
  ///
  /// In ar, this message translates to:
  /// **'اتسجّلت إزاي'**
  String get transactionSourceLabel;

  /// No description provided for @transactionSourceTyped.
  ///
  /// In ar, this message translates to:
  /// **'بجملة كتبتها'**
  String get transactionSourceTyped;

  /// No description provided for @transactionSourceManual.
  ///
  /// In ar, this message translates to:
  /// **'بإيدك'**
  String get transactionSourceManual;

  /// No description provided for @transactionSourceVoice.
  ///
  /// In ar, this message translates to:
  /// **'بالصوت'**
  String get transactionSourceVoice;

  /// No description provided for @transactionSourceSms.
  ///
  /// In ar, this message translates to:
  /// **'رسالة بنك أو محفظة'**
  String get transactionSourceSms;

  /// No description provided for @transactionSourceImage.
  ///
  /// In ar, this message translates to:
  /// **'صورة فاتورة'**
  String get transactionSourceImage;

  /// No description provided for @transactionSentenceLabel.
  ///
  /// In ar, this message translates to:
  /// **'الجملة الأصلية'**
  String get transactionSentenceLabel;

  /// No description provided for @transactionEditAction.
  ///
  /// In ar, this message translates to:
  /// **'تعديل العملية'**
  String get transactionEditAction;

  /// No description provided for @transactionEditOffline.
  ///
  /// In ar, this message translates to:
  /// **'وصّل النت عشان تعدّل العملية.'**
  String get transactionEditOffline;

  /// No description provided for @transactionDeleteAction.
  ///
  /// In ar, this message translates to:
  /// **'مسح العملية'**
  String get transactionDeleteAction;

  /// No description provided for @transactionDeleteOffline.
  ///
  /// In ar, this message translates to:
  /// **'وصّل النت عشان تمسح العملية.'**
  String get transactionDeleteOffline;

  /// No description provided for @transactionLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب تفاصيل العملية دلوقتي. اتأكد من النت وجرّب تاني.'**
  String get transactionLoadFailed;

  /// No description provided for @transactionNotFoundTitle.
  ///
  /// In ar, this message translates to:
  /// **'العملية دي مش موجودة'**
  String get transactionNotFoundTitle;

  /// No description provided for @transactionNotFoundBody.
  ///
  /// In ar, this message translates to:
  /// **'يمكن اتمسحت من جهاز تاني أو من الموقع.'**
  String get transactionNotFoundBody;

  /// No description provided for @transactionBack.
  ///
  /// In ar, this message translates to:
  /// **'ارجع'**
  String get transactionBack;

  /// No description provided for @personTransactionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'عمليات {name}'**
  String personTransactionsTitle(String name);

  /// No description provided for @personTransactionsEmpty.
  ///
  /// In ar, this message translates to:
  /// **'مفيش عمليات معروضة للشخص ده دلوقتي.'**
  String get personTransactionsEmpty;

  /// No description provided for @editTransactionTitle.
  ///
  /// In ar, this message translates to:
  /// **'تعديل العملية'**
  String get editTransactionTitle;

  /// No description provided for @editTransactionSubtitle.
  ///
  /// In ar, this message translates to:
  /// **'لو غيّرت التصنيف، التطبيق هيفتكر اختيارك للجمل اللي شبهها.'**
  String get editTransactionSubtitle;

  /// No description provided for @editKindLabel.
  ///
  /// In ar, this message translates to:
  /// **'النوع'**
  String get editKindLabel;

  /// No description provided for @editAmountLabel.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ'**
  String get editAmountLabel;

  /// No description provided for @editAmountInvalid.
  ///
  /// In ar, this message translates to:
  /// **'اكتب مبلغ أكبر من صفر، زي 150 أو 150.50.'**
  String get editAmountInvalid;

  /// No description provided for @editCategoryLabel.
  ///
  /// In ar, this message translates to:
  /// **'التصنيف'**
  String get editCategoryLabel;

  /// No description provided for @editSubCategoryLabel.
  ///
  /// In ar, this message translates to:
  /// **'التصنيف الفرعي'**
  String get editSubCategoryLabel;

  /// No description provided for @editDateLabel.
  ///
  /// In ar, this message translates to:
  /// **'التاريخ'**
  String get editDateLabel;

  /// No description provided for @editNoteLabel.
  ///
  /// In ar, this message translates to:
  /// **'ملاحظة'**
  String get editNoteLabel;

  /// No description provided for @editWalletLabel.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة أو الكارت'**
  String get editWalletLabel;

  /// No description provided for @editWalletNone.
  ///
  /// In ar, this message translates to:
  /// **'من غير محفظة'**
  String get editWalletNone;

  /// No description provided for @editPersonLabel.
  ///
  /// In ar, this message translates to:
  /// **'الشخص'**
  String get editPersonLabel;

  /// No description provided for @editPersonNone.
  ///
  /// In ar, this message translates to:
  /// **'من غير شخص'**
  String get editPersonNone;

  /// No description provided for @editSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ التعديل'**
  String get editSave;

  /// No description provided for @editCancel.
  ///
  /// In ar, this message translates to:
  /// **'رجوع'**
  String get editCancel;

  /// No description provided for @editSaved.
  ///
  /// In ar, this message translates to:
  /// **'اتعدّلت العملية.'**
  String get editSaved;

  /// No description provided for @editFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ التعديل. جرّب تاني.'**
  String get editFailed;

  /// No description provided for @pendingQuestionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'محتاج ردّك'**
  String get pendingQuestionsTitle;

  /// No description provided for @pendingQuestionsSubtitle.
  ///
  /// In ar, this message translates to:
  /// **'جمل وقفت عند سؤال ولسه ماتسجّلتش.'**
  String get pendingQuestionsSubtitle;

  /// No description provided for @pendingQuestionsReply.
  ///
  /// In ar, this message translates to:
  /// **'رد'**
  String get pendingQuestionsReply;

  /// No description provided for @pendingQuestionsDismiss.
  ///
  /// In ar, this message translates to:
  /// **'شيلها'**
  String get pendingQuestionsDismiss;

  /// No description provided for @pendingQuestionsNext.
  ///
  /// In ar, this message translates to:
  /// **'تمام، فاضل سؤال كمان.'**
  String get pendingQuestionsNext;

  /// No description provided for @pendingQuestionDismissed.
  ///
  /// In ar, this message translates to:
  /// **'اتشال السؤال.'**
  String get pendingQuestionDismissed;

  /// No description provided for @pendingQuestionsFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نسجّلها دلوقتي. جرّب تاني.'**
  String get pendingQuestionsFailed;

  /// No description provided for @transactionWalletUnknown.
  ///
  /// In ar, this message translates to:
  /// **'محفظة غير معروفة'**
  String get transactionWalletUnknown;

  /// No description provided for @transactionPersonUnknown.
  ///
  /// In ar, this message translates to:
  /// **'شخص غير معروف'**
  String get transactionPersonUnknown;

  /// Warning shown before sign-out when unsynced transactions are waiting in the offline outbox.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =1{عندك عملية واحدة متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هتروح.} few{عندك {count} عمليات متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.} many{عندك {count} عملية متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.} other{عندك {count} عملية متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.}}'**
  String signOutPendingOutboxWarning(int count);

  /// No description provided for @signOutConfirmAnyway.
  ///
  /// In ar, this message translates to:
  /// **'اخرج على أي حال'**
  String get signOutConfirmAnyway;

  /// No description provided for @signOutCancel.
  ///
  /// In ar, this message translates to:
  /// **'استنى'**
  String get signOutCancel;

  /// No description provided for @refreshFailedNotice.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.'**
  String get refreshFailedNotice;

  /// No description provided for @discardChangesTitle.
  ///
  /// In ar, this message translates to:
  /// **'تجاهل التعديلات؟'**
  String get discardChangesTitle;

  /// No description provided for @discardChangesBody.
  ///
  /// In ar, this message translates to:
  /// **'لو رجعت دلوقتي، التعديلات اللي كتبتها مش هتتحفظ.'**
  String get discardChangesBody;

  /// No description provided for @discardChangesConfirm.
  ///
  /// In ar, this message translates to:
  /// **'تجاهل'**
  String get discardChangesConfirm;

  /// No description provided for @discardChangesCancel.
  ///
  /// In ar, this message translates to:
  /// **'كمّل تعديل'**
  String get discardChangesCancel;

  /// No description provided for @walletOfflinePartial.
  ///
  /// In ar, this message translates to:
  /// **'المعاملات وملخص الشهر مش متوفرين أوفلاين.'**
  String get walletOfflinePartial;

  /// No description provided for @manualRecordTitle.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل يدوي'**
  String get manualRecordTitle;

  /// No description provided for @manualRecordAmountHint.
  ///
  /// In ar, this message translates to:
  /// **'٠'**
  String get manualRecordAmountHint;

  /// No description provided for @manualRecordTypeExpense.
  ///
  /// In ar, this message translates to:
  /// **'مصروف'**
  String get manualRecordTypeExpense;

  /// No description provided for @manualRecordTypeIncome.
  ///
  /// In ar, this message translates to:
  /// **'دخل'**
  String get manualRecordTypeIncome;

  /// No description provided for @manualRecordTypeTransfer.
  ///
  /// In ar, this message translates to:
  /// **'تحويل'**
  String get manualRecordTypeTransfer;

  /// No description provided for @manualRecordCategory.
  ///
  /// In ar, this message translates to:
  /// **'التصنيف'**
  String get manualRecordCategory;

  /// No description provided for @manualRecordSelectCategory.
  ///
  /// In ar, this message translates to:
  /// **'اختر التصنيف'**
  String get manualRecordSelectCategory;

  /// No description provided for @manualRecordDate.
  ///
  /// In ar, this message translates to:
  /// **'التاريخ'**
  String get manualRecordDate;

  /// No description provided for @manualRecordWallet.
  ///
  /// In ar, this message translates to:
  /// **'المحفظة (اختياري)'**
  String get manualRecordWallet;

  /// No description provided for @manualRecordNoWallet.
  ///
  /// In ar, this message translates to:
  /// **'بدون محفظة'**
  String get manualRecordNoWallet;

  /// No description provided for @manualRecordNote.
  ///
  /// In ar, this message translates to:
  /// **'ملاحظة (اختياري)'**
  String get manualRecordNote;

  /// No description provided for @manualRecordNoteHint.
  ///
  /// In ar, this message translates to:
  /// **'تفاصيل إضافية...'**
  String get manualRecordNoteHint;

  /// No description provided for @manualRecordSave.
  ///
  /// In ar, this message translates to:
  /// **'حفظ العملية'**
  String get manualRecordSave;

  /// No description provided for @manualRecordAmountRequired.
  ///
  /// In ar, this message translates to:
  /// **'اكتب المبلغ الأول'**
  String get manualRecordAmountRequired;

  /// No description provided for @manualRecordCategoryRequired.
  ///
  /// In ar, this message translates to:
  /// **'اختر تصنيف للعملية'**
  String get manualRecordCategoryRequired;

  /// No description provided for @manualRecordSavedNotice.
  ///
  /// In ar, this message translates to:
  /// **'اتسجلت العملية بنجاح'**
  String get manualRecordSavedNotice;

  /// No description provided for @manualRecordQueuedNotice.
  ///
  /// In ar, this message translates to:
  /// **'اتحفظت على الموبايل وهتتبعت أول ما النت يرجع'**
  String get manualRecordQueuedNotice;

  /// No description provided for @searchTitle.
  ///
  /// In ar, this message translates to:
  /// **'بحث في العمليات'**
  String get searchTitle;

  /// No description provided for @searchHint.
  ///
  /// In ar, this message translates to:
  /// **'ابحث بالاسم، الفئة أو المحل...'**
  String get searchHint;

  /// No description provided for @searchEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'مفيش نتائج لـ \"{query}\"'**
  String searchEmptyTitle(String query);

  /// No description provided for @searchEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تبحث بكلمة تانية أو اتأكد من الحروف.'**
  String get searchEmptyBody;

  /// No description provided for @searchOfflineNotice.
  ///
  /// In ar, this message translates to:
  /// **'البحث دلوقتي شغال على العمليات المحفوظة على جهازك بس.'**
  String get searchOfflineNotice;

  /// No description provided for @searchNoTransactions.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش معاملات تبحث فيها.'**
  String get searchNoTransactions;

  /// No description provided for @deleteAccountTitle.
  ///
  /// In ar, this message translates to:
  /// **'حذف الحساب'**
  String get deleteAccountTitle;

  /// No description provided for @deleteAccountBody.
  ///
  /// In ar, this message translates to:
  /// **'سيتم مسح جميع بياناتك، سجلاتك، ومعاملاتك نهائياً وفوراً. لن تتمكن من استرجاع هذا الحساب مجدداً. وفقاً لقانون حماية البيانات الشخصية رقم 151 لسنة 2020، قد يتم الاحتفاظ ببعض سجلات الامتثال المالي فقط للمدة المقررة قانوناً.'**
  String get deleteAccountBody;

  /// No description provided for @deleteAccountPhraseInstruction.
  ///
  /// In ar, this message translates to:
  /// **'لتأكيد الحذف، اكتب كلمة «احذف حسابي» أدناه:'**
  String get deleteAccountPhraseInstruction;

  /// No description provided for @deleteAccountPasswordLabel.
  ///
  /// In ar, this message translates to:
  /// **'كلمة المرور الحالية'**
  String get deleteAccountPasswordLabel;

  /// No description provided for @deleteAccountPasswordHint.
  ///
  /// In ar, this message translates to:
  /// **'اكتب كلمة المرور لتأكيد هويتك'**
  String get deleteAccountPasswordHint;

  /// No description provided for @deleteAccountConfirmButton.
  ///
  /// In ar, this message translates to:
  /// **'حذف حسابي نهائياً'**
  String get deleteAccountConfirmButton;

  /// No description provided for @deleteAccountCancelButton.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء والتراجع'**
  String get deleteAccountCancelButton;

  /// No description provided for @deleteAccountSuccess.
  ///
  /// In ar, this message translates to:
  /// **'تم حذف حسابك بنجاح.'**
  String get deleteAccountSuccess;

  /// No description provided for @deleteAccountFailed.
  ///
  /// In ar, this message translates to:
  /// **'فشل حذف الحساب. يرجى التأكد من البيانات أو التواصل مع الدعم.'**
  String get deleteAccountFailed;

  /// No description provided for @deleteAccountContactSupport.
  ///
  /// In ar, this message translates to:
  /// **'تواصل مع الدعم'**
  String get deleteAccountContactSupport;

  /// No description provided for @profileTitle.
  ///
  /// In ar, this message translates to:
  /// **'الملف الشخصي'**
  String get profileTitle;

  /// No description provided for @profileName.
  ///
  /// In ar, this message translates to:
  /// **'الاسم'**
  String get profileName;

  /// No description provided for @profilePhone.
  ///
  /// In ar, this message translates to:
  /// **'رقم الهاتف'**
  String get profilePhone;

  /// No description provided for @profileEmail.
  ///
  /// In ar, this message translates to:
  /// **'البريد الإلكتروني'**
  String get profileEmail;

  /// No description provided for @profileChangePhone.
  ///
  /// In ar, this message translates to:
  /// **'تغيير الرقم'**
  String get profileChangePhone;

  /// No description provided for @profileSave.
  ///
  /// In ar, this message translates to:
  /// **'حفظ التعديلات'**
  String get profileSave;

  /// No description provided for @profileSaved.
  ///
  /// In ar, this message translates to:
  /// **'تم حفظ التعديلات بنجاح'**
  String get profileSaved;

  /// No description provided for @phoneChangeTitle.
  ///
  /// In ar, this message translates to:
  /// **'تغيير رقم الهاتف'**
  String get phoneChangeTitle;

  /// No description provided for @phoneChangeBody.
  ///
  /// In ar, this message translates to:
  /// **'سنرسل رمز تأكيد على واتساب إلى رقمك الجديد.'**
  String get phoneChangeBody;

  /// No description provided for @phoneChangeNewNumber.
  ///
  /// In ar, this message translates to:
  /// **'الرقم الجديد'**
  String get phoneChangeNewNumber;

  /// No description provided for @phoneChangeSendCode.
  ///
  /// In ar, this message translates to:
  /// **'إرسال كود التأكيد'**
  String get phoneChangeSendCode;

  /// No description provided for @phoneChangeEnterCode.
  ///
  /// In ar, this message translates to:
  /// **'أدخل رمز التأكيد المرسل'**
  String get phoneChangeEnterCode;

  /// No description provided for @phoneChangeSuccess.
  ///
  /// In ar, this message translates to:
  /// **'تم تغيير رقم الهاتف بنجاح'**
  String get phoneChangeSuccess;

  /// No description provided for @moneyPrefsTitle.
  ///
  /// In ar, this message translates to:
  /// **'تفضيلات الراتب والميزانية'**
  String get moneyPrefsTitle;

  /// No description provided for @moneyPrefsSalaryDay.
  ///
  /// In ar, this message translates to:
  /// **'يوم نزول الراتب (بداية الشهر المالي)'**
  String get moneyPrefsSalaryDay;

  /// No description provided for @moneyPrefsSalaryDayBody.
  ///
  /// In ar, this message translates to:
  /// **'اليوم الذي تبدأ فيه حساب مصاريفك وميزانيتك الشهرية. في الشهور القصيرة مثل فبراير يتم اعتماد آخر يوم في الشهر تلقائياً.'**
  String get moneyPrefsSalaryDayBody;

  /// No description provided for @moneyPrefsCurrency.
  ///
  /// In ar, this message translates to:
  /// **'العملة'**
  String get moneyPrefsCurrency;

  /// No description provided for @moneyPrefsDecimalPlaces.
  ///
  /// In ar, this message translates to:
  /// **'الكسور العشرية'**
  String get moneyPrefsDecimalPlaces;

  /// No description provided for @moneyPrefsSaved.
  ///
  /// In ar, this message translates to:
  /// **'تم حفظ تفضيلات الراتب'**
  String get moneyPrefsSaved;

  /// No description provided for @onboardingQuestionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'أسئلة التخصيص'**
  String get onboardingQuestionsTitle;

  /// No description provided for @onboardingSkip.
  ///
  /// In ar, this message translates to:
  /// **'تخطي الآن'**
  String get onboardingSkip;

  /// No description provided for @onboardingSubmit.
  ///
  /// In ar, this message translates to:
  /// **'حفظ ومتابعة'**
  String get onboardingSubmit;

  /// No description provided for @onboardingDone.
  ///
  /// In ar, this message translates to:
  /// **'شكراً لإجاباتك!'**
  String get onboardingDone;

  /// No description provided for @sessionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'الأجهزة والجلسات النشطة'**
  String get sessionsTitle;

  /// No description provided for @sessionsCurrentDevice.
  ///
  /// In ar, this message translates to:
  /// **'هذا الجهاز'**
  String get sessionsCurrentDevice;

  /// No description provided for @sessionsRevoke.
  ///
  /// In ar, this message translates to:
  /// **'إنهاء الجلسة'**
  String get sessionsRevoke;

  /// No description provided for @sessionsRevokeConfirm.
  ///
  /// In ar, this message translates to:
  /// **'هل تريد إنهاء هذه الجلسة وتسجيل الخروج منها؟'**
  String get sessionsRevokeConfirm;

  /// No description provided for @sessionsRevokeCurrentWarning.
  ///
  /// In ar, this message translates to:
  /// **'إنهاء هذه الجلسة سيؤدي لتسجيل خروجك فوراً من هذا الموبايل.'**
  String get sessionsRevokeCurrentWarning;

  /// No description provided for @notificationsTitle.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات'**
  String get notificationsTitle;

  /// No description provided for @notificationsEmpty.
  ///
  /// In ar, this message translates to:
  /// **'لا توجد إشعارات حالياً'**
  String get notificationsEmpty;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In ar, this message translates to:
  /// **'تحديد الكل كمقروء'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsFilterAll.
  ///
  /// In ar, this message translates to:
  /// **'الكل'**
  String get notificationsFilterAll;

  /// No description provided for @notificationsFilterUnread.
  ///
  /// In ar, this message translates to:
  /// **'غير مقروءة'**
  String get notificationsFilterUnread;

  /// No description provided for @notificationsToday.
  ///
  /// In ar, this message translates to:
  /// **'اليوم'**
  String get notificationsToday;

  /// No description provided for @notificationsYesterday.
  ///
  /// In ar, this message translates to:
  /// **'أمس'**
  String get notificationsYesterday;

  /// No description provided for @notificationsThisWeek.
  ///
  /// In ar, this message translates to:
  /// **'هذا الأسبوع'**
  String get notificationsThisWeek;

  /// No description provided for @notificationsOlder.
  ///
  /// In ar, this message translates to:
  /// **'أقدم'**
  String get notificationsOlder;

  /// No description provided for @notificationSettingsTitle.
  ///
  /// In ar, this message translates to:
  /// **'إعدادات الإشعارات'**
  String get notificationSettingsTitle;

  /// No description provided for @notificationSettingsMaster.
  ///
  /// In ar, this message translates to:
  /// **'تفعيل الإشعارات'**
  String get notificationSettingsMaster;

  /// No description provided for @notificationSettingsBudget.
  ///
  /// In ar, this message translates to:
  /// **'تنبيهات الميزانية'**
  String get notificationSettingsBudget;

  /// No description provided for @notificationSettingsDaily.
  ///
  /// In ar, this message translates to:
  /// **'التذكير اليومي بالتسجيل'**
  String get notificationSettingsDaily;

  /// No description provided for @notificationSettingsStreak.
  ///
  /// In ar, this message translates to:
  /// **'تنبيهات الحفاظ على الالتزام (Streak)'**
  String get notificationSettingsStreak;

  /// No description provided for @notificationSettingsMonthly.
  ///
  /// In ar, this message translates to:
  /// **'التقرير الشهري'**
  String get notificationSettingsMonthly;

  /// No description provided for @helpCenterTitle.
  ///
  /// In ar, this message translates to:
  /// **'مركز المساعدة والدعم'**
  String get helpCenterTitle;

  /// No description provided for @helpFaqSection.
  ///
  /// In ar, this message translates to:
  /// **'الأسئلة الشائعة'**
  String get helpFaqSection;

  /// No description provided for @helpTicketSection.
  ///
  /// In ar, this message translates to:
  /// **'تواصل مع الدعم'**
  String get helpTicketSection;

  /// No description provided for @helpTicketSubject.
  ///
  /// In ar, this message translates to:
  /// **'موضوع الرسالة'**
  String get helpTicketSubject;

  /// No description provided for @helpTicketMessage.
  ///
  /// In ar, this message translates to:
  /// **'تفاصيل المشكلة أو الاستفسار'**
  String get helpTicketMessage;

  /// No description provided for @helpTicketSubmit.
  ///
  /// In ar, this message translates to:
  /// **'إرسال التذكرة'**
  String get helpTicketSubmit;

  /// No description provided for @helpTicketSuccess.
  ///
  /// In ar, this message translates to:
  /// **'تم إرسال تذكرتك بنجاح، سنرد عليك في أقرب وقت.'**
  String get helpTicketSuccess;

  /// No description provided for @helpMyTickets.
  ///
  /// In ar, this message translates to:
  /// **'تذاكري السابقة'**
  String get helpMyTickets;

  /// No description provided for @helpTicketOpen.
  ///
  /// In ar, this message translates to:
  /// **'قيد الانتظار'**
  String get helpTicketOpen;

  /// No description provided for @helpTicketClosed.
  ///
  /// In ar, this message translates to:
  /// **'مغلقة'**
  String get helpTicketClosed;

  /// No description provided for @helpTicketReplied.
  ///
  /// In ar, this message translates to:
  /// **'تم الرد'**
  String get helpTicketReplied;

  /// No description provided for @planTitle.
  ///
  /// In ar, this message translates to:
  /// **'الاشتراك والترقية'**
  String get planTitle;

  /// No description provided for @planCurrent.
  ///
  /// In ar, this message translates to:
  /// **'باقتك الحالية'**
  String get planCurrent;

  /// No description provided for @planFree.
  ///
  /// In ar, this message translates to:
  /// **'الخطة المجانية'**
  String get planFree;

  /// No description provided for @planPro.
  ///
  /// In ar, this message translates to:
  /// **'خطة المحترفين (Pro)'**
  String get planPro;

  /// No description provided for @planUpgrade.
  ///
  /// In ar, this message translates to:
  /// **'الترقية إلى Pro'**
  String get planUpgrade;

  /// No description provided for @planFeaturesTitle.
  ///
  /// In ar, this message translates to:
  /// **'مميزات خطة Pro'**
  String get planFeaturesTitle;

  /// No description provided for @cancelPlanTitle.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء الاشتراك'**
  String get cancelPlanTitle;

  /// No description provided for @cancelPlanConfirm.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد إلغاء التجديد التلقائي'**
  String get cancelPlanConfirm;

  /// No description provided for @cancelPlanRetainNotice.
  ///
  /// In ar, this message translates to:
  /// **'ستستمر باقتك الحالية حتى نهاية فترة الاشتراك ولن يتم تجديدها تلقائياً.'**
  String get cancelPlanRetainNotice;

  /// No description provided for @inviteTitle.
  ///
  /// In ar, this message translates to:
  /// **'دعوة أصدقاء'**
  String get inviteTitle;

  /// No description provided for @inviteYourCode.
  ///
  /// In ar, this message translates to:
  /// **'كود الدعوة الخاص بك'**
  String get inviteYourCode;

  /// No description provided for @inviteShare.
  ///
  /// In ar, this message translates to:
  /// **'مشاركة الكود'**
  String get inviteShare;

  /// No description provided for @inviteShareText.
  ///
  /// In ar, this message translates to:
  /// **'جرب تطبيق SmartSpend AI لتنظيم مصاريفك بذكاء! استخدم كود الدعوة بتاعي: {code}'**
  String inviteShareText(String code);

  /// No description provided for @inviteCopy.
  ///
  /// In ar, this message translates to:
  /// **'نسخ الكود'**
  String get inviteCopy;

  /// No description provided for @inviteCopied.
  ///
  /// In ar, this message translates to:
  /// **'تم نسخ الكود!'**
  String get inviteCopied;

  /// No description provided for @appearanceTitle.
  ///
  /// In ar, this message translates to:
  /// **'المظهر'**
  String get appearanceTitle;

  /// No description provided for @appearanceSystem.
  ///
  /// In ar, this message translates to:
  /// **'تلقائي (حسب النظام)'**
  String get appearanceSystem;

  /// No description provided for @appearanceLight.
  ///
  /// In ar, this message translates to:
  /// **'فاتح'**
  String get appearanceLight;

  /// No description provided for @appearanceDark.
  ///
  /// In ar, this message translates to:
  /// **'داكن'**
  String get appearanceDark;

  /// No description provided for @termsTitle.
  ///
  /// In ar, this message translates to:
  /// **'شروط الخدمة'**
  String get termsTitle;

  /// No description provided for @dataStoredTitle.
  ///
  /// In ar, this message translates to:
  /// **'البيانات والخصوصية'**
  String get dataStoredTitle;

  /// No description provided for @appInfoTitle.
  ///
  /// In ar, this message translates to:
  /// **'عن التطبيق'**
  String get appInfoTitle;

  /// No description provided for @appVersion.
  ///
  /// In ar, this message translates to:
  /// **'الإصدار'**
  String get appVersion;

  /// No description provided for @appUpdateRequired.
  ///
  /// In ar, this message translates to:
  /// **'تحديث إجباري متوفر'**
  String get appUpdateRequired;

  /// No description provided for @appUpdateBody.
  ///
  /// In ar, this message translates to:
  /// **'يتطلب التطبيق التحديث إلى أحدث إصدار لمتابعة الاستخدام وحماية بياناتك.'**
  String get appUpdateBody;

  /// No description provided for @appUpdateNow.
  ///
  /// In ar, this message translates to:
  /// **'تحديث الآن'**
  String get appUpdateNow;

  /// No description provided for @offlineRetryBanner.
  ///
  /// In ar, this message translates to:
  /// **'لا يوجد اتصال بالإنترنت. التعديلات ستُحفظ محلياً.'**
  String get offlineRetryBanner;

  /// No description provided for @forgotPassword.
  ///
  /// In ar, this message translates to:
  /// **'نسيت كلمة المرور؟'**
  String get forgotPassword;

  /// No description provided for @resetPasswordTitle.
  ///
  /// In ar, this message translates to:
  /// **'إعادة تعيين كلمة المرور'**
  String get resetPasswordTitle;

  /// No description provided for @resetPasswordNew.
  ///
  /// In ar, this message translates to:
  /// **'كلمة المرور الجديدة'**
  String get resetPasswordNew;

  /// No description provided for @resetPasswordConfirm.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد كلمة المرور'**
  String get resetPasswordConfirm;

  /// No description provided for @resetPasswordSubmit.
  ///
  /// In ar, this message translates to:
  /// **'تغيير كلمة المرور والدخول'**
  String get resetPasswordSubmit;

  /// No description provided for @resetPasswordSuccess.
  ///
  /// In ar, this message translates to:
  /// **'تم تغيير كلمة المرور بنجاح'**
  String get resetPasswordSuccess;

  /// No description provided for @planBuy.
  ///
  /// In ar, this message translates to:
  /// **'اشترك في Pro بـ {price}'**
  String planBuy(String price);

  /// No description provided for @planStoreSoon.
  ///
  /// In ar, this message translates to:
  /// **'الاشتراك من جوه التطبيق هيتاح قريب.'**
  String get planStoreSoon;

  /// No description provided for @planActivated.
  ///
  /// In ar, this message translates to:
  /// **'اشتراك Pro اتفعّل.'**
  String get planActivated;

  /// No description provided for @planPurchasePending.
  ///
  /// In ar, this message translates to:
  /// **'عملية الدفع لسه بتتراجع. هنفعّل الاشتراك أول ما تتأكد.'**
  String get planPurchasePending;

  /// No description provided for @planPurchaseFailed.
  ///
  /// In ar, this message translates to:
  /// **'الاشتراك ما اتمّش، ومفيش فلوس اتخصمت من عندنا. جرّب تاني.'**
  String get planPurchaseFailed;

  /// No description provided for @planRestore.
  ///
  /// In ar, this message translates to:
  /// **'رجّع مشترياتي'**
  String get planRestore;

  /// No description provided for @planRestored.
  ///
  /// In ar, this message translates to:
  /// **'اشتراكك رجع.'**
  String get planRestored;

  /// No description provided for @planNothingToRestore.
  ///
  /// In ar, this message translates to:
  /// **'مش لاقيين اشتراك سابق على الحساب ده في المتجر.'**
  String get planNothingToRestore;

  /// No description provided for @exportShare.
  ///
  /// In ar, this message translates to:
  /// **'شارك الملف'**
  String get exportShare;

  /// No description provided for @calendarLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب خطتك دلوقتي.'**
  String get calendarLoadFailed;

  /// No description provided for @calTransactionsOfDayP0.
  ///
  /// In ar, this message translates to:
  /// **'عمليات يوم {p0}'**
  String calTransactionsOfDayP0(String p0);

  /// No description provided for @calTransactionsOfDayP02.
  ///
  /// In ar, this message translates to:
  /// **'عمليات يوم {p0}'**
  String calTransactionsOfDayP02(String p0);

  /// No description provided for @calPayday.
  ///
  /// In ar, this message translates to:
  /// **'· يوم القبض'**
  String get calPayday;

  /// No description provided for @calNoSpending.
  ///
  /// In ar, this message translates to:
  /// **'مفيش صرف'**
  String get calNoSpending;

  /// No description provided for @calAddACommitmentOrIncome.
  ///
  /// In ar, this message translates to:
  /// **'ضيف التزام أو دخل'**
  String get calAddACommitmentOrIncome;

  /// No description provided for @calYourFinancialMonthStartsOn.
  ///
  /// In ar, this message translates to:
  /// **'شهرك المالي بيبدأ يوم {p0} وبيخلص يوم {p1}.'**
  String calYourFinancialMonthStartsOn(String p0, String p1);

  /// No description provided for @calP0DaysToPaydayDay.
  ///
  /// In ar, this message translates to:
  /// **'الأيام الباقية على القبض (يوم {p1}): {p0}. بعد التزاماتك فاضل معاك:'**
  String calP0DaysToPaydayDay(String p0, String p1);

  /// No description provided for @calP0DaysToTheEnd.
  ///
  /// In ar, this message translates to:
  /// **'الأيام الباقية في شهرك المالي: {p0}. بعد التزاماتك فاضل معاك:'**
  String calP0DaysToTheEnd(String p0);

  /// No description provided for @calLeftUntilPayday.
  ///
  /// In ar, this message translates to:
  /// **'المتاح لحد القبض'**
  String get calLeftUntilPayday;

  /// No description provided for @calNoWalletsYetSoThe.
  ///
  /// In ar, this message translates to:
  /// **'مفيش محافظ متسجلة، فالحساب بيبدأ من صفر.'**
  String get calNoWalletsYetSoThe;

  /// No description provided for @calOneBalanceHasNoKnown.
  ///
  /// In ar, this message translates to:
  /// **'فيه رصيد مش معروف اتسجل امتى؛ حدّثه من المحافظ.'**
  String get calOneBalanceHasNoKnown;

  /// No description provided for @calCommitmentsWithNoKnownAmount.
  ///
  /// In ar, this message translates to:
  /// **'التزامات مبلغها مش معروف: {p0}.'**
  String calCommitmentsWithNoKnownAmount(String p0);

  /// No description provided for @calCommitmentsWithNoDateSo.
  ///
  /// In ar, this message translates to:
  /// **'التزامات ميعادها مش معروف فمش محسوبة: {p0}.'**
  String calCommitmentsWithNoDateSo(String p0);

  /// No description provided for @calTotalCommitments.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي الالتزامات'**
  String get calTotalCommitments;

  /// No description provided for @calWalletBalances.
  ///
  /// In ar, this message translates to:
  /// **'رصيد المحافظ'**
  String get calWalletBalances;

  /// No description provided for @calNotRecorded.
  ///
  /// In ar, this message translates to:
  /// **'مش متسجل'**
  String get calNotRecorded;

  /// No description provided for @calThisMonthSSpending.
  ///
  /// In ar, this message translates to:
  /// **'صرفك في الشهر'**
  String get calThisMonthSSpending;

  /// No description provided for @calTapADayToSee.
  ///
  /// In ar, this message translates to:
  /// **'دوس على أي يوم تشوف صرفت إيه.'**
  String get calTapADayToSee;

  /// No description provided for @calCommitmentsAndExpectedIncome.
  ///
  /// In ar, this message translates to:
  /// **'الالتزامات والدخل المتوقع'**
  String get calCommitmentsAndExpectedIncome;

  /// No description provided for @calAdd.
  ///
  /// In ar, this message translates to:
  /// **'ضيف'**
  String get calAdd;

  /// No description provided for @calNoCommitmentsThisMonthAdd.
  ///
  /// In ar, this message translates to:
  /// **'مفيش التزامات الشهر ده.\nضيف فواتيرك وأقساطك علشان تعرف اللي هيفضل لحد القبض.'**
  String get calNoCommitmentsThisMonthAdd;

  /// No description provided for @calPaid.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع'**
  String get calPaid;

  /// No description provided for @calPartlyPaid.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع جزء منه'**
  String get calPartlyPaid;

  /// No description provided for @calOverdue.
  ///
  /// In ar, this message translates to:
  /// **'فات ميعاده'**
  String get calOverdue;

  /// No description provided for @calDue.
  ///
  /// In ar, this message translates to:
  /// **'مستحق'**
  String get calDue;

  /// No description provided for @calDueOnDayP0.
  ///
  /// In ar, this message translates to:
  /// **'ميعاده يوم {p0}'**
  String calDueOnDayP0(String p0);

  /// No description provided for @calSettle.
  ///
  /// In ar, this message translates to:
  /// **'ادفع'**
  String get calSettle;

  /// No description provided for @calPaidTapToUndo.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع (دوس للإلغاء)'**
  String get calPaidTapToUndo;

  /// No description provided for @calActiveSavingPlan.
  ///
  /// In ar, this message translates to:
  /// **'خطة التوفير الحالية'**
  String get calActiveSavingPlan;

  /// No description provided for @calEndThePlan.
  ///
  /// In ar, this message translates to:
  /// **'خلّص الخطة'**
  String get calEndThePlan;

  /// No description provided for @calPlanSteps.
  ///
  /// In ar, this message translates to:
  /// **'خطوات الخطة:'**
  String get calPlanSteps;

  /// No description provided for @calReminderOn.
  ///
  /// In ar, this message translates to:
  /// **'التذكير شغال'**
  String get calReminderOn;

  /// No description provided for @calTurnOnAReminder.
  ///
  /// In ar, this message translates to:
  /// **'شغّل تذكير'**
  String get calTurnOnAReminder;

  /// No description provided for @calReminderCancelled.
  ///
  /// In ar, this message translates to:
  /// **'التذكير اتلغى'**
  String get calReminderCancelled;

  /// No description provided for @calReminderSetCairoTime.
  ///
  /// In ar, this message translates to:
  /// **'التذكير اتظبط بتوقيت القاهرة'**
  String get calReminderSetCairoTime;

  /// No description provided for @calSkipThisStep.
  ///
  /// In ar, this message translates to:
  /// **'سيب الخطوة دي'**
  String get calSkipThisStep;

  /// No description provided for @calRent.
  ///
  /// In ar, this message translates to:
  /// **'إيجار'**
  String get calRent;

  /// No description provided for @calBill.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة'**
  String get calBill;

  /// No description provided for @calSubscription.
  ///
  /// In ar, this message translates to:
  /// **'اشتراك'**
  String get calSubscription;

  /// No description provided for @calSchoolFees.
  ///
  /// In ar, this message translates to:
  /// **'مصاريف مدارس'**
  String get calSchoolFees;

  /// No description provided for @calInstallment.
  ///
  /// In ar, this message translates to:
  /// **'قسط'**
  String get calInstallment;

  /// No description provided for @calDebtOrLoan.
  ///
  /// In ar, this message translates to:
  /// **'دين أو سلفة'**
  String get calDebtOrLoan;

  /// No description provided for @calSavingsCircle.
  ///
  /// In ar, this message translates to:
  /// **'جمعية'**
  String get calSavingsCircle;

  /// No description provided for @calSalary.
  ///
  /// In ar, this message translates to:
  /// **'مرتب'**
  String get calSalary;

  /// No description provided for @calFreelance.
  ///
  /// In ar, this message translates to:
  /// **'شغل حر'**
  String get calFreelance;

  /// No description provided for @calSomethingElse.
  ///
  /// In ar, this message translates to:
  /// **'حاجة تانية'**
  String get calSomethingElse;

  /// No description provided for @calEveryMonth.
  ///
  /// In ar, this message translates to:
  /// **'كل شهر'**
  String get calEveryMonth;

  /// No description provided for @calEveryWeek.
  ///
  /// In ar, this message translates to:
  /// **'كل أسبوع'**
  String get calEveryWeek;

  /// No description provided for @calEveryYear.
  ///
  /// In ar, this message translates to:
  /// **'كل سنة'**
  String get calEveryYear;

  /// No description provided for @calOnce.
  ///
  /// In ar, this message translates to:
  /// **'مرة واحدة'**
  String get calOnce;

  /// No description provided for @calEnterAName.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم'**
  String get calEnterAName;

  /// No description provided for @calEnterAValidAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب مبلغ صحيح'**
  String get calEnterAValidAmount;

  /// No description provided for @calWeCouldnTAddIt.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نضيفه. جرّب تاني.'**
  String get calWeCouldnTAddIt;

  /// No description provided for @calAddACommitmentOrExpected.
  ///
  /// In ar, this message translates to:
  /// **'ضيف التزام أو دخل متوقع'**
  String get calAddACommitmentOrExpected;

  /// No description provided for @calCommitment.
  ///
  /// In ar, this message translates to:
  /// **'التزام / مصروف'**
  String get calCommitment;

  /// No description provided for @calExpectedIncome.
  ///
  /// In ar, this message translates to:
  /// **'دخل متوقع'**
  String get calExpectedIncome;

  /// No description provided for @calNameLikeTheRent.
  ///
  /// In ar, this message translates to:
  /// **'الاسم (زي: إيجار الشقة)'**
  String get calNameLikeTheRent;

  /// No description provided for @calAmountOptionalIfItChanges.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ (اختياري لو بيتغير)'**
  String get calAmountOptionalIfItChanges;

  /// No description provided for @calKind.
  ///
  /// In ar, this message translates to:
  /// **'النوع'**
  String get calKind;

  /// No description provided for @calDueDay.
  ///
  /// In ar, this message translates to:
  /// **'يوم الميعاد'**
  String get calDueDay;

  /// No description provided for @calDayP0.
  ///
  /// In ar, this message translates to:
  /// **'يوم {p0}'**
  String calDayP0(String p0);

  /// No description provided for @calRepeats.
  ///
  /// In ar, this message translates to:
  /// **'التكرار'**
  String get calRepeats;

  /// No description provided for @calSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ'**
  String get calSave;

  /// No description provided for @calWeCouldnTRecordThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نسجل الدفع. جرّب تاني.'**
  String get calWeCouldnTRecordThe;

  /// No description provided for @calSettleP0.
  ///
  /// In ar, this message translates to:
  /// **'دفع: {p0}'**
  String calSettleP0(String p0);

  /// No description provided for @calAmountDueP0.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ المستحق: {p0}'**
  String calAmountDueP0(String p0);

  /// No description provided for @calAmountPaidPartOfIt.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ اللي دفعته (ينفع جزء منه)'**
  String get calAmountPaidPartOfIt;

  /// No description provided for @calMatchingTransactions.
  ///
  /// In ar, this message translates to:
  /// **'عمليات ممكن تكون هي:'**
  String get calMatchingTransactions;

  /// No description provided for @calNoRecentMatchingTransactionYou.
  ///
  /// In ar, this message translates to:
  /// **'مفيش عملية قريبة شبهها. تقدر تسجل المبلغ مباشرة.'**
  String get calNoRecentMatchingTransactionYou;

  /// No description provided for @calConfirmPayment.
  ///
  /// In ar, this message translates to:
  /// **'أكد الدفع'**
  String get calConfirmPayment;

  /// No description provided for @calClose.
  ///
  /// In ar, this message translates to:
  /// **'اقفل'**
  String get calClose;

  /// No description provided for @calWeCouldnTLoadThis.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نجيب عمليات اليوم ده.'**
  String get calWeCouldnTLoadThis;

  /// No description provided for @calNothingRecordedOnThisDay.
  ///
  /// In ar, this message translates to:
  /// **'مفيش حاجة متسجلة في اليوم ده.'**
  String get calNothingRecordedOnThisDay;

  /// No description provided for @calWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل'**
  String get calWorkAccount;

  /// No description provided for @calKeepWorkSpendingApartFrom.
  ///
  /// In ar, this message translates to:
  /// **'فصل مصاريف الشغل عن المصاريف الشخصية'**
  String get calKeepWorkSpendingApartFrom;

  /// No description provided for @calPeopleAndDebts.
  ///
  /// In ar, this message translates to:
  /// **'الناس والديون'**
  String get calPeopleAndDebts;

  /// No description provided for @calWhoOwesYouAndWho.
  ///
  /// In ar, this message translates to:
  /// **'مين ليك عنده ومين عليك ليه'**
  String get calWhoOwesYouAndWho;

  /// No description provided for @calMonthlyBudgets.
  ///
  /// In ar, this message translates to:
  /// **'الميزانيات الشهرية'**
  String get calMonthlyBudgets;

  /// No description provided for @calSetALimitAndSee.
  ///
  /// In ar, this message translates to:
  /// **'حدد سقف لمصاريفك وتابع اللي باقي لك أول بأول'**
  String get calSetALimitAndSee;

  /// No description provided for @calSavingGoals.
  ///
  /// In ar, this message translates to:
  /// **'أهداف التوفير'**
  String get calSavingGoals;

  /// No description provided for @calPlanWhatYouAreSaving.
  ///
  /// In ar, this message translates to:
  /// **'خطط لمستقبلك وتابع وصولك لأهدافك بالذكاء الاصطناعي'**
  String get calPlanWhatYouAreSaving;

  /// No description provided for @calInstallments.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط'**
  String get calInstallments;

  /// No description provided for @calMonthlyInstallmentsAndWhatIs.
  ///
  /// In ar, this message translates to:
  /// **'متابعة الأقساط الشهرية والباقي منها'**
  String get calMonthlyInstallmentsAndWhatIs;

  /// No description provided for @calSeasons.
  ///
  /// In ar, this message translates to:
  /// **'مواسم الصرف'**
  String get calSeasons;

  /// No description provided for @calRamadanFeastsSchoolAndSummer.
  ///
  /// In ar, this message translates to:
  /// **'رمضان، الأعياد، المدارس ومصاريف الصيف'**
  String get calRamadanFeastsSchoolAndSummer;

  /// No description provided for @calExportMyData.
  ///
  /// In ar, this message translates to:
  /// **'تصدير البيانات'**
  String get calExportMyData;

  /// No description provided for @calDownloadACopyOfYour.
  ///
  /// In ar, this message translates to:
  /// **'نزّل نسخة من عملياتك'**
  String get calDownloadACopyOfYour;

  /// No description provided for @calAccount.
  ///
  /// In ar, this message translates to:
  /// **'إعدادات الحساب'**
  String get calAccount;

  /// No description provided for @calProfile.
  ///
  /// In ar, this message translates to:
  /// **'الملف الشخصي'**
  String get calProfile;

  /// No description provided for @calYourNameAndPhoneNumber.
  ///
  /// In ar, this message translates to:
  /// **'اسمك ورقم موبايلك'**
  String get calYourNameAndPhoneNumber;

  /// No description provided for @calMoneyPreferences.
  ///
  /// In ar, this message translates to:
  /// **'تفضيلات الفلوس'**
  String get calMoneyPreferences;

  /// No description provided for @calWhenYourFinancialMonthStarts.
  ///
  /// In ar, this message translates to:
  /// **'يوم بداية شهرك المالي'**
  String get calWhenYourFinancialMonthStarts;

  /// No description provided for @calSignedInDevices.
  ///
  /// In ar, this message translates to:
  /// **'الأجهزة اللي داخل منها'**
  String get calSignedInDevices;

  /// No description provided for @calSeeAndSignOutYour.
  ///
  /// In ar, this message translates to:
  /// **'شوف أجهزتك واخرج منها'**
  String get calSeeAndSignOutYour;

  /// No description provided for @calPersonalQuestions.
  ///
  /// In ar, this message translates to:
  /// **'أسئلة عنك'**
  String get calPersonalQuestions;

  /// No description provided for @calHelpTheAssistantUnderstandYou.
  ///
  /// In ar, this message translates to:
  /// **'تساعد المساعد يفهمك أكتر'**
  String get calHelpTheAssistantUnderstandYou;

  /// No description provided for @calDeleteMyAccount.
  ///
  /// In ar, this message translates to:
  /// **'امسح حسابي'**
  String get calDeleteMyAccount;

  /// No description provided for @calDeleteYourDataForGood.
  ///
  /// In ar, this message translates to:
  /// **'امسح بياناتك نهائيًا'**
  String get calDeleteYourDataForGood;

  /// No description provided for @calPlanAndRewards.
  ///
  /// In ar, this message translates to:
  /// **'الباقة والدعوات'**
  String get calPlanAndRewards;

  /// No description provided for @calMyPlan.
  ///
  /// In ar, this message translates to:
  /// **'باقتي'**
  String get calMyPlan;

  /// No description provided for @calComparePlansAndManageYour.
  ///
  /// In ar, this message translates to:
  /// **'قارن الباقات واتحكم في اشتراكك'**
  String get calComparePlansAndManageYour;

  /// No description provided for @calInviteFriends.
  ///
  /// In ar, this message translates to:
  /// **'ادعي أصحابك'**
  String get calInviteFriends;

  /// No description provided for @calShareYourInviteCode.
  ///
  /// In ar, this message translates to:
  /// **'شارك كود الدعوة بتاعك'**
  String get calShareYourInviteCode;

  /// No description provided for @calWhatTheAppStoresAbout.
  ///
  /// In ar, this message translates to:
  /// **'ما يخزنه التطبيق عني'**
  String get calWhatTheAppStoresAbout;

  /// No description provided for @calYourDataAndYourRights.
  ///
  /// In ar, this message translates to:
  /// **'بياناتك وحقوقك'**
  String get calYourDataAndYourRights;

  /// No description provided for @calTermsAndPrivacy.
  ///
  /// In ar, this message translates to:
  /// **'الشروط والخصوصية'**
  String get calTermsAndPrivacy;

  /// No description provided for @calTermsOfUseAndPrivacy.
  ///
  /// In ar, this message translates to:
  /// **'شروط الاستخدام وسياسة الخصوصية'**
  String get calTermsOfUseAndPrivacy;

  /// No description provided for @calNotificationsAndAppearance.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات والشكل'**
  String get calNotificationsAndAppearance;

  /// No description provided for @calNotifications.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات'**
  String get calNotifications;

  /// No description provided for @calAlertsAboutYourTransactionsAnd.
  ///
  /// In ar, this message translates to:
  /// **'تنبيهات عملياتك وميزانياتك'**
  String get calAlertsAboutYourTransactionsAnd;

  /// No description provided for @calNotificationSettings.
  ///
  /// In ar, this message translates to:
  /// **'إعدادات الإشعارات'**
  String get calNotificationSettings;

  /// No description provided for @calChooseWhatReachesYou.
  ///
  /// In ar, this message translates to:
  /// **'اختار اللي يوصلك'**
  String get calChooseWhatReachesYou;

  /// No description provided for @calAppearance.
  ///
  /// In ar, this message translates to:
  /// **'الشكل'**
  String get calAppearance;

  /// No description provided for @calLightDarkOrLikeYour.
  ///
  /// In ar, this message translates to:
  /// **'فاتح، غامق، أو زي موبايلك'**
  String get calLightDarkOrLikeYour;

  /// No description provided for @calHelp.
  ///
  /// In ar, this message translates to:
  /// **'المساعدة'**
  String get calHelp;

  /// No description provided for @calHelpCenter.
  ///
  /// In ar, this message translates to:
  /// **'مركز المساعدة'**
  String get calHelpCenter;

  /// No description provided for @calCommonQuestionsAndSupportTickets.
  ///
  /// In ar, this message translates to:
  /// **'أسئلة شائعة وتواصل مع الدعم'**
  String get calCommonQuestionsAndSupportTickets;

  /// No description provided for @calAboutSmartspend.
  ///
  /// In ar, this message translates to:
  /// **'عن SmartSpend'**
  String get calAboutSmartspend;

  /// No description provided for @calVersionAndLicenses.
  ///
  /// In ar, this message translates to:
  /// **'الإصدار والتراخيص'**
  String get calVersionAndLicenses;

  /// No description provided for @monMonthlyBudgets.
  ///
  /// In ar, this message translates to:
  /// **'الميزانيات الشهرية'**
  String get monMonthlyBudgets;

  /// No description provided for @monAddABudget.
  ///
  /// In ar, this message translates to:
  /// **'ضيف ميزانية'**
  String get monAddABudget;

  /// No description provided for @monWeCanTLoadYour.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب ميزانياتك'**
  String get monWeCanTLoadYour;

  /// No description provided for @monCheckYourConnectionAndTry.
  ///
  /// In ar, this message translates to:
  /// **'اتأكد من النت وجرّب تاني'**
  String get monCheckYourConnectionAndTry;

  /// No description provided for @monTryAgain.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تاني'**
  String get monTryAgain;

  /// No description provided for @monNoBudgetsYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش ميزانيات'**
  String get monNoBudgetsYet;

  /// No description provided for @monSetAMonthlyLimitFor.
  ///
  /// In ar, this message translates to:
  /// **'حدد سقف شهري لمصاريفك أو لفئة معينة، وتابع اللي فاضل أول بأول.'**
  String get monSetAMonthlyLimitFor;

  /// No description provided for @monAddAMonthlyBudget.
  ///
  /// In ar, this message translates to:
  /// **'ضيف ميزانية شهرية'**
  String get monAddAMonthlyBudget;

  /// No description provided for @monAllBudgets.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي الميزانيات'**
  String get monAllBudgets;

  /// No description provided for @monSpentP0.
  ///
  /// In ar, this message translates to:
  /// **'صرفت: {p0}'**
  String monSpentP0(String p0);

  /// No description provided for @monOverByP0.
  ///
  /// In ar, this message translates to:
  /// **'زدت بـ {p0}'**
  String monOverByP0(String p0);

  /// No description provided for @monLeftP0.
  ///
  /// In ar, this message translates to:
  /// **'فاضل: {p0}'**
  String monLeftP0(String p0);

  /// No description provided for @monBudgetDetails.
  ///
  /// In ar, this message translates to:
  /// **'تفاصيل الميزانيات'**
  String get monBudgetDetails;

  /// No description provided for @monEdit.
  ///
  /// In ar, this message translates to:
  /// **'عدّل'**
  String get monEdit;

  /// No description provided for @monDelete.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get monDelete;

  /// No description provided for @monDeleteTheBudget.
  ///
  /// In ar, this message translates to:
  /// **'امسح الميزانية'**
  String get monDeleteTheBudget;

  /// No description provided for @monDeleteTheBudgetP0.
  ///
  /// In ar, this message translates to:
  /// **'تمسح ميزانية \"{p0}\"؟'**
  String monDeleteTheBudgetP0(String p0);

  /// No description provided for @monCancel.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء'**
  String get monCancel;

  /// No description provided for @monBudgetP0Deleted.
  ///
  /// In ar, this message translates to:
  /// **'ميزانية \"{p0}\" اتمسحت'**
  String monBudgetP0Deleted(String p0);

  /// No description provided for @monUndo.
  ///
  /// In ar, this message translates to:
  /// **'تراجع'**
  String get monUndo;

  /// No description provided for @monSpentP0OfP1.
  ///
  /// In ar, this message translates to:
  /// **'صرفت {p0} من {p1}'**
  String monSpentP0OfP1(String p0, String p1);

  /// No description provided for @monOverBudgetP0.
  ///
  /// In ar, this message translates to:
  /// **'زدت عن الميزانية ({p0}%)'**
  String monOverBudgetP0(String p0);

  /// No description provided for @monAlmostUsedP0.
  ///
  /// In ar, this message translates to:
  /// **'قربت تخلص ({p0}%)'**
  String monAlmostUsedP0(String p0);

  /// No description provided for @monLeftP02.
  ///
  /// In ar, this message translates to:
  /// **'فاضل: {p0}'**
  String monLeftP02(String p0);

  /// No description provided for @monOverallBudget.
  ///
  /// In ar, this message translates to:
  /// **'الميزانية العامة'**
  String get monOverallBudget;

  /// No description provided for @monEnterTheMonthlyAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب المبلغ الشهري'**
  String get monEnterTheMonthlyAmount;

  /// No description provided for @monWeCouldnTSaveIt.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نحفظ. جرّب تاني كمان شوية.'**
  String get monWeCouldnTSaveIt;

  /// No description provided for @monEditTheBudget.
  ///
  /// In ar, this message translates to:
  /// **'عدّل الميزانية'**
  String get monEditTheBudget;

  /// No description provided for @monNewMonthlyBudget.
  ///
  /// In ar, this message translates to:
  /// **'ميزانية شهرية جديدة'**
  String get monNewMonthlyBudget;

  /// No description provided for @monClose.
  ///
  /// In ar, this message translates to:
  /// **'اقفل'**
  String get monClose;

  /// No description provided for @monCategory.
  ///
  /// In ar, this message translates to:
  /// **'الفئة'**
  String get monCategory;

  /// No description provided for @monOverallBudgetAllSpending.
  ///
  /// In ar, this message translates to:
  /// **'الميزانية العامة (كل المصاريف)'**
  String get monOverallBudgetAllSpending;

  /// No description provided for @monBudgetName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الميزانية'**
  String get monBudgetName;

  /// No description provided for @monLikeFoodAndDrink.
  ///
  /// In ar, this message translates to:
  /// **'زي: الأكل والشرب'**
  String get monLikeFoodAndDrink;

  /// No description provided for @monMonthlyLimit.
  ///
  /// In ar, this message translates to:
  /// **'الحد الشهري'**
  String get monMonthlyLimit;

  /// No description provided for @monAlertMeAt.
  ///
  /// In ar, this message translates to:
  /// **'نبهني عند'**
  String get monAlertMeAt;

  /// No description provided for @monSaving.
  ///
  /// In ar, this message translates to:
  /// **'بنحفظ...'**
  String get monSaving;

  /// No description provided for @monSaveChanges.
  ///
  /// In ar, this message translates to:
  /// **'احفظ التعديلات'**
  String get monSaveChanges;

  /// No description provided for @monAddTheBudget.
  ///
  /// In ar, this message translates to:
  /// **'ضيف الميزانية'**
  String get monAddTheBudget;

  /// No description provided for @monSavingGoals.
  ///
  /// In ar, this message translates to:
  /// **'أهداف التوفير'**
  String get monSavingGoals;

  /// No description provided for @monNewGoal.
  ///
  /// In ar, this message translates to:
  /// **'هدف جديد'**
  String get monNewGoal;

  /// No description provided for @monWeCanTLoadYour2.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب أهدافك'**
  String get monWeCanTLoadYour2;

  /// No description provided for @monNoSavingGoalsYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش أهداف'**
  String get monNoSavingGoalsYet;

  /// No description provided for @monSetAGoalLikeUmrah.
  ///
  /// In ar, this message translates to:
  /// **'حدد هدف، زي عمرة أو لابتوب جديد أو فلوس للطوارئ، وتابعه خطوة بخطوة.'**
  String get monSetAGoalLikeUmrah;

  /// No description provided for @monCreateASavingGoal.
  ///
  /// In ar, this message translates to:
  /// **'اعمل هدف جديد'**
  String get monCreateASavingGoal;

  /// No description provided for @monCurrentGoals.
  ///
  /// In ar, this message translates to:
  /// **'أهدافك الحالية'**
  String get monCurrentGoals;

  /// No description provided for @monGoalsReached.
  ///
  /// In ar, this message translates to:
  /// **'أهداف حققتها'**
  String get monGoalsReached;

  /// No description provided for @monPausedGoals.
  ///
  /// In ar, this message translates to:
  /// **'أهداف متوقفة'**
  String get monPausedGoals;

  /// No description provided for @monTargetP0.
  ///
  /// In ar, this message translates to:
  /// **'الهدف: {p0}'**
  String monTargetP0(String p0);

  /// No description provided for @monSmartPlan.
  ///
  /// In ar, this message translates to:
  /// **'خطة ذكية'**
  String get monSmartPlan;

  /// No description provided for @monTargetDateP0P1P2.
  ///
  /// In ar, this message translates to:
  /// **'الميعاد: {p0}/{p1}/{p2}'**
  String monTargetDateP0P1P2(String p0, String p1, String p2);

  /// No description provided for @monWeCouldnTRunThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نعمل التحليل. اتأكد من النت وجرّب تاني.'**
  String get monWeCouldnTRunThe;

  /// No description provided for @monCongratulations.
  ///
  /// In ar, this message translates to:
  /// **'ألف مبروك!'**
  String get monCongratulations;

  /// No description provided for @monYouReachedYourGoalP0.
  ///
  /// In ar, this message translates to:
  /// **'حققت هدف \"{p0}\". خطوة كبيرة لقدام!'**
  String monYouReachedYourGoalP0(String p0);

  /// No description provided for @monReached.
  ///
  /// In ar, this message translates to:
  /// **'اتحقق'**
  String get monReached;

  /// No description provided for @monActive.
  ///
  /// In ar, this message translates to:
  /// **'شغال'**
  String get monActive;

  /// No description provided for @monPaused.
  ///
  /// In ar, this message translates to:
  /// **'متوقف'**
  String get monPaused;

  /// No description provided for @monDateP0P1P2.
  ///
  /// In ar, this message translates to:
  /// **'الميعاد: {p0}/{p1}/{p2}'**
  String monDateP0P1P2(String p0, String p1, String p2);

  /// No description provided for @monGoalAnalysis.
  ///
  /// In ar, this message translates to:
  /// **'تحليل الهدف'**
  String get monGoalAnalysis;

  /// No description provided for @monRefresh.
  ///
  /// In ar, this message translates to:
  /// **'حدّث'**
  String get monRefresh;

  /// No description provided for @monStepsToYourGoal.
  ///
  /// In ar, this message translates to:
  /// **'خطوات الوصول للهدف:'**
  String get monStepsToYourGoal;

  /// No description provided for @monSuggestedWeeklyActions.
  ///
  /// In ar, this message translates to:
  /// **'حاجات تعملها كل أسبوع:'**
  String get monSuggestedWeeklyActions;

  /// No description provided for @monLastAnalysisP0P1P2.
  ///
  /// In ar, this message translates to:
  /// **'آخر تحليل: {p0}/{p1}/{p2}'**
  String monLastAnalysisP0P1P2(String p0, String p1, String p2);

  /// No description provided for @monRunTheAnalysisToGet.
  ///
  /// In ar, this message translates to:
  /// **'شغّل التحليل وهتاخد خطة مبنية على مصاريفك.'**
  String get monRunTheAnalysisToGet;

  /// No description provided for @monGoalAnalysisComesWithPro.
  ///
  /// In ar, this message translates to:
  /// **'تحليل الأهداف متاح في باقة Pro.'**
  String get monGoalAnalysisComesWithPro;

  /// No description provided for @monAnalyzing.
  ///
  /// In ar, this message translates to:
  /// **'بنحلل الهدف...'**
  String get monAnalyzing;

  /// No description provided for @monAnalyzeThisGoal.
  ///
  /// In ar, this message translates to:
  /// **'حلل الهدف'**
  String get monAnalyzeThisGoal;

  /// No description provided for @monUpgradeToProForThe.
  ///
  /// In ar, this message translates to:
  /// **'اشترك في Pro للتحليل'**
  String get monUpgradeToProForThe;

  /// No description provided for @monGoalReached.
  ///
  /// In ar, this message translates to:
  /// **'الهدف اتحقق!'**
  String get monGoalReached;

  /// No description provided for @monPause.
  ///
  /// In ar, this message translates to:
  /// **'وقّف مؤقتًا'**
  String get monPause;

  /// No description provided for @monResumeTheGoal.
  ///
  /// In ar, this message translates to:
  /// **'كمّل الهدف'**
  String get monResumeTheGoal;

  /// No description provided for @monDeleteTheGoal.
  ///
  /// In ar, this message translates to:
  /// **'امسح الهدف'**
  String get monDeleteTheGoal;

  /// No description provided for @monEnterANameForThe.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم الهدف'**
  String get monEnterANameForThe;

  /// No description provided for @monEnterTheTargetAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب المبلغ المستهدف'**
  String get monEnterTheTargetAmount;

  /// No description provided for @monWeCouldnTCreateThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نعمل الهدف. اتأكد من النت وجرّب تاني.'**
  String get monWeCouldnTCreateThe;

  /// No description provided for @monNewSavingGoal.
  ///
  /// In ar, this message translates to:
  /// **'هدف جديد'**
  String get monNewSavingGoal;

  /// No description provided for @monGoalName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الهدف'**
  String get monGoalName;

  /// No description provided for @monLikeUmrahANewLaptop.
  ///
  /// In ar, this message translates to:
  /// **'زي: عمرة، لابتوب جديد، صيانة العربية'**
  String get monLikeUmrahANewLaptop;

  /// No description provided for @monTargetAmountRequired.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ المستهدف (مطلوب)'**
  String get monTargetAmountRequired;

  /// No description provided for @monLike25000.
  ///
  /// In ar, this message translates to:
  /// **'زي: 25000'**
  String get monLike25000;

  /// No description provided for @monTargetDateOptional.
  ///
  /// In ar, this message translates to:
  /// **'ميعاد الهدف (اختياري)'**
  String get monTargetDateOptional;

  /// No description provided for @monChooseADate.
  ///
  /// In ar, this message translates to:
  /// **'اختار ميعاد'**
  String get monChooseADate;

  /// No description provided for @monNotesOptional.
  ///
  /// In ar, this message translates to:
  /// **'ملاحظات (اختياري)'**
  String get monNotesOptional;

  /// No description provided for @monAnythingThatHelpsYouRemember.
  ///
  /// In ar, this message translates to:
  /// **'أي حاجة تفكرك بخطتك...'**
  String get monAnythingThatHelpsYouRemember;

  /// No description provided for @monCreating.
  ///
  /// In ar, this message translates to:
  /// **'بنعمل الهدف...'**
  String get monCreating;

  /// No description provided for @monCreateTheGoal.
  ///
  /// In ar, this message translates to:
  /// **'اعمل الهدف'**
  String get monCreateTheGoal;

  /// No description provided for @monClear.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get monClear;

  /// No description provided for @monVoiceRecordingNeedsInternetYou.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل بالصوت محتاج نت. تقدر تكتب الجملة دلوقتي.'**
  String get monVoiceRecordingNeedsInternetYou;

  /// No description provided for @monWeNeedMicrophoneAccessTo.
  ///
  /// In ar, this message translates to:
  /// **'محتاجين إذن المايك علشان تسجل بصوتك.'**
  String get monWeNeedMicrophoneAccessTo;

  /// No description provided for @monWeCouldnTStartRecording.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نبدأ التسجيل. جرّب تاني.'**
  String get monWeCouldnTStartRecording;

  /// No description provided for @monRecordingCancelled.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل اتلغى'**
  String get monRecordingCancelled;

  /// No description provided for @monBalance.
  ///
  /// In ar, this message translates to:
  /// **'رصيد'**
  String get monBalance;

  /// No description provided for @monSeconds.
  ///
  /// In ar, this message translates to:
  /// **'ثانية'**
  String get monSeconds;

  /// No description provided for @monPlan.
  ///
  /// In ar, this message translates to:
  /// **'باقة'**
  String get monPlan;

  /// No description provided for @monWeCouldnTProcessThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نقرا التسجيل. جرّب تاني.'**
  String get monWeCouldnTProcessThe;

  /// No description provided for @monWeCouldnTHearAny.
  ///
  /// In ar, this message translates to:
  /// **'ما سمعناش مصروف في التسجيل.'**
  String get monWeCouldnTHearAny;

  /// No description provided for @monVoiceRecording.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل صوتي'**
  String get monVoiceRecording;

  /// No description provided for @monModeSingleTap.
  ///
  /// In ar, this message translates to:
  /// **'الوضع: ضغطة واحدة'**
  String get monModeSingleTap;

  /// No description provided for @monModeHold.
  ///
  /// In ar, this message translates to:
  /// **'الوضع: ضغطة طويلة'**
  String get monModeHold;

  /// No description provided for @monPhotographAReceipt.
  ///
  /// In ar, this message translates to:
  /// **'صوّر فاتورة'**
  String get monPhotographAReceipt;

  /// No description provided for @monSlideToCancel.
  ///
  /// In ar, this message translates to:
  /// **'اسحب للإلغاء'**
  String get monSlideToCancel;

  /// No description provided for @monCancelRecording.
  ///
  /// In ar, this message translates to:
  /// **'ألغي التسجيل'**
  String get monCancelRecording;

  /// No description provided for @monListeningToTheRecording.
  ///
  /// In ar, this message translates to:
  /// **'بنسمع التسجيل...'**
  String get monListeningToTheRecording;

  /// No description provided for @monStopRecording.
  ///
  /// In ar, this message translates to:
  /// **'وقّف التسجيل'**
  String get monStopRecording;

  /// No description provided for @monRecordByVoiceTapTo.
  ///
  /// In ar, this message translates to:
  /// **'سجّل بصوتك (دوس للبدء)'**
  String get monRecordByVoiceTapTo;

  /// No description provided for @monRecordByVoiceHold.
  ///
  /// In ar, this message translates to:
  /// **'سجّل بصوتك (دوس مطوّل)'**
  String get monRecordByVoiceHold;

  /// No description provided for @monHoldTheMicToRecord.
  ///
  /// In ar, this message translates to:
  /// **'دوس مطوّل على المايك علشان تسجل'**
  String get monHoldTheMicToRecord;

  /// No description provided for @monReadingReceiptsNeedsInternet.
  ///
  /// In ar, this message translates to:
  /// **'قراءة الفواتير محتاجة نت.'**
  String get monReadingReceiptsNeedsInternet;

  /// No description provided for @monWeCanTOpenThe.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نفتح الكاميرا. اسمح بالوصول من إعدادات الموبايل، أو اختار صورة من المعرض.'**
  String get monWeCanTOpenThe;

  /// No description provided for @monThisPhotoIsTooLarge.
  ///
  /// In ar, this message translates to:
  /// **'الصورة كبيرة قوي. جرّب صورة تانية أقرب للفاتورة.'**
  String get monThisPhotoIsTooLarge;

  /// No description provided for @monThePhotoIsnTClear.
  ///
  /// In ar, this message translates to:
  /// **'الصورة مش واضحة أو مش قادرين نقرا المبلغ. جرّب في نور أحسن.'**
  String get monThePhotoIsnTClear;

  /// No description provided for @monReceipt.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة'**
  String get monReceipt;

  /// No description provided for @monThePhotoIsnTClear2.
  ///
  /// In ar, this message translates to:
  /// **'الصورة مش واضحة. جرّب صورة أوضح في نور أحسن.'**
  String get monThePhotoIsnTClear2;

  /// No description provided for @monReadingTheReceipt.
  ///
  /// In ar, this message translates to:
  /// **'بنقرا الفاتورة...'**
  String get monReadingTheReceipt;

  /// No description provided for @monFindingTheAmountAndDetails.
  ///
  /// In ar, this message translates to:
  /// **'بنطلع المبلغ والتفاصيل'**
  String get monFindingTheAmountAndDetails;

  /// No description provided for @monReviewTheReceipt.
  ///
  /// In ar, this message translates to:
  /// **'راجع الفاتورة'**
  String get monReviewTheReceipt;

  /// No description provided for @monReceiptTotal.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي الفاتورة'**
  String get monReceiptTotal;

  /// No description provided for @monCategory2.
  ///
  /// In ar, this message translates to:
  /// **'الفئة:'**
  String get monCategory2;

  /// No description provided for @monDetailsP0.
  ///
  /// In ar, this message translates to:
  /// **'البيان: {p0}'**
  String monDetailsP0(String p0);

  /// No description provided for @monSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ'**
  String get monSave;

  /// No description provided for @monEditInTheBox.
  ///
  /// In ar, this message translates to:
  /// **'عدّل في الخانة'**
  String get monEditInTheBox;

  /// No description provided for @monPhotographTheReceipt.
  ///
  /// In ar, this message translates to:
  /// **'صوّر الفاتورة'**
  String get monPhotographTheReceipt;

  /// No description provided for @monTakeAPhotoOfThe.
  ///
  /// In ar, this message translates to:
  /// **'صوّر الفاتورة أو اختار صورتها من المعرض، وإحنا هنقراها لك.'**
  String get monTakeAPhotoOfThe;

  /// No description provided for @monCamera.
  ///
  /// In ar, this message translates to:
  /// **'الكاميرا'**
  String get monCamera;

  /// No description provided for @monTakeAClearPhotoOf.
  ///
  /// In ar, this message translates to:
  /// **'صوّر الفاتورة صورة واضحة'**
  String get monTakeAClearPhotoOf;

  /// No description provided for @monChooseFromTheGallery.
  ///
  /// In ar, this message translates to:
  /// **'اختار من المعرض'**
  String get monChooseFromTheGallery;

  /// No description provided for @monPickAPhotoSavedOn.
  ///
  /// In ar, this message translates to:
  /// **'اختار صورة من موبايلك'**
  String get monPickAPhotoSavedOn;

  /// No description provided for @monRecordByVoice.
  ///
  /// In ar, this message translates to:
  /// **'سجّل مصاريفك بصوتك'**
  String get monRecordByVoice;

  /// No description provided for @monToRecordYourSpendingBy.
  ///
  /// In ar, this message translates to:
  /// **'علشان تسجل بصوتك محتاجين إذن المايك. صوتك بيتحول لنص وما بيتحفظش.'**
  String get monToRecordYourSpendingBy;

  /// No description provided for @monAllowTheMicrophone.
  ///
  /// In ar, this message translates to:
  /// **'اسمح بالمايك'**
  String get monAllowTheMicrophone;

  /// No description provided for @monNotNow.
  ///
  /// In ar, this message translates to:
  /// **'مش دلوقتي'**
  String get monNotNow;

  /// No description provided for @monAll.
  ///
  /// In ar, this message translates to:
  /// **'الكل'**
  String get monAll;

  /// No description provided for @monRecordedMonthlyIncome.
  ///
  /// In ar, this message translates to:
  /// **'الدخل الشهري المسجل'**
  String get monRecordedMonthlyIncome;

  /// No description provided for @monTotalIncomeThisMonth.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي دخل الشهر'**
  String get monTotalIncomeThisMonth;

  /// No description provided for @monHowYouSpend.
  ///
  /// In ar, this message translates to:
  /// **'طريقة صرفك'**
  String get monHowYouSpend;

  /// No description provided for @monRecordMoreThisMonthTo.
  ///
  /// In ar, this message translates to:
  /// **'سجّل مصاريف أكتر الشهر ده علشان طريقتك تبان بوضوح.'**
  String get monRecordMoreThisMonthTo;

  /// No description provided for @monYourSpendingJumpsOnCertain.
  ///
  /// In ar, this message translates to:
  /// **'مصاريفك بتقفز في أيام معينة، مش متوزعة بالتساوي.'**
  String get monYourSpendingJumpsOnCertain;

  /// No description provided for @monYourSpendingRisesOnWeekends.
  ///
  /// In ar, this message translates to:
  /// **'مصاريفك بتزيد في الويك إند والمناسبات.'**
  String get monYourSpendingRisesOnWeekends;

  /// No description provided for @monMostOfYourSpendingGoes.
  ///
  /// In ar, this message translates to:
  /// **'معظم مصاريفك رايحة لفئة واحدة.'**
  String get monMostOfYourSpendingGoes;

  /// No description provided for @monFrequentPurchasesWithoutPlanning.
  ///
  /// In ar, this message translates to:
  /// **'مشتريات متكررة من غير تخطيط.'**
  String get monFrequentPurchasesWithoutPlanning;

  /// No description provided for @monYouSpendCautiouslyAndKeep.
  ///
  /// In ar, this message translates to:
  /// **'بتصرف بحرص ومحافظ على مبلغ أمان.'**
  String get monYouSpendCautiouslyAndKeep;

  /// No description provided for @monYouStickToYourBudget.
  ///
  /// In ar, this message translates to:
  /// **'ملتزم بميزانيتك ومصاريفك منظمة.'**
  String get monYouStickToYourBudget;

  /// No description provided for @monYourSpendingIsBalancedWith.
  ///
  /// In ar, this message translates to:
  /// **'مصاريفك متوازنة ومفيهاش قفزات.'**
  String get monYourSpendingIsBalancedWith;

  /// No description provided for @monYourBiggestSpendingDayP0.
  ///
  /// In ar, this message translates to:
  /// **'أكتر يوم بتصرف فيه: {p0} ({p1})'**
  String monYourBiggestSpendingDayP0(String p0, String p1);

  /// No description provided for @monYourSpendingByWeekday.
  ///
  /// In ar, this message translates to:
  /// **'مصاريفك حسب أيام الأسبوع'**
  String get monYourSpendingByWeekday;

  /// No description provided for @monSpendingDays.
  ///
  /// In ar, this message translates to:
  /// **'أيام الصرف'**
  String get monSpendingDays;

  /// No description provided for @monChartOfSpendingByWeekday.
  ///
  /// In ar, this message translates to:
  /// **'رسم مصاريف أيام الأسبوع. أعلى يوم {p0} بمبلغ {p1}.'**
  String monChartOfSpendingByWeekday(String p0, String p1);

  /// No description provided for @monChartOfSpendingByWeekday2.
  ///
  /// In ar, this message translates to:
  /// **'رسم مصاريف أيام الأسبوع.'**
  String get monChartOfSpendingByWeekday2;

  /// No description provided for @monRecordMoreToSeeYour.
  ///
  /// In ar, this message translates to:
  /// **'سجّل مصاريف أكتر علشان تعرف أيام صرفك.'**
  String get monRecordMoreToSeeYour;

  /// No description provided for @monMonthlyBudget.
  ///
  /// In ar, this message translates to:
  /// **'الميزانية الشهرية'**
  String get monMonthlyBudget;

  /// No description provided for @monSetAMonthlyBudgetTo.
  ///
  /// In ar, this message translates to:
  /// **'حدد ميزانية شهرية علشان تعرف فاضل معاك كام أول بأول.'**
  String get monSetAMonthlyBudgetTo;

  /// No description provided for @monSetABudget.
  ///
  /// In ar, this message translates to:
  /// **'حدد ميزانية'**
  String get monSetABudget;

  /// No description provided for @monOverallMonthlyBudget.
  ///
  /// In ar, this message translates to:
  /// **'الميزانية الشهرية العامة'**
  String get monOverallMonthlyBudget;

  /// No description provided for @monComparedWithYourRecordedMonthly.
  ///
  /// In ar, this message translates to:
  /// **'مقارنة بدخلك الشهري المسجل (مفيش ميزانية)'**
  String get monComparedWithYourRecordedMonthly;

  /// No description provided for @monComparedWithThisMonthS.
  ///
  /// In ar, this message translates to:
  /// **'مقارنة بدخل الشهر ده'**
  String get monComparedWithThisMonthS;

  /// No description provided for @monBudgetAndSpending.
  ///
  /// In ar, this message translates to:
  /// **'الميزانية والصرف'**
  String get monBudgetAndSpending;

  /// No description provided for @monSpentP02.
  ///
  /// In ar, this message translates to:
  /// **'صرفت: {p0}'**
  String monSpentP02(String p0);

  /// No description provided for @monOverBudgetByP0.
  ///
  /// In ar, this message translates to:
  /// **'زدت عن الميزانية بـ {p0}'**
  String monOverBudgetByP0(String p0);

  /// No description provided for @monLeftP03.
  ///
  /// In ar, this message translates to:
  /// **'فاضل: {p0}'**
  String monLeftP03(String p0);

  /// No description provided for @monRecordedAutomatically.
  ///
  /// In ar, this message translates to:
  /// **'اللي اتسجل تلقائيًا'**
  String get monRecordedAutomatically;

  /// No description provided for @monFromBanksAndWallets.
  ///
  /// In ar, this message translates to:
  /// **'من البنوك والمحافظ'**
  String get monFromBanksAndWallets;

  /// No description provided for @monByHandOrCash.
  ///
  /// In ar, this message translates to:
  /// **'يدوي أو كاش'**
  String get monByHandOrCash;

  /// No description provided for @monTheseCameFromYourBank.
  ///
  /// In ar, this message translates to:
  /// **'دول جايين من رسايل البنك والمحفظة.'**
  String get monTheseCameFromYourBank;

  /// No description provided for @monMoneyWithPeople.
  ///
  /// In ar, this message translates to:
  /// **'فلوس مع الناس'**
  String get monMoneyWithPeople;

  /// No description provided for @monNoDebtsOrLoansYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش ديون أو سلف. قول أو اكتب: \"سلفت أحمد 200 جنيه\".'**
  String get monNoDebtsOrLoansYet;

  /// No description provided for @monMoneyWithPeopleDebtsAnd.
  ///
  /// In ar, this message translates to:
  /// **'فلوس مع الناس (ديون وسلف)'**
  String get monMoneyWithPeopleDebtsAnd;

  /// No description provided for @monOwedToYou.
  ///
  /// In ar, this message translates to:
  /// **'ليك برّه'**
  String get monOwedToYou;

  /// No description provided for @monYouOwe.
  ///
  /// In ar, this message translates to:
  /// **'عليك للناس'**
  String get monYouOwe;

  /// No description provided for @monOwesYouP0.
  ///
  /// In ar, this message translates to:
  /// **'ليك {p0}'**
  String monOwesYouP0(String p0);

  /// No description provided for @monYouOweP0.
  ///
  /// In ar, this message translates to:
  /// **'عليك {p0}'**
  String monYouOweP0(String p0);

  /// No description provided for @monSeeAllPeopleAndDebts.
  ///
  /// In ar, this message translates to:
  /// **'شوف كل الناس والديون'**
  String get monSeeAllPeopleAndDebts;

  /// No description provided for @monThisYearYourHighestMonth.
  ///
  /// In ar, this message translates to:
  /// **'السنة دي: أعلى شهر صرف كان {p0} ({p1})'**
  String monThisYearYourHighestMonth(String p0, String p1);

  /// No description provided for @monYourSpendingInP0.
  ///
  /// In ar, this message translates to:
  /// **'مصاريفك في {p0}'**
  String monYourSpendingInP0(String p0);

  /// No description provided for @monThisYearP0.
  ///
  /// In ar, this message translates to:
  /// **'السنة دي ({p0})'**
  String monThisYearP0(String p0);

  /// No description provided for @monChartOfTheYearS.
  ///
  /// In ar, this message translates to:
  /// **'رسم مصاريف السنة. الإجمالي {p0}.'**
  String monChartOfTheYearS(String p0);

  /// No description provided for @monYourSmartProfileAndPrivacy.
  ///
  /// In ar, this message translates to:
  /// **'ملفك الذكي وخصوصيتك'**
  String get monYourSmartProfileAndPrivacy;

  /// No description provided for @monWhatTheAppLearnedAbout.
  ///
  /// In ar, this message translates to:
  /// **'اللي التطبيق اتعلمه عنك بيستخدم لخدمتك بس، وتقدر تغيره من هنا.'**
  String get monWhatTheAppLearnedAbout;

  /// No description provided for @monYourSavedPaydayDayP0.
  ///
  /// In ar, this message translates to:
  /// **'يوم القبض المحفوظ: يوم {p0} من كل شهر.'**
  String monYourSavedPaydayDayP0(String p0);
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
