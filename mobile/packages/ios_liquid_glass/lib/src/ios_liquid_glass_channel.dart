import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// One destination displayed in [IosLiquidGlassTabBar].
@immutable
final class IosLiquidGlassTabItem {
  const IosLiquidGlassTabItem({
    required this.id,
    required this.label,
    required this.sfSymbol,
    this.badge = 0,
  });

  final String id;
  final String label;
  final String sfSymbol;
  final int badge;

  Map<String, Object?> toMap() => <String, Object?>{
    'id': id,
    'label': label,
    'sfSymbol': sfSymbol,
    'badge': badge < 0 ? 0 : badge,
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is IosLiquidGlassTabItem &&
          id == other.id &&
          label == other.label &&
          sfSymbol == other.sfSymbol &&
          badge == other.badge;

  @override
  int get hashCode => Object.hash(id, label, sfSymbol, badge);
}

/// Optional detached circular quick-action button beside the tab capsule.
@immutable
final class IosLiquidGlassHotAction {
  const IosLiquidGlassHotAction({
    required this.id,
    required this.label,
    required this.sfSymbol,
    this.accessibilityLabel,
  });

  final String id;
  final String label;
  final String sfSymbol;
  final String? accessibilityLabel;

  Map<String, Object?> toMap() => <String, Object?>{
    'id': id,
    'label': label,
    'sfSymbol': sfSymbol,
    'accessibilityLabel': accessibilityLabel ?? label,
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is IosLiquidGlassHotAction &&
          id == other.id &&
          label == other.label &&
          sfSymbol == other.sfSymbol &&
          accessibilityLabel == other.accessibilityLabel;

  @override
  int get hashCode => Object.hash(id, label, sfSymbol, accessibilityLabel);
}

/// Control channel for probing native iOS Liquid Glass availability.
abstract final class IosLiquidGlassChannel {
  static const String viewType = 'ios_liquid_glass/tab_bar';
  static const String controlChannelName =
      'com.smartspend.ios_liquid_glass/control';

  static const MethodChannel _controlChannel = MethodChannel(
    controlChannelName,
  );

  /// Channel name used by a mounted PlatformView instance with [viewId].
  static String viewChannelName(int viewId) => '${viewType}_$viewId';

  /// True on iOS 15+ when the native Liquid Glass plugin is registered
  /// (iOS 26 `UIGlassEffect` or iOS 15-18 `UIBlurEffect` material).
  static Future<bool> isNativeLiquidGlassAvailable({
    MethodChannel? channel,
    bool? isIosOverride,
  }) async {
    final onIos = isIosOverride ?? (!kIsWeb && Platform.isIOS);
    if (!onIos) return false;
    try {
      final result = await (channel ?? _controlChannel).invokeMethod<bool>(
        'isNativeLiquidGlassAvailable',
      );
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// True only on iOS 26+ built with Xcode 26 / Swift 6.2+ (`UIGlassEffect`).
  static Future<bool> supportsSystemGlassEffect({
    MethodChannel? channel,
    bool? isIosOverride,
  }) async {
    final onIos = isIosOverride ?? (!kIsWeb && Platform.isIOS);
    if (!onIos) return false;
    try {
      final result = await (channel ?? _controlChannel).invokeMethod<bool>(
        'supportsSystemGlassEffect',
      );
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }
}
