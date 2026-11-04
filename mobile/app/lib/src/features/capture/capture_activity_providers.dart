import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../auth/session_controller.dart';
import 'capture_activity_api.dart';
import 'capture_controller.dart';

final captureActivityApiProvider = Provider<CaptureActivityApi>((ref) {
  ref.watch(sessionProvider);
  return CaptureActivityApi(ref.watch(trpcClientProvider));
});

/// Poll only an observed, enabled automatic account, and only while the app is in the foreground.
final captureActivityProvider =
    FutureProvider.autoDispose<List<CaptureActivityItem>>((ref) async {
      if (ref.watch(sessionProvider) is! SignedIn) return const [];
      final status = await ref.watch(captureServerStatusProvider.future);
      if (!ref.mounted ||
          !status.automatic ||
          !status.enabled ||
          !status.consented) {
        return const [];
      }
      final timer = Timer(const Duration(seconds: 30), () {
        if (WidgetsBinding.instance.lifecycleState ==
            AppLifecycleState.resumed) {
          ref.invalidateSelf();
        }
      });
      ref.onDispose(timer.cancel);
      return ref.watch(captureActivityApiProvider).activity();
    });

final capturePurposeQuestionProvider =
    FutureProvider.autoDispose<CapturePurposeQuestion?>((ref) async {
      if (ref.watch(sessionProvider) is! SignedIn) return null;
      final status = await ref.watch(captureServerStatusProvider.future);
      if (!ref.mounted || !status.automatic || !status.questionsEnabled) {
        return null;
      }
      return ref.watch(captureActivityApiProvider).nextQuestion();
    });
