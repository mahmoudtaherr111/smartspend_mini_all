import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ios_liquid_glass/ios_liquid_glass.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const sampleItems = <IosLiquidGlassTabItem>[
    IosLiquidGlassTabItem(
      id: 'record',
      label: 'تسجيل',
      sfSymbol: 'plus.circle.fill',
    ),
    IosLiquidGlassTabItem(
      id: 'stats',
      label: 'إحصائيات',
      sfSymbol: 'chart.bar.fill',
    ),
    IosLiquidGlassTabItem(id: 'ai', label: 'الذكي', sfSymbol: 'sparkles'),
  ];

  group('IosLiquidGlassChannel', () {
    const controlChannel = MethodChannel(
      IosLiquidGlassChannel.controlChannelName,
    );

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(controlChannel, null);
    });

    test(
      'returns false on non-iOS without invoking platform channel',
      () async {
        var invoked = false;
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(controlChannel, (_) async {
              invoked = true;
              return true;
            });

        expect(
          await IosLiquidGlassChannel.isNativeLiquidGlassAvailable(
            isIosOverride: false,
          ),
          isFalse,
        );
        expect(invoked, isFalse);
      },
    );

    test('reads availability and system glass support on iOS', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(controlChannel, (call) async {
            return switch (call.method) {
              'isNativeLiquidGlassAvailable' => true,
              'supportsSystemGlassEffect' => true,
              _ => null,
            };
          });

      expect(
        await IosLiquidGlassChannel.isNativeLiquidGlassAvailable(
          isIosOverride: true,
        ),
        isTrue,
      );
      expect(
        await IosLiquidGlassChannel.supportsSystemGlassEffect(
          isIosOverride: true,
        ),
        isTrue,
      );
    });

    test('returns false cleanly when plugin is missing', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(controlChannel, null);

      expect(
        await IosLiquidGlassChannel.isNativeLiquidGlassAvailable(
          isIosOverride: true,
        ),
        isFalse,
      );
    });
  });

  group('IosLiquidGlassTabBar', () {
    testWidgets('delegates to fallback on non-iOS hosts', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            bottomNavigationBar: IosLiquidGlassTabBar(
              items: sampleItems,
              selectedIndex: 0,
              onSelected: (_) {},
              fallback: (_) => const Text('fallback-bar'),
            ),
          ),
        ),
      );

      expect(find.text('fallback-bar'), findsOneWidget);
      expect(find.byType(UiKitView), findsNothing);
    });

    testWidgets('uses fallback when high contrast is enabled', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(highContrast: true),
            child: Scaffold(
              bottomNavigationBar: IosLiquidGlassTabBar(
                items: sampleItems,
                selectedIndex: 0,
                onSelected: (_) {},
                forceNativeViewForTest: true,
                fallback: (_) => const Text('high-contrast-fallback'),
              ),
            ),
          ),
        ),
      );

      expect(find.text('high-contrast-fallback'), findsOneWidget);
      expect(find.byType(UiKitView), findsNothing);
    });

    testWidgets('mounts UiKitView and syncs MethodChannel updates', (
      tester,
    ) async {
      final createdCalls = <MethodCall>[];
      final viewCalls = <MethodCall>[];
      int? createdViewId;

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform_views, (
            call,
          ) async {
            createdCalls.add(call);
            if (call.method == 'create') {
              final args = call.arguments as Map<Object?, Object?>;
              createdViewId = args['id'] as int?;
            }
            return null;
          });

      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform_views, null);
        if (createdViewId != null) {
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
              .setMockMethodCallHandler(
                MethodChannel(
                  IosLiquidGlassChannel.viewChannelName(createdViewId!),
                ),
                null,
              );
        }
      });

      var selectedFromNative = -1;
      String? hotActionFromNative;

      Widget buildApp({
        required int activeIndex,
        required ThemeMode themeMode,
        required TextDirection direction,
        List<IosLiquidGlassTabItem> items = sampleItems,
      }) {
        return MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: themeMode,
          home: Directionality(
            textDirection: direction,
            child: Scaffold(
              bottomNavigationBar: IosLiquidGlassTabBar(
                items: items,
                selectedIndex: activeIndex,
                onSelected: (index) => selectedFromNative = index,
                hotAction: const IosLiquidGlassHotAction(
                  id: 'quick-record',
                  label: 'تسجيل سريع',
                  sfSymbol: 'mic.fill',
                ),
                onHotActionPressed: (id) => hotActionFromNative = id,
                forceNativeViewForTest: true,
                fallback: (_) => const Text('fallback-bar'),
              ),
            ),
          ),
        );
      }

      await tester.pumpWidget(
        buildApp(
          activeIndex: 0,
          themeMode: ThemeMode.dark,
          direction: TextDirection.rtl,
        ),
      );
      await tester.pump();

      expect(find.byType(UiKitView), findsOneWidget);
      expect(find.text('fallback-bar'), findsNothing);
      expect(createdViewId, isNotNull);

      final viewChannel = MethodChannel(
        IosLiquidGlassChannel.viewChannelName(createdViewId!),
      );
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(viewChannel, (call) async {
            viewCalls.add(call);
            return null;
          });

      // Trigger setActiveIndex
      await tester.pumpWidget(
        buildApp(
          activeIndex: 2,
          themeMode: ThemeMode.dark,
          direction: TextDirection.rtl,
        ),
      );
      await tester.pump();

      // Trigger setTheme + setLocale
      await tester.pumpWidget(
        buildApp(
          activeIndex: 2,
          themeMode: ThemeMode.light,
          direction: TextDirection.ltr,
        ),
      );
      await tester.pumpAndSettle();

      // Trigger updateItems
      await tester.pumpWidget(
        buildApp(
          activeIndex: 2,
          themeMode: ThemeMode.light,
          direction: TextDirection.ltr,
          items: const <IosLiquidGlassTabItem>[
            IosLiquidGlassTabItem(
              id: 'record',
              label: 'Record',
              sfSymbol: 'plus.circle.fill',
              badge: 3,
            ),
            IosLiquidGlassTabItem(
              id: 'stats',
              label: 'Stats',
              sfSymbol: 'chart.bar.fill',
            ),
            IosLiquidGlassTabItem(id: 'ai', label: 'AI', sfSymbol: 'sparkles'),
          ],
        ),
      );
      await tester.pump();

      expect(
        viewCalls.map((c) => c.method),
        containsAll(<String>[
          'setActiveIndex',
          'setTheme',
          'setLocale',
          'updateItems',
        ]),
      );

      // Simulate native Swift callbacks -> Dart
      const codec = StandardMethodCodec();
      await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .handlePlatformMessage(
            viewChannel.name,
            codec.encodeMethodCall(
              const MethodCall('onTabSelected', <String, Object?>{
                'index': 1,
                'id': 'stats',
              }),
            ),
            (_) {},
          );
      await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .handlePlatformMessage(
            viewChannel.name,
            codec.encodeMethodCall(
              const MethodCall('onHotActionPressed', <String, Object?>{
                'id': 'quick-record',
              }),
            ),
            (_) {},
          );

      expect(selectedFromNative, 1);
      expect(hotActionFromNative, 'quick-record');
    });
  });
}
