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
  /// **'التطبيق بيبعت لنا بس الرسايل والإشعارات اللي فيها كلام عن فلوس (خصم، تحويل، رصيد، دفع وغيرها) من البنوك والمحافظ ورسايل SMS. الذكاء الاصطناعي بيقرا كل رسالة عشان يعرف المبلغ والنوع ومين الطرف التاني، وأرقام موبايلك وكروتك وحساباتك بتتخبّى قبل ما يشوفها، وأسماء المحلات والناس بتفضل عشان يقدر يصنّفها. أكواد التحقق مابتتحفظش ومابتتقريش. العملية بتتسجل لوحدها ويوصلك إشعار تقدر منه تلغيها، والرسالة بتتمسح بعد 30 يوم.'**
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
  /// **'قراءة الرسايل بالذكاء الاصطناعي'**
  String get captureAiReadingTitle;

  /// No description provided for @captureAiReadingBody.
  ///
  /// In ar, this message translates to:
  /// **'هو اللي بيفهم كل رسالة ويسجّلها لوحدها. لو قفلته، رسايل البنك مش هتتسجل.'**
  String get captureAiReadingBody;

  /// No description provided for @captureAiReadingFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ اختيارك. جرّب تاني.'**
  String get captureAiReadingFailed;

  /// No description provided for @captureQuestionsBody.
  ///
  /// In ar, this message translates to:
  /// **'لما عملية تتسجل في «عام» أو تحويل لحد، نسألك لما تفتح التطبيق صرفتها في إيه أو بعتها لمين، وإجابتك بتتحفظ للمرة الجاية.'**
  String get captureQuestionsBody;

  /// No description provided for @captureQuestionsTitle.
  ///
  /// In ar, this message translates to:
  /// **'اسألني اتصرفت في إيه'**
  String get captureQuestionsTitle;

  /// No description provided for @captureSmsTitle.
  ///
  /// In ar, this message translates to:
  /// **'قراءة رسايل البنك SMS'**
  String get captureSmsTitle;

  /// No description provided for @captureSmsBody.
  ///
  /// In ar, this message translates to:
  /// **'بنقرا رسايل البنوك والمحافظ أول ما توصل، ورسايلك الشخصية مش بتتقري.'**
  String get captureSmsBody;

  /// No description provided for @captureSmsOn.
  ///
  /// In ar, this message translates to:
  /// **'شغالة: رسايل البنك بتتسجل أول ما توصل.'**
  String get captureSmsOn;

  /// No description provided for @captureSmsAllow.
  ///
  /// In ar, this message translates to:
  /// **'اسمح'**
  String get captureSmsAllow;

  /// No description provided for @captureSmsImport.
  ///
  /// In ar, this message translates to:
  /// **'سجّل رسايل آخر 30 يوم'**
  String get captureSmsImport;

  /// No description provided for @captureSmsImported.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =0{مالقيناش رسايل بنك جديدة} =1{بنسجّل رسالة واحدة} other{بنسجّل {count} رسالة}}'**
  String captureSmsImported(int count);

  /// No description provided for @captureSamplesTitle.
  ///
  /// In ar, this message translates to:
  /// **'ساعدنا نحسّن قراءة الرسايل'**
  String get captureSamplesTitle;

  /// No description provided for @captureSamplesBody.
  ///
  /// In ar, this message translates to:
  /// **'بنحتفظ برسايل البنك متخبّي منها الأسماء والأرقام، عشان نقرا الرسايل من غير ذكاء اصطناعي بعدين. لو قفلتها بنمسح اللي اتحفظ.'**
  String get captureSamplesBody;

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
  /// **'اكتب: قهوة 50 وأوبر 120'**
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

  /// No description provided for @manualRecordSelectCategory.
  ///
  /// In ar, this message translates to:
  /// **'اختر التصنيف'**
  String get manualRecordSelectCategory;

  /// No description provided for @manualRecordNoWallet.
  ///
  /// In ar, this message translates to:
  /// **'بدون محفظة'**
  String get manualRecordNoWallet;

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

  /// No description provided for @helpMyTickets.
  ///
  /// In ar, this message translates to:
  /// **'تذاكري السابقة'**
  String get helpMyTickets;

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

  /// No description provided for @cancelPlanRetainNotice.
  ///
  /// In ar, this message translates to:
  /// **'باقتك هتفضل شغالة لحد آخر الفترة اللي دفعتها.'**
  String get cancelPlanRetainNotice;

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

  /// No description provided for @calPaidOrNot.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع ولا لأ؟'**
  String get calPaidOrNot;

  /// No description provided for @calWeCouldnTUndoIt.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نلغي الدفع. جرّب تاني.'**
  String get calWeCouldnTUndoIt;

  /// No description provided for @calMoreOptions.
  ///
  /// In ar, this message translates to:
  /// **'اختيارات تانية'**
  String get calMoreOptions;

  /// No description provided for @calStopThisCommitment.
  ///
  /// In ar, this message translates to:
  /// **'وقّف الالتزام ده'**
  String get calStopThisCommitment;

  /// No description provided for @calStopCommitmentP0Explained.
  ///
  /// In ar, this message translates to:
  /// **'«{p0}» مش هيظهر في مواعيدك تاني ومش هيتخصم من المتاح. اللي اتدفع قبل كده هيفضل متسجل زي ما هو.'**
  String calStopCommitmentP0Explained(String p0);

  /// No description provided for @calStop.
  ///
  /// In ar, this message translates to:
  /// **'وقّف'**
  String get calStop;

  /// No description provided for @calWeCouldnTStopIt.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نوقفه. جرّب تاني.'**
  String get calWeCouldnTStopIt;

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
  /// **'الميعاد: {p0}'**
  String monTargetDateP0P1P2(String p0);

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
  /// **'الميعاد: {p0}'**
  String monDateP0P1P2(String p0);

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
  /// **'آخر تحليل: {p0}'**
  String monLastAnalysisP0P1P2(String p0);

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

  /// No description provided for @aiWeCanTRunThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نعمل التحليل السنوي دلوقتي.'**
  String get aiWeCanTRunThe;

  /// No description provided for @aiConfirmIt.
  ///
  /// In ar, this message translates to:
  /// **'أكد العملية'**
  String get aiConfirmIt;

  /// No description provided for @aiDone.
  ///
  /// In ar, this message translates to:
  /// **'اتعملت'**
  String get aiDone;

  /// No description provided for @aiItDidnTGoThrough.
  ///
  /// In ar, this message translates to:
  /// **'ما اتعملتش. جرّب تاني.'**
  String get aiItDidnTGoThrough;

  /// No description provided for @aiConfirmASensitiveAction.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد لعملية حساسة'**
  String get aiConfirmASensitiveAction;

  /// No description provided for @aiThisActionP0CanT.
  ///
  /// In ar, this message translates to:
  /// **'العملية دي ({p0}) مش سهل ترجع فيها.'**
  String aiThisActionP0CanT(String p0);

  /// No description provided for @aiToConfirmTypeExactlyP0.
  ///
  /// In ar, this message translates to:
  /// **'علشان تأكد، اكتب بالظبط:\n«{p0}»'**
  String aiToConfirmTypeExactlyP0(String p0);

  /// No description provided for @aiCancel.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء'**
  String get aiCancel;

  /// No description provided for @aiConfirm.
  ///
  /// In ar, this message translates to:
  /// **'أكد'**
  String get aiConfirm;

  /// No description provided for @aiSensitive.
  ///
  /// In ar, this message translates to:
  /// **'حساسة'**
  String get aiSensitive;

  /// No description provided for @aiDateP0.
  ///
  /// In ar, this message translates to:
  /// **'التاريخ: {p0}'**
  String aiDateP0(String p0);

  /// No description provided for @aiDoneAndYourRecordsAre.
  ///
  /// In ar, this message translates to:
  /// **'اتعملت وحساباتك اتحدثت.'**
  String get aiDoneAndYourRecordsAre;

  /// No description provided for @aiCancelled.
  ///
  /// In ar, this message translates to:
  /// **'اتلغت.'**
  String get aiCancelled;

  /// No description provided for @aiThisHasExpiredAndCan.
  ///
  /// In ar, this message translates to:
  /// **'المدة انتهت، ومش هينفع تتنفذ.'**
  String get aiThisHasExpiredAndCan;

  /// No description provided for @aiContinue.
  ///
  /// In ar, this message translates to:
  /// **'كمّل التأكيد'**
  String get aiContinue;

  /// No description provided for @aiConfirm2.
  ///
  /// In ar, this message translates to:
  /// **'أكد'**
  String get aiConfirm2;

  /// No description provided for @aiLiveCall.
  ///
  /// In ar, this message translates to:
  /// **'المكالمة المباشرة'**
  String get aiLiveCall;

  /// No description provided for @aiTheLiveCallComesWith.
  ///
  /// In ar, this message translates to:
  /// **'المكالمة المباشرة متاحة في باقة Pro.'**
  String get aiTheLiveCallComesWith;

  /// No description provided for @aiUpgrade.
  ///
  /// In ar, this message translates to:
  /// **'رقّي باقتك'**
  String get aiUpgrade;

  /// No description provided for @aiStartALiveCall.
  ///
  /// In ar, this message translates to:
  /// **'ابدأ مكالمة مباشرة'**
  String get aiStartALiveCall;

  /// No description provided for @aiWeLlUseTheMicrophone.
  ///
  /// In ar, this message translates to:
  /// **'هنستخدم المايك علشان تكلم المساعد.'**
  String get aiWeLlUseTheMicrophone;

  /// No description provided for @aiCall.
  ///
  /// In ar, this message translates to:
  /// **'اتصل'**
  String get aiCall;

  /// No description provided for @aiWeCouldnTStartThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نبدأ المكالمة.'**
  String get aiWeCouldnTStartThe;

  /// No description provided for @aiAiCenter.
  ///
  /// In ar, this message translates to:
  /// **'مركز AI'**
  String get aiAiCenter;

  /// No description provided for @aiLiveCall2.
  ///
  /// In ar, this message translates to:
  /// **'مكالمة مباشرة'**
  String get aiLiveCall2;

  /// No description provided for @aiWhatTheAssistantRemembers.
  ///
  /// In ar, this message translates to:
  /// **'ذاكرة المساعد'**
  String get aiWhatTheAssistantRemembers;

  /// No description provided for @aiPastConversations.
  ///
  /// In ar, this message translates to:
  /// **'المحادثات اللي فاتت'**
  String get aiPastConversations;

  /// No description provided for @aiChat.
  ///
  /// In ar, this message translates to:
  /// **'المحادثة'**
  String get aiChat;

  /// No description provided for @aiMonthlyReport.
  ///
  /// In ar, this message translates to:
  /// **'الشهر'**
  String get aiMonthlyReport;

  /// No description provided for @aiCompareMonths.
  ///
  /// In ar, this message translates to:
  /// **'قارن'**
  String get aiCompareMonths;

  /// No description provided for @aiCalls.
  ///
  /// In ar, this message translates to:
  /// **'المكالمات'**
  String get aiCalls;

  /// No description provided for @aiYearlyReport.
  ///
  /// In ar, this message translates to:
  /// **'السنة'**
  String get aiYearlyReport;

  /// No description provided for @aiWeNeedInternetToAnswer.
  ///
  /// In ar, this message translates to:
  /// **'محتاجين نت علشان نرد عليك. اللي كتبته محفوظ.'**
  String get aiWeNeedInternetToAnswer;

  /// No description provided for @aiYouReOfflineYourDraft.
  ///
  /// In ar, this message translates to:
  /// **'إنت من غير نت. اللي كتبته محفوظ، وابعته لما النت يرجع.'**
  String get aiYouReOfflineYourDraft;

  /// No description provided for @aiUpgradeToPro.
  ///
  /// In ar, this message translates to:
  /// **'اشترك في Pro'**
  String get aiUpgradeToPro;

  /// No description provided for @aiWeCanTLoadYour.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب رسايلك.'**
  String get aiWeCanTLoadYour;

  /// No description provided for @aiAskAboutYourSpending.
  ///
  /// In ar, this message translates to:
  /// **'اسأل عن مصاريفك...'**
  String get aiAskAboutYourSpending;

  /// No description provided for @aiSendingNeedsInternet.
  ///
  /// In ar, this message translates to:
  /// **'الإرسال محتاج نت...'**
  String get aiSendingNeedsInternet;

  /// No description provided for @aiHiIMYourAssistant.
  ///
  /// In ar, this message translates to:
  /// **'أهلًا، أنا مساعدك'**
  String get aiHiIMYourAssistant;

  /// No description provided for @aiAskAboutYourSpendingOr.
  ///
  /// In ar, this message translates to:
  /// **'اسألني عن مصاريفك أو ميزانيتك، أو قولّي أسجل حاجة.'**
  String get aiAskAboutYourSpendingOr;

  /// No description provided for @aiTryAsking.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تسأل:'**
  String get aiTryAsking;

  /// No description provided for @aiThinking.
  ///
  /// In ar, this message translates to:
  /// **'بيفكر...'**
  String get aiThinking;

  /// No description provided for @aiCompareTwoMonths.
  ///
  /// In ar, this message translates to:
  /// **'قارن شهرين'**
  String get aiCompareTwoMonths;

  /// No description provided for @aiPickTwoDifferentMonthsTo.
  ///
  /// In ar, this message translates to:
  /// **'اختار شهرين مختلفين تشوف إيه اللي اتغير وليه.'**
  String get aiPickTwoDifferentMonthsTo;

  /// No description provided for @aiFirstMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر الأول:'**
  String get aiFirstMonth;

  /// No description provided for @aiSecondMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر التاني:'**
  String get aiSecondMonth;

  /// No description provided for @aiPickTwoDifferentMonths.
  ///
  /// In ar, this message translates to:
  /// **'اختار شهرين مختلفين.'**
  String get aiPickTwoDifferentMonths;

  /// No description provided for @aiWeCouldnTCompareThem.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نقارن.'**
  String get aiWeCouldnTCompareThem;

  /// No description provided for @aiComparisonP0AndP1.
  ///
  /// In ar, this message translates to:
  /// **'المقارنة ({p0} و{p1})'**
  String aiComparisonP0AndP1(String p0, String p1);

  /// No description provided for @aiBiggestChangesByCategory.
  ///
  /// In ar, this message translates to:
  /// **'أكبر تغييرات في الفئات:'**
  String get aiBiggestChangesByCategory;

  /// No description provided for @aiCategory.
  ///
  /// In ar, this message translates to:
  /// **'فئة'**
  String get aiCategory;

  /// No description provided for @aiNewChat.
  ///
  /// In ar, this message translates to:
  /// **'محادثة جديدة'**
  String get aiNewChat;

  /// No description provided for @aiWeCanTLoadYour2.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب محادثاتك.'**
  String get aiWeCanTLoadYour2;

  /// No description provided for @aiNoPastConversations.
  ///
  /// In ar, this message translates to:
  /// **'مفيش محادثات قبل كده'**
  String get aiNoPastConversations;

  /// No description provided for @aiStartANewChatWith.
  ///
  /// In ar, this message translates to:
  /// **'ابدأ محادثة جديدة مع المساعد'**
  String get aiStartANewChatWith;

  /// No description provided for @aiConversation.
  ///
  /// In ar, this message translates to:
  /// **'محادثة'**
  String get aiConversation;

  /// No description provided for @aiP0P1Messages.
  ///
  /// In ar, this message translates to:
  /// **'{p0} • {p1} رسالة'**
  String aiP0P1Messages(String p0, String p1);

  /// No description provided for @aiDeleteTheConversation.
  ///
  /// In ar, this message translates to:
  /// **'امسح المحادثة'**
  String get aiDeleteTheConversation;

  /// No description provided for @aiDeleteTheConversationP0.
  ///
  /// In ar, this message translates to:
  /// **'تمسح محادثة «{p0}»؟'**
  String aiDeleteTheConversationP0(String p0);

  /// No description provided for @aiDelete.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get aiDelete;

  /// No description provided for @aiWhatTheAssistantRemembers2.
  ///
  /// In ar, this message translates to:
  /// **'ذاكرة المساعد'**
  String get aiWhatTheAssistantRemembers2;

  /// No description provided for @aiClearAll.
  ///
  /// In ar, this message translates to:
  /// **'امسح الكل'**
  String get aiClearAll;

  /// No description provided for @aiTheAssistantKeepsAFew.
  ///
  /// In ar, this message translates to:
  /// **'المساعد بيحفظ شوية حاجات أساسية عن عاداتك وأولوياتك علشان ردوده تناسبك، وتقدر تمسح أي حاجة منها هنا.'**
  String get aiTheAssistantKeepsAFew;

  /// No description provided for @aiWeCanTLoadThe.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب الذاكرة.'**
  String get aiWeCanTLoadThe;

  /// No description provided for @aiTheAssistantDoesnTKnow.
  ///
  /// In ar, this message translates to:
  /// **'المساعد لسه ما يعرفش تفاصيل عنك'**
  String get aiTheAssistantDoesnTKnow;

  /// No description provided for @aiTheMoreYouTalkThe.
  ///
  /// In ar, this message translates to:
  /// **'كل ما تتكلم معاه أكتر، هيفتكر أكتر.'**
  String get aiTheMoreYouTalkThe;

  /// No description provided for @aiForgetThis.
  ///
  /// In ar, this message translates to:
  /// **'انسى المعلومة دي'**
  String get aiForgetThis;

  /// No description provided for @aiRemovedFromTheAssistantS.
  ///
  /// In ar, this message translates to:
  /// **'اتمسحت من ذاكرة المساعد.'**
  String get aiRemovedFromTheAssistantS;

  /// No description provided for @aiClearAllMemories.
  ///
  /// In ar, this message translates to:
  /// **'امسح كل الذاكرة'**
  String get aiClearAllMemories;

  /// No description provided for @aiDeleteEverythingSavedTheAssistant.
  ///
  /// In ar, this message translates to:
  /// **'تمسح كل اللي اتحفظ؟ المساعد هيبدأ يتعلمك من الأول.'**
  String get aiDeleteEverythingSavedTheAssistant;

  /// No description provided for @aiWeCouldnTUpdateThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نحدث التقرير.'**
  String get aiWeCouldnTUpdateThe;

  /// No description provided for @aiExportTheReport.
  ///
  /// In ar, this message translates to:
  /// **'صدّر التقرير'**
  String get aiExportTheReport;

  /// No description provided for @aiWeCouldnTExportThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نصدر التقرير.'**
  String get aiWeCouldnTExportThe;

  /// No description provided for @aiPreviousMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر اللي فات'**
  String get aiPreviousMonth;

  /// No description provided for @aiNextMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر الجاي'**
  String get aiNextMonth;

  /// No description provided for @aiAnalyzeAgain.
  ///
  /// In ar, this message translates to:
  /// **'حلل تاني'**
  String get aiAnalyzeAgain;

  /// No description provided for @aiWeCanTLoadThe2.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب التقرير.'**
  String get aiWeCanTLoadThe2;

  /// No description provided for @aiLimitedDataRecordMoreThis.
  ///
  /// In ar, this message translates to:
  /// **'بيانات قليلة: سجّل عمليات أكتر الشهر ده علشان التقرير يبقى أوضح.'**
  String get aiLimitedDataRecordMoreThis;

  /// No description provided for @aiThisMonthSAnalysis.
  ///
  /// In ar, this message translates to:
  /// **'تحليل الشهر'**
  String get aiThisMonthSAnalysis;

  /// No description provided for @aiTopConfirmedSpending.
  ///
  /// In ar, this message translates to:
  /// **'أعلى بنود الصرف:'**
  String get aiTopConfirmedSpending;

  /// No description provided for @aiGeneral.
  ///
  /// In ar, this message translates to:
  /// **'عام'**
  String get aiGeneral;

  /// No description provided for @aiYearlyReport2.
  ///
  /// In ar, this message translates to:
  /// **'التقرير السنوي'**
  String get aiYearlyReport2;

  /// No description provided for @aiP0Summary.
  ///
  /// In ar, this message translates to:
  /// **'ملخص {p0}'**
  String aiP0Summary(String p0);

  /// No description provided for @aiNotEnoughDataForThis.
  ///
  /// In ar, this message translates to:
  /// **'مفيش بيانات كفاية للسنة دي.'**
  String get aiNotEnoughDataForThis;

  /// No description provided for @aiWeCanTLoadYour3.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب مكالماتك.'**
  String get aiWeCanTLoadYour3;

  /// No description provided for @aiTryAgain.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تاني'**
  String get aiTryAgain;

  /// No description provided for @aiNoPastCalls.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مكالمات قبل كده'**
  String get aiNoPastCalls;

  /// No description provided for @aiTalkToTheAssistantIn.
  ///
  /// In ar, this message translates to:
  /// **'اتكلم مع المساعد بطريقتك عن فلوسك.'**
  String get aiTalkToTheAssistantIn;

  /// No description provided for @aiStartANewCall.
  ///
  /// In ar, this message translates to:
  /// **'ابدأ مكالمة جديدة'**
  String get aiStartANewCall;

  /// No description provided for @aiP0MinP1Sec.
  ///
  /// In ar, this message translates to:
  /// **'{p0} دقيقة و{p1} ثانية'**
  String aiP0MinP1Sec(String p0, String p1);

  /// No description provided for @aiP0Sec.
  ///
  /// In ar, this message translates to:
  /// **'{p0} ثانية'**
  String aiP0Sec(String p0);

  /// No description provided for @aiVoiceCall.
  ///
  /// In ar, this message translates to:
  /// **'مكالمة صوتية'**
  String get aiVoiceCall;

  /// No description provided for @aiDurationP0.
  ///
  /// In ar, this message translates to:
  /// **'المدة: {p0}'**
  String aiDurationP0(String p0);

  /// No description provided for @aiNewCall.
  ///
  /// In ar, this message translates to:
  /// **'مكالمة جديدة'**
  String get aiNewCall;

  /// No description provided for @aiYourPrivacyNeitherTheAudio.
  ///
  /// In ar, this message translates to:
  /// **'خصوصيتك: الصوت ونص المكالمة مش بيتحفظوا.'**
  String get aiYourPrivacyNeitherTheAudio;

  /// No description provided for @aiCallEnded.
  ///
  /// In ar, this message translates to:
  /// **'المكالمة خلصت'**
  String get aiCallEnded;

  /// No description provided for @aiTheAudioIsNotRecorded.
  ///
  /// In ar, this message translates to:
  /// **'الصوت مش بيتسجل ولا بيتحفظ بعد المكالمة.'**
  String get aiTheAudioIsNotRecorded;

  /// No description provided for @aiReady.
  ///
  /// In ar, this message translates to:
  /// **'جاهز'**
  String get aiReady;

  /// No description provided for @aiConnecting.
  ///
  /// In ar, this message translates to:
  /// **'بنوصل...'**
  String get aiConnecting;

  /// No description provided for @aiListeningGoAhead.
  ///
  /// In ar, this message translates to:
  /// **'سامعينك، اتكلم...'**
  String get aiListeningGoAhead;

  /// No description provided for @aiThinking2.
  ///
  /// In ar, this message translates to:
  /// **'بيفكر...'**
  String get aiThinking2;

  /// No description provided for @aiTheAssistantIsSpeaking.
  ///
  /// In ar, this message translates to:
  /// **'المساعد بيتكلم...'**
  String get aiTheAssistantIsSpeaking;

  /// No description provided for @aiPleaseConfirmTheSuggestedAction.
  ///
  /// In ar, this message translates to:
  /// **'أكد العملية المقترحة'**
  String get aiPleaseConfirmTheSuggestedAction;

  /// No description provided for @aiReconnecting.
  ///
  /// In ar, this message translates to:
  /// **'بنوصل تاني...'**
  String get aiReconnecting;

  /// No description provided for @aiDone2.
  ///
  /// In ar, this message translates to:
  /// **'اتعملت'**
  String get aiDone2;

  /// No description provided for @aiCancelled2.
  ///
  /// In ar, this message translates to:
  /// **'اتلغت'**
  String get aiCancelled2;

  /// No description provided for @aiAddACategory.
  ///
  /// In ar, this message translates to:
  /// **'ضيف فئة للمشروع'**
  String get aiAddACategory;

  /// No description provided for @aiCategoryNameLikeStockShop.
  ///
  /// In ar, this message translates to:
  /// **'اسم الفئة (زي: بضاعة، إيجار المحل)'**
  String get aiCategoryNameLikeStockShop;

  /// No description provided for @aiExpense.
  ///
  /// In ar, this message translates to:
  /// **'مصروف'**
  String get aiExpense;

  /// No description provided for @aiIncomeOrSales.
  ///
  /// In ar, this message translates to:
  /// **'إيراد أو مبيعات'**
  String get aiIncomeOrSales;

  /// No description provided for @aiIcon.
  ///
  /// In ar, this message translates to:
  /// **'الأيقونة'**
  String get aiIcon;

  /// No description provided for @aiAddTheCategory.
  ///
  /// In ar, this message translates to:
  /// **'ضيف الفئة'**
  String get aiAddTheCategory;

  /// No description provided for @aiEnterTheBusinessNameFirst.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم المشروع الأول'**
  String get aiEnterTheBusinessNameFirst;

  /// No description provided for @aiWeCouldnTSuggestCategories.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نقترح فئات. جرّب تاني.'**
  String get aiWeCouldnTSuggestCategories;

  /// No description provided for @aiYourWorkAccountIsOn.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل اتفعّل'**
  String get aiYourWorkAccountIsOn;

  /// No description provided for @aiWeCouldnTCreateThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نعمل المشروع.'**
  String get aiWeCouldnTCreateThe;

  /// No description provided for @aiDeleteTheWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'تمسح حساب الشغل؟'**
  String get aiDeleteTheWorkAccount;

  /// No description provided for @aiIfYouDeleteTheWork.
  ///
  /// In ar, this message translates to:
  /// **'لو مسحت حساب الشغل:\n• عملياتك هتفضل محفوظة وهتتنقل لحسابك الشخصي.\n• فئاته وقواعده هتتمسح.\n• المسح مابيترجعش.'**
  String get aiIfYouDeleteTheWork;

  /// No description provided for @aiConfirmDelete.
  ///
  /// In ar, this message translates to:
  /// **'أكد المسح'**
  String get aiConfirmDelete;

  /// No description provided for @aiWorkAccountDeletedAndIts.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل اتمسح وعملياته اتنقلت للشخصي'**
  String get aiWorkAccountDeletedAndIts;

  /// No description provided for @aiWeCanTDeleteThe.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نمسح المشروع دلوقتي.'**
  String get aiWeCanTDeleteThe;

  /// No description provided for @aiWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل'**
  String get aiWorkAccount;

  /// No description provided for @aiTheWorkAccountComesWith.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل متاح في باقة Pro'**
  String get aiTheWorkAccountComesWith;

  /// No description provided for @aiKeepYourBusinessSSpending.
  ///
  /// In ar, this message translates to:
  /// **'افصل مصاريف وإيرادات مشروعك عن مصاريف بيتك.'**
  String get aiKeepYourBusinessSSpending;

  /// No description provided for @aiUpgradingFromTheAppIs.
  ///
  /// In ar, this message translates to:
  /// **'الاشتراك من التطبيق هيتاح قريب'**
  String get aiUpgradingFromTheAppIs;

  /// No description provided for @aiUpgradeToPro2.
  ///
  /// In ar, this message translates to:
  /// **'اشترك في Pro'**
  String get aiUpgradeToPro2;

  /// No description provided for @aiRestaurantsAndFood.
  ///
  /// In ar, this message translates to:
  /// **'مطاعم وأكل'**
  String get aiRestaurantsAndFood;

  /// No description provided for @aiTradeAndRetail.
  ///
  /// In ar, this message translates to:
  /// **'تجارة وقطاعي'**
  String get aiTradeAndRetail;

  /// No description provided for @aiServicesAndWorkshops.
  ///
  /// In ar, this message translates to:
  /// **'خدمات وورش'**
  String get aiServicesAndWorkshops;

  /// No description provided for @aiFreelanceAndCompanies.
  ///
  /// In ar, this message translates to:
  /// **'شغل حر وشركات'**
  String get aiFreelanceAndCompanies;

  /// No description provided for @aiSomethingElse.
  ///
  /// In ar, this message translates to:
  /// **'نوع تاني'**
  String get aiSomethingElse;

  /// No description provided for @aiSetUpTheWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'جهز حساب الشغل'**
  String get aiSetUpTheWorkAccount;

  /// No description provided for @aiMakeASeparateAccountFor.
  ///
  /// In ar, this message translates to:
  /// **'اعمل حساب منفصل لشغلك أو محلك.'**
  String get aiMakeASeparateAccountFor;

  /// No description provided for @aiBusinessOrShopName.
  ///
  /// In ar, this message translates to:
  /// **'اسم المشروع أو المحل'**
  String get aiBusinessOrShopName;

  /// No description provided for @aiField.
  ///
  /// In ar, this message translates to:
  /// **'مجال المشروع'**
  String get aiField;

  /// No description provided for @aiShortDescriptionOptional.
  ///
  /// In ar, this message translates to:
  /// **'وصف قصير (اختياري)'**
  String get aiShortDescriptionOptional;

  /// No description provided for @aiSuggestCategories.
  ///
  /// In ar, this message translates to:
  /// **'اقترح فئات'**
  String get aiSuggestCategories;

  /// No description provided for @aiSuggestedCategoriesReviewThem.
  ///
  /// In ar, this message translates to:
  /// **'فئات مقترحة (راجعها)'**
  String get aiSuggestedCategoriesReviewThem;

  /// No description provided for @aiChooseTheOnesThatFit.
  ///
  /// In ar, this message translates to:
  /// **'اختار اللي يناسب شغلك:'**
  String get aiChooseTheOnesThatFit;

  /// No description provided for @aiIncomeAndSales.
  ///
  /// In ar, this message translates to:
  /// **'إيراد ومبيعات'**
  String get aiIncomeAndSales;

  /// No description provided for @aiExpenses.
  ///
  /// In ar, this message translates to:
  /// **'مصروفات'**
  String get aiExpenses;

  /// No description provided for @aiCreateTheWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'اعمل حساب الشغل'**
  String get aiCreateTheWorkAccount;

  /// No description provided for @aiCurrentWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'حساب الشغل الحالي'**
  String get aiCurrentWorkAccount;

  /// No description provided for @aiSwitchedToTheWorkAccount.
  ///
  /// In ar, this message translates to:
  /// **'اتحولت لحساب الشغل'**
  String get aiSwitchedToTheWorkAccount;

  /// No description provided for @aiSwitchedToPersonal.
  ///
  /// In ar, this message translates to:
  /// **'اتحولت للشخصي'**
  String get aiSwitchedToPersonal;

  /// No description provided for @aiYouReInTheWork.
  ///
  /// In ar, this message translates to:
  /// **'إنت دلوقتي في حساب الشغل. العمليات الجديدة هتتسجل فيه.'**
  String get aiYouReInTheWork;

  /// No description provided for @aiYouReInPersonalMode.
  ///
  /// In ar, this message translates to:
  /// **'إنت في الوضع الشخصي. شغّل المفتاح علشان تسجل لشغلك.'**
  String get aiYouReInPersonalMode;

  /// No description provided for @aiBusinessCategoriesP0.
  ///
  /// In ar, this message translates to:
  /// **'فئات المشروع ({p0})'**
  String aiBusinessCategoriesP0(String p0);

  /// No description provided for @aiIncome.
  ///
  /// In ar, this message translates to:
  /// **'إيراد'**
  String get aiIncome;

  /// No description provided for @aiDeleteTheCategory.
  ///
  /// In ar, this message translates to:
  /// **'امسح الفئة'**
  String get aiDeleteTheCategory;

  /// No description provided for @aiAddANewCategory.
  ///
  /// In ar, this message translates to:
  /// **'ضيف فئة جديدة'**
  String get aiAddANewCategory;

  /// No description provided for @aiBusinessPeopleAndSuppliers.
  ///
  /// In ar, this message translates to:
  /// **'ناس وموردين المشروع'**
  String get aiBusinessPeopleAndSuppliers;

  /// No description provided for @aiSuppliersAndCustomersP0.
  ///
  /// In ar, this message translates to:
  /// **'عدد الموردين والعملاء: {p0}'**
  String aiSuppliersAndCustomersP0(String p0);

  /// No description provided for @aiLinkAnyoneToTheBusiness.
  ///
  /// In ar, this message translates to:
  /// **'تقدر تربط أي شخص بالمشروع علشان تتابع المستحقات.'**
  String get aiLinkAnyoneToTheBusiness;

  /// No description provided for @aiManageContactsAndSuppliers.
  ///
  /// In ar, this message translates to:
  /// **'ظبط الناس والموردين'**
  String get aiManageContactsAndSuppliers;

  /// No description provided for @aiDeleteTheWorkAccount2.
  ///
  /// In ar, this message translates to:
  /// **'امسح حساب الشغل'**
  String get aiDeleteTheWorkAccount2;

  /// No description provided for @aiEnterThePersonSName.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم الشخص الأول'**
  String get aiEnterThePersonSName;

  /// No description provided for @aiWeCouldnTAddThem.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نضيفه. اتأكد من النت وجرّب تاني.'**
  String get aiWeCouldnTAddThem;

  /// No description provided for @aiAddANewPerson.
  ///
  /// In ar, this message translates to:
  /// **'ضيف شخص جديد'**
  String get aiAddANewPerson;

  /// No description provided for @aiSoYouCanRecordSpending.
  ///
  /// In ar, this message translates to:
  /// **'علشان تسجل معاه مصاريف أو سلف أو ديون بسهولة.'**
  String get aiSoYouCanRecordSpending;

  /// No description provided for @aiName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الشخص *'**
  String get aiName;

  /// No description provided for @aiLikeMohamedIbrahimOrAhmed.
  ///
  /// In ar, this message translates to:
  /// **'زي: محمد إبراهيم أو أحمد الكهربائي'**
  String get aiLikeMohamedIbrahimOrAhmed;

  /// No description provided for @aiRelationOptional.
  ///
  /// In ar, this message translates to:
  /// **'صلة القرابة أو الوصف (اختياري)'**
  String get aiRelationOptional;

  /// No description provided for @aiLikeColleagueFriendBrother.
  ///
  /// In ar, this message translates to:
  /// **'زي: زميل شغل، صاحبي، أخويا...'**
  String get aiLikeColleagueFriendBrother;

  /// No description provided for @aiSaving.
  ///
  /// In ar, this message translates to:
  /// **'بنحفظ...'**
  String get aiSaving;

  /// No description provided for @aiSaveThePerson.
  ///
  /// In ar, this message translates to:
  /// **'احفظ الشخص'**
  String get aiSaveThePerson;

  /// No description provided for @aiPeopleAndDebts.
  ///
  /// In ar, this message translates to:
  /// **'الناس والديون'**
  String get aiPeopleAndDebts;

  /// No description provided for @aiAddAPerson.
  ///
  /// In ar, this message translates to:
  /// **'ضيف شخص'**
  String get aiAddAPerson;

  /// No description provided for @aiWeCanTLoadYour4.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب الناس والديون.'**
  String get aiWeCanTLoadYour4;

  /// No description provided for @aiSearchByNameOrRelation.
  ///
  /// In ar, this message translates to:
  /// **'دوّر بالاسم أو صلة القرابة...'**
  String get aiSearchByNameOrRelation;

  /// No description provided for @aiOpenBalances.
  ///
  /// In ar, this message translates to:
  /// **'حسابات مفتوحة'**
  String get aiOpenBalances;

  /// No description provided for @aiNoResults.
  ///
  /// In ar, this message translates to:
  /// **'مفيش نتايج'**
  String get aiNoResults;

  /// No description provided for @aiNoOpenDebtsAllSettled.
  ///
  /// In ar, this message translates to:
  /// **'مفيش ديون مفتوحة، كله متصفي.'**
  String get aiNoOpenDebtsAllSettled;

  /// No description provided for @aiSettled.
  ///
  /// In ar, this message translates to:
  /// **'حسابات متصفية'**
  String get aiSettled;

  /// No description provided for @aiNoResults2.
  ///
  /// In ar, this message translates to:
  /// **'مفيش نتايج'**
  String get aiNoResults2;

  /// No description provided for @aiNoSettledAccountsYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش حسابات متصفية.'**
  String get aiNoSettledAccountsYet;

  /// No description provided for @aiNetMoneyOut.
  ///
  /// In ar, this message translates to:
  /// **'صافي الفلوس برّه'**
  String get aiNetMoneyOut;

  /// No description provided for @aiOwedToYou.
  ///
  /// In ar, this message translates to:
  /// **'ليك برّه'**
  String get aiOwedToYou;

  /// No description provided for @aiYouOwe.
  ///
  /// In ar, this message translates to:
  /// **'عليك برّه'**
  String get aiYouOwe;

  /// No description provided for @aiMergeWithADuplicate.
  ///
  /// In ar, this message translates to:
  /// **'ادمج مع شخص مكرر'**
  String get aiMergeWithADuplicate;

  /// No description provided for @aiDeleteThePerson.
  ///
  /// In ar, this message translates to:
  /// **'امسح الشخص'**
  String get aiDeleteThePerson;

  /// No description provided for @aiDeleteP0.
  ///
  /// In ar, this message translates to:
  /// **'تمسح \"{p0}\"؟'**
  String aiDeleteP0(String p0);

  /// No description provided for @aiTheirRecordedTransactionsStayOnly.
  ///
  /// In ar, this message translates to:
  /// **'العمليات المسجلة معاه هتفضل، والشخص بس اللي هيتمسح.'**
  String get aiTheirRecordedTransactionsStayOnly;

  /// No description provided for @aiDeleting.
  ///
  /// In ar, this message translates to:
  /// **'بنمسح...'**
  String get aiDeleting;

  /// No description provided for @aiDelete2.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get aiDelete2;

  /// No description provided for @aiMergeDuplicates.
  ///
  /// In ar, this message translates to:
  /// **'ادمج المكررين'**
  String get aiMergeDuplicates;

  /// No description provided for @aiChooseTheNameToKeep.
  ///
  /// In ar, this message translates to:
  /// **'اختار الاسم اللي هيفضل، وكل العمليات هتتنقل عليه.'**
  String get aiChooseTheNameToKeep;

  /// No description provided for @aiNoOtherContactsToMerge.
  ///
  /// In ar, this message translates to:
  /// **'مفيش حد تاني تدمج معاه.'**
  String get aiNoOtherContactsToMerge;

  /// No description provided for @aiChooseWhoToMergeWith.
  ///
  /// In ar, this message translates to:
  /// **'اختار الشخص اللي هيتدمج مع \"{p0}\":'**
  String aiChooseWhoToMergeWith(String p0);

  /// No description provided for @aiChooseAContact.
  ///
  /// In ar, this message translates to:
  /// **'اختار شخص'**
  String get aiChooseAContact;

  /// No description provided for @aiWhichNameStays.
  ///
  /// In ar, this message translates to:
  /// **'أنهي اسم يفضل؟'**
  String get aiWhichNameStays;

  /// No description provided for @aiThisNameStaysAndAll.
  ///
  /// In ar, this message translates to:
  /// **'الاسم ده هيفضل وكل العمليات هتتنقل عليه'**
  String get aiThisNameStaysAndAll;

  /// No description provided for @aiMerging.
  ///
  /// In ar, this message translates to:
  /// **'بندمج...'**
  String get aiMerging;

  /// No description provided for @aiConfirmMerge.
  ///
  /// In ar, this message translates to:
  /// **'أكد الدمج'**
  String get aiConfirmMerge;

  /// No description provided for @aiWeCouldnTMergeThem.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش ندمج. جرّب تاني.'**
  String get aiWeCouldnTMergeThem;

  /// No description provided for @appDayP0OfTheMonth.
  ///
  /// In ar, this message translates to:
  /// **'يوم {p0} في الشهر'**
  String appDayP0OfTheMonth(String p0);

  /// No description provided for @appStartOfMonth.
  ///
  /// In ar, this message translates to:
  /// **'أول الشهر'**
  String get appStartOfMonth;

  /// No description provided for @appEndOfMonth.
  ///
  /// In ar, this message translates to:
  /// **'آخر الشهر'**
  String get appEndOfMonth;

  /// No description provided for @appWeCouldnTSaveYour.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نحفظ إجابتك.'**
  String get appWeCouldnTSaveYour;

  /// No description provided for @appBack.
  ///
  /// In ar, this message translates to:
  /// **'رجوع'**
  String get appBack;

  /// No description provided for @appWriteYourAnswerHere.
  ///
  /// In ar, this message translates to:
  /// **'اكتب إجابتك هنا...'**
  String get appWriteYourAnswerHere;

  /// No description provided for @appEnterAValidEgyptianMobile.
  ///
  /// In ar, this message translates to:
  /// **'اكتب رقم موبايل مصري صحيح: 11 رقم بيبدأ بـ 01'**
  String get appEnterAValidEgyptianMobile;

  /// No description provided for @appEnterThe6DigitCode.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الكود المكون من 6 أرقام'**
  String get appEnterThe6DigitCode;

  /// No description provided for @appYouCanAskForA.
  ///
  /// In ar, this message translates to:
  /// **'تقدر تطلب كود جديد بعد {p0} ثانية'**
  String appYouCanAskForA(String p0);

  /// No description provided for @appSignedOutOfThatDevice.
  ///
  /// In ar, this message translates to:
  /// **'الجهاز ده خرج من حسابك'**
  String get appSignedOutOfThatDevice;

  /// No description provided for @appTryAgain.
  ///
  /// In ar, this message translates to:
  /// **'جرّب تاني'**
  String get appTryAgain;

  /// No description provided for @appNoSessionsRecorded.
  ///
  /// In ar, this message translates to:
  /// **'مفيش أجهزة متسجلة'**
  String get appNoSessionsRecorded;

  /// No description provided for @appEnterAValidEgyptianMobile2.
  ///
  /// In ar, this message translates to:
  /// **'اكتب رقم موبايل مصري صحيح بيبدأ بـ 01'**
  String get appEnterAValidEgyptianMobile2;

  /// No description provided for @appWeCanTSendA.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نبعت كود دلوقتي. تأكد من النت وجرّب تاني.'**
  String get appWeCanTSendA;

  /// No description provided for @appEnterThe6DigitCode2.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الكود المكون من 6 أرقام'**
  String get appEnterThe6DigitCode2;

  /// No description provided for @appThatCodeDidnTWork.
  ///
  /// In ar, this message translates to:
  /// **'الكود ده ما نفعش.'**
  String get appThatCodeDidnTWork;

  /// No description provided for @appThePasswordMustBeAt.
  ///
  /// In ar, this message translates to:
  /// **'الباسورد لازم يكون 6 حروف على الأقل'**
  String get appThePasswordMustBeAt;

  /// No description provided for @appTheTwoPasswordsDonT.
  ///
  /// In ar, this message translates to:
  /// **'الباسوردين مش زي بعض'**
  String get appTheTwoPasswordsDonT;

  /// No description provided for @appWeCouldnTChangeThe.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نغير الباسورد.'**
  String get appWeCouldnTChangeThe;

  /// No description provided for @appEnterYourRegisteredNumberAnd.
  ///
  /// In ar, this message translates to:
  /// **'اكتب رقمك المسجل وهنبعتلك كود على واتساب:'**
  String get appEnterYourRegisteredNumberAnd;

  /// No description provided for @appEnterThe6DigitCode3.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الكود اللي وصلك على واتساب:'**
  String get appEnterThe6DigitCode3;

  /// No description provided for @appConfirmTheCode.
  ///
  /// In ar, this message translates to:
  /// **'أكد الكود'**
  String get appConfirmTheCode;

  /// No description provided for @appChooseANewPassword.
  ///
  /// In ar, this message translates to:
  /// **'اختار باسورد جديد:'**
  String get appChooseANewPassword;

  /// No description provided for @appThisMonth.
  ///
  /// In ar, this message translates to:
  /// **'الشهر ده'**
  String get appThisMonth;

  /// No description provided for @appLast3Months.
  ///
  /// In ar, this message translates to:
  /// **'آخر 3 شهور'**
  String get appLast3Months;

  /// No description provided for @appEverythingFromTheStart.
  ///
  /// In ar, this message translates to:
  /// **'كل العمليات من الأول'**
  String get appEverythingFromTheStart;

  /// No description provided for @appCsvFileSpreadsheet.
  ///
  /// In ar, this message translates to:
  /// **'ملف CSV (جداول)'**
  String get appCsvFileSpreadsheet;

  /// No description provided for @appExcelFileXlsx.
  ///
  /// In ar, this message translates to:
  /// **'ملف Excel (.xlsx)'**
  String get appExcelFileXlsx;

  /// No description provided for @appJsonFile.
  ///
  /// In ar, this message translates to:
  /// **'ملف JSON'**
  String get appJsonFile;

  /// No description provided for @appWeCouldnTPrepareThe.
  ///
  /// In ar, this message translates to:
  /// **'مقدرناش نجهز الملف دلوقتي. اتأكد من النت وجرّب تاني.'**
  String get appWeCouldnTPrepareThe;

  /// No description provided for @appExportMyData.
  ///
  /// In ar, this message translates to:
  /// **'صدّر بياناتك'**
  String get appExportMyData;

  /// No description provided for @appYourDataIsAlwaysYours.
  ///
  /// In ar, this message translates to:
  /// **'بياناتك بتاعتك دايمًا'**
  String get appYourDataIsAlwaysYours;

  /// No description provided for @appDownloadEverythingYouRecordedIn.
  ///
  /// In ar, this message translates to:
  /// **'نزّل كل اللي سجلته في ملف تقدر تفتحه على الكمبيوتر.'**
  String get appDownloadEverythingYouRecordedIn;

  /// No description provided for @appPeriod.
  ///
  /// In ar, this message translates to:
  /// **'الفترة'**
  String get appPeriod;

  /// No description provided for @appFileType.
  ///
  /// In ar, this message translates to:
  /// **'نوع الملف'**
  String get appFileType;

  /// No description provided for @appYouHaveTheRightTo.
  ///
  /// In ar, this message translates to:
  /// **'من حقك توصل لبياناتك طبقًا لقانون 151 لسنة 2020.'**
  String get appYouHaveTheRightTo;

  /// No description provided for @appTheFileIsReady.
  ///
  /// In ar, this message translates to:
  /// **'الملف جاهز'**
  String get appTheFileIsReady;

  /// No description provided for @appPreparingTheFile.
  ///
  /// In ar, this message translates to:
  /// **'بنجهز الملف...'**
  String get appPreparingTheFile;

  /// No description provided for @appExportTheFile.
  ///
  /// In ar, this message translates to:
  /// **'صدّر الملف'**
  String get appExportTheFile;

  /// No description provided for @appTermsOfService.
  ///
  /// In ar, this message translates to:
  /// **'شروط الخدمة'**
  String get appTermsOfService;

  /// No description provided for @appDataAndPrivacy.
  ///
  /// In ar, this message translates to:
  /// **'البيانات والخصوصية'**
  String get appDataAndPrivacy;

  /// No description provided for @app2026SmartspendAiEgypt.
  ///
  /// In ar, this message translates to:
  /// **'© 2026 SmartSpend AI، مصر'**
  String get app2026SmartspendAiEgypt;

  /// No description provided for @appPleaseUpdateTheAppFrom.
  ///
  /// In ar, this message translates to:
  /// **'حدّث التطبيق من المتجر: {p0}'**
  String appPleaseUpdateTheAppFrom(String p0);

  /// No description provided for @appPleaseUpdateTheApp.
  ///
  /// In ar, this message translates to:
  /// **'لازم تحدّث التطبيق'**
  String get appPleaseUpdateTheApp;

  /// No description provided for @appThisVersionIsNoLonger.
  ///
  /// In ar, this message translates to:
  /// **'النسخة دي ما بقتش مدعومة. حدّث علشان بياناتك تفضل في أمان.'**
  String get appThisVersionIsNoLonger;

  /// No description provided for @appMinimumVersionP0.
  ///
  /// In ar, this message translates to:
  /// **'أقل نسخة مطلوبة: {p0}'**
  String appMinimumVersionP0(String p0);

  /// No description provided for @appYouReOfflineYourSaved.
  ///
  /// In ar, this message translates to:
  /// **'إنت من غير نت. بياناتك المحفوظة موجودة.'**
  String get appYouReOfflineYourSaved;

  /// No description provided for @appUpdateNow2.
  ///
  /// In ar, this message translates to:
  /// **'حدّث دلوقتي'**
  String get appUpdateNow2;

  /// No description provided for @appContinueOffline.
  ///
  /// In ar, this message translates to:
  /// **'كمّل من غير نت'**
  String get appContinueOffline;

  /// No description provided for @appThisPageExplainsWhatThe.
  ///
  /// In ar, this message translates to:
  /// **'الصفحة دي بتوضح التطبيق بيحتفظ بإيه عنك وحقوقك طبقًا لقانون 151 لسنة 2020.'**
  String get appThisPageExplainsWhatThe;

  /// No description provided for @appYouReOfflineChangesSave.
  ///
  /// In ar, this message translates to:
  /// **'إنت من غير نت. التغييرات بتتحفظ هنا وبتتبعت بعدين.'**
  String get appYouReOfflineChangesSave;

  /// No description provided for @appConnectionError.
  ///
  /// In ar, this message translates to:
  /// **'مشكلة في الاتصال.'**
  String get appConnectionError;

  /// No description provided for @appHaveMonthlyInstallmentsFollowThem.
  ///
  /// In ar, this message translates to:
  /// **'عندك أقساط شهرية؟ تابعها من هنا'**
  String get appHaveMonthlyInstallmentsFollowThem;

  /// No description provided for @appAddAnInstallment.
  ///
  /// In ar, this message translates to:
  /// **'ضيف قسط'**
  String get appAddAnInstallment;

  /// No description provided for @appInstallmentsP0.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط ({p0})'**
  String appInstallmentsP0(String p0);

  /// No description provided for @appP0Month.
  ///
  /// In ar, this message translates to:
  /// **'{p0} / شهر'**
  String appP0Month(String p0);

  /// No description provided for @appInstallments.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط'**
  String get appInstallments;

  /// No description provided for @appWeCanTLoadYour.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب الأقساط دلوقتي.'**
  String get appWeCanTLoadYour;

  /// No description provided for @appNoInstallmentsYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه مفيش أقساط'**
  String get appNoInstallmentsYet;

  /// No description provided for @appAddAnInstallmentAndWhenever.
  ///
  /// In ar, this message translates to:
  /// **'ضيف القسط، وكل ما تسجل «دفعت قسط فاليو 800» هنحسبه.'**
  String get appAddAnInstallmentAndWhenever;

  /// No description provided for @appAddYourFirstInstallment.
  ///
  /// In ar, this message translates to:
  /// **'ضيف أول قسط'**
  String get appAddYourFirstInstallment;

  /// No description provided for @appTotalMonthlyInstallments.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي الأقساط الشهرية'**
  String get appTotalMonthlyInstallments;

  /// No description provided for @appP0ActiveInstallmentsP1Left.
  ///
  /// In ar, this message translates to:
  /// **'عندك {p0} أقساط شغالة · الباقي منها {p1}'**
  String appP0ActiveInstallmentsP1Left(String p0, String p1);

  /// No description provided for @appAllYourInstallmentsAreFinished.
  ///
  /// In ar, this message translates to:
  /// **'خلّصت كل الأقساط. مفيش حاجة شغالة دلوقتي.'**
  String get appAllYourInstallmentsAreFinished;

  /// No description provided for @appActiveInstallmentsP0.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط الشغالة ({p0})'**
  String appActiveInstallmentsP0(String p0);

  /// No description provided for @appFinishedInstallmentsP0.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط اللي خلصت ({p0})'**
  String appFinishedInstallmentsP0(String p0);

  /// No description provided for @appDeleteTheInstallment.
  ///
  /// In ar, this message translates to:
  /// **'امسح القسط'**
  String get appDeleteTheInstallment;

  /// No description provided for @appDeleteP0ThisCanT.
  ///
  /// In ar, this message translates to:
  /// **'تمسح قسط «{p0}»؟ المسح مابيترجعش.'**
  String appDeleteP0ThisCanT(String p0);

  /// No description provided for @appCancel.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء'**
  String get appCancel;

  /// No description provided for @appDelete.
  ///
  /// In ar, this message translates to:
  /// **'امسح'**
  String get appDelete;

  /// No description provided for @appWeCouldnTDeleteIt.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نمسح القسط. جرّب تاني.'**
  String get appWeCouldnTDeleteIt;

  /// No description provided for @appTrackingWordP0.
  ///
  /// In ar, this message translates to:
  /// **'كلمة التتبع: «{p0}»'**
  String appTrackingWordP0(String p0);

  /// No description provided for @appP0Month2.
  ///
  /// In ar, this message translates to:
  /// **'{p0} / شهر'**
  String appP0Month2(String p0);

  /// No description provided for @appAllPaidP0OfP1.
  ///
  /// In ar, this message translates to:
  /// **'خلصت كلها ({p0} من {p1})'**
  String appAllPaidP0OfP1(String p0, String p1);

  /// No description provided for @appPaidP0OfP1.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع {p0} من {p1}'**
  String appPaidP0OfP1(String p0, String p1);

  /// No description provided for @appP0Left.
  ///
  /// In ar, this message translates to:
  /// **'فاضل {p0}'**
  String appP0Left(String p0);

  /// No description provided for @appPaymentsShareANameWith.
  ///
  /// In ar, this message translates to:
  /// **'الدفعات اسمها شبه خطة تانية. اربطها بمواعيد القسط علشان تفرق بينهم.'**
  String get appPaymentsShareANameWith;

  /// No description provided for @appAllPaidYouPaidP0.
  ///
  /// In ar, this message translates to:
  /// **'خلصت الأقساط كلها. دفعت {p0} في المجموع.'**
  String appAllPaidYouPaidP0(String p0);

  /// No description provided for @appEnterANameAtLeast.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم القسط (حرفين على الأقل)'**
  String get appEnterANameAtLeast;

  /// No description provided for @appEnterTheMonthlyAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب قيمة القسط الشهري'**
  String get appEnterTheMonthlyAmount;

  /// No description provided for @appEnterTheNumberOfInstallments.
  ///
  /// In ar, this message translates to:
  /// **'اكتب عدد الأقساط (قسط واحد على الأقل)'**
  String get appEnterTheNumberOfInstallments;

  /// No description provided for @appPaidInstallmentsMustBeBetween.
  ///
  /// In ar, this message translates to:
  /// **'المدفوع لازم يكون بين 0 وإجمالي الأقساط'**
  String get appPaidInstallmentsMustBeBetween;

  /// No description provided for @appWeCouldnTAddIt.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نضيف القسط. اتأكد من النت وجرّب تاني.'**
  String get appWeCouldnTAddIt;

  /// No description provided for @appSomethingWentWrongTryAgain.
  ///
  /// In ar, this message translates to:
  /// **'حصلت مشكلة. جرّب تاني.'**
  String get appSomethingWentWrongTryAgain;

  /// No description provided for @appNewInstallment.
  ///
  /// In ar, this message translates to:
  /// **'قسط جديد'**
  String get appNewInstallment;

  /// No description provided for @appClose.
  ///
  /// In ar, this message translates to:
  /// **'اقفل'**
  String get appClose;

  /// No description provided for @appWheneverYouRecordSpendingWith.
  ///
  /// In ar, this message translates to:
  /// **'كل ما تسجل مصروف فيه كلمة القسط (زي «دفعت قسط فاليو 800») هنعدّه.'**
  String get appWheneverYouRecordSpendingWith;

  /// No description provided for @appName.
  ///
  /// In ar, this message translates to:
  /// **'اسم القسط *'**
  String get appName;

  /// No description provided for @appLikeValuPhoneOrThe.
  ///
  /// In ar, this message translates to:
  /// **'زي: موبايل فاليو أو قسط التكييف'**
  String get appLikeValuPhoneOrThe;

  /// No description provided for @appPaymentWordOptional.
  ///
  /// In ar, this message translates to:
  /// **'كلمة الدفع (اختياري)'**
  String get appPaymentWordOptional;

  /// No description provided for @appLikeValuEmptyUsesThe.
  ///
  /// In ar, this message translates to:
  /// **'زي: فاليو (لو سبتها فاضية هناخد اسم القسط)'**
  String get appLikeValuEmptyUsesThe;

  /// No description provided for @appMonthlyAmount.
  ///
  /// In ar, this message translates to:
  /// **'القسط كام في الشهر *'**
  String get appMonthlyAmount;

  /// No description provided for @appLike850.
  ///
  /// In ar, this message translates to:
  /// **'زي: 850'**
  String get appLike850;

  /// No description provided for @appTotalInstallments.
  ///
  /// In ar, this message translates to:
  /// **'إجمالي الأقساط *'**
  String get appTotalInstallments;

  /// No description provided for @appLike12.
  ///
  /// In ar, this message translates to:
  /// **'زي: 12'**
  String get appLike12;

  /// No description provided for @appAlreadyPaid.
  ///
  /// In ar, this message translates to:
  /// **'مدفوع منه كام'**
  String get appAlreadyPaid;

  /// No description provided for @appSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ القسط'**
  String get appSave;

  /// No description provided for @appYourPlanSMonthlyUsage.
  ///
  /// In ar, this message translates to:
  /// **'استهلاك باقتك الشهرية'**
  String get appYourPlanSMonthlyUsage;

  /// No description provided for @appLimitReached.
  ///
  /// In ar, this message translates to:
  /// **'وصلت للحد'**
  String get appLimitReached;

  /// No description provided for @appAlmostUsed.
  ///
  /// In ar, this message translates to:
  /// **'قربت تخلص'**
  String get appAlmostUsed;

  /// No description provided for @appVoiceRecording.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل الصوتي'**
  String get appVoiceRecording;

  /// No description provided for @appUnlimited.
  ///
  /// In ar, this message translates to:
  /// **'من غير حد'**
  String get appUnlimited;

  /// No description provided for @appP0OfP1SecondsLeft.
  ///
  /// In ar, this message translates to:
  /// **'باقي {p0} ثانية من {p1}'**
  String appP0OfP1SecondsLeft(String p0, String p1);

  /// No description provided for @appDailyAi.
  ///
  /// In ar, this message translates to:
  /// **'الذكاء الاصطناعي اليومي'**
  String get appDailyAi;

  /// No description provided for @appP0OfP1Left.
  ///
  /// In ar, this message translates to:
  /// **'باقي {p0} عملية من {p1}'**
  String appP0OfP1Left(String p0, String p1);

  /// No description provided for @appUpgradeToPro.
  ///
  /// In ar, this message translates to:
  /// **'اشترك في Pro'**
  String get appUpgradeToPro;

  /// No description provided for @appNotificationSettingsSaved.
  ///
  /// In ar, this message translates to:
  /// **'إعدادات الإشعارات اتحفظت'**
  String get appNotificationSettingsSaved;

  /// No description provided for @appAllowNotificationsFromTheApp.
  ///
  /// In ar, this message translates to:
  /// **'اسمح بالإشعارات من التطبيق'**
  String get appAllowNotificationsFromTheApp;

  /// No description provided for @appChooseYourNotifications.
  ///
  /// In ar, this message translates to:
  /// **'اختار إشعاراتك'**
  String get appChooseYourNotifications;

  /// No description provided for @appWhenSpendingNearsABudget.
  ///
  /// In ar, this message translates to:
  /// **'لما مصاريفك تقرب من سقف الميزانية'**
  String get appWhenSpendingNearsABudget;

  /// No description provided for @appAQuietEveningReminderTo.
  ///
  /// In ar, this message translates to:
  /// **'تذكير هادي بالليل تسجل مصاريفك'**
  String get appAQuietEveningReminderTo;

  /// No description provided for @appBeforeTheDayEndsTo.
  ///
  /// In ar, this message translates to:
  /// **'قبل ما اليوم يخلص علشان تحافظ على سلسلة التسجيل'**
  String get appBeforeTheDayEndsTo;

  /// No description provided for @appWhenYourMonthlyReportIs.
  ///
  /// In ar, this message translates to:
  /// **'لما تقريرك الشهري يجهز'**
  String get appWhenYourMonthlyReportIs;

  /// No description provided for @appWeCanTCancelRight.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نلغي دلوقتي.'**
  String get appWeCanTCancelRight;

  /// No description provided for @appKeepMyPlan.
  ///
  /// In ar, this message translates to:
  /// **'سيب باقتي'**
  String get appKeepMyPlan;

  /// No description provided for @appShareSmartspendWithYourFriends.
  ///
  /// In ar, this message translates to:
  /// **'شارك SmartSpend مع أصحابك'**
  String get appShareSmartspendWithYourFriends;

  /// No description provided for @appInviteYourFriendsAndFamily.
  ///
  /// In ar, this message translates to:
  /// **'ادعي أصحابك وأهلك ينظموا مصاريفهم.'**
  String get appInviteYourFriendsAndFamily;

  /// No description provided for @appLoading.
  ///
  /// In ar, this message translates to:
  /// **'بنحمّل...'**
  String get appLoading;

  /// No description provided for @appReadReceiptsWithTheCamera.
  ///
  /// In ar, this message translates to:
  /// **'قراءة الفواتير بالكاميرا'**
  String get appReadReceiptsWithTheCamera;

  /// No description provided for @appKeepWorkApartFromPersonal.
  ///
  /// In ar, this message translates to:
  /// **'فصل حساب الشغل عن مصاريفك الشخصية'**
  String get appKeepWorkApartFromPersonal;

  /// No description provided for @appGoalAnalysisAndTheDetailed.
  ///
  /// In ar, this message translates to:
  /// **'تحليل الأهداف والتقرير المفصل'**
  String get appGoalAnalysisAndTheDetailed;

  /// No description provided for @appNoSponsoredCards.
  ///
  /// In ar, this message translates to:
  /// **'من غير إعلانات'**
  String get appNoSponsoredCards;

  /// No description provided for @appYourMonthlyReportOnWhatsapp.
  ///
  /// In ar, this message translates to:
  /// **'تقريرك الشهري على واتساب'**
  String get appYourMonthlyReportOnWhatsapp;

  /// No description provided for @appYouHaveAllOfPro.
  ///
  /// In ar, this message translates to:
  /// **'إنت معاك كل مميزات Pro.'**
  String get appYouHaveAllOfPro;

  /// No description provided for @appYouReOnTheFree.
  ///
  /// In ar, this message translates to:
  /// **'إنت على الباقة المجانية.'**
  String get appYouReOnTheFree;

  /// No description provided for @appSeasons.
  ///
  /// In ar, this message translates to:
  /// **'مواسم الصرف'**
  String get appSeasons;

  /// No description provided for @appWeCanTLoadThis.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب الموسم دلوقتي.'**
  String get appWeCanTLoadThis;

  /// No description provided for @appP0ToP1P2More.
  ///
  /// In ar, this message translates to:
  /// **'من {p0} إلى {p1} · أكتر من السنة اللي فاتت بـ {p2}%'**
  String appP0ToP1P2More(String p0, String p1, String p2, String p3);

  /// No description provided for @appP0ToP1P2Less.
  ///
  /// In ar, this message translates to:
  /// **'من {p0} إلى {p1} · أقل من السنة اللي فاتت بـ {p2}%'**
  String appP0ToP1P2Less(String p0, String p1, String p2, String p3);

  /// No description provided for @appP0ToP1SameAs.
  ///
  /// In ar, this message translates to:
  /// **'من {p0} إلى {p1} · نفس السنة اللي فاتت'**
  String appP0ToP1SameAs(String p0, String p1, String p2);

  /// No description provided for @appP0ToP1.
  ///
  /// In ar, this message translates to:
  /// **'من {p0} إلى {p1}'**
  String appP0ToP1(String p0, String p1);

  /// No description provided for @appWhatP0CostYou.
  ///
  /// In ar, this message translates to:
  /// **'{p0} كلفك كام'**
  String appWhatP0CostYou(String p0);

  /// No description provided for @appNoSpendingInP0.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مصاريف في {p0}'**
  String appNoSpendingInP0(String p0);

  /// No description provided for @appNothingRecordedFromP0To.
  ///
  /// In ar, this message translates to:
  /// **'مفيش حاجة متسجلة من {p0} إلى {p1}.'**
  String appNothingRecordedFromP0To(String p0, String p1);

  /// No description provided for @appByCategory.
  ///
  /// In ar, this message translates to:
  /// **'حسب الفئة'**
  String get appByCategory;

  /// No description provided for @appP0Transactions.
  ///
  /// In ar, this message translates to:
  /// **'{p0} عملية'**
  String appP0Transactions(String p0);

  /// No description provided for @appDaysInARow.
  ///
  /// In ar, this message translates to:
  /// **'يوم ورا بعض'**
  String get appDaysInARow;

  /// No description provided for @appDaysInARow2.
  ///
  /// In ar, this message translates to:
  /// **'يوم ورا بعض'**
  String get appDaysInARow2;

  /// No description provided for @appDaysInARow3.
  ///
  /// In ar, this message translates to:
  /// **'يوم ورا بعض'**
  String get appDaysInARow3;

  /// No description provided for @appYouRecordedP0P1.
  ///
  /// In ar, this message translates to:
  /// **'سجلت {p0} {p1}'**
  String appYouRecordedP0P1(String p0, String p1);

  /// No description provided for @appHowDoIRecordMy.
  ///
  /// In ar, this message translates to:
  /// **'إزاي أسجل مصاريفي؟'**
  String get appHowDoIRecordMy;

  /// No description provided for @appTypeASentenceRecordYour.
  ///
  /// In ar, this message translates to:
  /// **'اكتب جملة، أو سجّل بصوتك، أو صوّر الفاتورة.'**
  String get appTypeASentenceRecordYour;

  /// No description provided for @appIsMyFinancialDataSafe.
  ///
  /// In ar, this message translates to:
  /// **'بياناتي في أمان؟'**
  String get appIsMyFinancialDataSafe;

  /// No description provided for @appOnlyYourAccountCanReach.
  ///
  /// In ar, this message translates to:
  /// **'بياناتك مربوطة بحسابك بس، وتقدر تقفل التطبيق برمز أو بصمة.'**
  String get appOnlyYourAccountCanReach;

  /// No description provided for @appHowDoIChangeWhen.
  ///
  /// In ar, this message translates to:
  /// **'إزاي أغير بداية شهري؟'**
  String get appHowDoIChangeWhen;

  /// No description provided for @appFromMoreMoneyPreferencesChoose.
  ///
  /// In ar, this message translates to:
  /// **'من «المزيد» ثم «تفضيلات الفلوس» اختار يوم القبض.'**
  String get appFromMoreMoneyPreferencesChoose;

  /// No description provided for @appWhenWillSupportAnswer.
  ///
  /// In ar, this message translates to:
  /// **'الدعم بيرد إمتى؟'**
  String get appWhenWillSupportAnswer;

  /// No description provided for @appOurTeamReadsEveryTicket.
  ///
  /// In ar, this message translates to:
  /// **'الفريق بيقرا كل طلب وبيرد في أقرب وقت.'**
  String get appOurTeamReadsEveryTicket;

  /// No description provided for @appYourTicketWasSent.
  ///
  /// In ar, this message translates to:
  /// **'طلبك اتبعت'**
  String get appYourTicketWasSent;

  /// No description provided for @appWeCouldnTSendYour.
  ///
  /// In ar, this message translates to:
  /// **'ما عرفناش نبعت طلبك.'**
  String get appWeCouldnTSendYour;

  /// No description provided for @appWeCanTLoadYour2.
  ///
  /// In ar, this message translates to:
  /// **'مش قادرين نجيب طلباتك.'**
  String get appWeCanTLoadYour2;

  /// No description provided for @appNoPastTickets.
  ///
  /// In ar, this message translates to:
  /// **'مفيش طلبات قبل كده'**
  String get appNoPastTickets;

  /// No description provided for @appPageNotFound.
  ///
  /// In ar, this message translates to:
  /// **'الصفحة مش موجودة'**
  String get appPageNotFound;

  /// No description provided for @appThisPageIsnTHere.
  ///
  /// In ar, this message translates to:
  /// **'الصفحة اللي بتدور عليها مش موجودة'**
  String get appThisPageIsnTHere;

  /// No description provided for @appTheLinkMayHaveChanged.
  ///
  /// In ar, this message translates to:
  /// **'الرابط ممكن يكون اتغير أو الصفحة اتمسحت.'**
  String get appTheLinkMayHaveChanged;

  /// No description provided for @appBackToHome.
  ///
  /// In ar, this message translates to:
  /// **'ارجع للرئيسية'**
  String get appBackToHome;

  /// No description provided for @appActiveSince.
  ///
  /// In ar, this message translates to:
  /// **'نشط من {p0}'**
  String appActiveSince(String p0);

  /// No description provided for @appInstallmentLeft.
  ///
  /// In ar, this message translates to:
  /// **'{p0}: باقي {p1} من {p2}'**
  String appInstallmentLeft(String p0, String p1, String p2);

  /// No description provided for @aiSend.
  ///
  /// In ar, this message translates to:
  /// **'ابعت'**
  String get aiSend;

  /// No description provided for @cancelPlanAtStore.
  ///
  /// In ar, this message translates to:
  /// **'الاشتراك بيتلغي من المتجر اللي اشتركت منه، مش من التطبيق. هنفتحلك صفحة اشتراكاتك هناك، ودوس إلغاء على SmartSpend.'**
  String get cancelPlanAtStore;

  /// No description provided for @cancelPlanOpenStore.
  ///
  /// In ar, this message translates to:
  /// **'افتح اشتراكاتي في المتجر'**
  String get cancelPlanOpenStore;

  /// No description provided for @settingsTitle.
  ///
  /// In ar, this message translates to:
  /// **'الإعدادات'**
  String get settingsTitle;

  /// No description provided for @settingsEntry.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات والشكل والأمان وبياناتك'**
  String get settingsEntry;

  /// No description provided for @aiOpeningMonth.
  ///
  /// In ar, this message translates to:
  /// **'صرفت {p0} الشهر ده، وأكبر بند عندك {p1}.'**
  String aiOpeningMonth(String p0, String p1);

  /// No description provided for @aiOpeningQuestion.
  ///
  /// In ar, this message translates to:
  /// **'إزاي أقلل صرفي على {p0}؟'**
  String aiOpeningQuestion(String p0);

  /// No description provided for @walletsStale.
  ///
  /// In ar, this message translates to:
  /// **'{p0} من أرصدتك ما اتحدثتش من أكتر من أسبوع. حدّثها عشان حساباتك تفضل صح.'**
  String walletsStale(String p0);

  /// No description provided for @calOldBalances.
  ///
  /// In ar, this message translates to:
  /// **'رقم المتاح مبني على رصيد قديم.'**
  String get calOldBalances;

  /// No description provided for @calUpdateBalances.
  ///
  /// In ar, this message translates to:
  /// **'حدّث'**
  String get calUpdateBalances;

  /// No description provided for @statsNextTitle.
  ///
  /// In ar, this message translates to:
  /// **'الخطوة الجاية'**
  String get statsNextTitle;

  /// No description provided for @statsNextBudget.
  ///
  /// In ar, this message translates to:
  /// **'ميزانية {p0} وصلت {p1}%. راجعها قبل ما الشهر يخلص.'**
  String statsNextBudget(String p0, String p1);

  /// No description provided for @statsNextBudgetAction.
  ///
  /// In ar, this message translates to:
  /// **'افتح الميزانيات'**
  String get statsNextBudgetAction;

  /// No description provided for @statsNextFirstBudget.
  ///
  /// In ar, this message translates to:
  /// **'أكبر بند عندك {p0}. حط له حد شهري ونبهك قبل ما تعدّيه.'**
  String statsNextFirstBudget(String p0);

  /// No description provided for @statsNextFirstBudgetAction.
  ///
  /// In ar, this message translates to:
  /// **'حط ميزانية'**
  String get statsNextFirstBudgetAction;

  /// No description provided for @statsNextAsk.
  ///
  /// In ar, this message translates to:
  /// **'أكبر بند عندك {p0}. اسأل المساعد إزاي تقلله.'**
  String statsNextAsk(String p0);

  /// No description provided for @statsNextAskAction.
  ///
  /// In ar, this message translates to:
  /// **'اسأل المساعد'**
  String get statsNextAskAction;

  /// No description provided for @aiOneQuestion.
  ///
  /// In ar, this message translates to:
  /// **'سؤال واحد يخليني أفهمك أحسن'**
  String get aiOneQuestion;

  /// No description provided for @aiOneQuestionBody.
  ///
  /// In ar, this message translates to:
  /// **'إجابتك بتخلي نصايحي على مقاسك.'**
  String get aiOneQuestionBody;

  /// No description provided for @aiChatStopped.
  ///
  /// In ar, this message translates to:
  /// **'المساعد متوقف مؤقتًا. تقدر تسجل مصاريفك عادي.'**
  String get aiChatStopped;

  /// No description provided for @adLabel.
  ///
  /// In ar, this message translates to:
  /// **'إعلان'**
  String get adLabel;

  /// No description provided for @helpTicketAnswered.
  ///
  /// In ar, this message translates to:
  /// **'اترد عليها'**
  String get helpTicketAnswered;

  /// No description provided for @helpTicketInProgress.
  ///
  /// In ar, this message translates to:
  /// **'بنراجعها'**
  String get helpTicketInProgress;

  /// No description provided for @helpTicketWaiting.
  ///
  /// In ar, this message translates to:
  /// **'مستنية رد'**
  String get helpTicketWaiting;

  /// No description provided for @helpTicketReply.
  ///
  /// In ar, this message translates to:
  /// **'رد فريق الدعم'**
  String get helpTicketReply;

  /// No description provided for @captureAutomaticTitle.
  ///
  /// In ar, this message translates to:
  /// **'رسايل البنك'**
  String get captureAutomaticTitle;

  /// No description provided for @captureAutomaticBody.
  ///
  /// In ar, this message translates to:
  /// **'عملياتك بتتسجل تلقائيًا. البيانات الناقصة بتفضل منتظرة دليل واضح.'**
  String get captureAutomaticBody;

  /// No description provided for @captureStateRecorded.
  ///
  /// In ar, this message translates to:
  /// **'اتسجلت'**
  String get captureStateRecorded;

  /// No description provided for @captureStateProcessing.
  ///
  /// In ar, this message translates to:
  /// **'بنقرأ الرسالة'**
  String get captureStateProcessing;

  /// No description provided for @captureStateWaiting.
  ///
  /// In ar, this message translates to:
  /// **'منتظرين بيانات تكمل العملية'**
  String get captureStateWaiting;

  /// No description provided for @captureStateHeld.
  ///
  /// In ar, this message translates to:
  /// **'محجوزة بسبب حد الباقة'**
  String get captureStateHeld;

  /// No description provided for @captureStateRemoved.
  ///
  /// In ar, this message translates to:
  /// **'اتشالت'**
  String get captureStateRemoved;

  /// No description provided for @capturePurposeQuestion.
  ///
  /// In ar, this message translates to:
  /// **'تحب تحدد كانت في إيه؟'**
  String get capturePurposeQuestion;

  /// No description provided for @capturePurposeOptional.
  ///
  /// In ar, this message translates to:
  /// **'اختياري. العملية اتسجلت بالفعل.'**
  String get capturePurposeOptional;

  /// No description provided for @capturePurposeCategory.
  ///
  /// In ar, this message translates to:
  /// **'الفئة'**
  String get capturePurposeCategory;

  /// No description provided for @capturePurposeSubcategory.
  ///
  /// In ar, this message translates to:
  /// **'الفئة الفرعية'**
  String get capturePurposeSubcategory;

  /// No description provided for @capturePurposeLabel.
  ///
  /// In ar, this message translates to:
  /// **'أو اكتب الغرض، زي مصاريف حضانة'**
  String get capturePurposeLabel;

  /// No description provided for @capturePurposeSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ التصنيف'**
  String get capturePurposeSave;

  /// No description provided for @capturePurposeOwn.
  ///
  /// In ar, this message translates to:
  /// **'بين حساباتي'**
  String get capturePurposeOwn;

  /// No description provided for @capturePurposeCardPayment.
  ///
  /// In ar, this message translates to:
  /// **'سداد بطاقتي'**
  String get capturePurposeCardPayment;

  /// No description provided for @capturePurposeKeep.
  ///
  /// In ar, this message translates to:
  /// **'سيب التصنيف زي ما هو'**
  String get capturePurposeKeep;

  /// No description provided for @capturePurposeSkip.
  ///
  /// In ar, this message translates to:
  /// **'تخطي'**
  String get capturePurposeSkip;

  /// No description provided for @captureChangeFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ التغيير، جرّب تاني.'**
  String get captureChangeFailed;

  /// No description provided for @captureFeeInvalid.
  ///
  /// In ar, this message translates to:
  /// **'اكتب رسوم صحيحة أو صفر.'**
  String get captureFeeInvalid;

  /// No description provided for @capturePrincipalLabel.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ قبل الرسوم'**
  String get capturePrincipalLabel;

  /// No description provided for @captureFeeLabel.
  ///
  /// In ar, this message translates to:
  /// **'الرسوم'**
  String get captureFeeLabel;

  /// No description provided for @captureAutomaticConsentBody.
  ///
  /// In ar, this message translates to:
  /// **'هنقرا رسايل البنوك والمحافظ المفعّلة بس ونبعتها لسيرفر SmartSpend. هنخفي الأرقام والأسماء اللي نقدر نحددها قبل ما مزوّد الذكاء الاصطناعي المعتمد يقرا كل رسالة. الأكواد والرسايل الشخصية المعروفة بتتفلتر. العملية اللي بياناتها واضحة بتتسجل تلقائيًا مع تراجع؛ والناقصة بتستنى. الرسايل المنقّحة وبيانات التصنيف المؤقتة بتتنسى بعد 30 يوم، والمحجوزة بسبب حد الباقة بعد 60 يوم. دفتر العمليات بيحتفظ بالتسجيلات. تقدر توقف الإرسال وتسحب موافقتك وتمسح بيانات الالتقاط من الإعدادات.'**
  String get captureAutomaticConsentBody;

  /// No description provided for @captureRenewConsent.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل التلقائي محتاج موافقة جديدة على قراءة كل رسايل البنك المنقّحة.'**
  String get captureRenewConsent;

  /// No description provided for @captureAutomaticAiTitle.
  ///
  /// In ar, this message translates to:
  /// **'قراءة الذكاء الاصطناعي'**
  String get captureAutomaticAiTitle;

  /// No description provided for @captureAutomaticAiBody.
  ///
  /// In ar, this message translates to:
  /// **'كل رسالة بنك من المصادر المفعّلة بتمر على المزوّد المعتمد بعد إخفاء البيانات المكتشفة. إيقاف الاختيار بيوقف التسجيل التلقائي.'**
  String get captureAutomaticAiBody;

  /// No description provided for @walletKindFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ نوع الرصيد، جرّب تاني.'**
  String get walletKindFailed;

  /// No description provided for @walletKindUnknown.
  ///
  /// In ar, this message translates to:
  /// **'مش محدد'**
  String get walletKindUnknown;

  /// No description provided for @walletKindCash.
  ///
  /// In ar, this message translates to:
  /// **'نقدي أو محفظة إلكترونية'**
  String get walletKindCash;

  /// No description provided for @walletKindBank.
  ///
  /// In ar, this message translates to:
  /// **'حساب بنكي'**
  String get walletKindBank;

  /// No description provided for @walletKindDebit.
  ///
  /// In ar, this message translates to:
  /// **'بطاقة خصم مباشر'**
  String get walletKindDebit;

  /// No description provided for @walletKindCredit.
  ///
  /// In ar, this message translates to:
  /// **'بطاقة ائتمان'**
  String get walletKindCredit;

  /// No description provided for @walletBalanceKindTitle.
  ///
  /// In ar, this message translates to:
  /// **'نوع الرصيد'**
  String get walletBalanceKindTitle;

  /// No description provided for @walletBalanceKindBody.
  ///
  /// In ar, this message translates to:
  /// **'متاح الائتمان مش فلوس نقدية. تحديد النوع بيخلّي الرصيد وحساب المتاح أدق.'**
  String get walletBalanceKindBody;

  /// No description provided for @walletCreditAvailable.
  ///
  /// In ar, this message translates to:
  /// **'متاح الائتمان'**
  String get walletCreditAvailable;

  /// No description provided for @capturePurposePerson.
  ///
  /// In ar, this message translates to:
  /// **'الشخص (اختياري)'**
  String get capturePurposePerson;

  /// No description provided for @captureAutomaticStopped.
  ///
  /// In ar, this message translates to:
  /// **'التسجيل التلقائي متوقف لحد ما توافق على القراءة. عملياتك المحفوظة موجودة وتقدر تعدّلها.'**
  String get captureAutomaticStopped;

  /// No description provided for @cmReceived.
  ///
  /// In ar, this message translates to:
  /// **'اتقبض'**
  String get cmReceived;

  /// No description provided for @cmPaid.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع'**
  String get cmPaid;

  /// No description provided for @cmPartlyPaid.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع جزء'**
  String get cmPartlyPaid;

  /// No description provided for @cmOverdue.
  ///
  /// In ar, this message translates to:
  /// **'فات ميعاده'**
  String get cmOverdue;

  /// No description provided for @cmSkipped.
  ///
  /// In ar, this message translates to:
  /// **'اتخطى المرة دي'**
  String get cmSkipped;

  /// No description provided for @cmPaidOrNot.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع؟'**
  String get cmPaidOrNot;

  /// No description provided for @cmOpen.
  ///
  /// In ar, this message translates to:
  /// **'مفتوح'**
  String get cmOpen;

  /// No description provided for @cmDue.
  ///
  /// In ar, this message translates to:
  /// **'مستني'**
  String get cmDue;

  /// No description provided for @cmNoDate.
  ///
  /// In ar, this message translates to:
  /// **'من غير ميعاد'**
  String get cmNoDate;

  /// No description provided for @cmInstallmentOf.
  ///
  /// In ar, this message translates to:
  /// **'{p0} من {p1}'**
  String cmInstallmentOf(String p0, String p1);

  /// No description provided for @cmAmountUnknown.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ مش معروف'**
  String get cmAmountUnknown;

  /// No description provided for @cmAbout.
  ///
  /// In ar, this message translates to:
  /// **'حوالي'**
  String get cmAbout;

  /// No description provided for @cmGotIt.
  ///
  /// In ar, this message translates to:
  /// **'قبضته'**
  String get cmGotIt;

  /// No description provided for @cmPaidIt.
  ///
  /// In ar, this message translates to:
  /// **'دفعته'**
  String get cmPaidIt;

  /// No description provided for @cmEnterAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب المبلغ اللي اتدفع.'**
  String get cmEnterAmount;

  /// No description provided for @cmPayFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نسجل الدفع، جرّب تاني.'**
  String get cmPayFailed;

  /// No description provided for @cmReceivedTitle.
  ///
  /// In ar, this message translates to:
  /// **'قبضت {p0}'**
  String cmReceivedTitle(String p0);

  /// No description provided for @cmPaidTitle.
  ///
  /// In ar, this message translates to:
  /// **'دفعت {p0}'**
  String cmPaidTitle(String p0);

  /// No description provided for @cmDueOn.
  ///
  /// In ar, this message translates to:
  /// **'ميعاده {p0}'**
  String cmDueOn(String p0);

  /// No description provided for @cmAmountPaid.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ'**
  String get cmAmountPaid;

  /// No description provided for @cmRecordInSpending.
  ///
  /// In ar, this message translates to:
  /// **'سجّله في مصاريفي'**
  String get cmRecordInSpending;

  /// No description provided for @cmRecordInSpendingHint.
  ///
  /// In ar, this message translates to:
  /// **'هيتسجل في مكانه ويتحسب على الميعاد ده.'**
  String get cmRecordInSpendingHint;

  /// No description provided for @cmOffRecordsHint.
  ///
  /// In ar, this message translates to:
  /// **'حد تاني دفعه أو اتسجل قبل كده: هيتعلّم إنه اتدفع من غير ما يتسجل تاني.'**
  String get cmOffRecordsHint;

  /// No description provided for @cmLeftAmount.
  ///
  /// In ar, this message translates to:
  /// **'فاضل {p0}'**
  String cmLeftAmount(String p0);

  /// No description provided for @cmCountedAs.
  ///
  /// In ar, this message translates to:
  /// **'اتحسبت على: {p0}'**
  String cmCountedAs(String p0);

  /// No description provided for @cmWhichOneAmount.
  ///
  /// In ar, this message translates to:
  /// **'الـ {p0} دي لأنهي واحد؟'**
  String cmWhichOneAmount(String p0);

  /// No description provided for @cmWhichOne.
  ///
  /// In ar, this message translates to:
  /// **'الدفعة دي لأنهي واحد؟'**
  String get cmWhichOne;

  /// No description provided for @cmNoneOfThem.
  ///
  /// In ar, this message translates to:
  /// **'مش منهم'**
  String get cmNoneOfThem;

  /// No description provided for @cmTitle.
  ///
  /// In ar, this message translates to:
  /// **'التزاماتي'**
  String get cmTitle;

  /// No description provided for @cmAdd.
  ///
  /// In ar, this message translates to:
  /// **'ضيف التزام'**
  String get cmAdd;

  /// No description provided for @cmLoadFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نجيب التزاماتك.'**
  String get cmLoadFailed;

  /// No description provided for @cmEmptyTitle.
  ///
  /// In ar, this message translates to:
  /// **'سجّل اللي عليك كل شهر'**
  String get cmEmptyTitle;

  /// No description provided for @cmEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط والاشتراكات والمدارس والديون والجمعيات في مكان واحد. هنفكرك قبل كل ميعاد، ولما تقول «دفعت قسط التلاجة» هنحسبه لوحده.'**
  String get cmEmptyBody;

  /// No description provided for @cmAddFirst.
  ///
  /// In ar, this message translates to:
  /// **'ضيف أول التزام'**
  String get cmAddFirst;

  /// No description provided for @cmLeftThisMonth.
  ///
  /// In ar, this message translates to:
  /// **'فاضل عليك الشهر ده'**
  String get cmLeftThisMonth;

  /// No description provided for @cmPaidOfMonth.
  ///
  /// In ar, this message translates to:
  /// **'دفعت {p0} من {p1}'**
  String cmPaidOfMonth(String p0, String p1);

  /// No description provided for @cmNothingThisMonth.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مواعيد الشهر ده'**
  String get cmNothingThisMonth;

  /// No description provided for @cmInstallmentsLeft.
  ///
  /// In ar, this message translates to:
  /// **'فاضل في الأقساط'**
  String get cmInstallmentsLeft;

  /// No description provided for @cmPaidThisMonth.
  ///
  /// In ar, this message translates to:
  /// **'دفعت الشهر ده'**
  String get cmPaidThisMonth;

  /// No description provided for @cmNeedsYou.
  ///
  /// In ar, this message translates to:
  /// **'محتاجة رد منك'**
  String get cmNeedsYou;

  /// No description provided for @cmComingUp.
  ///
  /// In ar, this message translates to:
  /// **'الجاي'**
  String get cmComingUp;

  /// No description provided for @cmAll.
  ///
  /// In ar, this message translates to:
  /// **'كل الالتزامات'**
  String get cmAll;

  /// No description provided for @cmAllGroups.
  ///
  /// In ar, this message translates to:
  /// **'الكل'**
  String get cmAllGroups;

  /// No description provided for @cmSayItHint.
  ///
  /// In ar, this message translates to:
  /// **'لما تدفع، سجّل زي ما بتسجل أي حاجة: «دفعت قسط التلاجة» أو «دفعت نتفليكس». لو متأكدين هنحسبه لوحده، ولو لأ هنسألك.'**
  String get cmSayItHint;

  /// No description provided for @cmGroupInstallments.
  ///
  /// In ar, this message translates to:
  /// **'أقساط وقروض'**
  String get cmGroupInstallments;

  /// No description provided for @cmGroupBills.
  ///
  /// In ar, this message translates to:
  /// **'فواتير واشتراكات'**
  String get cmGroupBills;

  /// No description provided for @cmGroupEducation.
  ///
  /// In ar, this message translates to:
  /// **'تعليم'**
  String get cmGroupEducation;

  /// No description provided for @cmGroupDebts.
  ///
  /// In ar, this message translates to:
  /// **'ديون وسلف'**
  String get cmGroupDebts;

  /// No description provided for @cmGroupGam3eya.
  ///
  /// In ar, this message translates to:
  /// **'جمعيات'**
  String get cmGroupGam3eya;

  /// No description provided for @cmGroupIncome.
  ///
  /// In ar, this message translates to:
  /// **'دخل'**
  String get cmGroupIncome;

  /// No description provided for @cmPaused.
  ///
  /// In ar, this message translates to:
  /// **'متوقف مؤقتًا'**
  String get cmPaused;

  /// No description provided for @cmNothingOpen.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مواعيد مفتوحة'**
  String get cmNothingOpen;

  /// No description provided for @cmNextOn.
  ///
  /// In ar, this message translates to:
  /// **'الجاي {p0}'**
  String cmNextOn(String p0);

  /// No description provided for @cmOverdueCount.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =1{ميعاد فات} =2{ميعادين فاتوا} few{{count} مواعيد فاتت} other{{count} ميعاد فات}}'**
  String cmOverdueCount(int count);

  /// No description provided for @cmPaidCount.
  ///
  /// In ar, this message translates to:
  /// **'دفعت {p0} من {p1}'**
  String cmPaidCount(String p0, String p1);

  /// No description provided for @cmMoreEntry.
  ///
  /// In ar, this message translates to:
  /// **'أقساط، اشتراكات، مدارس، ديون وجمعيات'**
  String get cmMoreEntry;

  /// No description provided for @cmSeeAll.
  ///
  /// In ar, this message translates to:
  /// **'كل الالتزامات'**
  String get cmSeeAll;

  /// No description provided for @cmQuickEmpty.
  ///
  /// In ar, this message translates to:
  /// **'عندك أقساط أو اشتراكات؟ سجّلها ونفكرك بيها'**
  String get cmQuickEmpty;

  /// No description provided for @cmQuickNothingDue.
  ///
  /// In ar, this message translates to:
  /// **'مفيش مواعيد قريبة'**
  String get cmQuickNothingDue;

  /// No description provided for @cmQuickNext.
  ///
  /// In ar, this message translates to:
  /// **'{p0} · {p1}'**
  String cmQuickNext(String p0, String p1);

  /// No description provided for @cmLeftThisMonthLine.
  ///
  /// In ar, this message translates to:
  /// **'فاضل عليك الشهر ده {p0}'**
  String cmLeftThisMonthLine(String p0);

  /// No description provided for @cmEndTitle.
  ///
  /// In ar, this message translates to:
  /// **'تنهي الالتزام ده؟'**
  String get cmEndTitle;

  /// No description provided for @cmEndBody.
  ///
  /// In ar, this message translates to:
  /// **'«{p0}» هيبطل يظهر ويتحسب. اللي اتدفع منه هيفضل متسجل.'**
  String cmEndBody(String p0);

  /// No description provided for @cmCancel.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء'**
  String get cmCancel;

  /// No description provided for @cmEnd.
  ///
  /// In ar, this message translates to:
  /// **'أنهيه'**
  String get cmEnd;

  /// No description provided for @cmChangeFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظ التغيير، جرّب تاني.'**
  String get cmChangeFailed;

  /// No description provided for @cmMore.
  ///
  /// In ar, this message translates to:
  /// **'اختيارات تانية'**
  String get cmMore;

  /// No description provided for @cmPause.
  ///
  /// In ar, this message translates to:
  /// **'وقّفه مؤقتًا'**
  String get cmPause;

  /// No description provided for @cmResume.
  ///
  /// In ar, this message translates to:
  /// **'رجّعه'**
  String get cmResume;

  /// No description provided for @cmSayToPay.
  ///
  /// In ar, this message translates to:
  /// **'لما تدفع قول: «{p0}»'**
  String cmSayToPay(String p0);

  /// No description provided for @cmReminder.
  ///
  /// In ar, this message translates to:
  /// **'التذكير'**
  String get cmReminder;

  /// No description provided for @cmFiledUnder.
  ///
  /// In ar, this message translates to:
  /// **'بيتسجل في'**
  String get cmFiledUnder;

  /// No description provided for @cmYourPayout.
  ///
  /// In ar, this message translates to:
  /// **'قبضك من الجمعية'**
  String get cmYourPayout;

  /// No description provided for @cmPayoutLine.
  ///
  /// In ar, this message translates to:
  /// **'{p0} · {p1}'**
  String cmPayoutLine(String p0, String p1);

  /// No description provided for @cmOpenDates.
  ///
  /// In ar, this message translates to:
  /// **'المواعيد الجاية'**
  String get cmOpenDates;

  /// No description provided for @cmDoneDates.
  ///
  /// In ar, this message translates to:
  /// **'اللي خلص'**
  String get cmDoneDates;

  /// No description provided for @cmAmountVaries.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ بيتغير'**
  String get cmAmountVaries;

  /// No description provided for @cmOnItsDates.
  ///
  /// In ar, this message translates to:
  /// **'على مواعيده'**
  String get cmOnItsDates;

  /// No description provided for @cmOwedTotal.
  ///
  /// In ar, this message translates to:
  /// **'الإجمالي {p0}'**
  String cmOwedTotal(String p0);

  /// No description provided for @cmOnce.
  ///
  /// In ar, this message translates to:
  /// **'مرة واحدة'**
  String get cmOnce;

  /// No description provided for @cmWeekly.
  ///
  /// In ar, this message translates to:
  /// **'كل أسبوع'**
  String get cmWeekly;

  /// No description provided for @cmYearly.
  ///
  /// In ar, this message translates to:
  /// **'كل سنة'**
  String get cmYearly;

  /// No description provided for @cmMonthly.
  ///
  /// In ar, this message translates to:
  /// **'كل شهر'**
  String get cmMonthly;

  /// No description provided for @cmEveryMonths.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =2{كل شهرين} few{كل {count} شهور} other{كل {count} شهر}}'**
  String cmEveryMonths(int count);

  /// No description provided for @cmTimesCount.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =1{قسط واحد} =2{قسطين} few{{count} أقساط} other{{count} قسط}}'**
  String cmTimesCount(int count);

  /// No description provided for @cmFor.
  ///
  /// In ar, this message translates to:
  /// **'لـ{p0}'**
  String cmFor(String p0);

  /// No description provided for @cmKindInstallment.
  ///
  /// In ar, this message translates to:
  /// **'قسط'**
  String get cmKindInstallment;

  /// No description provided for @cmKindLoan.
  ///
  /// In ar, this message translates to:
  /// **'قرض'**
  String get cmKindLoan;

  /// No description provided for @cmKindProperty.
  ///
  /// In ar, this message translates to:
  /// **'قسط شقة أو أرض'**
  String get cmKindProperty;

  /// No description provided for @cmKindCard.
  ///
  /// In ar, this message translates to:
  /// **'كارت ائتمان'**
  String get cmKindCard;

  /// No description provided for @cmKindSchool.
  ///
  /// In ar, this message translates to:
  /// **'مدرسة'**
  String get cmKindSchool;

  /// No description provided for @cmKindUniversity.
  ///
  /// In ar, this message translates to:
  /// **'جامعة'**
  String get cmKindUniversity;

  /// No description provided for @cmKindLessons.
  ///
  /// In ar, this message translates to:
  /// **'دروس'**
  String get cmKindLessons;

  /// No description provided for @cmKindRent.
  ///
  /// In ar, this message translates to:
  /// **'إيجار'**
  String get cmKindRent;

  /// No description provided for @cmKindBill.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة'**
  String get cmKindBill;

  /// No description provided for @cmKindSubscription.
  ///
  /// In ar, this message translates to:
  /// **'اشتراك'**
  String get cmKindSubscription;

  /// No description provided for @cmKindDebt.
  ///
  /// In ar, this message translates to:
  /// **'دين'**
  String get cmKindDebt;

  /// No description provided for @cmKindGam3eya.
  ///
  /// In ar, this message translates to:
  /// **'جمعية'**
  String get cmKindGam3eya;

  /// No description provided for @cmKindSalary.
  ///
  /// In ar, this message translates to:
  /// **'مرتب'**
  String get cmKindSalary;

  /// No description provided for @cmKindFreelance.
  ///
  /// In ar, this message translates to:
  /// **'شغل حر'**
  String get cmKindFreelance;

  /// No description provided for @cmKindOther.
  ///
  /// In ar, this message translates to:
  /// **'التزام'**
  String get cmKindOther;

  /// No description provided for @cmNoReminder.
  ///
  /// In ar, this message translates to:
  /// **'مفيش تذكير'**
  String get cmNoReminder;

  /// No description provided for @cmOnTheDay.
  ///
  /// In ar, this message translates to:
  /// **'يوم الميعاد'**
  String get cmOnTheDay;

  /// No description provided for @cmDaysBefore.
  ///
  /// In ar, this message translates to:
  /// **'{count, plural, =1{قبلها بيوم} =2{قبلها بيومين} few{قبلها بـ {count} أيام} other{قبلها بـ {count} يوم}}'**
  String cmDaysBefore(int count);

  /// No description provided for @cmReminderAt.
  ///
  /// In ar, this message translates to:
  /// **'{p0}، الساعة {p1}'**
  String cmReminderAt(String p0, String p1);

  /// No description provided for @cmLinkedAuto.
  ///
  /// In ar, this message translates to:
  /// **'اتحسب لوحده'**
  String get cmLinkedAuto;

  /// No description provided for @cmLinkedByAnswer.
  ///
  /// In ar, this message translates to:
  /// **'من إجابتك'**
  String get cmLinkedByAnswer;

  /// No description provided for @cmLinkedBySentence.
  ///
  /// In ar, this message translates to:
  /// **'من جملتك'**
  String get cmLinkedBySentence;

  /// No description provided for @cmLinkedByYou.
  ///
  /// In ar, this message translates to:
  /// **'إنت ربطته'**
  String get cmLinkedByYou;

  /// No description provided for @cmDeclared.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع من غير ما يتسجل'**
  String get cmDeclared;

  /// No description provided for @cmOtherAmountTitle.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ المرة دي'**
  String get cmOtherAmountTitle;

  /// No description provided for @cmSave.
  ///
  /// In ar, this message translates to:
  /// **'احفظ'**
  String get cmSave;

  /// No description provided for @cmMoveDate.
  ///
  /// In ar, this message translates to:
  /// **'غيّر الميعاد المرة دي'**
  String get cmMoveDate;

  /// No description provided for @cmOtherAmount.
  ///
  /// In ar, this message translates to:
  /// **'مبلغ تاني المرة دي'**
  String get cmOtherAmount;

  /// No description provided for @cmSkipThisTime.
  ///
  /// In ar, this message translates to:
  /// **'اتخطاه المرة دي'**
  String get cmSkipThisTime;

  /// No description provided for @cmUndoChange.
  ///
  /// In ar, this message translates to:
  /// **'رجّعه زي ما كان'**
  String get cmUndoChange;

  /// No description provided for @cmUnlinkPayment.
  ///
  /// In ar, this message translates to:
  /// **'فك ربط دفعة {p0}'**
  String cmUnlinkPayment(String p0);

  /// No description provided for @cmUnlinkKeeps.
  ///
  /// In ar, this message translates to:
  /// **'فك الربط مش بيمسح الدفعة من مصاريفك.'**
  String get cmUnlinkKeeps;

  /// No description provided for @cmReminderTitle.
  ///
  /// In ar, this message translates to:
  /// **'تذكير {p0}'**
  String cmReminderTitle(String p0);

  /// No description provided for @cmRemindMe.
  ///
  /// In ar, this message translates to:
  /// **'فكرني قبل الميعاد'**
  String get cmRemindMe;

  /// No description provided for @cmHowEarly.
  ///
  /// In ar, this message translates to:
  /// **'قبلها بقد إيه؟'**
  String get cmHowEarly;

  /// No description provided for @cmAtHour.
  ///
  /// In ar, this message translates to:
  /// **'الساعة'**
  String get cmAtHour;

  /// No description provided for @cmDueChecksTitle.
  ///
  /// In ar, this message translates to:
  /// **'المواعيد دي عدّت، اتدفعت؟'**
  String get cmDueChecksTitle;

  /// No description provided for @cmDueChecksBody.
  ///
  /// In ar, this message translates to:
  /// **'لو دوست «تخطي» هنعتبرها لسه ما اتدفعتش وهتفضل في المواعيد المفتوحة.'**
  String get cmDueChecksBody;

  /// No description provided for @cmSkip.
  ///
  /// In ar, this message translates to:
  /// **'تخطي'**
  String get cmSkip;

  /// No description provided for @cmWasDueOn.
  ///
  /// In ar, this message translates to:
  /// **'كان ميعاده {p0}'**
  String cmWasDueOn(String p0);

  /// No description provided for @cmPaidOffRecords.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع بره التسجيل'**
  String get cmPaidOffRecords;

  /// No description provided for @cmNotYet.
  ///
  /// In ar, this message translates to:
  /// **'لسه'**
  String get cmNotYet;

  /// No description provided for @cmPayNamed.
  ///
  /// In ar, this message translates to:
  /// **'دفعت {p0}'**
  String cmPayNamed(String p0);

  /// No description provided for @cmPayNamedAmount.
  ///
  /// In ar, this message translates to:
  /// **'دفعت {p0} · {p1}'**
  String cmPayNamedAmount(String p0, String p1);

  /// No description provided for @cmDueThatDay.
  ///
  /// In ar, this message translates to:
  /// **'عليك تدفع اليوم ده'**
  String get cmDueThatDay;

  /// No description provided for @cmPaidThatDay.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع اليوم ده'**
  String get cmPaidThatDay;

  /// No description provided for @cmAddTitle.
  ///
  /// In ar, this message translates to:
  /// **'التزام جديد'**
  String get cmAddTitle;

  /// No description provided for @cmWhatIsIt.
  ///
  /// In ar, this message translates to:
  /// **'إيه اللي عايز تسجله؟'**
  String get cmWhatIsIt;

  /// No description provided for @cmTypeSubscription.
  ///
  /// In ar, this message translates to:
  /// **'اشتراك'**
  String get cmTypeSubscription;

  /// No description provided for @cmTypeSubscriptionHint.
  ///
  /// In ar, this message translates to:
  /// **'نتفليكس، شاهد، سبوتيفاي…'**
  String get cmTypeSubscriptionHint;

  /// No description provided for @cmTypeInstallment.
  ///
  /// In ar, this message translates to:
  /// **'قسط حاجة'**
  String get cmTypeInstallment;

  /// No description provided for @cmTypeInstallmentHint.
  ///
  /// In ar, this message translates to:
  /// **'موبايل، تلاجة، عربية…'**
  String get cmTypeInstallmentHint;

  /// No description provided for @cmTypeLoan.
  ///
  /// In ar, this message translates to:
  /// **'قرض'**
  String get cmTypeLoan;

  /// No description provided for @cmTypeLoanHint.
  ///
  /// In ar, this message translates to:
  /// **'من بنك أو شركة'**
  String get cmTypeLoanHint;

  /// No description provided for @cmTypeProperty.
  ///
  /// In ar, this message translates to:
  /// **'قسط شقة أو أرض'**
  String get cmTypeProperty;

  /// No description provided for @cmTypePropertyHint.
  ///
  /// In ar, this message translates to:
  /// **'شقة، أرض، شاليه'**
  String get cmTypePropertyHint;

  /// No description provided for @cmTypeSchool.
  ///
  /// In ar, this message translates to:
  /// **'مدرسة أو جامعة'**
  String get cmTypeSchool;

  /// No description provided for @cmTypeSchoolHint.
  ///
  /// In ar, this message translates to:
  /// **'المصاريف على أقساطها'**
  String get cmTypeSchoolHint;

  /// No description provided for @cmTypeLessons.
  ///
  /// In ar, this message translates to:
  /// **'دروس'**
  String get cmTypeLessons;

  /// No description provided for @cmTypeLessonsHint.
  ///
  /// In ar, this message translates to:
  /// **'كل شهر لمدرس أو سنتر'**
  String get cmTypeLessonsHint;

  /// No description provided for @cmTypeRent.
  ///
  /// In ar, this message translates to:
  /// **'إيجار'**
  String get cmTypeRent;

  /// No description provided for @cmTypeRentHint.
  ///
  /// In ar, this message translates to:
  /// **'شقة أو محل'**
  String get cmTypeRentHint;

  /// No description provided for @cmTypeBill.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة'**
  String get cmTypeBill;

  /// No description provided for @cmTypeBillHint.
  ///
  /// In ar, this message translates to:
  /// **'كهربا، نت، موبايل'**
  String get cmTypeBillHint;

  /// No description provided for @cmTypeCard.
  ///
  /// In ar, this message translates to:
  /// **'كارت ائتمان'**
  String get cmTypeCard;

  /// No description provided for @cmTypeCardHint.
  ///
  /// In ar, this message translates to:
  /// **'ميعاد سداد الكارت'**
  String get cmTypeCardHint;

  /// No description provided for @cmTypeDebt.
  ///
  /// In ar, this message translates to:
  /// **'دين أو سلفة'**
  String get cmTypeDebt;

  /// No description provided for @cmTypeDebtHint.
  ///
  /// In ar, this message translates to:
  /// **'عليك أو ليك عند حد'**
  String get cmTypeDebtHint;

  /// No description provided for @cmTypeGam3eya.
  ///
  /// In ar, this message translates to:
  /// **'جمعية'**
  String get cmTypeGam3eya;

  /// No description provided for @cmTypeGam3eyaHint.
  ///
  /// In ar, this message translates to:
  /// **'بتدفع كل شهر وتقبض دورك'**
  String get cmTypeGam3eyaHint;

  /// No description provided for @cmTypeIncome.
  ///
  /// In ar, this message translates to:
  /// **'مرتب أو دخل'**
  String get cmTypeIncome;

  /// No description provided for @cmTypeIncomeHint.
  ///
  /// In ar, this message translates to:
  /// **'اللي بتقبضه في ميعاد'**
  String get cmTypeIncomeHint;

  /// No description provided for @cmTypeOther.
  ///
  /// In ar, this message translates to:
  /// **'حاجة تانية'**
  String get cmTypeOther;

  /// No description provided for @cmTypeOtherHint.
  ///
  /// In ar, this message translates to:
  /// **'أي ميعاد دفع تاني'**
  String get cmTypeOtherHint;

  /// No description provided for @cmSearchSubscriptions.
  ///
  /// In ar, this message translates to:
  /// **'دوّر على الاشتراك'**
  String get cmSearchSubscriptions;

  /// No description provided for @cmSubscriptionsFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نجيب الاشتراكات. تقدر تكتب اسمه.'**
  String get cmSubscriptionsFailed;

  /// No description provided for @cmNotInList.
  ///
  /// In ar, this message translates to:
  /// **'مش موجود؟ اكتب اسمه'**
  String get cmNotInList;

  /// No description provided for @cmNeedTitle.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسمه.'**
  String get cmNeedTitle;

  /// No description provided for @cmNeedAmount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب المبلغ.'**
  String get cmNeedAmount;

  /// No description provided for @cmNeedDay.
  ///
  /// In ar, this message translates to:
  /// **'اختار الميعاد.'**
  String get cmNeedDay;

  /// No description provided for @cmNeedCount.
  ///
  /// In ar, this message translates to:
  /// **'اكتب فاضل كام قسط.'**
  String get cmNeedCount;

  /// No description provided for @cmNeedSchool.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم المدرسة.'**
  String get cmNeedSchool;

  /// No description provided for @cmNeedItems.
  ///
  /// In ar, this message translates to:
  /// **'ضيف قسط واحد على الأقل بميعاده ومبلغه.'**
  String get cmNeedItems;

  /// No description provided for @cmNeedPerson.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم الشخص.'**
  String get cmNeedPerson;

  /// No description provided for @cmNeedInstallments.
  ///
  /// In ar, this message translates to:
  /// **'اكتب القسط كام وعلى كام مرة.'**
  String get cmNeedInstallments;

  /// No description provided for @cmNeedMonths.
  ///
  /// In ar, this message translates to:
  /// **'اكتب الجمعية كام شهر.'**
  String get cmNeedMonths;

  /// No description provided for @cmNeedTurn.
  ///
  /// In ar, this message translates to:
  /// **'اكتب دورك، رقم من الشهور.'**
  String get cmNeedTurn;

  /// No description provided for @cmSchoolTitle.
  ///
  /// In ar, this message translates to:
  /// **'مصاريف {p1} · {p0}'**
  String cmSchoolTitle(String p0, String p1);

  /// No description provided for @cmDebtToMeTitle.
  ///
  /// In ar, this message translates to:
  /// **'فلوسي عند {p0}'**
  String cmDebtToMeTitle(String p0);

  /// No description provided for @cmDebtOnMeTitle.
  ///
  /// In ar, this message translates to:
  /// **'سلفة {p0}'**
  String cmDebtOnMeTitle(String p0);

  /// No description provided for @cmCardTitle.
  ///
  /// In ar, this message translates to:
  /// **'كارت {p0}'**
  String cmCardTitle(String p0);

  /// No description provided for @cmLessonsTitle.
  ///
  /// In ar, this message translates to:
  /// **'{p0} · {p1}'**
  String cmLessonsTitle(String p0, String p1);

  /// No description provided for @cmAdded.
  ///
  /// In ar, this message translates to:
  /// **'اتضاف. هنفكرك قبل ميعاده.'**
  String get cmAdded;

  /// No description provided for @cmNotInPlan.
  ///
  /// In ar, this message translates to:
  /// **'الالتزامات مش متاحة في باقتك دلوقتي.'**
  String get cmNotInPlan;

  /// No description provided for @cmSaveFailed.
  ///
  /// In ar, this message translates to:
  /// **'ماقدرناش نحفظه، جرّب تاني.'**
  String get cmSaveFailed;

  /// No description provided for @cmPickDay.
  ///
  /// In ar, this message translates to:
  /// **'اختار يوم'**
  String get cmPickDay;

  /// No description provided for @cmLoanWhat.
  ///
  /// In ar, this message translates to:
  /// **'القرض ده لإيه؟'**
  String get cmLoanWhat;

  /// No description provided for @cmLoanWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: قرض بنك مصر'**
  String get cmLoanWhatHint;

  /// No description provided for @cmPropertyWhat.
  ///
  /// In ar, this message translates to:
  /// **'اسمه إيه؟'**
  String get cmPropertyWhat;

  /// No description provided for @cmPropertyWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: قسط الشقة'**
  String get cmPropertyWhatHint;

  /// No description provided for @cmInstallmentWhat.
  ///
  /// In ar, this message translates to:
  /// **'قسط إيه؟'**
  String get cmInstallmentWhat;

  /// No description provided for @cmInstallmentWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: التلاجة'**
  String get cmInstallmentWhatHint;

  /// No description provided for @cmWithWhom.
  ///
  /// In ar, this message translates to:
  /// **'مع مين؟ (اختياري)'**
  String get cmWithWhom;

  /// No description provided for @cmWithWhomHint.
  ///
  /// In ar, this message translates to:
  /// **'valU، بنك، المعرض…'**
  String get cmWithWhomHint;

  /// No description provided for @cmInstallmentAmount.
  ///
  /// In ar, this message translates to:
  /// **'القسط كام'**
  String get cmInstallmentAmount;

  /// No description provided for @cmNextDay.
  ///
  /// In ar, this message translates to:
  /// **'الميعاد الجاي'**
  String get cmNextDay;

  /// No description provided for @cmRemainingCount.
  ///
  /// In ar, this message translates to:
  /// **'فاضل كام قسط (مع الجاي)'**
  String get cmRemainingCount;

  /// No description provided for @cmUniversityName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الجامعة'**
  String get cmUniversityName;

  /// No description provided for @cmSchoolName.
  ///
  /// In ar, this message translates to:
  /// **'اسم المدرسة'**
  String get cmSchoolName;

  /// No description provided for @cmChildName.
  ///
  /// In ar, this message translates to:
  /// **'لمين؟ (اختياري)'**
  String get cmChildName;

  /// No description provided for @cmChildNameHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: محمد'**
  String get cmChildNameHint;

  /// No description provided for @cmFeeInstallments.
  ///
  /// In ar, this message translates to:
  /// **'أقساط المصاريف'**
  String get cmFeeInstallments;

  /// No description provided for @cmItemDay.
  ///
  /// In ar, this message translates to:
  /// **'ميعاد القسط {index}'**
  String cmItemDay(int index);

  /// No description provided for @cmItemAmount.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ'**
  String get cmItemAmount;

  /// No description provided for @cmAddItem.
  ///
  /// In ar, this message translates to:
  /// **'ضيف قسط'**
  String get cmAddItem;

  /// No description provided for @cmIOwe.
  ///
  /// In ar, this message translates to:
  /// **'عليّا'**
  String get cmIOwe;

  /// No description provided for @cmOwedToMe.
  ///
  /// In ar, this message translates to:
  /// **'ليّا'**
  String get cmOwedToMe;

  /// No description provided for @cmPersonName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الشخص'**
  String get cmPersonName;

  /// No description provided for @cmPersonNameHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: فريدة'**
  String get cmPersonNameHint;

  /// No description provided for @cmRelation.
  ///
  /// In ar, this message translates to:
  /// **'صلته بيك (اختياري)'**
  String get cmRelation;

  /// No description provided for @cmRelationHint.
  ///
  /// In ar, this message translates to:
  /// **'أختي، صاحبي…'**
  String get cmRelationHint;

  /// No description provided for @cmDebtTotal.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ كله'**
  String get cmDebtTotal;

  /// No description provided for @cmHowRepaid.
  ///
  /// In ar, this message translates to:
  /// **'هيترد إزاي؟'**
  String get cmHowRepaid;

  /// No description provided for @cmRepayFlexible.
  ///
  /// In ar, this message translates to:
  /// **'على راحته'**
  String get cmRepayFlexible;

  /// No description provided for @cmRepayOnce.
  ///
  /// In ar, this message translates to:
  /// **'مرة في ميعاد'**
  String get cmRepayOnce;

  /// No description provided for @cmRepayInstallments.
  ///
  /// In ar, this message translates to:
  /// **'على أقساط'**
  String get cmRepayInstallments;

  /// No description provided for @cmRepayDay.
  ///
  /// In ar, this message translates to:
  /// **'هيترد إمتى'**
  String get cmRepayDay;

  /// No description provided for @cmFirstInstallmentDay.
  ///
  /// In ar, this message translates to:
  /// **'أول قسط'**
  String get cmFirstInstallmentDay;

  /// No description provided for @cmHowManyTimes.
  ///
  /// In ar, this message translates to:
  /// **'على كام مرة'**
  String get cmHowManyTimes;

  /// No description provided for @cmGam3eyaName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الجمعية (اختياري)'**
  String get cmGam3eyaName;

  /// No description provided for @cmGam3eyaNameHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: جمعية الشغل'**
  String get cmGam3eyaNameHint;

  /// No description provided for @cmMonthlyShare.
  ///
  /// In ar, this message translates to:
  /// **'بتدفع كام كل شهر'**
  String get cmMonthlyShare;

  /// No description provided for @cmMonthsCount.
  ///
  /// In ar, this message translates to:
  /// **'كام شهر'**
  String get cmMonthsCount;

  /// No description provided for @cmMyTurn.
  ///
  /// In ar, this message translates to:
  /// **'دورك كام'**
  String get cmMyTurn;

  /// No description provided for @cmFirstPaymentDay.
  ///
  /// In ar, this message translates to:
  /// **'أول دفعة'**
  String get cmFirstPaymentDay;

  /// No description provided for @cmSubscriptionName.
  ///
  /// In ar, this message translates to:
  /// **'اسم الاشتراك'**
  String get cmSubscriptionName;

  /// No description provided for @cmBillWhat.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة إيه؟'**
  String get cmBillWhat;

  /// No description provided for @cmBillWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: النت'**
  String get cmBillWhatHint;

  /// No description provided for @cmCardBank.
  ///
  /// In ar, this message translates to:
  /// **'كارت أنهي بنك؟'**
  String get cmCardBank;

  /// No description provided for @cmCardBankHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: CIB'**
  String get cmCardBankHint;

  /// No description provided for @cmLessonsWhat.
  ///
  /// In ar, this message translates to:
  /// **'دروس إيه؟'**
  String get cmLessonsWhat;

  /// No description provided for @cmLessonsWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: دروس الرياضة'**
  String get cmLessonsWhatHint;

  /// No description provided for @cmIncomeWhat.
  ///
  /// In ar, this message translates to:
  /// **'اسمه إيه؟'**
  String get cmIncomeWhat;

  /// No description provided for @cmIncomeWhatHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: المرتب'**
  String get cmIncomeWhatHint;

  /// No description provided for @cmOtherWhat.
  ///
  /// In ar, this message translates to:
  /// **'اسمه إيه؟'**
  String get cmOtherWhat;

  /// No description provided for @cmAmountVariesSwitch.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ بيتغير كل مرة'**
  String get cmAmountVariesSwitch;

  /// No description provided for @cmIncomeAmount.
  ///
  /// In ar, this message translates to:
  /// **'بتقبض كام'**
  String get cmIncomeAmount;

  /// No description provided for @cmAmount.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ'**
  String get cmAmount;

  /// No description provided for @cmNextIncomeDay.
  ///
  /// In ar, this message translates to:
  /// **'ميعاد القبض الجاي'**
  String get cmNextIncomeDay;

  /// No description provided for @cmRemindBefore.
  ///
  /// In ar, this message translates to:
  /// **'فكرني'**
  String get cmRemindBefore;

  /// No description provided for @cmAfterSaveHint.
  ///
  /// In ar, this message translates to:
  /// **'بعد ما تحفظه، لما تسجّل إنك دفعته هنحسبه عليه لوحده لو متأكدين، ولو لأ هنسألك.'**
  String get cmAfterSaveHint;

  /// No description provided for @cfAboutHowMuch.
  ///
  /// In ar, this message translates to:
  /// **'بتيجي حوالي كام (اختياري)'**
  String get cfAboutHowMuch;

  /// No description provided for @cfAddAnyway.
  ///
  /// In ar, this message translates to:
  /// **'ضيفه تاني'**
  String get cfAddAnyway;

  /// No description provided for @cfAddExtra.
  ///
  /// In ar, this message translates to:
  /// **'ضيف دفعة'**
  String get cfAddExtra;

  /// No description provided for @cfAllCount.
  ///
  /// In ar, this message translates to:
  /// **'من كام قسط'**
  String get cfAllCount;

  /// No description provided for @cfAutoDebit.
  ///
  /// In ar, this message translates to:
  /// **'بتتخصم لوحدها'**
  String get cfAutoDebit;

  /// No description provided for @cfAutoFromAccount.
  ///
  /// In ar, this message translates to:
  /// **'بيتخصم لوحده من حسابي أو مرتبي'**
  String get cfAutoFromAccount;

  /// No description provided for @cfAutoFromCard.
  ///
  /// In ar, this message translates to:
  /// **'بيتخصم لوحده من الكارت'**
  String get cfAutoFromCard;

  /// No description provided for @cfBankCard.
  ///
  /// In ar, this message translates to:
  /// **'تقسيط الكارت'**
  String get cfBankCard;

  /// No description provided for @cfBoughtWhat.
  ///
  /// In ar, this message translates to:
  /// **'اشتريت إيه؟'**
  String get cfBoughtWhat;

  /// No description provided for @cfBrother.
  ///
  /// In ar, this message translates to:
  /// **'أخويا'**
  String get cfBrother;

  /// No description provided for @cfCardDueDay.
  ///
  /// In ar, this message translates to:
  /// **'آخر ميعاد للسداد'**
  String get cfCardDueDay;

  /// No description provided for @cfCardDueHint.
  ///
  /// In ar, this message translates to:
  /// **'مكتوب في كشف حساب الكارت'**
  String get cfCardDueHint;

  /// No description provided for @cfCardHint.
  ///
  /// In ar, this message translates to:
  /// **'بنفكرك قبل آخر ميعاد عشان تسدد قبل ما الفوايد تتحسب.'**
  String get cfCardHint;

  /// No description provided for @cfCardVaries.
  ///
  /// In ar, this message translates to:
  /// **'المبلغ بيتغير كل شهر'**
  String get cfCardVaries;

  /// No description provided for @cfContractEnds.
  ///
  /// In ar, this message translates to:
  /// **'العقد بيخلص (اختياري)'**
  String get cfContractEnds;

  /// No description provided for @cfDaughter.
  ///
  /// In ar, this message translates to:
  /// **'بنتي'**
  String get cfDaughter;

  /// No description provided for @cfDeveloper.
  ///
  /// In ar, this message translates to:
  /// **'المطوّر أو الشركة (اختياري)'**
  String get cfDeveloper;

  /// No description provided for @cfDeveloperHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: بالم هيلز'**
  String get cfDeveloperHint;

  /// No description provided for @cfDuplicateBody.
  ///
  /// In ar, this message translates to:
  /// **'عندك «{p0}» متسجل. تفتحه ولا تضيف واحد تاني؟'**
  String cfDuplicateBody(String p0);

  /// No description provided for @cfDuplicateTitle.
  ///
  /// In ar, this message translates to:
  /// **'متسجل قبل كده'**
  String get cfDuplicateTitle;

  /// No description provided for @cfElectricity.
  ///
  /// In ar, this message translates to:
  /// **'الكهربا'**
  String get cfElectricity;

  /// No description provided for @cfExtraHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: دفعة الاستلام'**
  String get cfExtraHint;

  /// No description provided for @cfExtras.
  ///
  /// In ar, this message translates to:
  /// **'دفعات كبيرة لوحدها (اختياري)'**
  String get cfExtras;

  /// No description provided for @cfExtrasHint.
  ///
  /// In ar, this message translates to:
  /// **'دفعة الاستلام، وديعة الصيانة، أو أي دفعة غير القسط.'**
  String get cfExtrasHint;

  /// No description provided for @cfExtrasTitle.
  ///
  /// In ar, this message translates to:
  /// **'{p0} · دفعات تانية'**
  String cfExtrasTitle(String p0);

  /// No description provided for @cfFeeHint.
  ///
  /// In ar, this message translates to:
  /// **'كل قسط بميعاده ومبلغه، وتقدر تسمّيه (الأتوبيس، الكتب…).'**
  String get cfFeeHint;

  /// No description provided for @cfFeesTotal.
  ///
  /// In ar, this message translates to:
  /// **'الإجمالي {p0} · فاضل {p1}'**
  String cfFeesTotal(String p0, String p1);

  /// No description provided for @cfFinancedBy.
  ///
  /// In ar, this message translates to:
  /// **'بالتقسيط من (اختياري)'**
  String get cfFinancedBy;

  /// No description provided for @cfFlexibleOnMeHint.
  ///
  /// In ar, this message translates to:
  /// **'من غير ميعاد: هيفضل ظاهر لحد ما تسدده، وكل مرة تسجل إنك رجعت جزء هنخصمه.'**
  String get cfFlexibleOnMeHint;

  /// No description provided for @cfFlexibleToMeHint.
  ///
  /// In ar, this message translates to:
  /// **'من غير ميعاد: هيفضل ظاهر لحد ما يرجعلك، وكل مرة تسجل إنه رجّع جزء هنخصمه.'**
  String get cfFlexibleToMeHint;

  /// No description provided for @cfFreelance.
  ///
  /// In ar, this message translates to:
  /// **'شغل حر'**
  String get cfFreelance;

  /// No description provided for @cfGam3eyaHolder.
  ///
  /// In ar, this message translates to:
  /// **'مين ماسك الجمعية (اختياري)'**
  String get cfGam3eyaHolder;

  /// No description provided for @cfGam3eyaHolderHint.
  ///
  /// In ar, this message translates to:
  /// **'عشان لما تبعتله القسط نعرف إنه للجمعية'**
  String get cfGam3eyaHolderHint;

  /// No description provided for @cfGam3eyaSummary.
  ///
  /// In ar, this message translates to:
  /// **'هتقبض {p0} في دورك (الشهر {p1} من {p2}).'**
  String cfGam3eyaSummary(String p0, String p1, String p2);

  /// No description provided for @cfGas.
  ///
  /// In ar, this message translates to:
  /// **'الغاز'**
  String get cfGas;

  /// No description provided for @cfGroupAi.
  ///
  /// In ar, this message translates to:
  /// **'ذكاء اصطناعي'**
  String get cfGroupAi;

  /// No description provided for @cfGroupMusic.
  ///
  /// In ar, this message translates to:
  /// **'موسيقى وكتب صوتية'**
  String get cfGroupMusic;

  /// No description provided for @cfGroupOther.
  ///
  /// In ar, this message translates to:
  /// **'تعليم وتوصيل وحاجات تانية'**
  String get cfGroupOther;

  /// No description provided for @cfGroupSoftware.
  ///
  /// In ar, this message translates to:
  /// **'برامج وتخزين وألعاب'**
  String get cfGroupSoftware;

  /// No description provided for @cfGroupStreaming.
  ///
  /// In ar, this message translates to:
  /// **'أفلام ومسلسلات ورياضة'**
  String get cfGroupStreaming;

  /// No description provided for @cfHowPaid.
  ///
  /// In ar, this message translates to:
  /// **'بيتدفع إزاي؟'**
  String get cfHowPaid;

  /// No description provided for @cfInternet.
  ///
  /// In ar, this message translates to:
  /// **'نت البيت'**
  String get cfInternet;

  /// No description provided for @cfItemLabel.
  ///
  /// In ar, this message translates to:
  /// **'اسمه (اختياري)'**
  String get cfItemLabel;

  /// No description provided for @cfLandline.
  ///
  /// In ar, this message translates to:
  /// **'التليفون الأرضي'**
  String get cfLandline;

  /// No description provided for @cfLandlord.
  ///
  /// In ar, this message translates to:
  /// **'صاحب الشقة (اختياري)'**
  String get cfLandlord;

  /// No description provided for @cfLeftCount.
  ///
  /// In ar, this message translates to:
  /// **'فاضل كام قسط'**
  String get cfLeftCount;

  /// No description provided for @cfLeftTotal.
  ///
  /// In ar, this message translates to:
  /// **'فاضل {p0} × {p1} = {p2}'**
  String cfLeftTotal(String p0, String p1, String p2);

  /// No description provided for @cfLessonsEnd.
  ///
  /// In ar, this message translates to:
  /// **'لحد إمتى (اختياري)'**
  String get cfLessonsEnd;

  /// No description provided for @cfLoanFor.
  ///
  /// In ar, this message translates to:
  /// **'القرض ده لإيه؟ (اختياري)'**
  String get cfLoanFor;

  /// No description provided for @cfLoanTitle.
  ///
  /// In ar, this message translates to:
  /// **'قرض {p0}'**
  String cfLoanTitle(String p0);

  /// No description provided for @cfMe.
  ///
  /// In ar, this message translates to:
  /// **'أنا'**
  String get cfMe;

  /// No description provided for @cfMobile.
  ///
  /// In ar, this message translates to:
  /// **'الموبايل'**
  String get cfMobile;

  /// No description provided for @cfMoneyIn.
  ///
  /// In ar, this message translates to:
  /// **'فلوس داخلالي'**
  String get cfMoneyIn;

  /// No description provided for @cfMoneyOut.
  ///
  /// In ar, this message translates to:
  /// **'فلوس طالعة مني'**
  String get cfMoneyOut;

  /// No description provided for @cfMonthlyInstallment.
  ///
  /// In ar, this message translates to:
  /// **'القسط الشهري'**
  String get cfMonthlyInstallment;

  /// No description provided for @cfNeedBank.
  ///
  /// In ar, this message translates to:
  /// **'اكتب اسم البنك.'**
  String get cfNeedBank;

  /// No description provided for @cfNeedEndAfterStart.
  ///
  /// In ar, this message translates to:
  /// **'النهاية لازم تبقى بعد الميعاد الجاي.'**
  String get cfNeedEndAfterStart;

  /// No description provided for @cfNeedExtras.
  ///
  /// In ar, this message translates to:
  /// **'كل دفعة محتاجة ميعاد ومبلغ.'**
  String get cfNeedExtras;

  /// No description provided for @cfNeedPaidBelowTotal.
  ///
  /// In ar, this message translates to:
  /// **'اللي اتدفع لازم يبقى أقل من الإجمالي.'**
  String get cfNeedPaidBelowTotal;

  /// No description provided for @cfNeedTotalCount.
  ///
  /// In ar, this message translates to:
  /// **'الأقساط كلها لازم تبقى أكتر من الفاضل أو قده.'**
  String get cfNeedTotalCount;

  /// No description provided for @cfNextCharge.
  ///
  /// In ar, this message translates to:
  /// **'الخصم الجاي'**
  String get cfNextCharge;

  /// No description provided for @cfNoSuchSubscription.
  ///
  /// In ar, this message translates to:
  /// **'مش لاقيينه. اكتب اسمه من تحت.'**
  String get cfNoSuchSubscription;

  /// No description provided for @cfNthInstallment.
  ///
  /// In ar, this message translates to:
  /// **'القسط {index}'**
  String cfNthInstallment(int index);

  /// No description provided for @cfOpenIt.
  ///
  /// In ar, this message translates to:
  /// **'افتحه'**
  String get cfOpenIt;

  /// No description provided for @cfPaidByCard.
  ///
  /// In ar, this message translates to:
  /// **'بيتخصم لوحده (كارت أو محفظة)'**
  String get cfPaidByCard;

  /// No description provided for @cfPaidByHand.
  ///
  /// In ar, this message translates to:
  /// **'بدفعه بنفسي'**
  String get cfPaidByHand;

  /// No description provided for @cfPaidEvery.
  ///
  /// In ar, this message translates to:
  /// **'بيتدفع كل'**
  String get cfPaidEvery;

  /// No description provided for @cfPaidSoFar.
  ///
  /// In ar, this message translates to:
  /// **'دفعت منهم كام لحد دلوقتي (اختياري)'**
  String get cfPaidSoFar;

  /// No description provided for @cfPension.
  ///
  /// In ar, this message translates to:
  /// **'معاش'**
  String get cfPension;

  /// No description provided for @cfPrice.
  ///
  /// In ar, this message translates to:
  /// **'السعر'**
  String get cfPrice;

  /// No description provided for @cfReceivedEvery.
  ///
  /// In ar, this message translates to:
  /// **'بيتقبض كل'**
  String get cfReceivedEvery;

  /// No description provided for @cfRemindIncome.
  ///
  /// In ar, this message translates to:
  /// **'فكرني'**
  String get cfRemindIncome;

  /// No description provided for @cfRemove.
  ///
  /// In ar, this message translates to:
  /// **'شيل'**
  String get cfRemove;

  /// No description provided for @cfRenews.
  ///
  /// In ar, this message translates to:
  /// **'بيتجدد كل'**
  String get cfRenews;

  /// No description provided for @cfRentIn.
  ///
  /// In ar, this message translates to:
  /// **'إيجار ليّا'**
  String get cfRentIn;

  /// No description provided for @cfRentOf.
  ///
  /// In ar, this message translates to:
  /// **'إيجار إيه؟ (اختياري)'**
  String get cfRentOf;

  /// No description provided for @cfRentOfHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: إيجار الشقة'**
  String get cfRentOfHint;

  /// No description provided for @cfRepaidSoFar.
  ///
  /// In ar, this message translates to:
  /// **'اتدفع منه كام'**
  String get cfRepaidSoFar;

  /// No description provided for @cfRepeats.
  ///
  /// In ar, this message translates to:
  /// **'بيتكرر'**
  String get cfRepeats;

  /// No description provided for @cfSalary.
  ///
  /// In ar, this message translates to:
  /// **'المرتب'**
  String get cfSalary;

  /// No description provided for @cfSister.
  ///
  /// In ar, this message translates to:
  /// **'أختي'**
  String get cfSister;

  /// No description provided for @cfSon.
  ///
  /// In ar, this message translates to:
  /// **'ابني'**
  String get cfSon;

  /// No description provided for @cfSubscriptionNameHint.
  ///
  /// In ar, this message translates to:
  /// **'زي: الجيم'**
  String get cfSubscriptionNameHint;

  /// No description provided for @cfTheShop.
  ///
  /// In ar, this message translates to:
  /// **'المحل نفسه'**
  String get cfTheShop;

  /// No description provided for @cfTrial.
  ///
  /// In ar, this message translates to:
  /// **'لسه في فترة تجربة مجانية'**
  String get cfTrial;

  /// No description provided for @cfTrialEnds.
  ///
  /// In ar, this message translates to:
  /// **'التجربة بتخلص يوم'**
  String get cfTrialEnds;

  /// No description provided for @cfTrialHint.
  ///
  /// In ar, this message translates to:
  /// **'هنفكرك قبلها بيومين، عشان تلغيه لو مش عايزه قبل ما يتخصم.'**
  String get cfTrialHint;

  /// No description provided for @cfUsualCardAmount.
  ///
  /// In ar, this message translates to:
  /// **'بتسدد عادة كام (اختياري)'**
  String get cfUsualCardAmount;

  /// No description provided for @cfWater.
  ///
  /// In ar, this message translates to:
  /// **'المية'**
  String get cfWater;

  /// No description provided for @cfWhichBank.
  ///
  /// In ar, this message translates to:
  /// **'من أنهي بنك؟'**
  String get cfWhichBank;

  /// No description provided for @cfWhichBill.
  ///
  /// In ar, this message translates to:
  /// **'فاتورة إيه؟'**
  String get cfWhichBill;

  /// No description provided for @cfYearlyCost.
  ///
  /// In ar, this message translates to:
  /// **'يعني حوالي {p0} في السنة.'**
  String cfYearlyCost(String p0);

  /// No description provided for @cfLeftCountHelp.
  ///
  /// In ar, this message translates to:
  /// **'مع الجاي'**
  String get cfLeftCountHelp;

  /// No description provided for @cfOptional.
  ///
  /// In ar, this message translates to:
  /// **'اختياري'**
  String get cfOptional;
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
