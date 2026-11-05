// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'SmartSpend';

  @override
  String get navRecord => 'تسجيل';

  @override
  String get navStats => 'إحصائيات';

  @override
  String get navAi => 'مركز AI';

  @override
  String get navCalendar => 'تقويم';

  @override
  String get navMore => 'المزيد';

  @override
  String get screenInProgress => 'الشاشة دي لسه بتتبني في التطبيق الجديد.';

  @override
  String get captureAndroidTitle => 'إشعارات البنك والمحفظة';

  @override
  String get captureAndroidBody =>
      'التطبيق بيقرا إشعارات البنك والمحفظة، وكل عملية بيسألك عنها قبل ما يسجّلها.';

  @override
  String get captureIosTitle => 'رسايل البنك من الاختصارات';

  @override
  String get captureIosBody =>
      'أتمتة في تطبيق الاختصارات بتبعت رسايل البنك للتطبيق أول ما توصل.';

  @override
  String get captureOn => 'شغّالة';

  @override
  String get captureOff => 'مش شغّالة';

  @override
  String get captureOpenSettings => 'افتح الإعدادات';

  @override
  String get captureOpenShortcuts => 'افتح الاختصارات';

  @override
  String get captureStatusFailed => 'مش قادرين نعرف حالتها دلوقتي. جرّب تاني.';

  @override
  String get captureStart => 'شغّل تسجيل رسايل البنك';

  @override
  String get captureConsentTitle => 'قبل ما نبدأ';

  @override
  String get captureConsentBody =>
      'التطبيق بيبعت لنا بس الرسايل والإشعارات اللي فيها كلام عن فلوس (خصم، تحويل، رصيد، دفع وغيرها) من البنوك والمحافظ ورسايل SMS. الذكاء الاصطناعي بيقرا كل رسالة عشان يعرف المبلغ والنوع ومين الطرف التاني، وأرقام موبايلك وكروتك وحساباتك بتتخبّى قبل ما يشوفها، وأسماء المحلات والناس بتفضل عشان يقدر يصنّفها. أكواد التحقق مابتتحفظش ومابتتقريش. العملية بتتسجل لوحدها ويوصلك إشعار تقدر منه تلغيها، والرسالة بتتمسح بعد 30 يوم.';

  @override
  String get captureConsentAgree => 'موافق، كمّل';

  @override
  String get captureUnavailable =>
      'تسجيل رسايل البنك لسه مش متاح. هنقولك أول ما يبقى جاهز.';

  @override
  String get captureConnectFailed =>
      'ماقدرناش نشغّله دلوقتي. اتأكد من النت وجرّب تاني.';

  @override
  String get captureNeedsAccess =>
      'فاضل خطوة: افتح الإعدادات وفعّل قراية الإشعارات للتطبيق.';

  @override
  String get captureNotificationsOff =>
      'الإشعارات مقفولة، فمش هنقدر نسألك عن العمليات من شريط الإشعارات. هتلاقيها هنا.';

  @override
  String captureWaiting(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count رسالة مستنية الإرسال.',
      few: '$count رسايل مستنية الإرسال.',
      two: 'رسالتين مستنيين الإرسال.',
      one: 'رسالة واحدة مستنية الإرسال.',
      zero: 'مفيش رسايل مستنية الإرسال.',
    );
    return '$_temp0';
  }

  @override
  String get captureAiReadingTitle => 'قراءة الرسايل بالذكاء الاصطناعي';

  @override
  String get captureAiReadingBody =>
      'هو اللي بيفهم كل رسالة ويسجّلها لوحدها. لو قفلته، رسايل البنك مش هتتسجل.';

  @override
  String get captureAiReadingFailed => 'ماقدرناش نحفظ اختيارك. جرّب تاني.';

  @override
  String get captureQuestionsBody =>
      'لما عملية تتسجل في «عام» أو تحويل لحد، نسألك لما تفتح التطبيق صرفتها في إيه أو بعتها لمين، وإجابتك بتتحفظ للمرة الجاية.';

  @override
  String get captureQuestionsTitle => 'اسألني اتصرفت في إيه';

  @override
  String get captureSmsTitle => 'قراءة رسايل البنك SMS';

  @override
  String get captureSmsBody =>
      'بنقرا رسايل البنوك والمحافظ أول ما توصل، ورسايلك الشخصية مش بتتقري.';

  @override
  String get captureSmsOn => 'شغالة: رسايل البنك بتتسجل أول ما توصل.';

  @override
  String get captureSmsAllow => 'اسمح';

  @override
  String get captureSmsImport => 'سجّل رسايل آخر 30 يوم';

  @override
  String captureSmsImported(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'بنسجّل $count رسالة',
      one: 'بنسجّل رسالة واحدة',
      zero: 'مالقيناش رسايل بنك جديدة',
    );
    return '$_temp0';
  }

  @override
  String get captureSamplesTitle => 'ساعدنا نحسّن قراءة الرسايل';

  @override
  String get captureSamplesBody =>
      'بنحتفظ برسايل البنك متخبّي منها الأسماء والأرقام، عشان نقرا الرسايل من غير ذكاء اصطناعي بعدين. لو قفلتها بنمسح اللي اتحفظ.';

  @override
  String get captureUpdateRequired =>
      'نسخة التطبيق دي قديمة على تسجيل رسايل البنك. حدّث التطبيق، والرسايل المستنية هتتبعت بعدها.';

  @override
  String get captureSettingsTitle => 'إعدادات رسايل البنك';

  @override
  String get captureSettingsFailed => 'ماقدرناش نحفظ ده. جرّب تاني.';

  @override
  String get captureDevicesTitle => 'الموبايلات اللي بتبعت';

  @override
  String get captureDevicesEmpty => 'مفيش موبايل متوصل.';

  @override
  String get captureThisPhone => 'الموبايل ده';

  @override
  String get captureOtherPhone => 'موبايل تاني';

  @override
  String get captureDeviceStop => 'وقّف';

  @override
  String get captureIgnoredTitle => 'كروت بنتجاهلها';

  @override
  String get captureIgnoredBody =>
      'رسايل الكروت دي مابتتحفظش خالص، زي كارت حد من أهلك أو كارت الشغل.';

  @override
  String get captureIgnoredRemove => 'بطّل تتجاهله';

  @override
  String get captureIgnoreDigitsLabel => 'آخر 3 أو 4 أرقام';

  @override
  String get captureIgnoreDigitsNeeded => 'اكتب آخر 3 أو 4 أرقام من الكارت.';

  @override
  String get captureIgnoreAdd => 'تجاهله';

  @override
  String get captureDeleteTitle => 'امسح بيانات رسايل البنك';

  @override
  String get captureDeleteBody =>
      'بنمسح الرسايل اللي عندنا وكل اللي اتعلمناه منها، وبنوقف التسجيل على كل موبايلاتك. العمليات اللي في دفترك بتفضل زي ما هي.';

  @override
  String get captureDeleteButton => 'امسح بياناتي';

  @override
  String get captureDeleteConfirmTitle => 'تمسح بيانات رسايل البنك؟';

  @override
  String get captureDeleteConfirmBody =>
      'مش هتقدر ترجّعها، والتسجيل هيقف لحد ما تشغّله تاني.';

  @override
  String get captureDeleteCancel => 'رجوع';

  @override
  String get captureDeleteConfirm => 'امسح';

  @override
  String get captureDeleted => 'اتمسحت بيانات رسايل البنك.';

  @override
  String get captureWalletOfferBody =>
      'هنسجّل عملياته عليها، ورصيدها هيتحدّث من رسايل البنك.';

  @override
  String get captureWalletAdd => 'ضيفها';

  @override
  String get captureWalletNo => 'لا';

  @override
  String captureIgnoredCard(String digits) {
    return 'كارت آخره $digits';
  }

  @override
  String captureIgnoreThisCard(String digits) {
    return 'تجاهل كارت آخره $digits';
  }

  @override
  String captureHeldUntil(String date) {
    return 'أول عملية منهم محفوظة لحد $date.';
  }

  @override
  String captureWalletOffer(String bank, String digits) {
    return 'لقينا كارت $bank آخره $digits. نضيفه لمحافظك؟';
  }

  @override
  String get captureOffline => 'مستنيين النت عشان نبعت.';

  @override
  String get captureRevoked => 'الجهاز ده اتفصل. شغّله تاني من هنا.';

  @override
  String captureReviewEntry(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عملية مستنية ردك',
      few: '$count عمليات مستنية ردك',
      two: 'عمليتين مستنيين ردك',
      one: 'عملية واحدة مستنية ردك',
      zero: 'مفيش عمليات مستنية ردك',
    );
    return '$_temp0';
  }

  @override
  String get captureReviewTitle => 'عمليات البنك';

  @override
  String get captureReviewEmpty => 'مفيش عمليات مستنية ردك.';

  @override
  String get captureReviewFailed =>
      'مش قادرين نجيب العمليات دلوقتي. جرّب تاني.';

  @override
  String get captureRecord => 'سجّل';

  @override
  String get captureDismiss => 'مش مصروف';

  @override
  String get captureAmountLabel => 'المبلغ بالجنيه';

  @override
  String get captureAmountNeeded =>
      'الرسالة فيها مبلغ بعملة تانية. اكتب قيمته بالجنيه زي ما اتخصم.';

  @override
  String get captureCheckAmount =>
      'مش متأكدين من المبلغ ده، راجعه قبل ما تسجّل.';

  @override
  String get captureMaybeDuplicate =>
      'ممكن تكون نفس العملية اللي قبلها. لو دفعت مرتين دوس «سجّل»، ولو هي نفسها دوس «مش مصروف».';

  @override
  String captureAutoOffer(String source) {
    return 'نسجّل عمليات «$source» دي لوحدها بعد كده؟';
  }

  @override
  String get captureAutoOfferBody =>
      'أكّدت آخر 3 عمليات زي ما اتقرت. لو وافقت، بنسجّلها من غير ما نسألك، ويجيلك إشعار فيه «تراجع».';

  @override
  String get captureAutoYes => 'أيوه';

  @override
  String get captureAutoNo => 'لا، اسألني';

  @override
  String captureUsage(int used, int limit) {
    return 'اتسجل $used من $limit الشهر ده.';
  }

  @override
  String captureHeld(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عملية محفوظة، بتتسجل لو اشتركت في Pro.',
      few: '$count عمليات محفوظة، بتتسجل لو اشتركت في Pro.',
      two: 'عمليتين محفوظين، بيتسجلوا لو اشتركت في Pro.',
      one: 'عملية واحدة محفوظة، بتتسجل لو اشتركت في Pro.',
    );
    return '$_temp0';
  }

  @override
  String get captureAnswerFailed => 'ماقدرناش نحفظ ردك. جرّب تاني.';

  @override
  String get signInTitle => 'أهلاً بيك في SmartSpend';

  @override
  String get signInSubtitle => 'ادخل برقم تليفونك أو بحساب Google.';

  @override
  String get phoneLabel => 'رقم التليفون';

  @override
  String get passwordLabel => 'الباسورد';

  @override
  String get showPassword => 'اظهر الباسورد';

  @override
  String get hidePassword => 'اخفي الباسورد';

  @override
  String get signInButton => 'ادخل';

  @override
  String get orSeparator => 'أو';

  @override
  String get signInWithGoogle => 'ادخل بحساب Google';

  @override
  String get noAccountPrompt => 'معندكش حساب؟';

  @override
  String get createAccount => 'اعمل حساب جديد';

  @override
  String get sessionEnded => 'الجلسة خلصت. سجّل دخولك تاني.';

  @override
  String get enterPhoneAndPassword => 'اكتب رقم التليفون والباسورد.';

  @override
  String tryAgainIn(int seconds) {
    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'جرّب تاني بعد $seconds ثانية.',
      few: 'جرّب تاني بعد $seconds ثواني.',
      two: 'جرّب تاني بعد ثانيتين.',
      one: 'جرّب تاني بعد ثانية.',
    );
    return '$_temp0';
  }

  @override
  String get googleFailed => 'ماقدرناش نكمّل الدخول بحساب Google. جرّب تاني.';

  @override
  String get registerTitle => 'حساب جديد';

  @override
  String get registerSubtitle => 'سجّل برقم تليفونك المصري.';

  @override
  String get nameLabel => 'اسمك';

  @override
  String get passwordHint => '6 حروف على الأقل';

  @override
  String get registerButton => 'اعمل الحساب';

  @override
  String get haveAccountPrompt => 'عندك حساب؟';

  @override
  String get goToSignIn => 'ادخل';

  @override
  String get enterRegisterFields => 'اكتب اسمك ورقم التليفون والباسورد.';

  @override
  String get nameTooShort => 'الاسم لازم يكون حرفين على الأقل.';

  @override
  String get passwordTooShort => 'الباسورد لازم يكون 6 حروف على الأقل.';

  @override
  String get humanCheckPending => 'استنى لحظة لحد ما التحقق يخلص.';

  @override
  String get verifyTitle => 'أكّد رقمك';

  @override
  String get verifyBody =>
      'بعتنا كود من 6 أرقام على واتساب الرقم اللي كتبته. اكتبه هنا.';

  @override
  String get verifyCodeField => 'كود التأكيد';

  @override
  String get verifyConfirm => 'تأكيد';

  @override
  String get verifyCodeIncomplete => 'الكود 6 أرقام.';

  @override
  String get verifyResend => 'ابعت كود جديد';

  @override
  String verifyResendIn(int seconds) {
    return 'ابعت كود جديد بعد $seconds ثانية';
  }

  @override
  String get verifyResent => 'بعتنالك كود جديد.';

  @override
  String verifyTimeLeft(String time) {
    return 'الكود صالح لمدة $time';
  }

  @override
  String get verifyExpired => 'الكود انتهى. اطلب كود جديد.';

  @override
  String get verifyDone => 'الرقم اتأكد. بنجهّز حسابك…';

  @override
  String get verifyBack => 'تعديل الرقم';

  @override
  String get accountTitle => 'حسابك';

  @override
  String get signOut => 'تسجيل الخروج';

  @override
  String summarySpentIn(String month) {
    return 'صرفت في $month';
  }

  @override
  String get summaryIncome => 'دخل';

  @override
  String summaryCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عملية',
      many: '$count عملية',
      few: '$count عمليات',
      two: 'عمليتين',
      one: 'عملية واحدة',
      zero: 'مفيش عمليات',
    );
    return '$_temp0';
  }

  @override
  String get summaryLoadFailed => 'مش قادرين نجيب ملخص الشهر دلوقتي.';

  @override
  String get recentTitle => 'آخر العمليات';

  @override
  String get seeAll => 'الكل';

  @override
  String get ledgerEmptyTitle => 'لسه مفيش عمليات';

  @override
  String get ledgerEmptyBody =>
      'اكتب أول مصروف تحت بالعامية، وإحنا هنصنّفه لوحدنا.';

  @override
  String get ledgerLoadFailed =>
      'مش قادرين نجيب العمليات دلوقتي. اتأكد من النت وجرّب تاني.';

  @override
  String get retry => 'جرّب تاني';

  @override
  String get composerHint => 'اكتب: قهوة 50 وأوبر 120';

  @override
  String get composerSend => 'ابعت';

  @override
  String savedAuto(String summary) {
    return 'اتحفظت لوحدها: $summary';
  }

  @override
  String savedManual(String summary) {
    return 'اتحفظت: $summary';
  }

  @override
  String savedItemsSummary(int count, String total) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عملية',
      few: '$count عمليات',
      two: 'عمليتين',
    );
    return '$_temp0 · $total';
  }

  @override
  String get undo => 'تراجع';

  @override
  String get undone => 'اترجعت.';

  @override
  String get undoFailed => 'ماقدرناش نرجعها، امسحها من القايمة.';

  @override
  String get nothingToSave =>
      'مش لاقيين مبلغ في الجملة. اكتب المبلغ وجرّب تاني.';

  @override
  String get reviewTitle => 'راجع قبل ما نحفظ';

  @override
  String get reviewSave => 'احفظ';

  @override
  String get reviewEdit => 'عدّل الجملة';

  @override
  String get clarifyDefault => 'ممكن توضح أكتر؟';

  @override
  String get clarifyAnswerLabel => 'ردّك';

  @override
  String get clarifySend => 'ابعت الرد';

  @override
  String get clarifyLater => 'بعدين';

  @override
  String get transactionsTitle => 'كل العمليات';

  @override
  String get entryDeleted => 'اتمسحت العملية.';

  @override
  String get deleteFailed => 'ماقدرناش نمسحها. جرّب تاني.';

  @override
  String get deleteAction => 'امسح';

  @override
  String get queuedOffline => 'النت فاصل. حفظناها هنا وهنبعتها أول ما يرجع.';

  @override
  String get offlineBanner =>
      'النت فاصل. اللي بتسجّله بيتحفظ هنا وهيتبعت لما يرجع.';

  @override
  String offlineFull(int limit) {
    String _temp0 = intl.Intl.pluralLogic(
      limit,
      locale: localeName,
      other: '$limit عملية',
      few: '$limit عمليات',
      two: 'عمليتين',
      one: 'عملية واحدة',
    );
    return 'قايمة الأوفلاين مليانة ($_temp0 في باقتك). وصّل النت عشان تتبعت، وبعدين سجّل تاني.';
  }

  @override
  String get offlineTooShort => 'الجملة قصيرة. اكتب صرفت في إيه وبكام.';

  @override
  String get offlineUnreadable =>
      'مش فاهمين الجملة دي. اكتب صرفت في إيه وبكام.';

  @override
  String get offlineNoAmount =>
      'مش لاقيين مبلغ في الجملة. اكتبه بالأرقام أو بالكلام (مثلاً: 50 جنيه، خمسين مواصلات).';

  @override
  String get outboxTitle => 'لسه ماتسجّلتش';

  @override
  String get outboxQueued => 'مستنية النت';

  @override
  String get outboxSending => 'بتتبعت…';

  @override
  String get outboxNeedsReview => 'محتاجة مراجعة منك';

  @override
  String get outboxNeedsAnswer => 'محتاجة رد منك';

  @override
  String get outboxFailed => 'ماتبعتتش. دوس عليها عشان تبعتها تاني.';

  @override
  String get outboxSendNow => 'ابعتها دلوقتي';

  @override
  String get outboxDelete => 'امسحها';

  @override
  String get lockTitle => 'اكتب الرمز السري';

  @override
  String lockDigitsEntered(int count, int total) {
    return 'اتكتب $count من $total';
  }

  @override
  String get lockDelete => 'امسح رقم';

  @override
  String get lockWrong => 'الرمز غلط. جرّب تاني.';

  @override
  String lockWrongWarning(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count محاولة',
      few: '$count محاولات',
      two: 'محاولتين',
      one: 'محاولة واحدة',
    );
    return 'الرمز غلط. فاضل $_temp0، وبعدها هنخرجك من الحساب على الموبايل ده.';
  }

  @override
  String lockWait(String time) {
    return 'جرّب تاني بعد $time.';
  }

  @override
  String get lockBiometricsChanged =>
      'البصمات على الموبايل اتغيّرت، فوقفنا الفتح بيها. ادخل بالرمز، وشغّلها تاني من الأمان والخصوصية.';

  @override
  String get lockBiometricsLockedOut =>
      'الموبايل وقف البصمة شوية بعد محاولات كتير. ادخل بالرمز.';

  @override
  String get lockBiometricsFailed => 'ماقدرناش نتأكد منك بالبصمة. ادخل بالرمز.';

  @override
  String get lockDamaged =>
      'مش قادرين نقرأ قفل التطبيق على الموبايل ده. اخرج من الحساب وادخل تاني.';

  @override
  String get lockForgot => 'نسيت الرمز؟';

  @override
  String get lockForgotBody =>
      'هنخرجك من الحساب على الموبايل ده ونشيل القفل. ادخل تاني برقمك وكلمة السر أو بجوجل، وحط رمز جديد. حسابك وعملياتك محفوظين.';

  @override
  String lockForgotUnsent(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عملية',
      few: '$count عمليات',
      two: 'عمليتين',
      one: 'عملية واحدة',
    );
    return 'فيه $_temp0 على الموبايل لسه ماتبعتتش، وهتتمسح.';
  }

  @override
  String get lockSignOut => 'اخرج من الحساب';

  @override
  String get lockBack => 'رجوع';

  @override
  String get biometricFingerprint => 'البصمة';

  @override
  String get biometricFace => 'الوش';

  @override
  String get biometricIris => 'العين';

  @override
  String lockUseBiometrics(String method) {
    return 'افتح ب$method';
  }

  @override
  String get biometricPromptTitle => 'افتح SmartSpend';

  @override
  String get biometricPromptReason => 'عشان تشوف حساباتك.';

  @override
  String get biometricPromptUsePin => 'استخدم الرمز السري';

  @override
  String get securityTitle => 'الأمان والخصوصية';

  @override
  String get securityEntryBody => 'القفل والبصمة وإخفاء المبالغ';

  @override
  String get securityLockSection => 'قفل التطبيق';

  @override
  String get securityLock => 'اقفل التطبيق';

  @override
  String get securityLockBody =>
      'يطلب رمز سري لما تفتح التطبيق، ويخفي محتواه في قايمة التطبيقات المفتوحة.';

  @override
  String securityBiometricsNotEnrolled(String method) {
    return 'سجّل $method في إعدادات الموبايل الأول.';
  }

  @override
  String get securityRelock => 'يطلب الرمز تاني بعد ما تسيب التطبيق';

  @override
  String get relockNow => 'على طول';

  @override
  String get relockMinute => 'دقيقة';

  @override
  String get relockFiveMinutes => '5 دقايق';

  @override
  String get securityChangePin => 'غيّر الرمز السري';

  @override
  String get securityConfirm => 'اكتب الرمز السري عشان تغيّر إعدادات القفل';

  @override
  String get securityPrivacySection => 'الخصوصية';

  @override
  String get hideAmounts => 'اخفي المبالغ';

  @override
  String get showAmounts => 'اظهر المبالغ';

  @override
  String get hideAmountsBody =>
      'الأرقام تبان •••• لحد ما تظهرها. زرار العين في شاشة التسجيل بيغيّرها بسرعة.';

  @override
  String get lockTurnedOn => 'القفل اشتغل.';

  @override
  String get lockTurnedOff => 'وقفنا قفل التطبيق.';

  @override
  String get pinChanged => 'الرمز السري اتغيّر.';

  @override
  String biometricsTurnedOn(String method) {
    return 'الفتح ب$method اشتغل.';
  }

  @override
  String biometricsUnavailable(String method) {
    return 'مش قادرين نستخدم $method دلوقتي. اتأكد إن الموبايل عليه رمز قفل وجرّب تاني.';
  }

  @override
  String get pinChooseTitle => 'اختار رمز سري من 6 أرقام';

  @override
  String get pinChooseBody =>
      'هتكتبه كل ما تفتح التطبيق. ماتستخدمش تاريخ ميلادك ولا رمز قفل الموبايل.';

  @override
  String get pinConfirmTitle => 'اكتبه تاني للتأكيد';

  @override
  String get pinMismatch => 'الرمزين مش زي بعض. اختار الرمز من الأول.';

  @override
  String get pinGuessable => 'الرمز ده سهل يتخمّن. اختار رمز تاني.';

  @override
  String pinOfferBiometricsTitle(String method) {
    return 'تفتح ب$method كمان؟';
  }

  @override
  String get pinOfferBiometricsBody =>
      'أسرع من الرمز، والرمز يفضل شغال لو احتجته.';

  @override
  String get pinOfferYes => 'أيوه، شغّلها';

  @override
  String get pinOfferNo => 'مش دلوقتي';

  @override
  String get languageTitle => 'لغة التطبيق';

  @override
  String get languageArabic => 'العربية';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageNote =>
      'التسجيل والتصنيفات بيفضلوا بالعربي: اكتب واتكلم بالعامية زي ما انت.';

  @override
  String statsLessThanLastMonth(String percent) {
    return 'أقل من الشهر اللي فات بـ $percent.';
  }

  @override
  String statsMoreThanLastMonth(String percent) {
    return 'أكتر من الشهر اللي فات بـ $percent.';
  }

  @override
  String get statsSameAsLastMonth => 'زي الشهر اللي فات بالظبط.';

  @override
  String statsLessThanLastWeek(String percent) {
    return 'الأسبوع ده أقل من نفس الأسبوع الشهر اللي فات بـ $percent.';
  }

  @override
  String statsMoreThanLastWeek(String percent) {
    return 'الأسبوع ده أكتر من نفس الأسبوع الشهر اللي فات بـ $percent.';
  }

  @override
  String get statsNoComparison => 'لسه مفيش شهر قبله نقارن بيه.';

  @override
  String get statsDailyAverage => 'متوسط يومي';

  @override
  String get statsByCategory => 'صرفت على إيه';

  @override
  String get statsOther => 'حاجات تانية';

  @override
  String get statsHabits => 'عاداتك في الشهر';

  @override
  String statsTopDay(String day, String amount) {
    return 'أكتر يوم صرفت فيه: $day، $amount.';
  }

  @override
  String statsMostRecurring(String name, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مرة',
      few: '$count مرات',
      two: 'مرتين',
      one: 'مرة واحدة',
    );
    return 'أكتر حاجة بتتكرر: $name، $_temp0.';
  }

  @override
  String statsEmptyTitle(String month) {
    return 'مفيش مصاريف في $month';
  }

  @override
  String get statsEmptyBody =>
      'سجّل مصاريفك من تبويب التسجيل، وهنا هتشوف صرفت على إيه وإزاي بيتغيّر من شهر لشهر.';

  @override
  String get statsEmptyAction => 'سجّل مصروف';

  @override
  String get statsLoadFailed => 'مش قادرين نجيب إحصائيات الشهر دلوقتي.';

  @override
  String get statsPreviousMonth => 'الشهر اللي قبله';

  @override
  String get statsNextMonth => 'الشهر اللي بعده';

  @override
  String get moreMoneySection => 'فلوسك';

  @override
  String get moreAppSection => 'التطبيق';

  @override
  String get walletsTitle => 'المحافظ والكروت';

  @override
  String get walletsEntry => 'الأرصدة واللي داخل وخارج كل شهر';

  @override
  String get walletsTotal => 'فلوسك في المحافظ والكروت';

  @override
  String get walletsTotalStory => 'مجموع الأرصدة اللي إنت كاتبها.';

  @override
  String get walletsEmptyTitle => 'مفيش محافظ ولا كروت لسه';

  @override
  String get walletsEmptyBody =>
      'ضيف كارتك أو محفظتك علشان تعرف رصيدها واللي داخل وخارج منها كل شهر.';

  @override
  String get walletsAdd => 'ضيف محفظة أو كارت';

  @override
  String get walletsLoadFailed => 'مش قادرين نجيب المحافظ دلوقتي.';

  @override
  String walletUpdated(String date) {
    return 'اتحدّث $date';
  }

  @override
  String get walletUpdatedUnknown => 'مش معروف اتحدّث إمتى';

  @override
  String walletBalanceStory(String date) {
    return 'ده الرصيد اللي كتبته $date. حدّثه لما يتغيّر.';
  }

  @override
  String get walletBalanceStoryUnknown =>
      'ده الرصيد اللي كتبته، ومش معروف إمتى. حدّثه علشان يبقى مظبوط.';

  @override
  String get walletMonthIn => 'دخل الشهر ده';

  @override
  String get walletMonthOut => 'خرج الشهر ده';

  @override
  String get walletRecent => 'آخر العمليات';

  @override
  String get walletNoTransactions =>
      'مفيش عمليات على المحفظة دي لسه. لما تسجّل مصروف وتقول دفعته منها، هيظهر هنا.';

  @override
  String get walletEdit => 'تعديل الرصيد والاسم';

  @override
  String get walletDelete => 'مسح المحفظة';

  @override
  String walletDeleteTitle(String name) {
    return 'تمسح $name؟';
  }

  @override
  String get walletDeleteBody =>
      'المحفظة هتتمسح. العمليات اللي كانت عليها هتفضل في سجلك من غير محفظة. المسح مابيترجعش.';

  @override
  String get walletDeleteConfirm => 'امسحها';

  @override
  String get walletDeleteKeep => 'لأ، سيبها';

  @override
  String get walletDeleted => 'المحفظة اتمسحت.';

  @override
  String get walletFormAddTitle => 'محفظة أو كارت جديد';

  @override
  String walletFormEditTitle(String name) {
    return 'تعديل $name';
  }

  @override
  String get walletKindLabel => 'النوع';

  @override
  String get walletNameLabel => 'الاسم';

  @override
  String get walletNameHint => 'زي: كارت CIB أو فودافون كاش بتاعي';

  @override
  String get walletNameRequired => 'اكتب اسم للمحفظة.';

  @override
  String get walletLastFourLabel => 'آخر 4 أرقام (لو كارت)';

  @override
  String get walletLastFourInvalid => 'اكتب آخر 4 أرقام بالظبط.';

  @override
  String get walletBalanceLabel => 'الرصيد دلوقتي';

  @override
  String get walletBalanceInvalid =>
      'الرصيد لازم يكون رقم، زي 1500 أو 1500.50.';

  @override
  String get walletSave => 'حفظ';

  @override
  String get walletSaved => 'اتحفظ.';

  @override
  String get walletNotFound => 'المحفظة دي مش موجودة';

  @override
  String get walletKindCard => 'كارت بنكي';

  @override
  String get walletKindVodafoneCash => 'فودافون كاش';

  @override
  String get walletKindInstaPay => 'إنستاباي';

  @override
  String get walletKindCib => 'البنك التجاري الدولي';

  @override
  String get walletKindNbe => 'البنك الأهلي';

  @override
  String get walletKindBanqueMisr => 'بنك مصر';

  @override
  String get walletKindQnb => 'QNB';

  @override
  String get walletKindFawry => 'فوري';

  @override
  String get walletKindOrangeCash => 'أورنج كاش';

  @override
  String get walletKindEtisalatCash => 'اتصالات كاش';

  @override
  String get walletNotFoundBody => 'يمكن اتمسحت من جهاز تاني أو من الموقع.';

  @override
  String get walletsBack => 'ارجع للمحافظ';

  @override
  String walletsLastFour(String digits) {
    return 'آخره $digits';
  }

  @override
  String get statsRefund => 'مرتجع';

  @override
  String statsCategoryInMonth(String month) {
    return 'في $month';
  }

  @override
  String statsCategoryRefundInMonth(String month) {
    return 'صافي مرتجع في $month';
  }

  @override
  String get statsCategoryEmptyTitle => 'مفيش عمليات في التصنيف ده';

  @override
  String statsCategoryEmptyBody(String category, String month) {
    return 'مفيش مصاريف متسجّلة تحت «$category» في $month.';
  }

  @override
  String get transactionTitle => 'تفاصيل العملية';

  @override
  String get transactionKindExpense => 'مصروف';

  @override
  String get transactionKindRefund => 'مرتجع';

  @override
  String get transactionKindIncome => 'دخل';

  @override
  String get transactionKindTransfer => 'تحويل';

  @override
  String get transactionKindInvestment => 'استثمار';

  @override
  String get transactionDetailsSection => 'التفاصيل';

  @override
  String get transactionCategoryLabel => 'التصنيف';

  @override
  String get transactionDateLabel => 'التاريخ والوقت';

  @override
  String get transactionWalletLabel => 'المحفظة أو الكارت';

  @override
  String get transactionPersonLabel => 'الشخص';

  @override
  String get transactionNoteLabel => 'ملاحظة';

  @override
  String get transactionSourceLabel => 'اتسجّلت إزاي';

  @override
  String get transactionSourceTyped => 'بجملة كتبتها';

  @override
  String get transactionSourceManual => 'بإيدك';

  @override
  String get transactionSourceVoice => 'بالصوت';

  @override
  String get transactionSourceSms => 'رسالة بنك أو محفظة';

  @override
  String get transactionSourceImage => 'صورة فاتورة';

  @override
  String get transactionSentenceLabel => 'الجملة الأصلية';

  @override
  String get transactionEditAction => 'تعديل العملية';

  @override
  String get transactionEditOffline => 'وصّل النت عشان تعدّل العملية.';

  @override
  String get transactionDeleteAction => 'مسح العملية';

  @override
  String get transactionDeleteOffline => 'وصّل النت عشان تمسح العملية.';

  @override
  String get transactionLoadFailed =>
      'مش قادرين نجيب تفاصيل العملية دلوقتي. اتأكد من النت وجرّب تاني.';

  @override
  String get transactionNotFoundTitle => 'العملية دي مش موجودة';

  @override
  String get transactionNotFoundBody =>
      'يمكن اتمسحت من جهاز تاني أو من الموقع.';

  @override
  String get transactionBack => 'ارجع';

  @override
  String personTransactionsTitle(String name) {
    return 'عمليات $name';
  }

  @override
  String get personTransactionsEmpty => 'مفيش عمليات معروضة للشخص ده دلوقتي.';

  @override
  String get editTransactionTitle => 'تعديل العملية';

  @override
  String get editTransactionSubtitle =>
      'لو غيّرت التصنيف، التطبيق هيفتكر اختيارك للجمل اللي شبهها.';

  @override
  String get editKindLabel => 'النوع';

  @override
  String get editAmountLabel => 'المبلغ';

  @override
  String get editAmountInvalid => 'اكتب مبلغ أكبر من صفر، زي 150 أو 150.50.';

  @override
  String get editCategoryLabel => 'التصنيف';

  @override
  String get editSubCategoryLabel => 'التصنيف الفرعي';

  @override
  String get editDateLabel => 'التاريخ';

  @override
  String get editNoteLabel => 'ملاحظة';

  @override
  String get editWalletLabel => 'المحفظة أو الكارت';

  @override
  String get editWalletNone => 'من غير محفظة';

  @override
  String get editPersonLabel => 'الشخص';

  @override
  String get editPersonNone => 'من غير شخص';

  @override
  String get editSave => 'احفظ التعديل';

  @override
  String get editCancel => 'رجوع';

  @override
  String get editSaved => 'اتعدّلت العملية.';

  @override
  String get editFailed => 'ماقدرناش نحفظ التعديل. جرّب تاني.';

  @override
  String get pendingQuestionsTitle => 'محتاج ردّك';

  @override
  String get pendingQuestionsSubtitle => 'جمل وقفت عند سؤال ولسه ماتسجّلتش.';

  @override
  String get pendingQuestionsReply => 'رد';

  @override
  String get pendingQuestionsDismiss => 'شيلها';

  @override
  String get pendingQuestionsNext => 'تمام، فاضل سؤال كمان.';

  @override
  String get pendingQuestionDismissed => 'اتشال السؤال.';

  @override
  String get pendingQuestionsFailed => 'ماقدرناش نسجّلها دلوقتي. جرّب تاني.';

  @override
  String get transactionWalletUnknown => 'محفظة غير معروفة';

  @override
  String get transactionPersonUnknown => 'شخص غير معروف';

  @override
  String signOutPendingOutboxWarning(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          'عندك $count عملية متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.',
      many:
          'عندك $count عملية متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.',
      few:
          'عندك $count عمليات متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هيروحوا.',
      one: 'عندك عملية واحدة متسجلة بدون نت ولسه ماتحفظتش. لو خرجت دلوقتي هتروح.',
    );
    return '$_temp0';
  }

  @override
  String get signOutConfirmAnyway => 'اخرج على أي حال';

  @override
  String get signOutCancel => 'استنى';

  @override
  String get refreshFailedNotice =>
      'ماقدرناش نحدّث البيانات دلوقتي. البيانات المعروضة هي آخر نسخة محفوظة.';

  @override
  String get discardChangesTitle => 'تجاهل التعديلات؟';

  @override
  String get discardChangesBody =>
      'لو رجعت دلوقتي، التعديلات اللي كتبتها مش هتتحفظ.';

  @override
  String get discardChangesConfirm => 'تجاهل';

  @override
  String get discardChangesCancel => 'كمّل تعديل';

  @override
  String get walletOfflinePartial =>
      'المعاملات وملخص الشهر مش متوفرين أوفلاين.';

  @override
  String get manualRecordTitle => 'تسجيل يدوي';

  @override
  String get manualRecordAmountHint => '٠';

  @override
  String get manualRecordTypeExpense => 'مصروف';

  @override
  String get manualRecordTypeIncome => 'دخل';

  @override
  String get manualRecordTypeTransfer => 'تحويل';

  @override
  String get manualRecordSelectCategory => 'اختر التصنيف';

  @override
  String get manualRecordNoWallet => 'بدون محفظة';

  @override
  String get manualRecordNoteHint => 'تفاصيل إضافية...';

  @override
  String get manualRecordSave => 'حفظ العملية';

  @override
  String get manualRecordAmountRequired => 'اكتب المبلغ الأول';

  @override
  String get manualRecordCategoryRequired => 'اختر تصنيف للعملية';

  @override
  String get manualRecordSavedNotice => 'اتسجلت العملية بنجاح';

  @override
  String get manualRecordQueuedNotice =>
      'اتحفظت على الموبايل وهتتبعت أول ما النت يرجع';

  @override
  String get searchTitle => 'بحث في العمليات';

  @override
  String get searchHint => 'ابحث بالاسم، الفئة أو المحل...';

  @override
  String searchEmptyTitle(String query) {
    return 'مفيش نتائج لـ \"$query\"';
  }

  @override
  String get searchEmptyBody => 'جرّب تبحث بكلمة تانية أو اتأكد من الحروف.';

  @override
  String get searchOfflineNotice =>
      'البحث دلوقتي شغال على العمليات المحفوظة على جهازك بس.';

  @override
  String get deleteAccountTitle => 'حذف الحساب';

  @override
  String get deleteAccountBody =>
      'سيتم مسح جميع بياناتك، سجلاتك، ومعاملاتك نهائياً وفوراً. لن تتمكن من استرجاع هذا الحساب مجدداً. وفقاً لقانون حماية البيانات الشخصية رقم 151 لسنة 2020، قد يتم الاحتفاظ ببعض سجلات الامتثال المالي فقط للمدة المقررة قانوناً.';

  @override
  String get deleteAccountPhraseInstruction =>
      'لتأكيد الحذف، اكتب كلمة «احذف حسابي» أدناه:';

  @override
  String get deleteAccountPasswordLabel => 'كلمة المرور الحالية';

  @override
  String get deleteAccountPasswordHint => 'اكتب كلمة المرور لتأكيد هويتك';

  @override
  String get deleteAccountConfirmButton => 'حذف حسابي نهائياً';

  @override
  String get deleteAccountCancelButton => 'إلغاء والتراجع';

  @override
  String get deleteAccountSuccess => 'تم حذف حسابك بنجاح.';

  @override
  String get deleteAccountFailed =>
      'فشل حذف الحساب. يرجى التأكد من البيانات أو التواصل مع الدعم.';

  @override
  String get deleteAccountContactSupport => 'تواصل مع الدعم';

  @override
  String get profileTitle => 'الملف الشخصي';

  @override
  String get profileName => 'الاسم';

  @override
  String get profilePhone => 'رقم الهاتف';

  @override
  String get profileEmail => 'البريد الإلكتروني';

  @override
  String get profileChangePhone => 'تغيير الرقم';

  @override
  String get profileSave => 'حفظ التعديلات';

  @override
  String get profileSaved => 'تم حفظ التعديلات بنجاح';

  @override
  String get phoneChangeTitle => 'تغيير رقم الهاتف';

  @override
  String get phoneChangeBody => 'سنرسل رمز تأكيد على واتساب إلى رقمك الجديد.';

  @override
  String get phoneChangeNewNumber => 'الرقم الجديد';

  @override
  String get phoneChangeSendCode => 'إرسال كود التأكيد';

  @override
  String get phoneChangeEnterCode => 'أدخل رمز التأكيد المرسل';

  @override
  String get phoneChangeSuccess => 'تم تغيير رقم الهاتف بنجاح';

  @override
  String get moneyPrefsTitle => 'تفضيلات الراتب والميزانية';

  @override
  String get moneyPrefsSalaryDay => 'يوم نزول الراتب (بداية الشهر المالي)';

  @override
  String get moneyPrefsSalaryDayBody =>
      'اليوم الذي تبدأ فيه حساب مصاريفك وميزانيتك الشهرية. في الشهور القصيرة مثل فبراير يتم اعتماد آخر يوم في الشهر تلقائياً.';

  @override
  String get moneyPrefsSaved => 'تم حفظ تفضيلات الراتب';

  @override
  String get onboardingQuestionsTitle => 'أسئلة التخصيص';

  @override
  String get onboardingSkip => 'تخطي الآن';

  @override
  String get onboardingSubmit => 'حفظ ومتابعة';

  @override
  String get onboardingDone => 'شكراً لإجاباتك!';

  @override
  String get sessionsTitle => 'الأجهزة والجلسات النشطة';

  @override
  String get sessionsCurrentDevice => 'هذا الجهاز';

  @override
  String get sessionsRevoke => 'إنهاء الجلسة';

  @override
  String get sessionsRevokeConfirm =>
      'هل تريد إنهاء هذه الجلسة وتسجيل الخروج منها؟';

  @override
  String get sessionsRevokeCurrentWarning =>
      'إنهاء هذه الجلسة سيؤدي لتسجيل خروجك فوراً من هذا الموبايل.';

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get notificationsEmpty => 'لا توجد إشعارات حالياً';

  @override
  String get notificationsMarkAllRead => 'تحديد الكل كمقروء';

  @override
  String get notificationsFilterAll => 'الكل';

  @override
  String get notificationsFilterUnread => 'غير مقروءة';

  @override
  String get notificationsToday => 'اليوم';

  @override
  String get notificationsYesterday => 'أمس';

  @override
  String get notificationsThisWeek => 'هذا الأسبوع';

  @override
  String get notificationsOlder => 'أقدم';

  @override
  String get notificationSettingsTitle => 'إعدادات الإشعارات';

  @override
  String get notificationSettingsMaster => 'تفعيل الإشعارات';

  @override
  String get notificationSettingsBudget => 'تنبيهات الميزانية';

  @override
  String get notificationSettingsDaily => 'التذكير اليومي بالتسجيل';

  @override
  String get notificationSettingsStreak =>
      'تنبيهات الحفاظ على الالتزام (Streak)';

  @override
  String get notificationSettingsMonthly => 'التقرير الشهري';

  @override
  String get helpCenterTitle => 'مركز المساعدة والدعم';

  @override
  String get helpFaqSection => 'الأسئلة الشائعة';

  @override
  String get helpTicketSection => 'تواصل مع الدعم';

  @override
  String get helpTicketSubject => 'موضوع الرسالة';

  @override
  String get helpTicketMessage => 'تفاصيل المشكلة أو الاستفسار';

  @override
  String get helpTicketSubmit => 'إرسال التذكرة';

  @override
  String get helpMyTickets => 'تذاكري السابقة';

  @override
  String get planTitle => 'الاشتراك والترقية';

  @override
  String get planCurrent => 'باقتك الحالية';

  @override
  String get planFree => 'الخطة المجانية';

  @override
  String get planPro => 'خطة المحترفين (Pro)';

  @override
  String get planFeaturesTitle => 'مميزات خطة Pro';

  @override
  String get cancelPlanTitle => 'إلغاء الاشتراك';

  @override
  String get cancelPlanRetainNotice =>
      'باقتك هتفضل شغالة لحد آخر الفترة اللي دفعتها.';

  @override
  String get appearanceTitle => 'المظهر';

  @override
  String get appearanceSystem => 'تلقائي (حسب النظام)';

  @override
  String get appearanceLight => 'فاتح';

  @override
  String get appearanceDark => 'داكن';

  @override
  String get termsTitle => 'شروط الخدمة';

  @override
  String get dataStoredTitle => 'البيانات والخصوصية';

  @override
  String get forgotPassword => 'نسيت كلمة المرور؟';

  @override
  String get resetPasswordTitle => 'إعادة تعيين كلمة المرور';

  @override
  String get resetPasswordNew => 'كلمة المرور الجديدة';

  @override
  String get resetPasswordConfirm => 'تأكيد كلمة المرور';

  @override
  String get resetPasswordSubmit => 'تغيير كلمة المرور والدخول';

  @override
  String get resetPasswordSuccess => 'تم تغيير كلمة المرور بنجاح';

  @override
  String planBuy(String price) {
    return 'اشترك في Pro بـ $price';
  }

  @override
  String get planStoreSoon => 'الاشتراك من جوه التطبيق هيتاح قريب.';

  @override
  String get planActivated => 'اشتراك Pro اتفعّل.';

  @override
  String get planPurchasePending =>
      'عملية الدفع لسه بتتراجع. هنفعّل الاشتراك أول ما تتأكد.';

  @override
  String get planPurchaseFailed =>
      'الاشتراك ما اتمّش، ومفيش فلوس اتخصمت من عندنا. جرّب تاني.';

  @override
  String get planRestore => 'رجّع مشترياتي';

  @override
  String get planRestored => 'اشتراكك رجع.';

  @override
  String get planNothingToRestore =>
      'مش لاقيين اشتراك سابق على الحساب ده في المتجر.';

  @override
  String get exportShare => 'شارك الملف';

  @override
  String get calendarLoadFailed => 'مش قادرين نجيب خطتك دلوقتي.';

  @override
  String calTransactionsOfDayP0(String p0) {
    return 'عمليات يوم $p0';
  }

  @override
  String calTransactionsOfDayP02(String p0) {
    return 'عمليات يوم $p0';
  }

  @override
  String get calPayday => '· يوم القبض';

  @override
  String get calNoSpending => 'مفيش صرف';

  @override
  String get calAddACommitmentOrIncome => 'ضيف التزام أو دخل';

  @override
  String calYourFinancialMonthStartsOn(String p0, String p1) {
    return 'شهرك المالي بيبدأ يوم $p0 وبيخلص يوم $p1.';
  }

  @override
  String calP0DaysToPaydayDay(String p0, String p1) {
    return 'الأيام الباقية على القبض (يوم $p1): $p0. بعد التزاماتك فاضل معاك:';
  }

  @override
  String calP0DaysToTheEnd(String p0) {
    return 'الأيام الباقية في شهرك المالي: $p0. بعد التزاماتك فاضل معاك:';
  }

  @override
  String get calLeftUntilPayday => 'المتاح لحد القبض';

  @override
  String get calNoWalletsYetSoThe => 'مفيش محافظ متسجلة، فالحساب بيبدأ من صفر.';

  @override
  String get calOneBalanceHasNoKnown =>
      'فيه رصيد مش معروف اتسجل امتى؛ حدّثه من المحافظ.';

  @override
  String calCommitmentsWithNoKnownAmount(String p0) {
    return 'التزامات مبلغها مش معروف: $p0.';
  }

  @override
  String calCommitmentsWithNoDateSo(String p0) {
    return 'التزامات ميعادها مش معروف فمش محسوبة: $p0.';
  }

  @override
  String get calTotalCommitments => 'إجمالي الالتزامات';

  @override
  String get calWalletBalances => 'رصيد المحافظ';

  @override
  String get calNotRecorded => 'مش متسجل';

  @override
  String get calThisMonthSSpending => 'صرفك في الشهر';

  @override
  String get calTapADayToSee => 'دوس على أي يوم تشوف صرفت إيه.';

  @override
  String get calCommitmentsAndExpectedIncome => 'الالتزامات والدخل المتوقع';

  @override
  String get calAdd => 'ضيف';

  @override
  String get calNoCommitmentsThisMonthAdd =>
      'مفيش التزامات الشهر ده.\nضيف فواتيرك وأقساطك علشان تعرف اللي هيفضل لحد القبض.';

  @override
  String get calPaid => 'اتدفع';

  @override
  String get calPartlyPaid => 'اتدفع جزء منه';

  @override
  String get calOverdue => 'فات ميعاده';

  @override
  String get calDue => 'مستحق';

  @override
  String calDueOnDayP0(String p0) {
    return 'ميعاده يوم $p0';
  }

  @override
  String get calSettle => 'ادفع';

  @override
  String get calPaidTapToUndo => 'اتدفع (دوس للإلغاء)';

  @override
  String get calActiveSavingPlan => 'خطة التوفير الحالية';

  @override
  String get calEndThePlan => 'خلّص الخطة';

  @override
  String get calPlanSteps => 'خطوات الخطة:';

  @override
  String get calReminderOn => 'التذكير شغال';

  @override
  String get calTurnOnAReminder => 'شغّل تذكير';

  @override
  String get calReminderCancelled => 'التذكير اتلغى';

  @override
  String get calReminderSetCairoTime => 'التذكير اتظبط بتوقيت القاهرة';

  @override
  String get calSkipThisStep => 'سيب الخطوة دي';

  @override
  String get calRent => 'إيجار';

  @override
  String get calBill => 'فاتورة';

  @override
  String get calSubscription => 'اشتراك';

  @override
  String get calSchoolFees => 'مصاريف مدارس';

  @override
  String get calInstallment => 'قسط';

  @override
  String get calDebtOrLoan => 'دين أو سلفة';

  @override
  String get calSavingsCircle => 'جمعية';

  @override
  String get calSalary => 'مرتب';

  @override
  String get calFreelance => 'شغل حر';

  @override
  String get calSomethingElse => 'حاجة تانية';

  @override
  String get calEveryMonth => 'كل شهر';

  @override
  String get calEveryWeek => 'كل أسبوع';

  @override
  String get calEveryYear => 'كل سنة';

  @override
  String get calOnce => 'مرة واحدة';

  @override
  String get calEnterAName => 'اكتب اسم';

  @override
  String get calEnterAValidAmount => 'اكتب مبلغ صحيح';

  @override
  String get calWeCouldnTAddIt => 'ما عرفناش نضيفه. جرّب تاني.';

  @override
  String get calAddACommitmentOrExpected => 'ضيف التزام أو دخل متوقع';

  @override
  String get calCommitment => 'التزام / مصروف';

  @override
  String get calExpectedIncome => 'دخل متوقع';

  @override
  String get calNameLikeTheRent => 'الاسم (زي: إيجار الشقة)';

  @override
  String get calAmountOptionalIfItChanges => 'المبلغ (اختياري لو بيتغير)';

  @override
  String get calKind => 'النوع';

  @override
  String get calDueDay => 'يوم الميعاد';

  @override
  String calDayP0(String p0) {
    return 'يوم $p0';
  }

  @override
  String get calRepeats => 'التكرار';

  @override
  String get calSave => 'احفظ';

  @override
  String get calWeCouldnTRecordThe => 'ما عرفناش نسجل الدفع. جرّب تاني.';

  @override
  String calSettleP0(String p0) {
    return 'دفع: $p0';
  }

  @override
  String calAmountDueP0(String p0) {
    return 'المبلغ المستحق: $p0';
  }

  @override
  String get calAmountPaidPartOfIt => 'المبلغ اللي دفعته (ينفع جزء منه)';

  @override
  String get calMatchingTransactions => 'عمليات ممكن تكون هي:';

  @override
  String get calNoRecentMatchingTransactionYou =>
      'مفيش عملية قريبة شبهها. تقدر تسجل المبلغ مباشرة.';

  @override
  String get calConfirmPayment => 'أكد الدفع';

  @override
  String get calClose => 'اقفل';

  @override
  String get calWeCouldnTLoadThis => 'ما عرفناش نجيب عمليات اليوم ده.';

  @override
  String get calNothingRecordedOnThisDay => 'مفيش حاجة متسجلة في اليوم ده.';

  @override
  String get calWorkAccount => 'حساب الشغل';

  @override
  String get calKeepWorkSpendingApartFrom =>
      'فصل مصاريف الشغل عن المصاريف الشخصية';

  @override
  String get calPeopleAndDebts => 'الناس والديون';

  @override
  String get calWhoOwesYouAndWho => 'مين ليك عنده ومين عليك ليه';

  @override
  String get calMonthlyBudgets => 'الميزانيات الشهرية';

  @override
  String get calSetALimitAndSee =>
      'حدد سقف لمصاريفك وتابع اللي باقي لك أول بأول';

  @override
  String get calSavingGoals => 'أهداف التوفير';

  @override
  String get calPlanWhatYouAreSaving =>
      'خطط لمستقبلك وتابع وصولك لأهدافك بالذكاء الاصطناعي';

  @override
  String get calInstallments => 'الأقساط';

  @override
  String get calMonthlyInstallmentsAndWhatIs =>
      'متابعة الأقساط الشهرية والباقي منها';

  @override
  String get calSeasons => 'مواسم الصرف';

  @override
  String get calRamadanFeastsSchoolAndSummer =>
      'رمضان، الأعياد، المدارس ومصاريف الصيف';

  @override
  String get calExportMyData => 'تصدير البيانات';

  @override
  String get calDownloadACopyOfYour => 'نزّل نسخة من عملياتك';

  @override
  String get calAccount => 'إعدادات الحساب';

  @override
  String get calProfile => 'الملف الشخصي';

  @override
  String get calYourNameAndPhoneNumber => 'اسمك ورقم موبايلك';

  @override
  String get calMoneyPreferences => 'تفضيلات الفلوس';

  @override
  String get calWhenYourFinancialMonthStarts => 'يوم بداية شهرك المالي';

  @override
  String get calSignedInDevices => 'الأجهزة اللي داخل منها';

  @override
  String get calSeeAndSignOutYour => 'شوف أجهزتك واخرج منها';

  @override
  String get calPersonalQuestions => 'أسئلة عنك';

  @override
  String get calHelpTheAssistantUnderstandYou => 'تساعد المساعد يفهمك أكتر';

  @override
  String get calDeleteMyAccount => 'امسح حسابي';

  @override
  String get calDeleteYourDataForGood => 'امسح بياناتك نهائيًا';

  @override
  String get calPlanAndRewards => 'الباقة والدعوات';

  @override
  String get calMyPlan => 'باقتي';

  @override
  String get calComparePlansAndManageYour => 'قارن الباقات واتحكم في اشتراكك';

  @override
  String get calShareYourInviteCode => 'شارك كود الدعوة بتاعك';

  @override
  String get calWhatTheAppStoresAbout => 'ما يخزنه التطبيق عني';

  @override
  String get calYourDataAndYourRights => 'بياناتك وحقوقك';

  @override
  String get calTermsAndPrivacy => 'الشروط والخصوصية';

  @override
  String get calTermsOfUseAndPrivacy => 'شروط الاستخدام وسياسة الخصوصية';

  @override
  String get calNotificationsAndAppearance => 'الإشعارات والشكل';

  @override
  String get calNotifications => 'الإشعارات';

  @override
  String get calAlertsAboutYourTransactionsAnd => 'تنبيهات عملياتك وميزانياتك';

  @override
  String get calNotificationSettings => 'إعدادات الإشعارات';

  @override
  String get calChooseWhatReachesYou => 'اختار اللي يوصلك';

  @override
  String get calAppearance => 'الشكل';

  @override
  String get calLightDarkOrLikeYour => 'فاتح، غامق، أو زي موبايلك';

  @override
  String get calHelp => 'المساعدة';

  @override
  String get calHelpCenter => 'مركز المساعدة';

  @override
  String get calCommonQuestionsAndSupportTickets =>
      'أسئلة شائعة وتواصل مع الدعم';

  @override
  String get calAboutSmartspend => 'عن SmartSpend';

  @override
  String get calVersionAndLicenses => 'الإصدار والتراخيص';

  @override
  String get monMonthlyBudgets => 'الميزانيات الشهرية';

  @override
  String get monAddABudget => 'ضيف ميزانية';

  @override
  String get monWeCanTLoadYour => 'مش قادرين نجيب ميزانياتك';

  @override
  String get monCheckYourConnectionAndTry => 'اتأكد من النت وجرّب تاني';

  @override
  String get monTryAgain => 'جرّب تاني';

  @override
  String get monNoBudgetsYet => 'لسه مفيش ميزانيات';

  @override
  String get monSetAMonthlyLimitFor =>
      'حدد سقف شهري لمصاريفك أو لفئة معينة، وتابع اللي فاضل أول بأول.';

  @override
  String get monAddAMonthlyBudget => 'ضيف ميزانية شهرية';

  @override
  String get monAllBudgets => 'إجمالي الميزانيات';

  @override
  String monSpentP0(String p0) {
    return 'صرفت: $p0';
  }

  @override
  String monOverByP0(String p0) {
    return 'زدت بـ $p0';
  }

  @override
  String monLeftP0(String p0) {
    return 'فاضل: $p0';
  }

  @override
  String get monBudgetDetails => 'تفاصيل الميزانيات';

  @override
  String get monEdit => 'عدّل';

  @override
  String get monDelete => 'امسح';

  @override
  String get monDeleteTheBudget => 'امسح الميزانية';

  @override
  String monDeleteTheBudgetP0(String p0) {
    return 'تمسح ميزانية \"$p0\"؟';
  }

  @override
  String get monCancel => 'إلغاء';

  @override
  String monBudgetP0Deleted(String p0) {
    return 'ميزانية \"$p0\" اتمسحت';
  }

  @override
  String get monUndo => 'تراجع';

  @override
  String monSpentP0OfP1(String p0, String p1) {
    return 'صرفت $p0 من $p1';
  }

  @override
  String monOverBudgetP0(String p0) {
    return 'زدت عن الميزانية ($p0%)';
  }

  @override
  String monAlmostUsedP0(String p0) {
    return 'قربت تخلص ($p0%)';
  }

  @override
  String monLeftP02(String p0) {
    return 'فاضل: $p0';
  }

  @override
  String get monOverallBudget => 'الميزانية العامة';

  @override
  String get monEnterTheMonthlyAmount => 'اكتب المبلغ الشهري';

  @override
  String get monWeCouldnTSaveIt => 'ما عرفناش نحفظ. جرّب تاني كمان شوية.';

  @override
  String get monEditTheBudget => 'عدّل الميزانية';

  @override
  String get monNewMonthlyBudget => 'ميزانية شهرية جديدة';

  @override
  String get monClose => 'اقفل';

  @override
  String get monCategory => 'الفئة';

  @override
  String get monOverallBudgetAllSpending => 'الميزانية العامة (كل المصاريف)';

  @override
  String get monBudgetName => 'اسم الميزانية';

  @override
  String get monLikeFoodAndDrink => 'زي: الأكل والشرب';

  @override
  String get monMonthlyLimit => 'الحد الشهري';

  @override
  String get monAlertMeAt => 'نبهني عند';

  @override
  String get monSaving => 'بنحفظ...';

  @override
  String get monSaveChanges => 'احفظ التعديلات';

  @override
  String get monAddTheBudget => 'ضيف الميزانية';

  @override
  String get monSavingGoals => 'أهداف التوفير';

  @override
  String get monNewGoal => 'هدف جديد';

  @override
  String get monWeCanTLoadYour2 => 'مش قادرين نجيب أهدافك';

  @override
  String get monNoSavingGoalsYet => 'لسه مفيش أهداف';

  @override
  String get monSetAGoalLikeUmrah =>
      'حدد هدف، زي عمرة أو لابتوب جديد أو فلوس للطوارئ، وتابعه خطوة بخطوة.';

  @override
  String get monCreateASavingGoal => 'اعمل هدف جديد';

  @override
  String get monCurrentGoals => 'أهدافك الحالية';

  @override
  String get monGoalsReached => 'أهداف حققتها';

  @override
  String get monPausedGoals => 'أهداف متوقفة';

  @override
  String monTargetP0(String p0) {
    return 'الهدف: $p0';
  }

  @override
  String get monSmartPlan => 'خطة ذكية';

  @override
  String monTargetDateP0P1P2(String p0) {
    return 'الميعاد: $p0';
  }

  @override
  String get monWeCouldnTRunThe =>
      'ما عرفناش نعمل التحليل. اتأكد من النت وجرّب تاني.';

  @override
  String get monCongratulations => 'ألف مبروك!';

  @override
  String monYouReachedYourGoalP0(String p0) {
    return 'حققت هدف \"$p0\". خطوة كبيرة لقدام!';
  }

  @override
  String get monReached => 'اتحقق';

  @override
  String get monActive => 'شغال';

  @override
  String get monPaused => 'متوقف';

  @override
  String monDateP0P1P2(String p0) {
    return 'الميعاد: $p0';
  }

  @override
  String get monGoalAnalysis => 'تحليل الهدف';

  @override
  String get monRefresh => 'حدّث';

  @override
  String get monStepsToYourGoal => 'خطوات الوصول للهدف:';

  @override
  String get monSuggestedWeeklyActions => 'حاجات تعملها كل أسبوع:';

  @override
  String monLastAnalysisP0P1P2(String p0) {
    return 'آخر تحليل: $p0';
  }

  @override
  String get monRunTheAnalysisToGet =>
      'شغّل التحليل وهتاخد خطة مبنية على مصاريفك.';

  @override
  String get monGoalAnalysisComesWithPro => 'تحليل الأهداف متاح في باقة Pro.';

  @override
  String get monAnalyzing => 'بنحلل الهدف...';

  @override
  String get monAnalyzeThisGoal => 'حلل الهدف';

  @override
  String get monUpgradeToProForThe => 'اشترك في Pro للتحليل';

  @override
  String get monGoalReached => 'الهدف اتحقق!';

  @override
  String get monPause => 'وقّف مؤقتًا';

  @override
  String get monResumeTheGoal => 'كمّل الهدف';

  @override
  String get monDeleteTheGoal => 'امسح الهدف';

  @override
  String get monEnterANameForThe => 'اكتب اسم الهدف';

  @override
  String get monEnterTheTargetAmount => 'اكتب المبلغ المستهدف';

  @override
  String get monWeCouldnTCreateThe =>
      'ما عرفناش نعمل الهدف. اتأكد من النت وجرّب تاني.';

  @override
  String get monNewSavingGoal => 'هدف جديد';

  @override
  String get monGoalName => 'اسم الهدف';

  @override
  String get monLikeUmrahANewLaptop => 'زي: عمرة، لابتوب جديد، صيانة العربية';

  @override
  String get monTargetAmountRequired => 'المبلغ المستهدف (مطلوب)';

  @override
  String get monLike25000 => 'زي: 25000';

  @override
  String get monTargetDateOptional => 'ميعاد الهدف (اختياري)';

  @override
  String get monChooseADate => 'اختار ميعاد';

  @override
  String get monNotesOptional => 'ملاحظات (اختياري)';

  @override
  String get monAnythingThatHelpsYouRemember => 'أي حاجة تفكرك بخطتك...';

  @override
  String get monCreating => 'بنعمل الهدف...';

  @override
  String get monCreateTheGoal => 'اعمل الهدف';

  @override
  String get monClear => 'امسح';

  @override
  String get monVoiceRecordingNeedsInternetYou =>
      'التسجيل بالصوت محتاج نت. تقدر تكتب الجملة دلوقتي.';

  @override
  String get monWeNeedMicrophoneAccessTo =>
      'محتاجين إذن المايك علشان تسجل بصوتك.';

  @override
  String get monWeCouldnTStartRecording => 'ما عرفناش نبدأ التسجيل. جرّب تاني.';

  @override
  String get monRecordingCancelled => 'التسجيل اتلغى';

  @override
  String get monBalance => 'رصيد';

  @override
  String get monSeconds => 'ثانية';

  @override
  String get monPlan => 'باقة';

  @override
  String get monWeCouldnTProcessThe => 'ما عرفناش نقرا التسجيل. جرّب تاني.';

  @override
  String get monWeCouldnTHearAny => 'ما سمعناش مصروف في التسجيل.';

  @override
  String get monVoiceRecording => 'تسجيل صوتي';

  @override
  String get monModeSingleTap => 'الوضع: ضغطة واحدة';

  @override
  String get monModeHold => 'الوضع: ضغطة طويلة';

  @override
  String get monPhotographAReceipt => 'صوّر فاتورة';

  @override
  String get monSlideToCancel => 'اسحب للإلغاء';

  @override
  String get monCancelRecording => 'ألغي التسجيل';

  @override
  String get monListeningToTheRecording => 'بنسمع التسجيل...';

  @override
  String get monStopRecording => 'وقّف التسجيل';

  @override
  String get monRecordByVoiceTapTo => 'سجّل بصوتك (دوس للبدء)';

  @override
  String get monRecordByVoiceHold => 'سجّل بصوتك (دوس مطوّل)';

  @override
  String get monHoldTheMicToRecord => 'دوس مطوّل على المايك علشان تسجل';

  @override
  String get monReadingReceiptsNeedsInternet => 'قراءة الفواتير محتاجة نت.';

  @override
  String get monWeCanTOpenThe =>
      'مش قادرين نفتح الكاميرا. اسمح بالوصول من إعدادات الموبايل، أو اختار صورة من المعرض.';

  @override
  String get monThisPhotoIsTooLarge =>
      'الصورة كبيرة قوي. جرّب صورة تانية أقرب للفاتورة.';

  @override
  String get monThePhotoIsnTClear =>
      'الصورة مش واضحة أو مش قادرين نقرا المبلغ. جرّب في نور أحسن.';

  @override
  String get monReceipt => 'فاتورة';

  @override
  String get monThePhotoIsnTClear2 =>
      'الصورة مش واضحة. جرّب صورة أوضح في نور أحسن.';

  @override
  String get monReadingTheReceipt => 'بنقرا الفاتورة...';

  @override
  String get monFindingTheAmountAndDetails => 'بنطلع المبلغ والتفاصيل';

  @override
  String get monReviewTheReceipt => 'راجع الفاتورة';

  @override
  String get monReceiptTotal => 'إجمالي الفاتورة';

  @override
  String get monCategory2 => 'الفئة:';

  @override
  String monDetailsP0(String p0) {
    return 'البيان: $p0';
  }

  @override
  String get monSave => 'احفظ';

  @override
  String get monEditInTheBox => 'عدّل في الخانة';

  @override
  String get monPhotographTheReceipt => 'صوّر الفاتورة';

  @override
  String get monTakeAPhotoOfThe =>
      'صوّر الفاتورة أو اختار صورتها من المعرض، وإحنا هنقراها لك.';

  @override
  String get monCamera => 'الكاميرا';

  @override
  String get monTakeAClearPhotoOf => 'صوّر الفاتورة صورة واضحة';

  @override
  String get monChooseFromTheGallery => 'اختار من المعرض';

  @override
  String get monPickAPhotoSavedOn => 'اختار صورة من موبايلك';

  @override
  String get monRecordByVoice => 'سجّل مصاريفك بصوتك';

  @override
  String get monToRecordYourSpendingBy =>
      'علشان تسجل بصوتك محتاجين إذن المايك. صوتك بيتحول لنص وما بيتحفظش.';

  @override
  String get monAllowTheMicrophone => 'اسمح بالمايك';

  @override
  String get monNotNow => 'مش دلوقتي';

  @override
  String get monHowYouSpend => 'طريقة صرفك';

  @override
  String get monRecordMoreThisMonthTo =>
      'سجّل مصاريف أكتر الشهر ده علشان طريقتك تبان بوضوح.';

  @override
  String get monYourSpendingJumpsOnCertain =>
      'مصاريفك بتقفز في أيام معينة، مش متوزعة بالتساوي.';

  @override
  String get monYourSpendingRisesOnWeekends =>
      'مصاريفك بتزيد في الويك إند والمناسبات.';

  @override
  String get monMostOfYourSpendingGoes => 'معظم مصاريفك رايحة لفئة واحدة.';

  @override
  String get monFrequentPurchasesWithoutPlanning =>
      'مشتريات متكررة من غير تخطيط.';

  @override
  String get monYouSpendCautiouslyAndKeep => 'بتصرف بحرص ومحافظ على مبلغ أمان.';

  @override
  String get monYouStickToYourBudget => 'ملتزم بميزانيتك ومصاريفك منظمة.';

  @override
  String get monYourSpendingIsBalancedWith => 'مصاريفك متوازنة ومفيهاش قفزات.';

  @override
  String monYourBiggestSpendingDayP0(String p0, String p1) {
    return 'أكتر يوم بتصرف فيه: $p0 ($p1)';
  }

  @override
  String get monYourSpendingByWeekday => 'مصاريفك حسب أيام الأسبوع';

  @override
  String get monSpendingDays => 'أيام الصرف';

  @override
  String monChartOfSpendingByWeekday(String p0, String p1) {
    return 'رسم مصاريف أيام الأسبوع. أعلى يوم $p0 بمبلغ $p1.';
  }

  @override
  String get monChartOfSpendingByWeekday2 => 'رسم مصاريف أيام الأسبوع.';

  @override
  String get monRecordMoreToSeeYour => 'سجّل مصاريف أكتر علشان تعرف أيام صرفك.';

  @override
  String get monMonthlyBudget => 'الميزانية الشهرية';

  @override
  String get monSetAMonthlyBudgetTo =>
      'حدد ميزانية شهرية علشان تعرف فاضل معاك كام أول بأول.';

  @override
  String get monSetABudget => 'حدد ميزانية';

  @override
  String get monOverallMonthlyBudget => 'الميزانية الشهرية العامة';

  @override
  String get monComparedWithYourRecordedMonthly =>
      'مقارنة بدخلك الشهري المسجل (مفيش ميزانية)';

  @override
  String get monComparedWithThisMonthS => 'مقارنة بدخل الشهر ده';

  @override
  String get monBudgetAndSpending => 'الميزانية والصرف';

  @override
  String monSpentP02(String p0) {
    return 'صرفت: $p0';
  }

  @override
  String monOverBudgetByP0(String p0) {
    return 'زدت عن الميزانية بـ $p0';
  }

  @override
  String monLeftP03(String p0) {
    return 'فاضل: $p0';
  }

  @override
  String get monRecordedAutomatically => 'اللي اتسجل تلقائيًا';

  @override
  String get monFromBanksAndWallets => 'من البنوك والمحافظ';

  @override
  String get monByHandOrCash => 'يدوي أو كاش';

  @override
  String get monTheseCameFromYourBank => 'دول جايين من رسايل البنك والمحفظة.';

  @override
  String get monMoneyWithPeople => 'فلوس مع الناس';

  @override
  String get monNoDebtsOrLoansYet =>
      'لسه مفيش ديون أو سلف. قول أو اكتب: \"سلفت أحمد 200 جنيه\".';

  @override
  String get monMoneyWithPeopleDebtsAnd => 'فلوس مع الناس (ديون وسلف)';

  @override
  String get monOwedToYou => 'ليك برّه';

  @override
  String get monYouOwe => 'عليك للناس';

  @override
  String monOwesYouP0(String p0) {
    return 'ليك $p0';
  }

  @override
  String monYouOweP0(String p0) {
    return 'عليك $p0';
  }

  @override
  String get monSeeAllPeopleAndDebts => 'شوف كل الناس والديون';

  @override
  String monThisYearYourHighestMonth(String p0, String p1) {
    return 'السنة دي: أعلى شهر صرف كان $p0 ($p1)';
  }

  @override
  String monYourSpendingInP0(String p0) {
    return 'مصاريفك في $p0';
  }

  @override
  String monThisYearP0(String p0) {
    return 'السنة دي ($p0)';
  }

  @override
  String monChartOfTheYearS(String p0) {
    return 'رسم مصاريف السنة. الإجمالي $p0.';
  }

  @override
  String get monYourSmartProfileAndPrivacy => 'ملفك الذكي وخصوصيتك';

  @override
  String get monWhatTheAppLearnedAbout =>
      'اللي التطبيق اتعلمه عنك بيستخدم لخدمتك بس، وتقدر تغيره من هنا.';

  @override
  String monYourSavedPaydayDayP0(String p0) {
    return 'يوم القبض المحفوظ: يوم $p0 من كل شهر.';
  }

  @override
  String get aiWeCanTRunThe => 'ما عرفناش نعمل التحليل السنوي دلوقتي.';

  @override
  String get aiConfirmIt => 'أكد العملية';

  @override
  String get aiDone => 'اتعملت';

  @override
  String get aiItDidnTGoThrough => 'ما اتعملتش. جرّب تاني.';

  @override
  String get aiConfirmASensitiveAction => 'تأكيد لعملية حساسة';

  @override
  String aiThisActionP0CanT(String p0) {
    return 'العملية دي ($p0) مش سهل ترجع فيها.';
  }

  @override
  String aiToConfirmTypeExactlyP0(String p0) {
    return 'علشان تأكد، اكتب بالظبط:\n«$p0»';
  }

  @override
  String get aiCancel => 'إلغاء';

  @override
  String get aiConfirm => 'أكد';

  @override
  String get aiSensitive => 'حساسة';

  @override
  String aiDateP0(String p0) {
    return 'التاريخ: $p0';
  }

  @override
  String get aiDoneAndYourRecordsAre => 'اتعملت وحساباتك اتحدثت.';

  @override
  String get aiCancelled => 'اتلغت.';

  @override
  String get aiThisHasExpiredAndCan => 'المدة انتهت، ومش هينفع تتنفذ.';

  @override
  String get aiContinue => 'كمّل التأكيد';

  @override
  String get aiConfirm2 => 'أكد';

  @override
  String get aiLiveCall => 'المكالمة المباشرة';

  @override
  String get aiTheLiveCallComesWith => 'المكالمة المباشرة متاحة في باقة Pro.';

  @override
  String get aiUpgrade => 'رقّي باقتك';

  @override
  String get aiStartALiveCall => 'ابدأ مكالمة مباشرة';

  @override
  String get aiWeLlUseTheMicrophone => 'هنستخدم المايك علشان تكلم المساعد.';

  @override
  String get aiCall => 'اتصل';

  @override
  String get aiWeCouldnTStartThe => 'ما عرفناش نبدأ المكالمة.';

  @override
  String get aiAiCenter => 'مركز AI';

  @override
  String get aiLiveCall2 => 'مكالمة مباشرة';

  @override
  String get aiWhatTheAssistantRemembers => 'ذاكرة المساعد';

  @override
  String get aiPastConversations => 'المحادثات اللي فاتت';

  @override
  String get aiChat => 'المحادثة';

  @override
  String get aiMonthlyReport => 'الشهر';

  @override
  String get aiCompareMonths => 'قارن';

  @override
  String get aiCalls => 'المكالمات';

  @override
  String get aiYearlyReport => 'السنة';

  @override
  String get aiWeNeedInternetToAnswer =>
      'محتاجين نت علشان نرد عليك. اللي كتبته محفوظ.';

  @override
  String get aiYouReOfflineYourDraft =>
      'إنت من غير نت. اللي كتبته محفوظ، وابعته لما النت يرجع.';

  @override
  String get aiUpgradeToPro => 'اشترك في Pro';

  @override
  String get aiWeCanTLoadYour => 'مش قادرين نجيب رسايلك.';

  @override
  String get aiAskAboutYourSpending => 'اسأل عن مصاريفك...';

  @override
  String get aiSendingNeedsInternet => 'الإرسال محتاج نت...';

  @override
  String get aiHiIMYourAssistant => 'أهلًا، أنا مساعدك';

  @override
  String get aiAskAboutYourSpendingOr =>
      'اسألني عن مصاريفك أو ميزانيتك، أو قولّي أسجل حاجة.';

  @override
  String get aiTryAsking => 'جرّب تسأل:';

  @override
  String get aiThinking => 'بيفكر...';

  @override
  String get aiCompareTwoMonths => 'قارن شهرين';

  @override
  String get aiPickTwoDifferentMonthsTo =>
      'اختار شهرين مختلفين تشوف إيه اللي اتغير وليه.';

  @override
  String get aiFirstMonth => 'الشهر الأول:';

  @override
  String get aiSecondMonth => 'الشهر التاني:';

  @override
  String get aiPickTwoDifferentMonths => 'اختار شهرين مختلفين.';

  @override
  String get aiWeCouldnTCompareThem => 'ما عرفناش نقارن.';

  @override
  String aiComparisonP0AndP1(String p0, String p1) {
    return 'المقارنة ($p0 و$p1)';
  }

  @override
  String get aiBiggestChangesByCategory => 'أكبر تغييرات في الفئات:';

  @override
  String get aiCategory => 'فئة';

  @override
  String get aiNewChat => 'محادثة جديدة';

  @override
  String get aiWeCanTLoadYour2 => 'مش قادرين نجيب محادثاتك.';

  @override
  String get aiNoPastConversations => 'مفيش محادثات قبل كده';

  @override
  String get aiStartANewChatWith => 'ابدأ محادثة جديدة مع المساعد';

  @override
  String get aiConversation => 'محادثة';

  @override
  String aiP0P1Messages(String p0, String p1) {
    return '$p0 • $p1 رسالة';
  }

  @override
  String get aiDeleteTheConversation => 'امسح المحادثة';

  @override
  String aiDeleteTheConversationP0(String p0) {
    return 'تمسح محادثة «$p0»؟';
  }

  @override
  String get aiDelete => 'امسح';

  @override
  String get aiWhatTheAssistantRemembers2 => 'ذاكرة المساعد';

  @override
  String get aiClearAll => 'امسح الكل';

  @override
  String get aiTheAssistantKeepsAFew =>
      'المساعد بيحفظ شوية حاجات أساسية عن عاداتك وأولوياتك علشان ردوده تناسبك، وتقدر تمسح أي حاجة منها هنا.';

  @override
  String get aiWeCanTLoadThe => 'مش قادرين نجيب الذاكرة.';

  @override
  String get aiTheAssistantDoesnTKnow => 'المساعد لسه ما يعرفش تفاصيل عنك';

  @override
  String get aiTheMoreYouTalkThe => 'كل ما تتكلم معاه أكتر، هيفتكر أكتر.';

  @override
  String get aiForgetThis => 'انسى المعلومة دي';

  @override
  String get aiRemovedFromTheAssistantS => 'اتمسحت من ذاكرة المساعد.';

  @override
  String get aiClearAllMemories => 'امسح كل الذاكرة';

  @override
  String get aiDeleteEverythingSavedTheAssistant =>
      'تمسح كل اللي اتحفظ؟ المساعد هيبدأ يتعلمك من الأول.';

  @override
  String get aiWeCouldnTUpdateThe => 'ما عرفناش نحدث التقرير.';

  @override
  String get aiExportTheReport => 'صدّر التقرير';

  @override
  String get aiWeCouldnTExportThe => 'ما عرفناش نصدر التقرير.';

  @override
  String get aiPreviousMonth => 'الشهر اللي فات';

  @override
  String get aiNextMonth => 'الشهر الجاي';

  @override
  String get aiAnalyzeAgain => 'حلل تاني';

  @override
  String get aiWeCanTLoadThe2 => 'مش قادرين نجيب التقرير.';

  @override
  String get aiLimitedDataRecordMoreThis =>
      'بيانات قليلة: سجّل عمليات أكتر الشهر ده علشان التقرير يبقى أوضح.';

  @override
  String get aiThisMonthSAnalysis => 'تحليل الشهر';

  @override
  String get aiTopConfirmedSpending => 'أعلى بنود الصرف:';

  @override
  String get aiGeneral => 'عام';

  @override
  String get aiYearlyReport2 => 'التقرير السنوي';

  @override
  String aiP0Summary(String p0) {
    return 'ملخص $p0';
  }

  @override
  String get aiNotEnoughDataForThis => 'مفيش بيانات كفاية للسنة دي.';

  @override
  String get aiWeCanTLoadYour3 => 'مش قادرين نجيب مكالماتك.';

  @override
  String get aiTryAgain => 'جرّب تاني';

  @override
  String get aiNoPastCalls => 'مفيش مكالمات قبل كده';

  @override
  String get aiTalkToTheAssistantIn => 'اتكلم مع المساعد بطريقتك عن فلوسك.';

  @override
  String get aiStartANewCall => 'ابدأ مكالمة جديدة';

  @override
  String aiP0MinP1Sec(String p0, String p1) {
    return '$p0 دقيقة و$p1 ثانية';
  }

  @override
  String aiP0Sec(String p0) {
    return '$p0 ثانية';
  }

  @override
  String get aiVoiceCall => 'مكالمة صوتية';

  @override
  String aiDurationP0(String p0) {
    return 'المدة: $p0';
  }

  @override
  String get aiNewCall => 'مكالمة جديدة';

  @override
  String get aiYourPrivacyNeitherTheAudio =>
      'خصوصيتك: الصوت ونص المكالمة مش بيتحفظوا.';

  @override
  String get aiCallEnded => 'المكالمة خلصت';

  @override
  String get aiTheAudioIsNotRecorded =>
      'الصوت مش بيتسجل ولا بيتحفظ بعد المكالمة.';

  @override
  String get aiReady => 'جاهز';

  @override
  String get aiConnecting => 'بنوصل...';

  @override
  String get aiListeningGoAhead => 'سامعينك، اتكلم...';

  @override
  String get aiThinking2 => 'بيفكر...';

  @override
  String get aiTheAssistantIsSpeaking => 'المساعد بيتكلم...';

  @override
  String get aiPleaseConfirmTheSuggestedAction => 'أكد العملية المقترحة';

  @override
  String get aiReconnecting => 'بنوصل تاني...';

  @override
  String get aiDone2 => 'اتعملت';

  @override
  String get aiCancelled2 => 'اتلغت';

  @override
  String get aiAddACategory => 'ضيف فئة للمشروع';

  @override
  String get aiCategoryNameLikeStockShop =>
      'اسم الفئة (زي: بضاعة، إيجار المحل)';

  @override
  String get aiExpense => 'مصروف';

  @override
  String get aiIncomeOrSales => 'إيراد أو مبيعات';

  @override
  String get aiIcon => 'الأيقونة';

  @override
  String get aiAddTheCategory => 'ضيف الفئة';

  @override
  String get aiEnterTheBusinessNameFirst => 'اكتب اسم المشروع الأول';

  @override
  String get aiWeCouldnTSuggestCategories => 'ما عرفناش نقترح فئات. جرّب تاني.';

  @override
  String get aiYourWorkAccountIsOn => 'حساب الشغل اتفعّل';

  @override
  String get aiWeCouldnTCreateThe => 'ما عرفناش نعمل المشروع.';

  @override
  String get aiDeleteTheWorkAccount => 'تمسح حساب الشغل؟';

  @override
  String get aiIfYouDeleteTheWork =>
      'لو مسحت حساب الشغل:\n• عملياتك هتفضل محفوظة وهتتنقل لحسابك الشخصي.\n• فئاته وقواعده هتتمسح.\n• المسح مابيترجعش.';

  @override
  String get aiConfirmDelete => 'أكد المسح';

  @override
  String get aiWorkAccountDeletedAndIts =>
      'حساب الشغل اتمسح وعملياته اتنقلت للشخصي';

  @override
  String get aiWeCanTDeleteThe => 'مش قادرين نمسح المشروع دلوقتي.';

  @override
  String get aiWorkAccount => 'حساب الشغل';

  @override
  String get aiTheWorkAccountComesWith => 'حساب الشغل متاح في باقة Pro';

  @override
  String get aiKeepYourBusinessSSpending =>
      'افصل مصاريف وإيرادات مشروعك عن مصاريف بيتك.';

  @override
  String get aiUpgradingFromTheAppIs => 'الاشتراك من التطبيق هيتاح قريب';

  @override
  String get aiUpgradeToPro2 => 'اشترك في Pro';

  @override
  String get aiRestaurantsAndFood => 'مطاعم وأكل';

  @override
  String get aiTradeAndRetail => 'تجارة وقطاعي';

  @override
  String get aiServicesAndWorkshops => 'خدمات وورش';

  @override
  String get aiFreelanceAndCompanies => 'شغل حر وشركات';

  @override
  String get aiSomethingElse => 'نوع تاني';

  @override
  String get aiSetUpTheWorkAccount => 'جهز حساب الشغل';

  @override
  String get aiMakeASeparateAccountFor => 'اعمل حساب منفصل لشغلك أو محلك.';

  @override
  String get aiBusinessOrShopName => 'اسم المشروع أو المحل';

  @override
  String get aiField => 'مجال المشروع';

  @override
  String get aiShortDescriptionOptional => 'وصف قصير (اختياري)';

  @override
  String get aiSuggestCategories => 'اقترح فئات';

  @override
  String get aiSuggestedCategoriesReviewThem => 'فئات مقترحة (راجعها)';

  @override
  String get aiChooseTheOnesThatFit => 'اختار اللي يناسب شغلك:';

  @override
  String get aiIncomeAndSales => 'إيراد ومبيعات';

  @override
  String get aiExpenses => 'مصروفات';

  @override
  String get aiCreateTheWorkAccount => 'اعمل حساب الشغل';

  @override
  String get aiCurrentWorkAccount => 'حساب الشغل الحالي';

  @override
  String get aiSwitchedToTheWorkAccount => 'اتحولت لحساب الشغل';

  @override
  String get aiSwitchedToPersonal => 'اتحولت للشخصي';

  @override
  String get aiYouReInTheWork =>
      'إنت دلوقتي في حساب الشغل. العمليات الجديدة هتتسجل فيه.';

  @override
  String get aiYouReInPersonalMode =>
      'إنت في الوضع الشخصي. شغّل المفتاح علشان تسجل لشغلك.';

  @override
  String aiBusinessCategoriesP0(String p0) {
    return 'فئات المشروع ($p0)';
  }

  @override
  String get aiIncome => 'إيراد';

  @override
  String get aiDeleteTheCategory => 'امسح الفئة';

  @override
  String get aiAddANewCategory => 'ضيف فئة جديدة';

  @override
  String get aiBusinessPeopleAndSuppliers => 'ناس وموردين المشروع';

  @override
  String aiSuppliersAndCustomersP0(String p0) {
    return 'عدد الموردين والعملاء: $p0';
  }

  @override
  String get aiLinkAnyoneToTheBusiness =>
      'تقدر تربط أي شخص بالمشروع علشان تتابع المستحقات.';

  @override
  String get aiManageContactsAndSuppliers => 'ظبط الناس والموردين';

  @override
  String get aiDeleteTheWorkAccount2 => 'امسح حساب الشغل';

  @override
  String get aiEnterThePersonSName => 'اكتب اسم الشخص الأول';

  @override
  String get aiWeCouldnTAddThem => 'ما عرفناش نضيفه. اتأكد من النت وجرّب تاني.';

  @override
  String get aiAddANewPerson => 'ضيف شخص جديد';

  @override
  String get aiSoYouCanRecordSpending =>
      'علشان تسجل معاه مصاريف أو سلف أو ديون بسهولة.';

  @override
  String get aiName => 'اسم الشخص *';

  @override
  String get aiLikeMohamedIbrahimOrAhmed =>
      'زي: محمد إبراهيم أو أحمد الكهربائي';

  @override
  String get aiRelationOptional => 'صلة القرابة أو الوصف (اختياري)';

  @override
  String get aiLikeColleagueFriendBrother => 'زي: زميل شغل، صاحبي، أخويا...';

  @override
  String get aiSaving => 'بنحفظ...';

  @override
  String get aiSaveThePerson => 'احفظ الشخص';

  @override
  String get aiPeopleAndDebts => 'الناس والديون';

  @override
  String get aiAddAPerson => 'ضيف شخص';

  @override
  String get aiWeCanTLoadYour4 => 'مش قادرين نجيب الناس والديون.';

  @override
  String get aiSearchByNameOrRelation => 'دوّر بالاسم أو صلة القرابة...';

  @override
  String get aiOpenBalances => 'حسابات مفتوحة';

  @override
  String get aiNoResults => 'مفيش نتايج';

  @override
  String get aiNoOpenDebtsAllSettled => 'مفيش ديون مفتوحة، كله متصفي.';

  @override
  String get aiSettled => 'حسابات متصفية';

  @override
  String get aiNoResults2 => 'مفيش نتايج';

  @override
  String get aiNoSettledAccountsYet => 'لسه مفيش حسابات متصفية.';

  @override
  String get aiNetMoneyOut => 'صافي الفلوس برّه';

  @override
  String get aiOwedToYou => 'ليك برّه';

  @override
  String get aiYouOwe => 'عليك برّه';

  @override
  String get aiMergeWithADuplicate => 'ادمج مع شخص مكرر';

  @override
  String get aiDeleteThePerson => 'امسح الشخص';

  @override
  String aiDeleteP0(String p0) {
    return 'تمسح \"$p0\"؟';
  }

  @override
  String get aiTheirRecordedTransactionsStayOnly =>
      'العمليات المسجلة معاه هتفضل، والشخص بس اللي هيتمسح.';

  @override
  String get aiDeleting => 'بنمسح...';

  @override
  String get aiDelete2 => 'امسح';

  @override
  String get aiMergeDuplicates => 'ادمج المكررين';

  @override
  String get aiChooseTheNameToKeep =>
      'اختار الاسم اللي هيفضل، وكل العمليات هتتنقل عليه.';

  @override
  String get aiNoOtherContactsToMerge => 'مفيش حد تاني تدمج معاه.';

  @override
  String aiChooseWhoToMergeWith(String p0) {
    return 'اختار الشخص اللي هيتدمج مع \"$p0\":';
  }

  @override
  String get aiChooseAContact => 'اختار شخص';

  @override
  String get aiWhichNameStays => 'أنهي اسم يفضل؟';

  @override
  String get aiThisNameStaysAndAll => 'الاسم ده هيفضل وكل العمليات هتتنقل عليه';

  @override
  String get aiMerging => 'بندمج...';

  @override
  String get aiConfirmMerge => 'أكد الدمج';

  @override
  String get aiWeCouldnTMergeThem => 'ما عرفناش ندمج. جرّب تاني.';

  @override
  String appDayP0OfTheMonth(String p0) {
    return 'يوم $p0 في الشهر';
  }

  @override
  String get appStartOfMonth => 'أول الشهر';

  @override
  String get appEndOfMonth => 'آخر الشهر';

  @override
  String get appWeCouldnTSaveYour => 'ما عرفناش نحفظ إجابتك.';

  @override
  String get appBack => 'رجوع';

  @override
  String get appWriteYourAnswerHere => 'اكتب إجابتك هنا...';

  @override
  String get appEnterAValidEgyptianMobile =>
      'اكتب رقم موبايل مصري صحيح: 11 رقم بيبدأ بـ 01';

  @override
  String get appEnterThe6DigitCode => 'اكتب الكود المكون من 6 أرقام';

  @override
  String appYouCanAskForA(String p0) {
    return 'تقدر تطلب كود جديد بعد $p0 ثانية';
  }

  @override
  String get appSignedOutOfThatDevice => 'الجهاز ده خرج من حسابك';

  @override
  String get appTryAgain => 'جرّب تاني';

  @override
  String get appNoSessionsRecorded => 'مفيش أجهزة متسجلة';

  @override
  String get appEnterAValidEgyptianMobile2 =>
      'اكتب رقم موبايل مصري صحيح بيبدأ بـ 01';

  @override
  String get appWeCanTSendA =>
      'مش قادرين نبعت كود دلوقتي. تأكد من النت وجرّب تاني.';

  @override
  String get appEnterThe6DigitCode2 => 'اكتب الكود المكون من 6 أرقام';

  @override
  String get appThatCodeDidnTWork => 'الكود ده ما نفعش.';

  @override
  String get appThePasswordMustBeAt => 'الباسورد لازم يكون 6 حروف على الأقل';

  @override
  String get appTheTwoPasswordsDonT => 'الباسوردين مش زي بعض';

  @override
  String get appWeCouldnTChangeThe => 'ما عرفناش نغير الباسورد.';

  @override
  String get appEnterYourRegisteredNumberAnd =>
      'اكتب رقمك المسجل وهنبعتلك كود على واتساب:';

  @override
  String get appEnterThe6DigitCode3 => 'اكتب الكود اللي وصلك على واتساب:';

  @override
  String get appConfirmTheCode => 'أكد الكود';

  @override
  String get appChooseANewPassword => 'اختار باسورد جديد:';

  @override
  String get appThisMonth => 'الشهر ده';

  @override
  String get appLast3Months => 'آخر 3 شهور';

  @override
  String get appEverythingFromTheStart => 'كل العمليات من الأول';

  @override
  String get appCsvFileSpreadsheet => 'ملف CSV (جداول)';

  @override
  String get appExcelFileXlsx => 'ملف Excel (.xlsx)';

  @override
  String get appJsonFile => 'ملف JSON';

  @override
  String get appWeCouldnTPrepareThe =>
      'مقدرناش نجهز الملف دلوقتي. اتأكد من النت وجرّب تاني.';

  @override
  String get appExportMyData => 'صدّر بياناتك';

  @override
  String get appYourDataIsAlwaysYours => 'بياناتك بتاعتك دايمًا';

  @override
  String get appDownloadEverythingYouRecordedIn =>
      'نزّل كل اللي سجلته في ملف تقدر تفتحه على الكمبيوتر.';

  @override
  String get appPeriod => 'الفترة';

  @override
  String get appFileType => 'نوع الملف';

  @override
  String get appYouHaveTheRightTo =>
      'من حقك توصل لبياناتك طبقًا لقانون 151 لسنة 2020.';

  @override
  String get appTheFileIsReady => 'الملف جاهز';

  @override
  String get appPreparingTheFile => 'بنجهز الملف...';

  @override
  String get appExportTheFile => 'صدّر الملف';

  @override
  String get appTermsOfService => 'شروط الخدمة';

  @override
  String get appDataAndPrivacy => 'البيانات والخصوصية';

  @override
  String get app2026SmartspendAiEgypt => '© 2026 SmartSpend AI، مصر';

  @override
  String appPleaseUpdateTheAppFrom(String p0) {
    return 'حدّث التطبيق من المتجر: $p0';
  }

  @override
  String get appPleaseUpdateTheApp => 'لازم تحدّث التطبيق';

  @override
  String get appThisVersionIsNoLonger =>
      'النسخة دي ما بقتش مدعومة. حدّث علشان بياناتك تفضل في أمان.';

  @override
  String appMinimumVersionP0(String p0) {
    return 'أقل نسخة مطلوبة: $p0';
  }

  @override
  String get appYouReOfflineYourSaved =>
      'إنت من غير نت. بياناتك المحفوظة موجودة.';

  @override
  String get appUpdateNow2 => 'حدّث دلوقتي';

  @override
  String get appContinueOffline => 'كمّل من غير نت';

  @override
  String get appThisPageExplainsWhatThe =>
      'الصفحة دي بتوضح التطبيق بيحتفظ بإيه عنك وحقوقك طبقًا لقانون 151 لسنة 2020.';

  @override
  String get appYouReOfflineChangesSave =>
      'إنت من غير نت. التغييرات بتتحفظ هنا وبتتبعت بعدين.';

  @override
  String get appConnectionError => 'مشكلة في الاتصال.';

  @override
  String get appHaveMonthlyInstallmentsFollowThem =>
      'عندك أقساط شهرية؟ تابعها من هنا';

  @override
  String get appAddAnInstallment => 'ضيف قسط';

  @override
  String appInstallmentsP0(String p0) {
    return 'الأقساط ($p0)';
  }

  @override
  String appP0Month(String p0) {
    return '$p0 / شهر';
  }

  @override
  String get appInstallments => 'الأقساط';

  @override
  String get appWeCanTLoadYour => 'مش قادرين نجيب الأقساط دلوقتي.';

  @override
  String get appNoInstallmentsYet => 'لسه مفيش أقساط';

  @override
  String get appAddAnInstallmentAndWhenever =>
      'ضيف القسط، وكل ما تسجل «دفعت قسط فاليو 800» هنحسبه.';

  @override
  String get appAddYourFirstInstallment => 'ضيف أول قسط';

  @override
  String get appTotalMonthlyInstallments => 'إجمالي الأقساط الشهرية';

  @override
  String appP0ActiveInstallmentsP1Left(String p0, String p1) {
    return 'عندك $p0 أقساط شغالة · الباقي منها $p1';
  }

  @override
  String get appAllYourInstallmentsAreFinished =>
      'خلّصت كل الأقساط. مفيش حاجة شغالة دلوقتي.';

  @override
  String appActiveInstallmentsP0(String p0) {
    return 'الأقساط الشغالة ($p0)';
  }

  @override
  String appFinishedInstallmentsP0(String p0) {
    return 'الأقساط اللي خلصت ($p0)';
  }

  @override
  String get appDeleteTheInstallment => 'امسح القسط';

  @override
  String appDeleteP0ThisCanT(String p0) {
    return 'تمسح قسط «$p0»؟ المسح مابيترجعش.';
  }

  @override
  String get appCancel => 'إلغاء';

  @override
  String get appDelete => 'امسح';

  @override
  String get appWeCouldnTDeleteIt => 'ما عرفناش نمسح القسط. جرّب تاني.';

  @override
  String appTrackingWordP0(String p0) {
    return 'كلمة التتبع: «$p0»';
  }

  @override
  String appP0Month2(String p0) {
    return '$p0 / شهر';
  }

  @override
  String appAllPaidP0OfP1(String p0, String p1) {
    return 'خلصت كلها ($p0 من $p1)';
  }

  @override
  String appPaidP0OfP1(String p0, String p1) {
    return 'اتدفع $p0 من $p1';
  }

  @override
  String appP0Left(String p0) {
    return 'فاضل $p0';
  }

  @override
  String get appPaymentsShareANameWith =>
      'الدفعات اسمها شبه خطة تانية. اربطها بمواعيد القسط علشان تفرق بينهم.';

  @override
  String appAllPaidYouPaidP0(String p0) {
    return 'خلصت الأقساط كلها. دفعت $p0 في المجموع.';
  }

  @override
  String get appEnterANameAtLeast => 'اكتب اسم القسط (حرفين على الأقل)';

  @override
  String get appEnterTheMonthlyAmount => 'اكتب قيمة القسط الشهري';

  @override
  String get appEnterTheNumberOfInstallments =>
      'اكتب عدد الأقساط (قسط واحد على الأقل)';

  @override
  String get appPaidInstallmentsMustBeBetween =>
      'المدفوع لازم يكون بين 0 وإجمالي الأقساط';

  @override
  String get appWeCouldnTAddIt =>
      'ما عرفناش نضيف القسط. اتأكد من النت وجرّب تاني.';

  @override
  String get appSomethingWentWrongTryAgain => 'حصلت مشكلة. جرّب تاني.';

  @override
  String get appNewInstallment => 'قسط جديد';

  @override
  String get appClose => 'اقفل';

  @override
  String get appWheneverYouRecordSpendingWith =>
      'كل ما تسجل مصروف فيه كلمة القسط (زي «دفعت قسط فاليو 800») هنعدّه.';

  @override
  String get appName => 'اسم القسط *';

  @override
  String get appLikeValuPhoneOrThe => 'زي: موبايل فاليو أو قسط التكييف';

  @override
  String get appPaymentWordOptional => 'كلمة الدفع (اختياري)';

  @override
  String get appLikeValuEmptyUsesThe =>
      'زي: فاليو (لو سبتها فاضية هناخد اسم القسط)';

  @override
  String get appMonthlyAmount => 'القسط كام في الشهر *';

  @override
  String get appLike850 => 'زي: 850';

  @override
  String get appTotalInstallments => 'إجمالي الأقساط *';

  @override
  String get appLike12 => 'زي: 12';

  @override
  String get appAlreadyPaid => 'مدفوع منه كام';

  @override
  String get appSave => 'احفظ القسط';

  @override
  String get appYourPlanSMonthlyUsage => 'استهلاك باقتك الشهرية';

  @override
  String get appLimitReached => 'وصلت للحد';

  @override
  String get appAlmostUsed => 'قربت تخلص';

  @override
  String get appVoiceRecording => 'التسجيل الصوتي';

  @override
  String get appUnlimited => 'من غير حد';

  @override
  String appP0OfP1SecondsLeft(String p0, String p1) {
    return 'باقي $p0 ثانية من $p1';
  }

  @override
  String get appDailyAi => 'الذكاء الاصطناعي اليومي';

  @override
  String appP0OfP1Left(String p0, String p1) {
    return 'باقي $p0 عملية من $p1';
  }

  @override
  String get appUpgradeToPro => 'اشترك في Pro';

  @override
  String get appNotificationSettingsSaved => 'إعدادات الإشعارات اتحفظت';

  @override
  String get appAllowNotificationsFromTheApp => 'اسمح بالإشعارات من التطبيق';

  @override
  String get appChooseYourNotifications => 'اختار إشعاراتك';

  @override
  String get appWhenSpendingNearsABudget => 'لما مصاريفك تقرب من سقف الميزانية';

  @override
  String get appAQuietEveningReminderTo => 'تذكير هادي بالليل تسجل مصاريفك';

  @override
  String get appBeforeTheDayEndsTo =>
      'قبل ما اليوم يخلص علشان تحافظ على سلسلة التسجيل';

  @override
  String get appWhenYourMonthlyReportIs => 'لما تقريرك الشهري يجهز';

  @override
  String get appWeCanTCancelRight => 'مش قادرين نلغي دلوقتي.';

  @override
  String get appKeepMyPlan => 'سيب باقتي';

  @override
  String get appShareSmartspendWithYourFriends => 'شارك SmartSpend مع أصحابك';

  @override
  String get appInviteYourFriendsAndFamily =>
      'ادعي أصحابك وأهلك ينظموا مصاريفهم.';

  @override
  String get appLoading => 'بنحمّل...';

  @override
  String get appReadReceiptsWithTheCamera => 'قراءة الفواتير بالكاميرا';

  @override
  String get appKeepWorkApartFromPersonal =>
      'فصل حساب الشغل عن مصاريفك الشخصية';

  @override
  String get appGoalAnalysisAndTheDetailed => 'تحليل الأهداف والتقرير المفصل';

  @override
  String get appNoSponsoredCards => 'من غير إعلانات';

  @override
  String get appYourMonthlyReportOnWhatsapp => 'تقريرك الشهري على واتساب';

  @override
  String get appYouHaveAllOfPro => 'إنت معاك كل مميزات Pro.';

  @override
  String get appYouReOnTheFree => 'إنت على الباقة المجانية.';

  @override
  String get appSeasons => 'مواسم الصرف';

  @override
  String get appWeCanTLoadThis => 'مش قادرين نجيب الموسم دلوقتي.';

  @override
  String appP0ToP1P2More(String p0, String p1, String p2, String p3) {
    return 'من $p0 إلى $p1 · أكتر من السنة اللي فاتت بـ $p2%';
  }

  @override
  String appP0ToP1P2Less(String p0, String p1, String p2, String p3) {
    return 'من $p0 إلى $p1 · أقل من السنة اللي فاتت بـ $p2%';
  }

  @override
  String appP0ToP1SameAs(String p0, String p1, String p2) {
    return 'من $p0 إلى $p1 · نفس السنة اللي فاتت';
  }

  @override
  String appP0ToP1(String p0, String p1) {
    return 'من $p0 إلى $p1';
  }

  @override
  String appWhatP0CostYou(String p0) {
    return '$p0 كلفك كام';
  }

  @override
  String appNoSpendingInP0(String p0) {
    return 'مفيش مصاريف في $p0';
  }

  @override
  String appNothingRecordedFromP0To(String p0, String p1) {
    return 'مفيش حاجة متسجلة من $p0 إلى $p1.';
  }

  @override
  String get appByCategory => 'حسب الفئة';

  @override
  String appP0Transactions(String p0) {
    return '$p0 عملية';
  }

  @override
  String get appDaysInARow => 'يوم ورا بعض';

  @override
  String get appDaysInARow2 => 'يوم ورا بعض';

  @override
  String get appDaysInARow3 => 'يوم ورا بعض';

  @override
  String appYouRecordedP0P1(String p0, String p1) {
    return 'سجلت $p0 $p1';
  }

  @override
  String get appHowDoIRecordMy => 'إزاي أسجل مصاريفي؟';

  @override
  String get appTypeASentenceRecordYour =>
      'اكتب جملة، أو سجّل بصوتك، أو صوّر الفاتورة.';

  @override
  String get appIsMyFinancialDataSafe => 'بياناتي في أمان؟';

  @override
  String get appOnlyYourAccountCanReach =>
      'بياناتك مربوطة بحسابك بس، وتقدر تقفل التطبيق برمز أو بصمة.';

  @override
  String get appHowDoIChangeWhen => 'إزاي أغير بداية شهري؟';

  @override
  String get appFromMoreMoneyPreferencesChoose =>
      'من «المزيد» ثم «تفضيلات الفلوس» اختار يوم القبض.';

  @override
  String get appWhenWillSupportAnswer => 'الدعم بيرد إمتى؟';

  @override
  String get appOurTeamReadsEveryTicket =>
      'الفريق بيقرا كل طلب وبيرد في أقرب وقت.';

  @override
  String get appYourTicketWasSent => 'طلبك اتبعت';

  @override
  String get appWeCouldnTSendYour => 'ما عرفناش نبعت طلبك.';

  @override
  String get appWeCanTLoadYour2 => 'مش قادرين نجيب طلباتك.';

  @override
  String get appNoPastTickets => 'مفيش طلبات قبل كده';

  @override
  String get appPageNotFound => 'الصفحة مش موجودة';

  @override
  String get appThisPageIsnTHere => 'الصفحة اللي بتدور عليها مش موجودة';

  @override
  String get appTheLinkMayHaveChanged =>
      'الرابط ممكن يكون اتغير أو الصفحة اتمسحت.';

  @override
  String get appBackToHome => 'ارجع للرئيسية';

  @override
  String appActiveSince(String p0) {
    return 'نشط من $p0';
  }

  @override
  String appInstallmentLeft(String p0, String p1, String p2) {
    return '$p0: باقي $p1 من $p2';
  }

  @override
  String get aiSend => 'ابعت';

  @override
  String get cancelPlanAtStore =>
      'الاشتراك بيتلغي من المتجر اللي اشتركت منه، مش من التطبيق. هنفتحلك صفحة اشتراكاتك هناك، ودوس إلغاء على SmartSpend.';

  @override
  String get cancelPlanOpenStore => 'افتح اشتراكاتي في المتجر';

  @override
  String get settingsTitle => 'الإعدادات';

  @override
  String get settingsEntry => 'الإشعارات والشكل والأمان وبياناتك';

  @override
  String aiOpeningMonth(String p0, String p1) {
    return 'صرفت $p0 الشهر ده، وأكبر بند عندك $p1.';
  }

  @override
  String aiOpeningQuestion(String p0) {
    return 'إزاي أقلل صرفي على $p0؟';
  }

  @override
  String walletsStale(String p0) {
    return '$p0 من أرصدتك ما اتحدثتش من أكتر من أسبوع. حدّثها عشان حساباتك تفضل صح.';
  }

  @override
  String get calOldBalances => 'رقم المتاح مبني على رصيد قديم.';

  @override
  String get calUpdateBalances => 'حدّث';

  @override
  String get statsNextTitle => 'الخطوة الجاية';

  @override
  String statsNextBudget(String p0, String p1) {
    return 'ميزانية $p0 وصلت $p1%. راجعها قبل ما الشهر يخلص.';
  }

  @override
  String get statsNextBudgetAction => 'افتح الميزانيات';

  @override
  String statsNextFirstBudget(String p0) {
    return 'أكبر بند عندك $p0. حط له حد شهري ونبهك قبل ما تعدّيه.';
  }

  @override
  String get statsNextFirstBudgetAction => 'حط ميزانية';

  @override
  String statsNextAsk(String p0) {
    return 'أكبر بند عندك $p0. اسأل المساعد إزاي تقلله.';
  }

  @override
  String get statsNextAskAction => 'اسأل المساعد';

  @override
  String get aiOneQuestion => 'سؤال واحد يخليني أفهمك أحسن';

  @override
  String get aiOneQuestionBody => 'إجابتك بتخلي نصايحي على مقاسك.';

  @override
  String get aiChatStopped => 'المساعد متوقف مؤقتًا. تقدر تسجل مصاريفك عادي.';

  @override
  String get adLabel => 'إعلان';

  @override
  String get helpTicketAnswered => 'اترد عليها';

  @override
  String get helpTicketInProgress => 'بنراجعها';

  @override
  String get helpTicketWaiting => 'مستنية رد';

  @override
  String get helpTicketReply => 'رد فريق الدعم';

  @override
  String get captureAutomaticTitle => 'رسايل البنك';

  @override
  String get captureAutomaticBody =>
      'عملياتك بتتسجل تلقائيًا. البيانات الناقصة بتفضل منتظرة دليل واضح.';

  @override
  String get captureStateRecorded => 'اتسجلت';

  @override
  String get captureStateProcessing => 'بنقرأ الرسالة';

  @override
  String get captureStateWaiting => 'منتظرين بيانات تكمل العملية';

  @override
  String get captureStateHeld => 'محجوزة بسبب حد الباقة';

  @override
  String get captureStateRemoved => 'اتشالت';

  @override
  String get capturePurposeQuestion => 'تحب تحدد كانت في إيه؟';

  @override
  String get capturePurposeOptional => 'اختياري. العملية اتسجلت بالفعل.';

  @override
  String get capturePurposeCategory => 'الفئة';

  @override
  String get capturePurposeSubcategory => 'الفئة الفرعية';

  @override
  String get capturePurposeLabel => 'أو اكتب الغرض، زي مصاريف حضانة';

  @override
  String get capturePurposeSave => 'احفظ التصنيف';

  @override
  String get capturePurposeOwn => 'بين حساباتي';

  @override
  String get capturePurposeCardPayment => 'سداد بطاقتي';

  @override
  String get capturePurposeKeep => 'سيب التصنيف زي ما هو';

  @override
  String get capturePurposeSkip => 'تخطي';

  @override
  String get captureChangeFailed => 'ماقدرناش نحفظ التغيير، جرّب تاني.';

  @override
  String get captureFeeInvalid => 'اكتب رسوم صحيحة أو صفر.';

  @override
  String get capturePrincipalLabel => 'المبلغ قبل الرسوم';

  @override
  String get captureFeeLabel => 'الرسوم';

  @override
  String get captureAutomaticConsentBody =>
      'هنقرا رسايل البنوك والمحافظ المفعّلة بس ونبعتها لسيرفر SmartSpend. هنخفي الأرقام والأسماء اللي نقدر نحددها قبل ما مزوّد الذكاء الاصطناعي المعتمد يقرا كل رسالة. الأكواد والرسايل الشخصية المعروفة بتتفلتر. العملية اللي بياناتها واضحة بتتسجل تلقائيًا مع تراجع؛ والناقصة بتستنى. الرسايل المنقّحة وبيانات التصنيف المؤقتة بتتنسى بعد 30 يوم، والمحجوزة بسبب حد الباقة بعد 60 يوم. دفتر العمليات بيحتفظ بالتسجيلات. تقدر توقف الإرسال وتسحب موافقتك وتمسح بيانات الالتقاط من الإعدادات.';

  @override
  String get captureRenewConsent =>
      'التسجيل التلقائي محتاج موافقة جديدة على قراءة كل رسايل البنك المنقّحة.';

  @override
  String get captureAutomaticAiTitle => 'قراءة الذكاء الاصطناعي';

  @override
  String get captureAutomaticAiBody =>
      'كل رسالة بنك من المصادر المفعّلة بتمر على المزوّد المعتمد بعد إخفاء البيانات المكتشفة. إيقاف الاختيار بيوقف التسجيل التلقائي.';

  @override
  String get walletKindFailed => 'ماقدرناش نحفظ نوع الرصيد، جرّب تاني.';

  @override
  String get walletKindUnknown => 'مش محدد';

  @override
  String get walletKindCash => 'نقدي أو محفظة إلكترونية';

  @override
  String get walletKindBank => 'حساب بنكي';

  @override
  String get walletKindDebit => 'بطاقة خصم مباشر';

  @override
  String get walletKindCredit => 'بطاقة ائتمان';

  @override
  String get walletBalanceKindTitle => 'نوع الرصيد';

  @override
  String get walletBalanceKindBody =>
      'متاح الائتمان مش فلوس نقدية. تحديد النوع بيخلّي الرصيد وحساب المتاح أدق.';

  @override
  String get walletCreditAvailable => 'متاح الائتمان';

  @override
  String get capturePurposePerson => 'الشخص (اختياري)';

  @override
  String get captureAutomaticStopped =>
      'التسجيل التلقائي متوقف لحد ما توافق على القراءة. عملياتك المحفوظة موجودة وتقدر تعدّلها.';
}
