import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../core/providers.dart';

/// Known services' logos kept on the phone (decision 0051). The server names each logo by its content hash, so a file
/// once saved never changes: it is read from the phone on every later start, and downloaded only the first time or
/// after the server fetched a new logo (a new name). Nothing here holds a person's data.
class LogoCache {
  LogoCache(this._client, {Future<Directory?> Function()? directory})
    : _directory = directory ?? _defaultDirectory;

  final http.Client _client;
  final Future<Directory?> Function() _directory;
  final _downloads = <String, Future<Uint8List?>>{};
  Directory? _dir;
  bool _dirTried = false;

  /// At most this many files are kept; the oldest go first. A logo is about 20–60 KB.
  static const maxFiles = 150;
  static const _maxBytes = 600 * 1024;

  static Future<Directory?> _defaultDirectory() async {
    final base = await getApplicationSupportDirectory();
    return Directory('${base.path}/brand-logos');
  }

  Future<Directory?> _folder() async {
    if (_dirTried) return _dir;
    _dirTried = true;
    try {
      final dir = await _directory();
      if (dir != null && !dir.existsSync()) await dir.create(recursive: true);
      _dir = dir;
    } on Object {
      // No storage (a test, a full disk): logos still load from the server, only not kept.
      _dir = null;
    }
    return _dir;
  }

  static String fileNameOf(String url) =>
      sha1.convert(url.codeUnits).toString();

  /// The logo's bytes: from the phone when it was saved, else downloaded once and saved.
  Future<Uint8List?> bytesOf(String url) =>
      _downloads[url] ??= _load(url).whenComplete(() {
        // A block, not an arrow: returning the removed future would make it wait on itself.
        _downloads.remove(url);
      });

  Future<Uint8List?> _load(String url) async {
    final dir = await _folder();
    final file = dir == null ? null : File('${dir.path}/${fileNameOf(url)}');
    if (file != null && file.existsSync()) {
      try {
        final bytes = await file.readAsBytes();
        if (bytes.isNotEmpty) return bytes;
      } on Object {
        // An unreadable file is downloaded again below.
      }
    }
    final http.Response response;
    try {
      response = await _client
          .get(Uri.parse(url))
          .timeout(const Duration(seconds: 15));
    } on Object {
      return null;
    }
    final bytes = response.bodyBytes;
    if (response.statusCode != 200 ||
        bytes.isEmpty ||
        bytes.length > _maxBytes) {
      return null;
    }
    if (file != null) {
      try {
        // Written beside it, then renamed: a half-written file is never read as a logo.
        final part = File('${file.path}.part');
        await part.writeAsBytes(bytes, flush: true);
        await part.rename(file.path);
        unawaited(_prune(dir!));
      } on Object {
        // Shown this time, kept next time.
      }
    }
    return bytes;
  }

  Future<void> _prune(Directory dir) async {
    try {
      final files = dir
          .listSync()
          .whereType<File>()
          .where((file) => !file.path.endsWith('.part'))
          .toList();
      if (files.length <= maxFiles) return;
      files.sort(
        (a, b) => a.statSync().modified.compareTo(b.statSync().modified),
      );
      for (final file in files.take(files.length - maxFiles)) {
        await file.delete();
      }
    } on Object {
      // Pruning is housekeeping; it never stops a logo from showing.
    }
  }
}

final logoCacheProvider = Provider<LogoCache>(
  (ref) => LogoCache(ref.watch(httpClientProvider)),
);

/// A logo read through [LogoCache]: decoded once per run (Flutter's image cache keys it by its address).
@immutable
class CachedLogoImage extends ImageProvider<CachedLogoImage> {
  const CachedLogoImage(this.url, this.cache);

  final String url;
  final LogoCache cache;

  @override
  Future<CachedLogoImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(
    CachedLogoImage key,
    ImageDecoderCallback decode,
  ) => OneFrameImageStreamCompleter(_load(key, decode));

  Future<ImageInfo> _load(
    CachedLogoImage key,
    ImageDecoderCallback decode,
  ) async {
    final bytes = await cache.bytesOf(key.url);
    if (bytes == null) throw StateError('Logo not available: ${key.url}');
    final codec = await decode(await ui.ImmutableBuffer.fromUint8List(bytes));
    final frame = await codec.getNextFrame();
    return ImageInfo(image: frame.image);
  }

  @override
  bool operator ==(Object other) =>
      other is CachedLogoImage && other.url == url;

  @override
  int get hashCode => url.hashCode;
}

/// Puts the cache under every screen, unless something above already decides where logos come from (the render
/// harness hands in local files).
class LogoCacheScope extends ConsumerWidget {
  const LogoCacheScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (LogoImageScope.maybeOf(context) != null) return child;
    final cache = ref.watch(logoCacheProvider);
    return LogoImageScope(
      imageFor: (url) => CachedLogoImage(url, cache),
      child: child,
    );
  }
}
