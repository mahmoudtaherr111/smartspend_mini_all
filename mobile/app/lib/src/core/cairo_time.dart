import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/infrastructure/remote_config.dart';

const _eetOffset = Duration(hours: 2);
const _eestOffset = Duration(hours: 3);

int _lastWeekdayDayOfMonth(int year, int month, int weekday) {
  final lastDay = DateTime.utc(year, month + 1, 0);
  final delta = (lastDay.weekday - weekday + 7) % 7;
  return lastDay.day - delta;
}

/// Returns Egypt's UTC offset (+02:00 EET, or +03:00 EEST during DST from the
/// last Friday of April at 00:00 EET through the last Thursday of October at 24:00 EEST).
Duration cairoUtcOffset([DateTime? instant]) {
  final utc = (instant ?? clock.now()).toUtc();
  final dstStartDay = _lastWeekdayDayOfMonth(utc.year, 4, DateTime.friday);
  final dstEndDay = _lastWeekdayDayOfMonth(utc.year, 10, DateTime.thursday);
  final dstStartUtc = DateTime.utc(
    utc.year,
    4,
    dstStartDay,
  ).subtract(_eetOffset);
  final dstEndUtc = DateTime.utc(
    utc.year,
    10,
    dstEndDay,
    24,
  ).subtract(_eestOffset);
  final inDst = !utc.isBefore(dstStartUtc) && utc.isBefore(dstEndUtc);
  return inDst ? _eestOffset : _eetOffset;
}

/// Current Cairo wall-clock time as an unzoned local-field [DateTime]
/// (year/month/day/hour/minute/second match Africa/Cairo regardless of device timezone).
DateTime cairoNow([DateTime? instant]) {
  final utc = (instant ?? clock.now()).toUtc();
  final wall = utc.add(cairoUtcOffset(utc));
  return DateTime(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
}

/// Current Cairo calendar date (`DateTime(year, month, day)`), independent of device timezone.
DateTime cairoNowDate([DateTime? instant]) {
  final wall = cairoNow(instant);
  return DateTime(wall.year, wall.month, wall.day);
}

/// Parses a `YYYY-MM-DD` server date string into a date-only [DateTime], or `null` if invalid.
DateTime? parseCairoIsoDate(String? raw) {
  if (raw == null) return null;
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw.trim());
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  final parsed = DateTime(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    return null;
  }
  return parsed;
}

/// Formats [date] as `YYYY-MM-DD`.
String formatCairoIsoDate(DateTime date) {
  final year = date.year.toString().padLeft(4, '0');
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

/// Today's Cairo calendar date from the server's `appConfig.get.today` when available,
/// falling back to [cairoNowDate] (UTC+2/UTC+3) before the server answers or while offline.
final cairoTodayProvider = Provider<DateTime>((ref) {
  final serverToday = ref.watch(remoteConfigProvider).value?.today;
  return parseCairoIsoDate(serverToday) ?? cairoNowDate();
});
