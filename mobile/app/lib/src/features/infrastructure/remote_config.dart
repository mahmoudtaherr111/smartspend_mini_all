import 'dart:io' show Platform;

import 'package:clock/clock.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

/// What the server says about this app build, read once at launch: the oldest version it still works with, where to
/// update, and which AI features an admin stopped.
final class RemoteConfig {
  const RemoteConfig({
    this.minVersion = '',
    this.storeUrl = '',
    this.aiOff = const {},
    this.today = '',
  });

  factory RemoteConfig.fromJson(Map<String, Object?> json, String platform) {
    String read(String key) {
      final value = json[key];
      return value is Map<String, Object?>
          ? value[platform] as String? ?? ''
          : '';
    }

    return RemoteConfig(
      minVersion: read('minVersion'),
      storeUrl: read('storeUrl'),
      aiOff: {...(json['aiOff'] as List<Object?>? ?? const []).whereType()},
      today: json['today'] as String? ?? '',
    );
  }

  final String minVersion;
  final String storeUrl;
  final Set<String> aiOff;

  /// The Cairo day as the server counts it, "2026-11-02"; empty when the server did not answer.
  final String today;
}

/// Whether [installed] comes before [minimum], part by part: "1.9.0" before "1.10.0". An empty or unreadable minimum
/// requires nothing, so a mistake in the setting cannot lock people out.
bool isOlderVersion(String installed, String minimum) {
  List<int>? parts(String version) {
    final numbers = version.trim().split('.').map(int.tryParse).toList();
    if (version.trim().isEmpty || numbers.contains(null)) return null;
    return numbers.cast<int>();
  }

  final have = parts(installed);
  final need = parts(minimum);
  if (have == null || need == null) return false;
  for (var i = 0; i < need.length; i++) {
    final own = i < have.length ? have[i] : 0;
    if (own != need[i]) return own < need[i];
  }
  return false;
}

/// Without an answer the app works as it did: this check must never be the reason it stops.
final remoteConfigProvider = FutureProvider<RemoteConfig>((ref) async {
  try {
    final data = await ref
        .watch(trpcClientProvider)
        .query(Procedures.appConfig.get);
    if (data is! Map<String, Object?>) return const RemoteConfig();
    return RemoteConfig.fromJson(data, Platform.isIOS ? 'ios' : 'android');
  } on Object {
    return const RemoteConfig();
  }
});

/// Today on the server's calendar (mobile rule 8); the phone's date only when the server has not answered.
final todayProvider = FutureProvider<DateTime>((ref) async {
  final config = await ref.watch(remoteConfigProvider.future);
  return DateTime.tryParse(config.today) ?? clock.now();
});

/// The calendar month on the server, "2026-11". The ledger's financial month, which follows the payday, is
/// `currentMonthProvider`.
final serverMonthProvider = FutureProvider<String>((ref) async {
  final today = await ref.watch(todayProvider.future);
  return '${today.year}-${today.month.toString().padLeft(2, '0')}';
});

final installedVersionProvider = FutureProvider<String?>((ref) async {
  try {
    return (await PackageInfo.fromPlatform()).version;
  } on Object {
    return null;
  }
});

/// The configuration when this build is too old to use, otherwise null.
final updateRequiredProvider = Provider<RemoteConfig?>((ref) {
  final config = ref.watch(remoteConfigProvider).value;
  final installed = ref.watch(installedVersionProvider).value;
  if (config == null || installed == null) return null;
  return isOlderVersion(installed, config.minVersion) ? config : null;
});

/// Reads the configuration again when the app returns from the background: a phone can sleep past midnight or past a
/// stopped feature.
class RemoteConfigRefresher extends ConsumerStatefulWidget {
  const RemoteConfigRefresher({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<RemoteConfigRefresher> createState() =>
      _RemoteConfigRefresherState();
}

class _RemoteConfigRefresherState extends ConsumerState<RemoteConfigRefresher> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.invalidate(remoteConfigProvider),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
