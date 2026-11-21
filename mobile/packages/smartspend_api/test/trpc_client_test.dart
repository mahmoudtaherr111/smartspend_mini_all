import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:test/test.dart';

const _list = ApiQuery(
  'expense.list',
  builder: 'authedProcedure',
  hasInput: true,
);
const _me = ApiQuery('auth.me', builder: 'publicProcedure');
const _create = ApiMutation(
  'expense.create',
  builder: 'authedProcedure',
  hasInput: true,
);

http.Response _json(Object body, int status) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  late List<http.Request> sent;

  TrpcClient clientAnswering(
    http.Response Function(http.Request request) answer, {
    String? token,
    Uri? baseUri,
  }) {
    sent = [];
    return TrpcClient(
      baseUri: baseUri ?? Uri.parse('https://api.example.test'),
      readSessionToken: () => token,
      userAgent: 'SmartSpend/0.1.0 (test)',
      httpClient: MockClient((request) async {
        sent.add(request);
        return answer(request);
      }),
    );
  }

  group('queries', () {
    test('are a GET with the input as JSON in the query string', () async {
      final client = clientAnswering(
        (_) => _json({
          'result': {'data': <Object?>[]},
        }, 200),
        token: 'session-token',
      );

      await client.query(
        _list,
        input: {'month': '2026-10', 'note': 'أكل وشرب'},
      );

      final request = sent.single;
      expect(request.method, 'GET');
      expect(request.url.path, '/api/trpc/expense.list');
      expect(jsonDecode(request.url.queryParameters['input']!), {
        'month': '2026-10',
        'note': 'أكل وشرب',
      });
      expect(request.headers['authorization'], 'Bearer session-token');
      expect(request.headers['user-agent'], 'SmartSpend/0.1.0 (test)');
    });

    test(
      'without input send no input parameter and, signed out, no token',
      () async {
        final client = clientAnswering(
          (_) => _json({
            'result': {'data': null},
          }, 200),
        );

        await client.query(_me);

        expect(sent.single.url.hasQuery, isFalse);
        expect(sent.single.headers.containsKey('authorization'), isFalse);
      },
    );

    test('keep a path prefix of the base address', () async {
      final client = clientAnswering(
        (_) => _json({
          'result': {'data': 1},
        }, 200),
        baseUri: Uri.parse('https://example.test/smartspend/'),
      );

      await client.query(_me);

      expect(sent.single.url.path, '/smartspend/api/trpc/auth.me');
    });

    test('return the data inside the result', () async {
      final client = clientAnswering(
        (_) => _json({
          'result': {
            'data': {'total': 1250.5},
          },
        }, 200),
      );

      expect(await client.query(_me), {'total': 1250.5});
    });
  });

  group('mutations', () {
    test('are a POST with the input as a JSON body', () async {
      final client = clientAnswering(
        (_) => _json({
          'result': {
            'data': {'id': 7},
          },
        }, 200),
      );

      final data = await client.mutate(_create, input: {'amount': 85});

      final request = sent.single;
      expect(request.method, 'POST');
      expect(request.url.path, '/api/trpc/expense.create');
      expect(request.headers['content-type'], startsWith('application/json'));
      expect(jsonDecode(request.body), {'amount': 85});
      expect(data, {'id': 7});
    });
  });

  group('errors', () {
    test('carry the code, status and Arabic message of a tRPC error', () async {
      final client = clientAnswering(
        (_) => _json({
          'error': {
            'message': 'اكتب المبلغ.',
            'code': -32600,
            'data': {
              'code': 'BAD_REQUEST',
              'httpStatus': 400,
              'path': 'expense.create',
            },
          },
        }, 400),
      );

      await expectLater(
        client.mutate(_create, input: {}),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'BAD_REQUEST')
              .having((e) => e.httpStatus, 'httpStatus', 400)
              .having((e) => e.message, 'message', 'اكتب المبلغ.')
              .having((e) => e.path, 'path', 'expense.create'),
        ),
      );
    });

    test('read the wait the server asks for on rate limits', () async {
      final client = clientAnswering(
        (_) => _json({
          'error': {
            'message': 'طلبات كتير جداً من نفس الشبكة. جرب بعد دقيقة.',
            'code': -32029,
            'data': {
              'code': 'TOO_MANY_REQUESTS',
              'httpStatus': 429,
              'retryAfterSeconds': 42,
            },
          },
        }, 429),
      );

      await expectLater(
        client.query(_me),
        throwsA(
          isA<ApiException>().having(
            (e) => e.retryAfter,
            'retryAfter',
            const Duration(seconds: 42),
          ),
        ),
      );
    });

    test('mark a missing session as unauthorized', () async {
      final client = clientAnswering(
        (_) => _json({
          'error': {
            'message': 'سجّل دخولك الأول.',
            'code': -32001,
            'data': {'code': 'UNAUTHORIZED', 'httpStatus': 401},
          },
        }, 401),
      );

      await expectLater(
        client.query(_list),
        throwsA(
          isA<ApiException>().having(
            (e) => e.isUnauthorized,
            'isUnauthorized',
            isTrue,
          ),
        ),
      );
    });

    test('report a refused session token before throwing', () async {
      final rejected = <ApiException>[];
      sent = [];
      final client = TrpcClient(
        baseUri: Uri.parse('https://api.example.test'),
        readSessionToken: () => 'revoked-token',
        onSessionRejected: rejected.add,
        httpClient: MockClient(
          (_) async => _json({
            'error': {
              'message': 'يجب تسجيل الدخول أولاً',
              'code': -32001,
              'data': {'code': 'UNAUTHORIZED', 'httpStatus': 401},
            },
          }, 401),
        ),
      );

      await expectLater(client.query(_list), throwsA(isA<ApiException>()));
      expect(rejected.single.isUnauthorized, isTrue);
    });

    test('of a sign-in without a token end no session', () async {
      final rejected = <ApiException>[];
      final client = TrpcClient(
        baseUri: Uri.parse('https://api.example.test'),
        readSessionToken: () => null,
        onSessionRejected: rejected.add,
        httpClient: MockClient(
          (_) async => _json({
            'error': {
              'message': 'رقم التليفون أو الباسورد غلط',
              'code': -32001,
              'data': {'code': 'UNAUTHORIZED', 'httpStatus': 401},
            },
          }, 401),
        ),
      );

      await expectLater(
        client.mutate(Procedures.localAuth.login, input: {}),
        throwsA(isA<ApiException>()),
      );
      expect(rejected, isEmpty);
    });

    test('that are not tRPC answers get a message for their status', () async {
      final client = clientAnswering(
        (_) => http.Response('<html>Bad Gateway</html>', 502),
      );

      await expectLater(
        client.query(_me),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'HTTP_502')
              .having((e) => e.message, 'message', friendlyHttpMessage(502)),
        ),
      );
    });

    test('of the network become ApiNetworkException', () async {
      final client = TrpcClient(
        baseUri: Uri.parse('https://api.example.test'),
        httpClient: MockClient(
          (_) async => throw http.ClientException('offline'),
        ),
      );

      await expectLater(client.query(_me), throwsA(isA<ApiNetworkException>()));
    });
  });

  test('the generated catalog types each procedure by its kind', () {
    // The sign-in calls the app makes first; renaming them on the server breaks this line at compile time.
    expect(Procedures.localAuth.login, isA<ApiMutation>());
    expect(Procedures.auth.me, isA<ApiQuery>());
    expect(Procedures.localAuth.login.isPublic, isTrue);
    expect(Procedures.auth.signInWithGoogle, isA<ApiMutation>());
    expect(Procedures.auth.signInWithGoogle.isPublic, isTrue);
  });
}
