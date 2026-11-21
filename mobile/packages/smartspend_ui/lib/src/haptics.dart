import 'package:flutter/services.dart';

/// The app's haptics, by meaning (rule 8.1 of docs/guides/mobile-design.md, from Apple's guidance on haptics):
/// each pattern is used only for what it means, never for opposite outcomes, and never on every touch.
abstract final class SmartSpendHaptics {
  /// Off when the person turns haptics off in the app's settings; the app works the same without them.
  static bool enabled = true;

  /// A value or a tab changed: a picker moved, a segment or a tab was chosen.
  static Future<void> selection() =>
      enabled ? HapticFeedback.selectionClick() : Future.value();

  /// Something snapped into place: a sheet reached a stop, a swipe crossed its threshold.
  static Future<void> impact() =>
      enabled ? HapticFeedback.lightImpact() : Future.value();

  /// A task finished as the person wanted: an expense saved, a budget set.
  static Future<void> success() =>
      enabled ? HapticFeedback.successNotification() : Future.value();

  /// A task finished, but needs attention: saved offline, close to a limit.
  static Future<void> warning() =>
      enabled ? HapticFeedback.warningNotification() : Future.value();

  /// A task failed.
  static Future<void> error() =>
      enabled ? HapticFeedback.errorNotification() : Future.value();
}
