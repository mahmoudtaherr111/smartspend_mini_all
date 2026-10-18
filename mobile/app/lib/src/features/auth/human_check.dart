import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/providers.dart';

/// Builds the "not a robot" check the server asks for before it hands out a phone verification code
/// (`api/services/turnstile-service.ts`). The check calls [onToken] with a token, or with null when the token
/// expired or the check failed; a token is good for one request, and a new [resetSignal] asks for a fresh one.
typedef HumanCheckBuilder = Widget Function(
  ValueChanged<String?> onToken,
  int resetSignal,
);

/// Null when this build has no Turnstile site key: then no check is shown and no token is sent, which a development
/// server accepts and a production server with `TURNSTILE_SECRET_KEY` refuses, as on the web.
final humanCheckProvider = Provider<HumanCheckBuilder?>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.turnstileSiteKey.isEmpty) return null;
  final api = config.apiBaseUri;
  final origin = Uri(scheme: api.scheme, host: api.host, port: api.port);
  return (onToken, resetSignal) => TurnstileView(
    siteKey: config.turnstileSiteKey,
    origin: origin,
    onToken: onToken,
    resetSignal: resetSignal,
  );
});

/// Cloudflare Turnstile in a web view, the widget the website shows (`src/components/auth/TurnstileWidget.tsx`).
///
/// The page is loaded as if it came from [origin], the API's own address, so the site key must list that host
/// among its hostnames in Cloudflare. Its result reaches Dart through a JavaScript channel.
class TurnstileView extends StatefulWidget {
  const TurnstileView({
    super.key,
    required this.siteKey,
    required this.origin,
    required this.onToken,
    this.resetSignal = 0,
  });

  final String siteKey;
  final Uri origin;
  final ValueChanged<String?> onToken;
  final int resetSignal;

  @override
  State<TurnstileView> createState() => _TurnstileViewState();
}

class _TurnstileViewState extends State<TurnstileView> {
  WebViewController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _load(Theme.of(context).brightness);
  }

  @override
  void didUpdateWidget(TurnstileView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The screen forgets its token when it asks for a new one; the check only fetches it.
    if (oldWidget.resetSignal != widget.resetSignal) {
      _controller?.runJavaScript('window.turnstile && turnstile.reset()');
    }
  }

  WebViewController _load(Brightness brightness) {
    final config = jsonEncode({
      'sitekey': widget.siteKey,
      'language': 'ar',
      'theme': brightness == Brightness.dark ? 'dark' : 'light',
    });
    final page =
        '''
<!doctype html>
<html dir="rtl"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style>
<script>
function send(kind, token) { Turnstile.postMessage(JSON.stringify({kind: kind, token: token || null})); }
function ready() {
  var options = $config;
  options.callback = function (token) { send('token', token); };
  options['expired-callback'] = function () { send('expired'); };
  options['error-callback'] = function () { send('error'); };
  turnstile.render('#check', options);
}
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ready" async defer></script>
</head><body><div id="check"></div></body></html>
''';
    return WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..addJavaScriptChannel(
        'Turnstile',
        onMessageReceived: (message) {
          final decoded = jsonDecode(message.message);
          if (!mounted) return;
          widget.onToken(switch (decoded) {
            {'kind': 'token', 'token': final String token} => token,
            _ => null,
          });
        },
      )
      ..loadHtmlString(page, baseUrl: widget.origin.toString());
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) return const SizedBox(height: 72);
    return SizedBox(height: 72, child: WebViewWidget(controller: controller));
  }
}
