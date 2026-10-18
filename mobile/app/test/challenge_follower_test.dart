import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_app/src/features/auth/challenge_follower.dart';

/// One scripted connection: what it answers, or the error it fails with.
typedef _Connection = FutureOr<PhoneChallengeOutcome?> Function();

void main() {
  late List<_Connection> script;
  late List<PhoneChallengeOutcome> outcomes;
  late int connections;
  late FakeAsync time;

  /// Answers each connection from [script] in turn; past its end, a connection waits until cancelled.
  Future<PhoneChallengeOutcome?> next(String watch, {Future<void>? cancel}) {
    expect(watch, '9.watch');
    final index = connections++;
    if (index < script.length) return Future.sync(script[index]);
    final waiting = Completer<PhoneChallengeOutcome?>();
    cancel?.then((_) => waiting.complete(null));
    return waiting.future;
  }

  ChallengeFollower follower({
    Duration lifetime = const Duration(minutes: 10),
  }) => ChallengeFollower(
    next: next,
    watch: '9.watch',
    deadline: time.getClock(DateTime(2026, 10, 18)).now().add(lifetime),
    now: () => time.getClock(DateTime(2026, 10, 18)).now(),
    onOutcome: outcomes.add,
  );

  void run(void Function(FakeAsync async) body) => fakeAsync((async) {
    time = async;
    script = [];
    outcomes = [];
    connections = 0;
    body(async);
  });

  test('reports the outcome and stops', () {
    run((async) {
      script = [() => PhoneChallengeOutcome.verified];
      follower().start();
      async.flushMicrotasks();

      expect(outcomes, [PhoneChallengeOutcome.verified]);
      expect(connections, 1);
    });
  });

  test('keeps waiting after a code from the wrong number', () {
    run((async) {
      script = [
        () => PhoneChallengeOutcome.wrongSender,
        () => PhoneChallengeOutcome.verified,
      ];
      follower().start();
      async.flushMicrotasks();

      expect(outcomes, [
        PhoneChallengeOutcome.wrongSender,
        PhoneChallengeOutcome.verified,
      ]);
    });
  });

  test(
    'reconnects after a dropped connection, waiting a little longer each time',
    () {
      run((async) {
        script = [
          () => throw ApiNetworkException(Exception('dropped')),
          () => throw ApiNetworkException(Exception('dropped')),
          () => PhoneChallengeOutcome.verified,
        ];
        follower().start();
        async.flushMicrotasks();
        expect(connections, 1);

        async.elapse(const Duration(seconds: 2));
        expect(connections, 2);

        async.elapse(const Duration(seconds: 4));
        expect(connections, 2);
        async.elapse(const Duration(seconds: 1));
        expect(connections, 3);
        expect(outcomes, [PhoneChallengeOutcome.verified]);
      });
    },
  );

  test('backs off for a minute when the server refuses more streams', () {
    run((async) {
      script = [
        () => throw const ApiException(
          code: 'TOO_MANY_REQUESTS',
          httpStatus: 429,
          message: 'طلبات كتير',
        ),
      ];
      follower().start();
      async.flushMicrotasks();

      async.elapse(const Duration(seconds: 59));
      expect(connections, 1);
      async.elapse(const Duration(seconds: 1));
      expect(connections, 2);
    });
  });

  test('resume replaces the open connection at once', () {
    run((async) {
      final followed = follower()..start();
      async.flushMicrotasks();
      expect(connections, 1);

      followed.resume();
      async.flushMicrotasks();
      expect(connections, 2);
      expect(outcomes, isEmpty);
    });
  });

  test('resume cuts a retry wait short', () {
    run((async) {
      script = [() => throw ApiNetworkException(Exception('dropped'))];
      final followed = follower()..start();
      async.flushMicrotasks();

      followed.resume();
      async.flushMicrotasks();
      expect(connections, 2);
    });
  });

  test('gives up at the deadline', () {
    run((async) {
      script = List.filled(
        20,
        () => throw ApiNetworkException(Exception('dropped')),
      );
      follower(lifetime: const Duration(seconds: 30)).start();

      async.elapse(const Duration(seconds: 31));
      expect(outcomes, [PhoneChallengeOutcome.expired]);
    });
  });

  test('says nothing after dispose', () {
    run((async) {
      script = [() => throw ApiNetworkException(Exception('dropped'))];
      final followed = follower()..start();
      async.flushMicrotasks();

      followed.dispose();
      async.elapse(const Duration(minutes: 11));
      expect(connections, 1);
      expect(outcomes, isEmpty);
      expect(async.pendingTimers, isEmpty);
    });
  });
}
