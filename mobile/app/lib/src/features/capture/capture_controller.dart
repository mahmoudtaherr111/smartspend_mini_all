import 'dart:io';
import 'dart:math';

import 'package:bank_capture/bank_capture.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/preferences.dart';
import '../../core/providers.dart';
import '../auth/auth_api.dart';
import '../auth/session_controller.dart';
import 'capture_api.dart';

final captureApiProvider = Provider<CaptureApi>(
  (ref) => CaptureApi(ref.watch(trpcClientProvider)),
);

/// Whether capture is open on the server and what the person agreed to.
final captureServerStatusProvider = FutureProvider<CaptureServerStatus>(
  (ref) => ref.watch(captureApiProvider).status(),
);

/// The captured transactions waiting for the person, newest first.
final capturePendingProvider = FutureProvider<List<PendingCapture>>(
  (ref) => ref.watch(captureApiProvider).pending(),
);

/// The banks and kinds the person may now let record on their own.
final captureAutoOffersProvider = FutureProvider<List<AutoOffer>>(
  (ref) => ref.watch(captureApiProvider).autoOffers(),
);

/// Cards and accounts seen in messages with no wallet yet.
final captureWalletOffersProvider = FutureProvider<List<WalletOffer>>(
  (ref) => ref.watch(captureApiProvider).walletOffers(),
);

/// The cards and phrases the person asked capture to ignore.
final captureIgnoredProvider = FutureProvider<List<IgnoredMarker>>(
  (ref) => ref.watch(captureApiProvider).ignored(),
);

/// The phones registered to send the person's bank messages.
final captureDevicesProvider = FutureProvider<List<CaptureDeviceRow>>(
  (ref) => ref.watch(captureApiProvider).devices(),
);

enum CaptureConnectOutcome {
  connected,

  /// The admin has not opened capture yet.
  unavailable,
}

final captureConnectorProvider = Provider<CaptureConnector>(
  CaptureConnector.new,
);

/// Connects this phone's capture to the signed-in account (decision 0028): the person's consent, a device token for
/// this installation, and the native side set up to send on its own. Signing out disconnects it
/// (`SessionController.signOut`).
class CaptureConnector {
  CaptureConnector(this._ref);

  final Ref _ref;

  Future<CaptureConnectOutcome> connect() async {
    final session = _ref.read(sessionProvider);
    final user = session is SignedIn ? session.user : null;
    if (user == null) throw StateError('capture needs a signed-in person');

    final api = _ref.read(captureApiProvider);
    final status = await api.status();
    if (!status.enabled) return CaptureConnectOutcome.unavailable;
    await api.consent(status.consentTextVersion);

    final token = await api.registerDevice(
      installationId: await _installationId(),
      platform: Platform.isIOS ? 'ios' : 'android',
    );
    final bankCapture = _ref.read(bankCaptureProvider);
    await bankCapture.connect(
      CaptureSetup(
        baseUrl: _ref.read(appConfigProvider).apiBaseUri.origin,
        deviceToken: token,
        ownerKey: ownerKey(user),
        language: _ref.read(languageProvider).code,
      ),
    );
    await bankCapture.requestNotificationPermission();
    _ref
      ..invalidate(captureServerStatusProvider)
      ..invalidate(captureStatusProvider);
    return CaptureConnectOutcome.connected;
  }

  /// Whether [device] is this phone's own registration.
  Future<bool> isThisPhone(CaptureDeviceRow device) async {
    final preferences = await _ref.read(preferencesStoreProvider).read();
    return device.installationId.isNotEmpty &&
        device.installationId == preferences.captureInstallationId;
  }

  /// Revokes [device]; when it is this phone, the native side also forgets its token and queue.
  Future<void> revoke(CaptureDeviceRow device) async {
    final here = await isThisPhone(device);
    await _ref.read(captureApiProvider).revokeDevice(device.id);
    if (here) await _ref.read(bankCaptureProvider).disconnect();
    _refresh();
  }

  /// Deletes the person's capture data on the server and stops capture on this phone.
  Future<void> deleteMyData() async {
    await _ref.read(captureApiProvider).deleteMyData();
    await _ref.read(bankCaptureProvider).disconnect();
    _refresh();
  }

  void _refresh() {
    _ref
      ..invalidate(captureDevicesProvider)
      ..invalidate(captureIgnoredProvider)
      ..invalidate(capturePendingProvider)
      ..invalidate(captureServerStatusProvider)
      ..invalidate(captureStatusProvider);
  }

  /// The account a device token belongs to, as the server names the pair (golden rule 1).
  static String ownerKey(AppUser user) =>
      '${user.kind == AccountKind.google ? 'oauth' : 'local'}:${user.id}';

  Future<String> _installationId() async {
    final store = _ref.read(preferencesStoreProvider);
    final preferences = await store.read();
    final existing = preferences.captureInstallationId;
    if (existing != null) return existing;
    final random = Random.secure();
    final id = [
      for (var i = 0; i < 16; i++)
        random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ].join();
    await store.write(preferences.copyWith(captureInstallationId: id));
    return id;
  }
}
