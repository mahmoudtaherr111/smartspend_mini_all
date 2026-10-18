import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';
import 'procedure.dart';

/// Reads the session token to send, or null when nobody is signed in.
typedef SessionTokenReader = FutureOr<String?> Function();

/// Calls the SmartSpend tRPC API (`/api/trpc/*` in `api/boot.ts`) over plain HTTP and JSON.
///
/// The server has no transformer, so inputs and answers are ordinary JSON: a query is
/// `GET /api/trpc/<path>?input=<json>`, a mutation `POST /api/trpc/<path>` with the input as its body, and an answer
/// is `{"result": {"data": ...}}` or `{"error": {...}}`. The session token goes in `Authorization: Bearer`, which
/// `createContext` in `api/context.ts` reads before any cookie.
///
/// The client returns the decoded `data` as it is; each feature turns it into its own Dart types.
final class TrpcClient {
  TrpcClient({
    required this._baseUri,
    http.Client? httpClient,
    this._readSessionToken,
    this._userAgent,
    this.timeout = const Duration(seconds: 30),
  }) : _http = httpClient ?? http.Client();

  final Uri _baseUri;
  final http.Client _http;
  final SessionTokenReader? _readSessionToken;
  final String? _userAgent;

  /// How long a call may take before it fails with [ApiNetworkException].
  final Duration timeout;

  /// Runs a query and returns its data.
  Future<Object?> query(ApiQuery procedure, {Object? input}) async {
    final uri = _uriFor(
      procedure,
      queryParameters: input == null ? null : {'input': jsonEncode(input)},
    );
    return _send(procedure, http.Request('GET', uri));
  }

  /// Runs a mutation and returns its data.
  Future<Object?> mutate(ApiMutation procedure, {Object? input}) async {
    final request = http.Request('POST', _uriFor(procedure));
    request.headers['content-type'] = 'application/json';
    if (input != null) request.body = jsonEncode(input);
    return _send(procedure, request);
  }

  /// Closes the underlying HTTP client. The client cannot be used afterwards.
  void close() => _http.close();

  Uri _uriFor(ApiProcedure procedure, {Map<String, String>? queryParameters}) {
    final basePath = _baseUri.path.endsWith('/')
        ? _baseUri.path.substring(0, _baseUri.path.length - 1)
        : _baseUri.path;
    return _baseUri.replace(
      path: '$basePath/api/trpc/${procedure.path}',
      queryParameters: queryParameters,
    );
  }

  Future<Object?> _send(ApiProcedure procedure, http.Request request) async {
    request.headers['accept'] = 'application/json';
    final userAgent = _userAgent;
    if (userAgent != null) request.headers['user-agent'] = userAgent;
    final token = await _readSessionToken?.call();
    if (token != null && token.isNotEmpty) {
      request.headers['authorization'] = 'Bearer $token';
    }

    final http.Response response;
    try {
      final streamed = await _http.send(request).timeout(timeout);
      response = await http.Response.fromStream(streamed).timeout(timeout);
    } on TimeoutException catch (error) {
      throw ApiNetworkException(error);
    } on http.ClientException catch (error) {
      throw ApiNetworkException(error);
    }

    final body = _decode(response);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (body case {'result': final Map<String, Object?> result}) {
        return result['data'];
      }
      throw ApiException(
        code: 'MALFORMED_RESPONSE',
        httpStatus: response.statusCode,
        message: friendlyHttpMessage(500),
        path: procedure.path,
      );
    }
    throw _errorFrom(procedure, response.statusCode, body);
  }

  static Object? _decode(http.Response response) {
    if (response.body.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      return null;
    }
  }

  static ApiException _errorFrom(
    ApiProcedure procedure,
    int status,
    Object? body,
  ) {
    if (body case {'error': final Map<String, Object?> error}) {
      final data = error['data'];
      final details = data is Map<String, Object?>
          ? data
          : const <String, Object?>{};
      final message = error['message'];
      final retryAfterSeconds = details['retryAfterSeconds'];
      return ApiException(
        code: details['code'] as String? ?? 'HTTP_$status',
        httpStatus: details['httpStatus'] as int? ?? status,
        message: message is String && message.isNotEmpty
            ? message
            : friendlyHttpMessage(status),
        path: details['path'] as String? ?? procedure.path,
        retryAfter: retryAfterSeconds is num
            ? Duration(milliseconds: (retryAfterSeconds * 1000).round())
            : null,
      );
    }
    return ApiException(
      code: 'HTTP_$status',
      httpStatus: status,
      message: friendlyHttpMessage(status),
      path: procedure.path,
    );
  }
}
