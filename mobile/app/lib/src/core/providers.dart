import 'package:bank_capture/bank_capture.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:smartspend_api/smartspend_api.dart';

import '../config/app_config.dart';
import '../features/auth/session_controller.dart';
import 'session_store.dart';

/// This build's configuration. `bootstrap()` provides it; tests override it.
final appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError('bootstrap() overrides appConfigProvider'),
);

final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore());

/// The HTTP client every call to the API goes through. Tests answer it with `MockClient`.
final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

/// The one API client of the app. It reads the session token on every call, so signing in or out needs no new
/// client. When the server refuses the token a call carried, the session ends and the router shows sign-in.
final trpcClientProvider = Provider<TrpcClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final sessions = ref.watch(sessionStoreProvider);
  return TrpcClient(
    baseUri: config.apiBaseUri,
    httpClient: ref.watch(httpClientProvider),
    readSessionToken: sessions.readToken,
    userAgent: config.userAgent,
    onSessionRejected: (_) => ref.read(sessionProvider.notifier).expire(),
  );
});

final bankCaptureProvider = Provider<BankCapture>((ref) => BankCapture());

/// How this phone captures bank messages and whether the user allowed it. Invalidate it when the app returns
/// to the foreground: the user may have changed the setting meanwhile.
final captureStatusProvider = FutureProvider<CaptureStatus>(
  (ref) => ref.watch(bankCaptureProvider).status(),
);
