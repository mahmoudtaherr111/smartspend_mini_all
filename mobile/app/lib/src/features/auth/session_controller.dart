import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import 'auth_api.dart';
import 'google_identity.dart';

/// Whether someone is signed in on this phone. The router reads it to guard the tabs.
sealed class SessionState {
  const SessionState();
}

/// The app has just started and is reading the stored token.
final class SessionRestoring extends SessionState {
  const SessionRestoring();
}

final class SignedOut extends SessionState {
  const SignedOut({this.expired = false});

  /// The server refused the stored token: the sign-in screen says the session ended.
  final bool expired;
}

final class SignedIn extends SessionState {
  const SignedIn(this.user);

  /// Who is signed in; null until the server has answered, for example when the app opens without a network.
  final AppUser? user;
}

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(trpcClientProvider)),
);

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// Keeps the session token in `SessionStore` and the signed-in user in memory.
///
/// The server is the judge of a token: the app opens on a stored token at once, even offline, and ends the
/// session only when the server resolves the token to nobody (`auth.me` and `localAuth.me` both answer null) or
/// refuses it on a call (`TrpcClient`'s `onSessionRejected`).
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    unawaited(_restore());
    return const SessionRestoring();
  }

  Future<void> _restore() async {
    final String? token;
    try {
      token = await ref.read(sessionStoreProvider).readToken();
    } on Object {
      state = const SignedOut();
      return;
    }
    if (token == null || token.isEmpty) {
      state = const SignedOut();
      return;
    }
    state = const SignedIn(null);
    await refresh();
  }

  /// Asks the server who the stored token belongs to. Without an answer the session stays as it is.
  Future<void> refresh() async {
    if (state is! SignedIn) return;
    final AppUser? user;
    try {
      user = await ref.read(authApiProvider).me();
    } on ApiNetworkException {
      return;
    } on ApiException {
      return;
    }
    if (state is! SignedIn) return;
    if (user == null) {
      await expire();
    } else {
      state = SignedIn(user);
    }
  }

  /// Keeps the token of a session the server just opened.
  Future<void> signIn(SignedInAnswer answer) async {
    await ref.read(sessionStoreProvider).writeToken(answer.token);
    state = SignedIn(answer.user);
    // A sign-in answer leaves out some fields (email, photo); `me` has them all.
    unawaited(refresh());
  }

  /// The server no longer accepts the stored token: forget it and show sign-in.
  Future<void> expire() async {
    if (state is! SignedIn) return;
    state = const SignedOut(expired: true);
    await ref.read(sessionStoreProvider).clear();
  }

  /// Ends the session on the server, then on this phone. The token is forgotten even when the server cannot be
  /// reached; it then expires on its own within seven days.
  Future<void> signOut() async {
    try {
      await ref
          .read(authApiProvider)
          .signOut()
          .timeout(const Duration(seconds: 8));
    } on Object {
      // Signing out on this phone does not wait for the network.
    }
    await ref.read(sessionStoreProvider).clear();
    state = const SignedOut();
    unawaited(ref.read(googleIdentityProvider).signOut());
  }
}
