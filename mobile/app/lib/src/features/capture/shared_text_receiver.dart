import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../ledger/offline/outbox.dart';

/// Receives text shared into SmartSpend from outside (SMS, WhatsApp, notes)
/// via Android Share Target or iOS Share Extension, routing through the outbox (CAP-05).
class SharedTextReceiver {
  SharedTextReceiver(this._ref, {MethodChannel? channel})
    : _channel = channel ?? const MethodChannel('com.smartspend.app/share');

  final Ref _ref;
  final MethodChannel _channel;

  /// Checks for any text shared into the app and submits it to the outbox.
  Future<String?> checkAndSubmitSharedText() async {
    try {
      final text = await _channel.invokeMethod<String>('getSharedText');
      if (text != null && text.trim().isNotEmpty) {
        final cleanText = text.trim();
        await _ref.read(outboxProvider.notifier).submit(cleanText);
        return cleanText;
      }
    } catch (_) {
      // Channel not available on test or unsupported platform
    }
    return null;
  }
}

final sharedTextReceiverProvider = Provider<SharedTextReceiver>((ref) {
  return SharedTextReceiver(ref);
});
