import 'package:bank_capture/bank_capture.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../config/app_config.dart';
import 'session_store.dart';

/// This build's configuration. `bootstrap()` provides it; tests override it.
final appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError('bootstrap() overrides appConfigProvider'),
);

final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore());

/// The one API client of the app. It reads the session token on every call, so signing in or out needs no new
/// client.
final trpcClientProvider = Provider<TrpcClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final sessions = ref.watch(sessionStoreProvider);
  final client = TrpcClient(
    baseUri: config.apiBaseUri,
    readSessionToken: sessions.readToken,
    userAgent: config.userAgent,
  );
  ref.onDispose(client.close);
  return client;
});

final bankCaptureProvider = Provider<BankCapture>((ref) => BankCapture());

/// How this phone captures bank messages and whether the user allowed it. Invalidate it when the app returns
/// to the foreground: the user may have changed the setting meanwhile.
final captureStatusProvider = FutureProvider<CaptureStatus>(
  (ref) => ref.watch(bankCaptureProvider).status(),
);
