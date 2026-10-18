import 'dart:async';

import 'package:clock/clock.dart';

import 'package:smartspend_api/smartspend_api.dart';

/// Opens one connection to the challenge's event stream and completes with its next outcome, or null when
/// `cancel` completed first: `PhoneChallengeEvents.next`.
typedef NextChallengeOutcome = Future<PhoneChallengeOutcome?> Function(
  String watch, {
  Future<void>? cancel,
});

/// Waits for the bot to see a phone challenge's code, across everything that happens meanwhile: the person leaves
/// for WhatsApp and comes back, the phone drops the connection, the network changes.
///
/// A connection that ends without an outcome is opened again after a short wait, and at once when the app returns
/// to the foreground ([resume]); the server answers a challenge that was verified meanwhile on the first event. It
/// stops at the challenge's deadline, and when [dispose] is called.
final class ChallengeFollower {
  ChallengeFollower({
    required this.next,
    required this.watch,
    required this.deadline,
    required this.onOutcome,
    DateTime Function()? now,
    this.retryDelays = const [
      Duration(seconds: 2),
      Duration(seconds: 5),
      Duration(seconds: 10),
      Duration(seconds: 20),
      Duration(seconds: 30),
    ],
    this.rateLimitDelay = const Duration(minutes: 1),
  }) : _now = now ?? clock.now;

  final NextChallengeOutcome next;
  final String watch;
  final DateTime deadline;

  /// Told each outcome. [PhoneChallengeOutcome.wrongSender] leaves the follower waiting for the right number; the
  /// other two end it.
  final void Function(PhoneChallengeOutcome outcome) onOutcome;

  /// The waits between failed connections, the last one repeating.
  final List<Duration> retryDelays;

  /// The wait after the server refused another stream from this address.
  final Duration rateLimitDelay;

  final DateTime Function() _now;

  bool _running = false;
  bool _stopped = false;
  Completer<void>? _cancelConnection;
  Completer<void>? _wakeUp;
  Timer? _sleepTimer;

  void start() {
    if (_running || _stopped) return;
    _running = true;
    unawaited(_run());
  }

  /// The app is in the foreground again: a connection kept through the background may be dead without knowing
  /// it, so the follower opens a fresh one now instead of waiting for the old one to time out.
  void resume() {
    if (!_running || _stopped) return;
    _complete(_cancelConnection);
    _complete(_wakeUp);
  }

  void dispose() {
    _stopped = true;
    _sleepTimer?.cancel();
    _complete(_cancelConnection);
    _complete(_wakeUp);
  }

  Future<void> _run() async {
    var failures = 0;
    while (!_stopped) {
      if (!_now().isBefore(deadline)) {
        _finish(PhoneChallengeOutcome.expired);
        return;
      }
      final cancel = _cancelConnection = Completer<void>();
      Duration? wait;
      try {
        final outcome = await next(watch, cancel: cancel.future);
        if (_stopped) return;
        switch (outcome) {
          case null:
            // Cancelled by [resume]: reconnect at once.
            failures = 0;
          case PhoneChallengeOutcome.wrongSender:
            failures = 0;
            onOutcome(PhoneChallengeOutcome.wrongSender);
          case PhoneChallengeOutcome.verified:
          case PhoneChallengeOutcome.expired:
            _finish(outcome);
            return;
        }
      } on ApiException catch (error) {
        wait = error.code == 'TOO_MANY_REQUESTS'
            ? rateLimitDelay
            : _retryDelay(failures++);
      } on ApiNetworkException {
        wait = _retryDelay(failures++);
      } finally {
        _cancelConnection = null;
      }
      if (wait != null && !_stopped) await _sleep(wait);
    }
  }

  Duration _retryDelay(int failures) =>
      retryDelays[failures.clamp(0, retryDelays.length - 1)];

  /// Waits [duration], or less when [resume] or [dispose] is called, and never past the deadline.
  Future<void> _sleep(Duration duration) async {
    final untilDeadline = deadline.difference(_now());
    final wake = _wakeUp = Completer<void>();
    _sleepTimer = Timer(
      duration < untilDeadline ? duration : untilDeadline,
      () => _complete(wake),
    );
    await wake.future;
    _sleepTimer?.cancel();
    _sleepTimer = null;
    _wakeUp = null;
  }

  void _finish(PhoneChallengeOutcome outcome) {
    if (_stopped) return;
    _stopped = true;
    onOutcome(outcome);
  }

  static void _complete(Completer<void>? completer) {
    if (completer != null && !completer.isCompleted) completer.complete();
  }
}
