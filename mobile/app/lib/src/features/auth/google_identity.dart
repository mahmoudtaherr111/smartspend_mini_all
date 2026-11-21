import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart';

import '../../config/app_config.dart';
import '../../core/providers.dart';

/// What `auth.signInWithGoogle` needs from one Google sign-in on the phone.
@immutable
final class GoogleCredential {
  const GoogleCredential({required this.idToken, required this.nonce});

  final String idToken;

  /// The random value made for this sign-in. Google holds only its hash, in the token; the server checks that the
  /// two match and accepts each value once, so a token that leaked without it signs no one in.
  final String nonce;
}

/// A new value for each sign-in: 32 random bytes, base64url without padding (43 characters).
String newGoogleNonce([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(32, (_) => source.nextInt(256));
  return base64Url.encode(bytes).replaceAll('=', '');
}

/// The token's `nonce` claim for [nonce]: its SHA-256 in lowercase hex, as `googleNonceHash` in
/// `api/lib/google-id-token.ts` computes it.
String googleNonceHash(String nonce) =>
    sha256.convert(utf8.encode(nonce)).toString();

/// The phone's Google sign-in, reduced to what the server needs: an ID token bound to one sign-in.
abstract interface class GoogleIdentity {
  /// Whether this build is configured for Google on this platform. The button is shown only then.
  bool get isAvailable;

  /// Shows Google's account picker and returns the chosen account's credential, or null when the person closed it.
  /// Throws [GoogleIdentityFailure] when Google could not sign in.
  Future<GoogleCredential?> requestCredential();

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

  String? get _clientId => defaultTargetPlatform == TargetPlatform.iOS
      ? _config.googleIosClientId
      : null;

  /// The plugin is initialized once per process, on first use; a failed attempt is tried again next time.
  Future<void> _initialize() => _initialized ??= () async {
    try {
      await GoogleSignIn.instance.initialize(
        clientId: _clientId,
        serverClientId: _config.googleServerClientId,
      );
    } on Object {
      _initialized = null;
      rethrow;
    }
  }();

  @override
  Future<GoogleCredential?> requestCredential() async {
    if (!isAvailable) throw const GoogleIdentityFailure('not configured');
    final signIn = GoogleSignIn.instance;
    try {
      await _initialize();
      if (!signIn.supportsAuthenticate()) {
        throw const GoogleIdentityFailure('authenticate is not supported');
      }
      // google_sign_in takes the nonce only when it is initialized, and each sign-in needs its own. The platform's
      // init only stores its parameters (Android) or configures the SDK again (iOS), so it is given this sign-in's
      // nonce just before the account picker opens.
      final nonce = newGoogleNonce();
      await GoogleSignInPlatform.instance.init(
        InitParameters(
          clientId: _clientId,
          serverClientId: _config.googleServerClientId,
          nonce: googleNonceHash(nonce),
        ),
      );
      final account = await signIn.authenticate(scopeHint: const ['email']);
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const GoogleIdentityFailure('no ID token');
      }
      return GoogleCredential(idToken: idToken, nonce: nonce);
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
