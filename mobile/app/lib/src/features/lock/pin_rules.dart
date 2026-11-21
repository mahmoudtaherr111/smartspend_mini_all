import 'dart:typed_data';

/// The rules of the app lock's PIN (docs/decisions/0023-mobile-app-lock.md).
abstract final class PinRules {
  /// Six digits: a million choices instead of four digits' ten thousand, as banking apps ask.
  static const length = 6;

  /// Wrong PINs in a row that end the session on this phone. The person signs in again with their password or
  /// Google and sets a new PIN; the account on the server is untouched.
  static const maxFailures = 10;

  /// Tries left before signing out at which the lock screen starts warning.
  static const warnWhenLeft = 3;

  /// How long the pad stays blocked after [failures] wrong PINs in a row: the first four cost nothing (a typo
  /// happens), then the wait grows.
  static Duration waitAfter(int failures) => switch (failures) {
    < 5 => Duration.zero,
    5 => const Duration(seconds: 30),
    6 => const Duration(minutes: 1),
    7 => const Duration(minutes: 5),
    8 => const Duration(minutes: 15),
    _ => const Duration(hours: 1),
  };

  /// What is left of the wait at [now]. A clock set back before the last failure restarts the whole wait, so
  /// changing the phone's time does not skip it.
  static Duration waitLeft({
    required int failures,
    required DateTime? lastFailureAt,
    required DateTime now,
  }) {
    final wait = waitAfter(failures);
    if (wait == Duration.zero || lastFailureAt == null) return Duration.zero;
    if (now.isBefore(lastFailureAt)) return wait;
    final left = wait - now.difference(lastFailureAt);
    return left.isNegative ? Duration.zero : left;
  }

  /// A PIN anyone would try first: one digit repeated, a run up or down the pad, a pair or a triple repeated, or a
  /// few well-known ones. NIST SP 800-63B asks to refuse such values.
  static bool isGuessable(String pin) {
    if (pin.length != length || !RegExp(r'^\d+$').hasMatch(pin)) return true;
    if (pin.split('').toSet().length == 1) return true;
    var up = true;
    var down = true;
    for (var i = 1; i < pin.length; i++) {
      final step = pin.codeUnitAt(i) - pin.codeUnitAt(i - 1);
      if (step != 1 && step != -9) up = false;
      if (step != -1 && step != 9) down = false;
    }
    if (up || down) return true;
    if (pin == pin.substring(0, 2) * 3 || pin == pin.substring(0, 3) * 2) {
      return true;
    }
    return const {
      '112233',
      '102030',
      '147258',
      '159753',
      '147852',
      '123321',
      '696969',
      '520520',
    }.contains(pin);
  }
}

/// Compares two tags in time that does not depend on where they differ.
bool sameBytes(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }
  return difference == 0;
}
