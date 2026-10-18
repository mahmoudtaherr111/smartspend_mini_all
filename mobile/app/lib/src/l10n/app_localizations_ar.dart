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
}
