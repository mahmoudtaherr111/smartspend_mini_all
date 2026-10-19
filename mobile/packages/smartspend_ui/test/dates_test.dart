import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

void main() {
  const ar = DateWords.arabic;
  final now = DateTime(2026, 10, 19, 14, 30);

  test('days read as people say them', () {
    expect(ar.day(DateTime(2026, 10, 19, 1), now: now), 'النهارده');
    expect(ar.day(DateTime(2026, 10, 18, 23, 59), now: now), 'امبارح');
    expect(ar.day(DateTime(2026, 10, 15, 9), now: now), 'الخميس 15 أكتوبر');
    expect(ar.day(DateTime(2025, 12, 31), now: now), 'الأربع 31 ديسمبر 2025');
  });

  test('times use a twelve-hour clock with Western digits', () {
    expect(ar.clock(DateTime(2026, 10, 19, 21, 41)), '9:41 م');
    expect(ar.clock(DateTime(2026, 10, 19, 0, 5)), '12:05 ص');
    expect(ar.clock(DateTime(2026, 10, 19, 12, 0)), '12:00 م');
    expect(DateWords.english.clock(DateTime(2026, 10, 19, 9, 7)), '9:07 AM');
  });

  test('months are named as the web app names them', () {
    expect(ar.month('2026-10'), 'أكتوبر 2026');
    expect(ar.monthName('2026-04'), 'إبريل');
    expect(ar.month('not a month'), 'not a month');
  });
}
