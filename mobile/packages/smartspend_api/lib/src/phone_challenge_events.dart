import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';

/// What became of a WhatsApp phone challenge (`api/services/phone-challenge.ts`).
enum PhoneChallengeOutcome {
  /// The bot saw the number send its code: the ticket now proves the number, once.
  verified,

  /// The code came from another WhatsApp number; the challenge stays open for the right one.
  wrongSender,

  /// The challenge ran out, or was already spent.
  expired,
}

/// Follows one phone challenge on `GET /api/sse/otp?challenge=<watch>` (`api/boot.ts`), the one route outside tRPC
/// the app calls. The server answers with Server-Sent Events: `{"status": "verified" | "wrong_sender" | "expired"}`
/// once, and a `ping` event every 15 seconds while it waits. It knows the challenge only by its `watch` token,
/// never by a phone number.
///
/// A connection does not survive the app going to WhatsApp and back on every phone, so the caller opens a new one
/// whenever the last ended without an outcome; the server answers a challenge that was verified meanwhile at once.
final class PhoneChallengeEvents {
  PhoneChallengeEvents({
    required this._baseUri,
    http.Client? httpClient,
    this._userAgent,
    this.idleTimeout = const Duration(seconds: 45),
  }) : _http = httpClient ?? http.Client();

  final Uri _baseUri;
  final http.Client _http;
  final String? _userAgent;

  /// How long a connection may stay silent (no event, no ping) before it counts as dropped.
  final Duration idleTimeout;

  /// Opens a connection and completes with the next outcome.
  ///
  /// Completes with [PhoneChallengeOutcome.expired] when the server no longer knows the challenge, and with null
  /// once [cancel] completes. Throws [ApiNetworkException] when the connection ends or goes silent first, and
  /// [ApiException] when the server refuses it (`TOO_MANY_REQUESTS`: five streams per address in five minutes).
  Future<PhoneChallengeOutcome?> next(
    String watch, {
    Future<void>? cancel,
  }) async {
    final request = http.AbortableRequest(
      'GET',
      _uriFor(watch),
      abortTrigger: cancel,
    );
    request.headers['accept'] = 'text/event-stream';
    final userAgent = _userAgent;
    if (userAgent != null) request.headers['user-agent'] = userAgent;

    final http.StreamedResponse response;
    try {
      response = await _http.send(request).timeout(idleTimeout);
    } on http.RequestAbortedException {
      return null;
    } on TimeoutException catch (error) {
      throw ApiNetworkException(error);
    } on http.ClientException catch (error) {
      throw ApiNetworkException(error);
    }

    if (response.statusCode == 404) {
      await _discard(response);
      return PhoneChallengeOutcome.expired;
    }
    if (response.statusCode != 200) {
      await _discard(response);
      final status = response.statusCode;
      throw ApiException(
        code: status == 429 ? 'TOO_MANY_REQUESTS' : 'HTTP_$status',
        httpStatus: status,
        message: friendlyHttpMessage(status),
        path: 'sse/otp',
      );
    }

    String? event;
    final data = StringBuffer();
    try {
      final lines = response.stream
          .timeout(idleTimeout)
          .transform(utf8.decoder)
          .transform(const LineSplitter());
      await for (final line in lines) {
        if (line.isEmpty) {
          final outcome = event == null || event == 'message'
              ? _outcomeOf(data.toString())
              : null;
          event = null;
          data.clear();
          if (outcome != null) return outcome;
          continue;
        }
        if (line.startsWith(':')) continue;
        final colon = line.indexOf(':');
        final field = colon == -1 ? line : line.substring(0, colon);
        var value = colon == -1 ? '' : line.substring(colon + 1);
        if (value.startsWith(' ')) value = value.substring(1);
        if (field == 'event') {
          event = value;
        } else if (field == 'data') {
          if (data.isNotEmpty) data.write('\n');
          data.write(value);
        }
      }
    } on http.RequestAbortedException {
      return null;
    } on TimeoutException catch (error) {
      throw ApiNetworkException(error);
    } on http.ClientException catch (error) {
      throw ApiNetworkException(error);
    }
    throw ApiNetworkException(
      StateError('The challenge stream closed before an outcome'),
    );
  }

  /// Closes the underlying HTTP client. The object cannot be used afterwards.
  void close() => _http.close();

  Uri _uriFor(String watch) {
    final basePath = _baseUri.path.endsWith('/')
        ? _baseUri.path.substring(0, _baseUri.path.length - 1)
        : _baseUri.path;
    return _baseUri.replace(
      path: '$basePath/api/sse/otp',
      queryParameters: {'challenge': watch},
    );
  }

  static PhoneChallengeOutcome? _outcomeOf(String data) {
    if (data.isEmpty) return null;
    final Object? decoded;
    try {
      decoded = jsonDecode(data);
    } on FormatException {
      return null;
    }
    return switch (decoded) {
      {'status': 'verified'} => PhoneChallengeOutcome.verified,
      {'status': 'wrong_sender'} => PhoneChallengeOutcome.wrongSender,
      {'status': 'expired'} => PhoneChallengeOutcome.expired,
      _ => null,
    };
  }

  static Future<void> _discard(http.StreamedResponse response) async {
    try {
      await response.stream.drain<void>();
    } on Object {
      // The answer is already decided by its status.
    }
  }
}
