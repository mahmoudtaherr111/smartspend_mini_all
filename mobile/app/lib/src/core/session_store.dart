import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keeps the session token the server returns at sign-in: in the Keychain on iOS and in Keystore-backed
/// storage on Android, never in plain preferences.
///
/// On iOS the token is readable after the first unlock and stays on this device (no iCloud Keychain, no backup),
/// so work that runs while the phone is locked, such as a Shortcuts automation, can still use it.
class SessionStore {
  SessionStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _tokenKey = 'smartspend.session_token';

  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> writeToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<void> clear() => _storage.delete(key: _tokenKey);
}
