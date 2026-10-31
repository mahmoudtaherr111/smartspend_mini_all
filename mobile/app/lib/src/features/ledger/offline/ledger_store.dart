import 'dart:convert';
import 'dart:io';

import '../../stats/stats_models.dart';
import '../../wallets/wallet_models.dart';
import '../ledger_models.dart';

/// What a sentence waiting in the outbox is doing.
enum OutboxState {
  /// Kept on the phone until the server can read it.
  queued,

  /// Being read or saved right now.
  sending,

  /// Read, but the person has to review it or answer the server's question.
  needsYou,

  /// The server refused it; the person can send it again or delete it.
  failed,
}

/// A sentence the person recorded that is not in the ledger yet.
final class OutboxItem {
  const OutboxItem({
    required this.id,
    required this.text,
    required this.createdAt,
    this.state = OutboxState.queued,
    this.message,
    this.parse,
  });

  factory OutboxItem.fromJson(Map<String, Object?> json) => OutboxItem(
    id: json['id']! as String,
    text: json['text']! as String,
    createdAt: DateTime.parse(json['createdAt']! as String),
    // A sentence caught mid-send when the app closed is sent again.
    state: switch (json['state']) {
      'needsYou' => OutboxState.needsYou,
      'failed' => OutboxState.failed,
      _ => OutboxState.queued,
    },
    message: json['message'] as String?,
    parse: switch (json['parse']) {
      final Map<String, Object?> parse => ParseResult.fromJson(parse),
      _ => null,
    },
  );

  /// The request id its save carries, so a save retried after a lost answer is not saved twice.
  final String id;
  final String text;
  final DateTime createdAt;
  final OutboxState state;

  /// Why the server refused it, in the server's words.
  final String? message;

  /// What the server read, while it waits for the person's review or answer.
  final ParseResult? parse;

  OutboxItem copyWith({
    OutboxState? state,
    String? message,
    ParseResult? parse,
  }) => OutboxItem(
    id: id,
    text: text,
    createdAt: createdAt,
    state: state ?? this.state,
    message: message,
    parse: parse ?? this.parse,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'text': text,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'state': state.name,
    'message': message,
    'parse': parse?.toJson(),
  };
}

/// Everything the app keeps on the phone for one signed-in account: the outbox, and the last answers it showed,
/// so the record tab, statistics and wallets list have something to show without a network.
final class StoredLedger {
  const StoredLedger({
    this.accountKey,
    this.outbox = const [],
    this.recent,
    this.summaryMonth,
    this.summary,
    this.statsByMonth = const {},
    this.wallets,
    this.offlineLimit,
  });

  factory StoredLedger.fromJson(Map<String, Object?> json) => StoredLedger(
    accountKey: json['accountKey'] as String?,
    outbox: [
      for (final item in json['outbox'] as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) OutboxItem.fromJson(item),
    ],
    recent: switch (json['recent']) {
      final Map<String, Object?> page => LedgerPage.fromJson(page),
      _ => null,
    },
    summaryMonth: json['summaryMonth'] as String?,
    summary: switch (json['summary']) {
      final Map<String, Object?> summary => MonthSummary.fromJson(summary),
      _ => null,
    },
    statsByMonth: switch (json['statsByMonth']) {
      final Map<String, Object?> months => {
        for (final MapEntry(:key, :value) in months.entries)
          if (value is Map<String, Object?>) key: MonthStats.fromJson(value),
      },
      _ => const {},
    },
    wallets: switch (json['wallets']) {
      final List<Object?> rows => [
        for (final row in rows)
          if (row is Map<String, Object?>) Wallet.fromJson(row),
      ],
      _ => null,
    },
    offlineLimit: (json['offlineLimit'] as num?)?.toInt(),
  );

  /// Whose data this is ("phone:42"); a different account signing in on the phone starts from nothing.
  final String? accountKey;
  final List<OutboxItem> outbox;
  final LedgerPage? recent;
  final String? summaryMonth;
  final MonthSummary? summary;
  final Map<String, MonthStats> statsByMonth;
  final List<Wallet>? wallets;

  /// How many sentences the plan lets wait offline (`ai.getUserLimits`); the web's 3 when unknown.
  final int? offlineLimit;

