/// The server answered, but with an error instead of data.
///
/// [message] is written for the user in Egyptian Arabic, by the server or, when the answer carried none, by
/// [friendlyHttpMessage]; it is safe to show as it is.
final class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.httpStatus,
    required this.message,
    this.path,
    this.retryAfter,
  });

  /// The tRPC error code (`UNAUTHORIZED`, `BAD_REQUEST`, `TOO_MANY_REQUESTS`, ...), or `HTTP_<status>` when the
  /// answer was not a tRPC error, for example a proxy's error page.
  final String code;

  final int httpStatus;

  final String message;

  /// The procedure the server names in the error.
  final String? path;

  /// How long the server asks the client to wait, on rate limits.
  final Duration? retryAfter;

  /// The session is missing, expired or revoked: the user has to sign in again.
  bool get isUnauthorized => code == 'UNAUTHORIZED' || httpStatus == 401;

  @override
  String toString() => 'ApiException($code, $httpStatus, ${path ?? '-'})';
}

/// The request never got an answer: no network, a timeout, or a connection the server closed.
final class ApiNetworkException implements Exception {
  const ApiNetworkException(this.cause);

  final Object cause;

  /// What the user reads (docs/guides/writing-app-messages.md).
  String get message => 'مش قادرين نوصل للسيرفر. اتأكد من النت وجرّب تاني.';

  @override
  String toString() => 'ApiNetworkException($cause)';
}

/// What the user reads for an HTTP status whose answer carried no message of its own, in the voice of
/// docs/guides/writing-app-messages.md.
String friendlyHttpMessage(int status) {
  if (status == 401) return 'الجلسة خلصت. سجّل دخولك تاني.';
  if (status == 403) return 'مش مسموحلك تعمل العملية دي.';
  if (status == 429) return 'طلبات كتير في وقت قصير. استنى لحظة وجرّب تاني.';
  if (status >= 500) return 'حصلت مشكلة عندنا. جرّب تاني.';
  return 'ماقدرناش نكمّل الطلب. جرّب تاني.';
}
