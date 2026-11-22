import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'ios_liquid_glass_channel.dart';

/// Native iOS floating Liquid Glass tab bar mounted via [UiKitView].
///
/// Renders inside Flutter's normal widget tree (never as a separate window
/// overlay), so root-navigator bottom sheets (`showSmartSpendSheet`), dialogs,
/// and the app lock always cover it cleanly.
///
/// On non-iOS platforms, web, high-contrast accessibility mode, or when
/// [useNativeOnIos] is false, this widget delegates directly to [fallback].
class IosLiquidGlassTabBar extends StatefulWidget {
  const IosLiquidGlassTabBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelected,
    required this.fallback,
    this.hotAction,
    this.onHotActionPressed,
    this.height = 74,
    this.useNativeOnIos = true,
    @visibleForTesting this.forceNativeViewForTest,
  });

  final List<IosLiquidGlassTabItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final WidgetBuilder fallback;
  final IosLiquidGlassHotAction? hotAction;
  final ValueChanged<String>? onHotActionPressed;

  /// Content height reserved above the bottom safe area (58pt capsule + 16pt breathing room).
  final double height;
  final bool useNativeOnIos;

  /// Test-only override to exercise the [UiKitView] + [MethodChannel] path on non-iOS hosts.
  @visibleForTesting
  final bool? forceNativeViewForTest;

  @override
  State<IosLiquidGlassTabBar> createState() => _IosLiquidGlassTabBarState();
}

class _IosLiquidGlassTabBarState extends State<IosLiquidGlassTabBar> {
  MethodChannel? _viewChannel;
  Brightness? _lastBrightness;
  TextDirection? _lastDirection;
  String? _lastLocale;

  bool _shouldUseNative(BuildContext context) {
    if (!widget.useNativeOnIos) return false;
    if (MediaQuery.highContrastOf(context)) return false;
    final override = widget.forceNativeViewForTest;
    if (override != null) return override;
    return !kIsWeb &&
        Platform.isIOS &&
        Theme.of(context).platform == TargetPlatform.iOS;
  }

  Map<String, Object?> _creationParams(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final direction = Directionality.of(context);
    final locale =
        Localizations.maybeLocaleOf(context)?.toLanguageTag() ?? 'ar';
    return <String, Object?>{
      'items': <Map<String, Object?>>[
        for (final item in widget.items) item.toMap(),
      ],
      'activeIndex': widget.selectedIndex,
      'theme': brightness == Brightness.dark ? 'dark' : 'light',
      'rtl': direction == TextDirection.rtl,
      'locale': locale,
      if (widget.hotAction != null) 'hotAction': widget.hotAction!.toMap(),
    };
  }

  void _onPlatformViewCreated(int viewId) {
    if (!mounted) return;
    _viewChannel?.setMethodCallHandler(null);
    final channel = MethodChannel(
      IosLiquidGlassChannel.viewChannelName(viewId),
    );
    channel.setMethodCallHandler(_handleNativeCall);
    _viewChannel = channel;
  }

  Future<Object?> _handleNativeCall(MethodCall call) async {
    final args = call.arguments;
    switch (call.method) {
      case 'onTabSelected':
        if (args is Map<Object?, Object?>) {
          final index = args['index'];
          if (index is int && index >= 0 && index < widget.items.length) {
            widget.onSelected(index);
          }
        }
        return null;
      case 'onHotActionPressed':
        if (args is Map<Object?, Object?>) {
          final id = args['id'];
          if (id is String && id.isNotEmpty) {
            widget.onHotActionPressed?.call(id);
          }
        }
        return null;
      default:
        return null;
    }
  }

  void _invokeSafe(String method, Map<String, Object?> arguments) {
    final channel = _viewChannel;
    if (channel == null) return;
    unawaited(
      channel.invokeMethod<void>(method, arguments).catchError((Object _) {}),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final brightness = Theme.of(context).brightness;
    final direction = Directionality.of(context);
    final locale =
        Localizations.maybeLocaleOf(context)?.toLanguageTag() ?? 'ar';

    if (_viewChannel != null) {
      if (_lastBrightness != null && _lastBrightness != brightness) {
        _invokeSafe('setTheme', <String, Object?>{
          'theme': brightness == Brightness.dark ? 'dark' : 'light',
          'animated': true,
        });
      }
      if ((_lastDirection != null && _lastDirection != direction) ||
          (_lastLocale != null && _lastLocale != locale)) {
        _invokeSafe('setLocale', <String, Object?>{
          'rtl': direction == TextDirection.rtl,
          'locale': locale,
        });
      }
    }

    _lastBrightness = brightness;
    _lastDirection = direction;
    _lastLocale = locale;
  }

  @override
  void didUpdateWidget(covariant IosLiquidGlassTabBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_viewChannel == null) return;

    final itemsChanged = !listEquals(oldWidget.items, widget.items);
    final hotActionChanged = oldWidget.hotAction != widget.hotAction;
    if (itemsChanged || hotActionChanged) {
      _invokeSafe('updateItems', <String, Object?>{
        'items': <Map<String, Object?>>[
          for (final item in widget.items) item.toMap(),
        ],
        'activeIndex': widget.selectedIndex,
        'hotAction': widget.hotAction?.toMap(),
      });
    } else if (oldWidget.selectedIndex != widget.selectedIndex) {
      _invokeSafe('setActiveIndex', <String, Object?>{
        'index': widget.selectedIndex,
        'animated': true,
      });
    }
  }

  @override
  void dispose() {
    _viewChannel?.setMethodCallHandler(null);
    _viewChannel = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_shouldUseNative(context)) {
      return widget.fallback(context);
    }

    return SafeArea(
      top: false,
      child: SizedBox(
        height: widget.height,
        width: double.infinity,
        child: UiKitView(
          viewType: IosLiquidGlassChannel.viewType,
          layoutDirection: Directionality.of(context),
          creationParams: _creationParams(context),
          creationParamsCodec: const StandardMessageCodec(),
          gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
            Factory<HorizontalDragGestureRecognizer>(
              HorizontalDragGestureRecognizer.new,
            ),
            Factory<TapGestureRecognizer>(TapGestureRecognizer.new),
          },
          onPlatformViewCreated: _onPlatformViewCreated,
        ),
      ),
    );
  }
}
