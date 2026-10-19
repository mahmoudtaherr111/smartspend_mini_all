import 'package:flutter/widgets.dart';

/// How dates and times are written in one interface language, with Western digits as money is
/// (`src/i18n/format.ts` names the months the same way). Dates shown in lists are the phone's local time; the
/// ledger's days and months themselves are computed by the server (golden rule 6).
final class DateWords {
  const DateWords._({
    required this.months,
    required this.weekdays,
    required this.today,
    required this.yesterday,
    required this.morning,
    required this.evening,
  });

  /// January first.
  final List<String> months;

  /// Monday first, as `DateTime.weekday` counts.
  final List<String> weekdays;
  final String today;
  final String yesterday;
  final String morning;
  final String evening;

  static const arabic = DateWords._(
    months: [
      'يناير',
      'فبراير',
      'مارس',
      'إبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ],
    weekdays: [
      'الاتنين',
      'التلات',
      'الأربع',
      'الخميس',
      'الجمعة',
      'السبت',
      'الأحد',
    ],
    today: 'النهارده',
    yesterday: 'امبارح',
    morning: 'ص',
    evening: 'م',
  );

  static const english = DateWords._(
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    weekdays: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    today: 'Today',
    yesterday: 'Yesterday',
    morning: 'AM',
    evening: 'PM',
  );

  /// The words of the interface around [context]: English when its language is English, Arabic otherwise.
  static DateWords of(BuildContext context) =>
      Localizations.maybeLocaleOf(context)?.languageCode == 'en'
      ? english
      : arabic;

  /// "9:41 م", on a twelve-hour clock.
  String clock(DateTime time) {
    final hour = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${time.hour < 12 ? morning : evening}';
  }

  /// «النهارده», «امبارح», or the weekday and date: «الخميس 16 أكتوبر», with the year when it is not [now]'s.
  String day(DateTime date, {required DateTime now}) {
    final day = DateTime(date.year, date.month, date.day);
    final today = DateTime(now.year, now.month, now.day);
    final difference = _dayNumber(today) - _dayNumber(day);
    if (difference == 0) return this.today;
    if (difference == 1) return yesterday;
    final label =
        '${weekdays[day.weekday - 1]} ${day.day} ${months[day.month - 1]}';
    return day.year == today.year ? label : '$label ${day.year}';
  }

  /// «أكتوبر 2026» for a month key such as "2026-10"; the key itself when it is not one.
  String month(String monthKey) {
    final match = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(monthKey);
    if (match == null) return monthKey;
    final index = int.parse(match.group(2)!) - 1;
    if (index < 0 || index > 11) return monthKey;
    return '${months[index]} ${match.group(1)}';
  }

  /// The month's name alone: «أكتوبر».
  String monthName(String monthKey) {
    final match = RegExp(r'^\d{4}-(\d{2})$').firstMatch(monthKey);
    if (match == null) return monthKey;
    final index = int.parse(match.group(1)!) - 1;
    return index < 0 || index > 11 ? monthKey : months[index];
  }
}

/// Days since 1970 of a calendar date, counted on UTC so a daylight-saving change cannot make a day 23 hours long.
int _dayNumber(DateTime day) =>
    DateTime.utc(day.year, day.month, day.day).millisecondsSinceEpoch ~/
    Duration.millisecondsPerDay;
