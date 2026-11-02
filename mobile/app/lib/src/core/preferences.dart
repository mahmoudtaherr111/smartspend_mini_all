import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'providers.dart';

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

enum ThemeChoice {
  system('system'),
  light('light'),
  dark('dark');

  const ThemeChoice(this.code);
  final String code;

  static ThemeChoice fromCode(Object? code) => switch (code) {
    'light' => ThemeChoice.light,
    'dark' => ThemeChoice.dark,
    _ => ThemeChoice.system,
  };
}

/// Choices that belong to the phone, not to the account: they stay through signing out, so the sign-in screen
/// already speaks the person's language.
final class DevicePreferences {
  const DevicePreferences({
    this.language = AppLanguage.arabic,
    this.themeChoice = ThemeChoice.system,
    this.captureInstallationId,
    this.supportDraftSubject,
    this.supportDraftMessage,
  });

  final AppLanguage language;
  final ThemeChoice themeChoice;

  /// This installation's id for bank message capture (`capture.registerDevice`): kept through signing out, so
  /// registering again replaces the same device instead of adding one.
  final String? captureInstallationId;
  final String? supportDraftSubject;
  final String? supportDraftMessage;

  DevicePreferences copyWith({
    AppLanguage? language,
    ThemeChoice? themeChoice,
    String? captureInstallationId,
    String? supportDraftSubject,
    String? supportDraftMessage,
  }) => DevicePreferences(
    language: language ?? this.language,
    themeChoice: themeChoice ?? this.themeChoice,
    captureInstallationId: captureInstallationId ?? this.captureInstallationId,
    supportDraftSubject: supportDraftSubject ?? this.supportDraftSubject,
    supportDraftMessage: supportDraftMessage ?? this.supportDraftMessage,
  );

  Map<String, Object?> toJson() => {
    'version': 1,
    'language': language.code,
    'themeChoice': themeChoice.code,
    'captureInstallationId': ?captureInstallationId,
    'supportDraftSubject': ?supportDraftSubject,
    'supportDraftMessage': ?supportDraftMessage,
  };

  static DevicePreferences fromJson(Map<String, Object?> json) =>
      DevicePreferences(
        language: AppLanguage.fromCode(json['language']),
        themeChoice: ThemeChoice.fromCode(json['themeChoice']),
        captureInstallationId: switch (json['captureInstallationId']) {
          final String id when id.isNotEmpty => id,
          _ => null,
        },
        supportDraftSubject: switch (json['supportDraftSubject']) {
          final String s when s.isNotEmpty => s,
          _ => null,
        },
        supportDraftMessage: switch (json['supportDraftMessage']) {
          final String m when m.isNotEmpty => m,
          _ => null,
        },
      );
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
    // The bank transaction notices follow the interface language.
    unawaited(
      ref
          .read(bankCaptureProvider)
          .setLanguage(language.code)
          .catchError((Object _) {}),
    );
    final store = ref.read(preferencesStoreProvider);
    await store.write((await store.read()).copyWith(language: language));
  }
}

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeChoice>(
  ThemeModeController.new,
);

class ThemeModeController extends Notifier<ThemeChoice> {
  @override
  ThemeChoice build() => ref.read(initialPreferencesProvider).themeChoice;

  Future<void> choose(ThemeChoice choice) async {
    state = choice;
    final store = ref.read(preferencesStoreProvider);
    await store.write((await store.read()).copyWith(themeChoice: choice));
  }
}