  StoredLedger copyWith({
    String? accountKey,
    List<OutboxItem>? outbox,
    LedgerPage? recent,
    String? summaryMonth,
    MonthSummary? summary,
    Map<String, MonthStats>? statsByMonth,
    List<Wallet>? wallets,
    int? offlineLimit,
  }) => StoredLedger(
    accountKey: accountKey ?? this.accountKey,
    outbox: outbox ?? this.outbox,
    recent: recent ?? this.recent,
    summaryMonth: summaryMonth ?? this.summaryMonth,
    summary: summary ?? this.summary,
    statsByMonth: statsByMonth ?? this.statsByMonth,
    wallets: wallets ?? this.wallets,
    offlineLimit: offlineLimit ?? this.offlineLimit,
  );

  Map<String, Object?> toJson() => {
    'version': 1,
    'accountKey': accountKey,
    'outbox': [for (final item in outbox) item.toJson()],
    'recent': recent?.toJson(),
    'summaryMonth': summaryMonth,
    'summary': summary?.toJson(),
    'statsByMonth': {
      for (final MapEntry(:key, :value) in statsByMonth.entries)
        key: value.toJson(),
    },
    'wallets': switch (wallets) {
      final List<Wallet> rows => [for (final wallet in rows) wallet.toJson()],
      null => null,
    },
    'offlineLimit': offlineLimit,
  };
}

/// Where [StoredLedger] lives.
abstract interface class LedgerStore {
  Future<StoredLedger> read();
  Future<void> write(StoredLedger ledger);
  Future<void> clear();
}

/// One JSON file in the app's private support folder, which other apps cannot read and Android does not back up
/// (`android:allowBackup="false"`). Written to a temporary file first and then renamed over the old one, so a
/// crash in the middle never leaves half a file. Encrypting it is part of the security milestone.
class FileLedgerStore implements LedgerStore {
  FileLedgerStore(this._directory);

  final Future<Directory> Function() _directory;

  Future<File> _file() async =>
      File('${(await _directory()).path}${Platform.pathSeparator}ledger.json');

  @override
  Future<StoredLedger> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return const StoredLedger();
      final data = jsonDecode(await file.readAsString());
      return data is Map<String, Object?>
          ? StoredLedger.fromJson(data)
          : const StoredLedger();
    } on Object {
      // An unreadable file is treated as empty, as the web treats an unreadable queue.
      return const StoredLedger();
    }
  }

  @override
  Future<void> write(StoredLedger ledger) async {
    final file = await _file();
    await file.parent.create(recursive: true);
    final temporary = File('${file.path}.tmp');
    await temporary.writeAsString(jsonEncode(ledger.toJson()), flush: true);
    await temporary.rename(file.path);
  }

  @override
  Future<void> clear() async {
    final file = await _file();
    if (await file.exists()) await file.delete();
  }
}

/// The store in memory, for tests.
class MemoryLedgerStore implements LedgerStore {
  MemoryLedgerStore([this.ledger = const StoredLedger()]);

  StoredLedger ledger;
  int writes = 0;

  @override
  Future<StoredLedger> read() async => StoredLedger.fromJson(
    jsonDecode(jsonEncode(ledger.toJson())) as Map<String, Object?>,
  );

  @override
  Future<void> write(StoredLedger ledger) async {
    writes++;
    this.ledger = ledger;
  }

  @override
  Future<void> clear() async => ledger = const StoredLedger();
}

/// The one way the app changes [StoredLedger]: every change reads the latest copy and writes it back, one after
/// another, so the outbox and the offline copy of the ledger never overwrite each other's change.
class LocalLedger {
  LocalLedger(this._store);

  final LedgerStore _store;
  StoredLedger? _current;
  Future<void> _tail = Future.value();

  /// The ledger as stored now.
  Future<StoredLedger> snapshot() => _serialized(() async => _load());

  /// Applies [change] to the latest copy, stores the result and returns it.
  Future<StoredLedger> update(StoredLedger Function(StoredLedger) change) =>
      _serialized(() async {
        final next = change(await _load());
        await _store.write(next);
        return _current = next;
      });

  /// Forgets everything: on sign-out, or when another account signs in.
  Future<void> wipe() => _serialized(() async {
    await _store.clear();
    _current = const StoredLedger();
  });

  Future<StoredLedger> _load() async => _current ??= await _store.read();

  Future<T> _serialized<T>(Future<T> Function() operation) {
    final run = _tail.then((_) => operation());
    _tail = run.then<void>((_) {}, onError: (Object _) {});
    return run;
  }
}
