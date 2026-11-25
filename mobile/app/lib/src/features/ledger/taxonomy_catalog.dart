import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';

typedef TaxonomyOption = ({String id, String name});

class TaxonomyPurpose {
  const TaxonomyPurpose({
    required this.id,
    required this.name,
    required this.group,
    required this.kinds,
    required this.subs,
  });

  final String id;
  final String name;
  final String group;
  final List<String> kinds;
  final List<TaxonomyOption> subs;

  TaxonomyOption get defaultSub =>
      subs.where((sub) => sub.id == 'other').firstOrNull ?? subs.first;
}

List<TaxonomyPurpose> _catalog(Object? data) {
  if (data case {'version': String _, 'categories': final List<Object?> rows}) {
    return [
      for (final row in rows)
        if (row case {
          'id': final String id,
          'nameAr': final String name,
          'group': final String group,
          'kinds': final List<Object?> kinds,
          'subs': final List<Object?> rawSubs,
        })
          if (_subs(rawSubs) case final subs when subs.isNotEmpty)
            TaxonomyPurpose(
              id: id,
              name: name,
              group: group,
              kinds: kinds.whereType<String>().toList(),
              subs: subs,
            ),
    ];
  }
  return const [];
}

List<TaxonomyOption> _subs(List<Object?> rows) => [
  for (final row in rows)
    if (row case {'id': final String id, 'nameAr': final String name})
      (id: id, name: name),
];

final taxonomyCacheFileProvider = Provider<Future<File> Function()>(
  (_) => () async {
    final directory = await getApplicationSupportDirectory();
    return File('${directory.path}${Platform.pathSeparator}taxonomy.json');
  },
);

/// The server's shared display catalog contains no account data and can be reused offline.
final taxonomyCatalogProvider = FutureProvider<List<TaxonomyPurpose>>((
  ref,
) async {
  final client = ref.watch(trpcClientProvider);
  final cacheFile = ref.watch(taxonomyCacheFileProvider);
  try {
    final data = await client.query(Procedures.taxonomy.get);
    final catalog = _catalog(data);
    if (catalog.isNotEmpty) {
      try {
        final file = await cacheFile();
        await file.parent.create(recursive: true);
        final temporary = File('${file.path}.tmp');
        await temporary.writeAsString(jsonEncode(data), flush: true);
        await temporary.rename(file.path);
      } on Object {
        // The online catalog can still be used if the cache cannot be written.
      }
      return catalog;
    }
  } on Object {
    // A cold offline device uses the built-in filing list until the first download.
  }
  try {
    return _catalog(jsonDecode(await (await cacheFile()).readAsString()));
  } on Object {
    return const [];
  }
});

Iterable<TaxonomyPurpose> purposesForType(
  List<TaxonomyPurpose> catalog,
  String type,
) => switch (type) {
  'income' => catalog.where((purpose) => purpose.kinds.contains('income')),
  'investment' => catalog.where(
    (purpose) => purpose.kinds.contains('investment'),
  ),
  // The transfer form has a legacy direction and type selector.
  'transfer' => const [],
  _ => catalog.where((purpose) => purpose.group == 'spending'),
};
