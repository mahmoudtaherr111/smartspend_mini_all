import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:test/test.dart';

/// An answer of `/api/sse/otp` as `streamSSE` in `api/boot.ts` writes it.
http.StreamedResponse _events(List<String> chunks, {int status = 200}) =>
    http.StreamedResponse(
      Stream.fromIterable(chunks.map(utf8.encode)),
      status,
      headers: {'content-type': 'text/event-stream'},
    );

void main() {
  late List<http.BaseRequest> sent;

  PhoneChallengeEvents eventsAnswering(
    FutureOr<http.StreamedResponse> Function(http.BaseRequest request) answer, {
    Duration idleTimeout = const Duration(seconds: 45),
  }) {
    sent = [];
    return PhoneChallengeEvents(
      baseUri: Uri.parse('https://api.example.test'),
      userAgent: 'SmartSpend-Mobile (test)',
      idleTimeout: idleTimeout,
      httpClient: MockClient.streaming((request, _) async {
        sent.add(request);
        return answer(request);
      }),
    );
  }

  test('asks for the challenge by its watch token', () async {
    final events = eventsAnswering(
      (_) => _events(['data: {"status":"verified"}\n\n']),
    );

    await events.next('7.watch-token');

    final request = sent.single;
    expect(request.method, 'GET');
    expect(request.url.path, '/api/sse/otp');
    expect(request.url.queryParameters, {'challenge': '7.watch-token'});
    expect(request.headers['accept'], 'text/event-stream');
    expect(request.headers.containsKey('authorization'), isFalse);
  });

  test('reads each outcome the server sends', () async {
    for (final (status, outcome) in [
      ('verified', PhoneChallengeOutcome.verified),
      ('wrong_sender', PhoneChallengeOutcome.wrongSender),
      ('expired', PhoneChallengeOutcome.expired),
    ]) {
      final events = eventsAnswering(
        (_) => _events(['data: {"status":"$status"}\n\n']),
      );
      expect(await events.next('w'), outcome);
    }
  });

  test(
    'skips pings and waits for the outcome, even split across chunks',
    () async {
      final events = eventsAnswering(
        (_) => _events([
          'event: ping\ndata: ping\n\n',
          'event: ping\nda',
          'ta: ping\n\ndata: {"sta',
          'tus":"verified"}\n',
          '\n',
        ]),
      );

      expect(await events.next('w'), PhoneChallengeOutcome.verified);
    },
  );

  test('a challenge the server no longer knows has expired', () async {
    final events = eventsAnswering(
      (_) => _events(['Unknown or expired challenge'], status: 404),
    );

    expect(await events.next('w'), PhoneChallengeOutcome.expired);
  });

  test(
    'a connection that ends without an outcome is a network failure',
    () async {
      final events = eventsAnswering(
        (_) => _events(['event: ping\ndata: ping\n\n']),
      );

      await expectLater(events.next('w'), throwsA(isA<ApiNetworkException>()));
    },
  );

  test('a silent connection counts as dropped', () async {
    final events = eventsAnswering(
      // Headers arrive, then nothing: no event, no ping, no end.
      (_) => http.StreamedResponse(StreamController<List<int>>().stream, 200),
      idleTimeout: const Duration(milliseconds: 20),
    );

    await expectLater(events.next('w'), throwsA(isA<ApiNetworkException>()));
  });

  test('too many streams from one address is a rate limit', () async {
    final events = eventsAnswering(
      (_) => _events(['Too many SSE connections'], status: 429),
    );

    await expectLater(
      events.next('w'),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'TOO_MANY_REQUESTS'),
      ),
    );
  });

  test('no network is a network failure', () async {
    final events = PhoneChallengeEvents(
      baseUri: Uri.parse('https://api.example.test'),
      httpClient: MockClient(
        (_) async => throw http.ClientException('offline'),
      ),
    );

    await expectLater(events.next('w'), throwsA(isA<ApiNetworkException>()));
  });
}
