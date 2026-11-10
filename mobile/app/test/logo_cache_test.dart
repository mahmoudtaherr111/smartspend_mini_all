import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_app/src/features/commitments/logo_cache.dart';

void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('logos'));
  tearDown(() => dir.deleteSync(recursive: true));

  const url = 'http://localhost:3000/api/brand-logos/netflix-0123456789ab.png';
  final png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

  test('a logo is downloaded once, kept on the phone, and read from it on the next start', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response.bytes(png, 200);
    });
    final first = LogoCache(client, directory: () async => dir);
    expect(await first.bytesOf(url), png);
    expect(
      File('${dir.path}/${LogoCache.fileNameOf(url)}').existsSync(),
      isTrue,
    );

    // Another run of the app: no request at all.
    final next = LogoCache(
      MockClient((_) async => throw StateError('no network')),
      directory: () async => dir,
    );
    expect(await next.bytesOf(url), png);
    expect(requests, 1);
  });

  test('two screens asking at once make one request', () async {
    var requests = 0;
    final cache = LogoCache(
      MockClient((_) async {
        requests += 1;
        return http.Response.bytes(png, 200);
      }),
      directory: () async => dir,
    );
    await Future.wait([cache.bytesOf(url), cache.bytesOf(url)]);
    expect(requests, 1);
  });

  test('a failed download keeps nothing, and works without storage', () async {
    final failing = LogoCache(
      MockClient((_) async => http.Response('not found', 404)),
      directory: () async => dir,
    );
    expect(await failing.bytesOf(url), isNull);
    expect(dir.listSync(), isEmpty);
    final noDisk = LogoCache(
      MockClient((_) async => http.Response.bytes(png, 200)),
      directory: () async => throw const FileSystemException('full'),
    );
    expect(await noDisk.bytesOf(url), png);
  });

  test('only the newest logos are kept', () async {
    final cache = LogoCache(
      MockClient((_) async => http.Response.bytes(png, 200)),
      directory: () async => dir,
    );
    for (var index = 0; index < LogoCache.maxFiles + 5; index++) {
      await cache.bytesOf(
        'http://localhost:3000/api/brand-logos/s$index-0123456789ab.png',
      );
    }
    await Future<void>.delayed(const Duration(milliseconds: 200));
    expect(dir.listSync().length, lessThanOrEqualTo(LogoCache.maxFiles));
  });
}
