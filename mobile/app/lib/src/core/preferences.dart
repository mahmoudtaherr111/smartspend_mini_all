import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// The interface language. Arabic is the source and the default; English translates the interface only. What people
/// type and say, the categories and the AI's answers stay Egyptian Arabic, as on the web
/// (docs/decisions/0020-optional-english-interface.md).
enum AppLanguage {
  arabic('ar'),
  english('en');

  const AppLanguage(this.code);

  final String code;

  Locale get locale => Locale(code);

  static AppLanguage fromCode(Object? code) =>
      code == english.code ? english : arabic;
}

/// Choices that belong to the phone, not to the account: they stay through signing out, so the sign-in screen
/// already speaks the person's language.
final class DevicePreferences {
  const DevicePreferences({this.language = AppLanguage.arabic});

  final AppLanguage language;

  DevicePreferences copyWith({AppLanguage? language}) =>
      DevicePreferences(language: language ?? this.language);

  Map<String, Object?> toJson() => {'version': 1, 'language': language.code};

  static DevicePreferences fromJson(Map<String, Object?> json) =>
      DevicePreferences(language: AppLanguage.fromCode(json['language']));
}

abstract interface class PreferencesStore {
  Future<DevicePreferences> read();
  Future<void> write(DevicePreferences preferences);
}

/// `preferences.json` in the app's private folder. Nothing here is secret.
class FilePreferencesStore implements PreferencesStore {
  FilePreferencesStore([this._directory = getApplicationSupportDirectory]);

  final Future<Directory> Function() _directory;

  Future<File> _file() async => File(
    '${(await _directory()).path}${Platform.pathSeparator}preferences.json',
  );

  @override
  Future<DevicePreferences> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return const DevicePreferences();
      final data = jsonDecode(await file.readAsString());
      return data is Map<String, Object?>
          ? DevicePreferences.fromJson(data)
          : const DevicePreferences();
    } on Object {
      return const DevicePreferences();
    }
  }

  @override
  Future<void> write(DevicePreferences preferences) async {
    final file = await _file();
    await file.parent.create(recursive: true);
    final temporary = File('${file.path}.tmp');
    await temporary.writeAsString(
      jsonEncode(preferences.toJson()),
      flush: true,
    );
    await temporary.rename(file.path);
  }
}

/// For tests.
class MemoryPreferencesStore implements PreferencesStore {
  MemoryPreferencesStore([this.preferences = const DevicePreferences()]);

  DevicePreferences preferences;

  @override
  Future<DevicePreferences> read() async => preferences;

  @override
  Future<void> write(DevicePreferences preferences) async =>
      this.preferences = preferences;
}

final preferencesStoreProvider = Provider<PreferencesStore>(
  (ref) => FilePreferencesStore(),
);

/// The preferences as `bootstrap()` read them before the first frame, so the app never opens in one language and
/// flips to the other.
final initialPreferencesProvider = Provider<DevicePreferences>(
  (ref) => const DevicePreferences(),
);

final languageProvider = NotifierProvider<LanguageController, AppLanguage>(
  LanguageController.new,
);

class LanguageController extends Notifier<AppLanguage> {
  @override
  AppLanguage build() => ref.read(initialPreferencesProvider).language;

  Future<void> choose(AppLanguage language) async {
    state = language;
    final store = ref.read(preferencesStoreProvider);
    await store.write((await store.read()).copyWith(language: language));
  }
}
