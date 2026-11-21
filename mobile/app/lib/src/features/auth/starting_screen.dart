import 'package:flutter/material.dart';

/// Shown for the moment the app reads the stored session token, before it knows which screen to open.
class StartingScreen extends StatelessWidget {
  const StartingScreen({super.key});

  static const path = '/starting';

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
