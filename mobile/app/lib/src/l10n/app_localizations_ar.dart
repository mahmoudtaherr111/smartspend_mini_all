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
      'هنقرا إشعارات تطبيقات البنوك والمحافظ ورسايلها بس. الرسايل الشخصية والأكواد مابتخرجش من موبايلك. الرسالة اللي فيها عملية بتروح للسيرفر عشان يفهمها، وأرقامها بتتخبّى، وبتتمسح بعد 30 يوم. ومفيش عملية بتتسجل غير لما توافق عليها.';

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
  String get captureAiReadingTitle =>
      'خلّي الذكاء الاصطناعي يقرا الرسايل المش واضحة';

  @override
  String get captureAiReadingBody =>
      'لو رسالة بنك ماعرفناش نقرا مبلغها أو نوعها، بنبعتها متخبّي منها أرقامك للذكاء الاصطناعي، وبنسألك قبل ما نسجّل حاجة.';

  @override
  String get captureAiReadingFailed => 'ماقدرناش نحفظ اختيارك. جرّب تاني.';

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
  String get referralLabel => 'كود دعوة (لو معاك)';

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
  String get summaryNet => 'الصافي';

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
  String get composerHint => 'اكتب اللي صرفته… مثلاً: قهوة 50 وأوبر 120';

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
  String get statsLastMonth => 'الشهر اللي فات';

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
}
