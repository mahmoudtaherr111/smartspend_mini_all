import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:smartspend_api/smartspend_api.dart';

import '../../core/providers.dart';
import 'export_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class ExportApi {
  const ExportApi(this._client, {this.documentsDirectoryResolver});

  final TrpcClient _client;
  final Future<Directory> Function()? documentsDirectoryResolver;

  Future<File> exportExpenses({
    required ExportFormat format,
    DateTime? startDate,
    DateTime? endDate,
    String type = 'all',
  }) async {
    final input = <String, Object?>{
      'format': format.extension,
      'type': type,
      if (startDate != null) 'startDate': startDate.toIso8601String().substring(0, 10),
      if (endDate != null) 'endDate': endDate.toIso8601String().substring(0, 10),
    };

    final response = _object(
      await _client.mutate(Procedures.export.myExpenses, input: input),
    );
    final result = ExportResult.fromJson(response);

    final dir = documentsDirectoryResolver != null
        ? await documentsDirectoryResolver!()
        : await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/${result.filename}');

    if (result.format == 'xlsx' && result.data is String) {
      final bytes = base64Decode(result.data as String);
      file.writeAsBytesSync(bytes, flush: true);
    } else if (result.format == 'json') {
      final text = jsonEncode(result.data);
      file.writeAsStringSync(text, flush: true);
    } else {
      // CSV: prepend BOM for Excel UTF-8 compatibility
      final text = result.data.toString();
      file.writeAsStringSync('\uFEFF$text', flush: true);
    }

    return file;
  }
}

final exportApiProvider = Provider<ExportApi>((ref) {
  final client = ref.watch(trpcClientProvider);
  return ExportApi(client);
});
