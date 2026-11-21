import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Runs on the computer that drives the device: saves every screenshot the test takes as
/// `build/screenshots/<name>.png`.
Future<void> main() => integrationDriver(
  onScreenshot: (name, bytes, [args]) async {
    final file = File('build/screenshots/$name.png');
    await file.create(recursive: true);
    await file.writeAsBytes(bytes);
    return true;
  },
);
