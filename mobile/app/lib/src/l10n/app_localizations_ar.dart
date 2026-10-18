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
      'التطبيق بيقرا إشعارات البنك والمحفظة ويسجّل المصروف لوحده.';

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
  String get verifyTitle => 'أكّد رقمك من واتساب';

  @override
  String get verifyBody =>
      'ابعت الكود ده لبوت SmartSpend من واتساب الرقم اللي كتبته. أول ما يوصل هنكمّل إنشاء حسابك.';

  @override
  String get verifyCodeLabel => 'كود التأكيد';

  @override
  String get verifySendOnWhatsApp => 'ابعته من واتساب';

  @override
  String get verifyCopyCode => 'انسخ الكود';

  @override
  String get verifyCodeCopied => 'الكود اتنسخ.';

  @override
  String get verifyWaiting => 'مستنيين رسالتك…';

  @override
  String verifyTimeLeft(String time) {
    return 'فاضل $time';
  }

  @override
  String get verifyWrongSender =>
      'الكود وصل من رقم واتساب غير الرقم اللي بتسجّل بيه. ابعته من نفس الرقم.';

  @override
  String get verifyExpired => 'وقت التأكيد خلص. اطلب كود جديد.';

  @override
  String get verifyDone => 'الرقم اتأكد. بنجهّز حسابك…';

  @override
  String get verifyBack => 'رجوع وتعديل';

  @override
  String get verifyBotUnavailable =>
      'بوت الواتساب مش شغّال دلوقتي. جرّب كمان شوية، أو ادخل بطريقة تانية.';

  @override
  String verifyWhatsAppText(String code) {
    return 'تفعيل حسابي: $code';
  }

  @override
  String get whatsappNotOpened =>
      'مش قادرين نفتح واتساب. انسخ الكود وابعته للبوت بنفسك.';

  @override
  String get accountTitle => 'حسابك';

  @override
  String get signOut => 'تسجيل الخروج';
}
