import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_app/src/core/cairo_time.dart';
import 'package:smartspend_app/src/features/infrastructure/remote_config.dart';

void main() {
  group('cairo_time', () {
    test('computes Egypt UTC+2 (winter) and UTC+3 (DST) boundaries', () {
      // Winter (January): UTC+2
      final winterUtc = DateTime.utc(2026, 1, 15, 22, 30);
      expect(cairoUtcOffset(winterUtc), const Duration(hours: 2));
      expect(cairoNowDate(winterUtc), DateTime(2026, 1, 16));

      // Before DST start (2026 last Friday of April is Apr 24; 00:00 EET = Apr 23 22:00 UTC)
      final beforeDst = DateTime.utc(2026, 4, 23, 21, 59);
      expect(cairoUtcOffset(beforeDst), const Duration(hours: 2));
      expect(cairoNow(beforeDst), DateTime(2026, 4, 23, 23, 59));

      // At DST start
      final atDst = DateTime.utc(2026, 4, 23, 22, 0);
      expect(cairoUtcOffset(atDst), const Duration(hours: 3));
      expect(cairoNow(atDst), DateTime(2026, 4, 24, 1, 0));

      // Before DST end (2026 last Thursday of October is Oct 29; 24:00 EEST = Oct 29 21:00 UTC)
      final beforeEnd = DateTime.utc(2026, 10, 29, 20, 59);
      expect(cairoUtcOffset(beforeEnd), const Duration(hours: 3));
      expect(cairoNow(beforeEnd), DateTime(2026, 10, 29, 23, 59));

      // At DST end
      final atEnd = DateTime.utc(2026, 10, 29, 21, 0);
      expect(cairoUtcOffset(atEnd), const Duration(hours: 2));
      expect(cairoNow(atEnd), DateTime(2026, 10, 29, 23, 0));
    });

    test('parseCairoIsoDate and formatCairoIsoDate handle valid and invalid inputs', () {
      expect(parseCairoIsoDate('2026-11-22'), DateTime(2026, 11, 22));
      expect(parseCairoIsoDate(' 2026-02-28 '), DateTime(2026, 2, 28));
      expect(parseCairoIsoDate('2026-02-30'), isNull);
      expect(parseCairoIsoDate(''), isNull);
      expect(parseCairoIsoDate(null), isNull);
      expect(parseCairoIsoDate('invalid'), isNull);

      expect(formatCairoIsoDate(DateTime(2026, 3, 5)), '2026-03-05');
    });

    test(
      'cairoTodayProvider prefers server today and falls back to Cairo clock',
      () async {
        final containerWithServer = ProviderContainer(
          overrides: [
            remoteConfigProvider.overrideWith(
              (ref) async => const RemoteConfig(today: '2026-11-22'),
            ),
          ],
        );
        addTearDown(containerWithServer.dispose);
        await containerWithServer.read(remoteConfigProvider.future);
        expect(
          containerWithServer.read(cairoTodayProvider),
          DateTime(2026, 11, 22),
        );

        await withClock(
          Clock.fixed(DateTime.utc(2026, 12, 1, 22, 15)),
          () async {
            final fallbackContainer = ProviderContainer(
              overrides: [
                remoteConfigProvider.overrideWith(
                  (ref) async => const RemoteConfig(today: ''),
                ),
              ],
            );
            addTearDown(fallbackContainer.dispose);
            await fallbackContainer.read(remoteConfigProvider.future);
            // 22:15 UTC + 2h EET = 00:15 on Dec 2 in Cairo.
            expect(
              fallbackContainer.read(cairoTodayProvider),
              DateTime(2026, 12, 2),
            );
          },
        );
      },
    );
  });
}
