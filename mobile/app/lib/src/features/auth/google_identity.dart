import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../config/app_config.dart';
import '../../core/providers.dart';

/// The phone's Google sign-in, reduced to what the server needs: an ID token for `auth.signInWithGoogle`.
abstract interface class GoogleIdentity {
  /// Whether this build is configured for Google on this platform. The button is shown only then.
  bool get isAvailable;

  /// Shows Google's account picker and returns the ID token of the chosen account, or null when the person closed
  /// it. Throws [GoogleIdentityFailure] when Google could not sign in.
  Future<String?> requestIdToken();

  /// Forgets the chosen account, so the next sign-in asks again.
  Future<void> signOut();
}

final class GoogleIdentityFailure implements Exception {
  const GoogleIdentityFailure(this.reason);

  /// For debugging only; the user reads a fixed message.
  final String reason;

  @override
  String toString() => 'GoogleIdentityFailure($reason)';
}

final googleIdentityProvider = Provider<GoogleIdentity>(
  (ref) => PluginGoogleIdentity(ref.watch(appConfigProvider)),
);

/// [GoogleIdentity] through the `google_sign_in` plugin: Credential Manager on Android, the Google Sign-In SDK on
/// iOS.
///
/// Both platforms are given the server's web client id, so the ID token is issued for the server and names the
/// app's own client as its authorized party, which `api/lib/google-id-token.ts` checks. Android needs nothing else
/// in the app (its client is matched by package name and signing key in Google Cloud); iOS needs its own client id
/// and that id reversed as a URL scheme (`ios/Flutter/GoogleSignIn.xcconfig`).
final class PluginGoogleIdentity implements GoogleIdentity {
  PluginGoogleIdentity(this._config);

  final AppConfig _config;
  Future<void>? _initialized;

  @override
  bool get isAvailable => switch (defaultTargetPlatform) {
    TargetPlatform.android => _config.googleServerClientId.isNotEmpty,
    TargetPlatform.iOS =>
      _config.googleIosClientId.isNotEmpty &&
          _config.googleServerClientId.isNotEmpty,
    _ => false,
  };

  /// The plugin is initialized once per process, on first use; a failed attempt is tried again next time.
  Future<void> _initialize() => _initialized ??= () async {
    try {
      await GoogleSignIn.instance.initialize(
        clientId: defaultTargetPlatform == TargetPlatform.iOS
            ? _config.googleIosClientId
            : null,
        serverClientId: _config.googleServerClientId,
      );
    } on Object {
      _initialized = null;
      rethrow;
    }
  }();

  @override
  Future<String?> requestIdToken() async {
    if (!isAvailable) throw const GoogleIdentityFailure('not configured');
    final signIn = GoogleSignIn.instance;
    try {
      await _initialize();
      if (!signIn.supportsAuthenticate()) {
        throw const GoogleIdentityFailure('authenticate is not supported');
      }
      final account = await signIn.authenticate(scopeHint: const ['email']);
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const GoogleIdentityFailure('no ID token');
      }
      return idToken;
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) return null;
      throw GoogleIdentityFailure(error.code.name);
    }
  }

  @override
  Future<void> signOut() async {
    if (!isAvailable) return;
    try {
      await _initialize();
      await GoogleSignIn.instance.signOut();
    } on Object {
      // Nothing to forget, or the plugin is gone; the next sign-in asks for an account either way.
    }
  }
}
