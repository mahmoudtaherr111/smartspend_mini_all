/// Resolves internal notification paths, legacy web paths, and `smartspend://`
/// deep links to valid GoRouter routes defined in `app_router.dart`.
///
/// Returns `null` for empty, external (`http`/`https`/etc.), or unknown paths so
/// callers never navigate into a 404 screen.
String? resolveAppRoute(String? rawPath) {
  if (rawPath == null) return null;
  final trimmed = rawPath.trim();
  if (trimmed.isEmpty || trimmed.startsWith('//')) return null;

  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;

  final Uri normalizedUri;
  if (uri.hasScheme) {
    if (uri.scheme.toLowerCase() != 'smartspend') {
      return null;
    }
    final reconstructedPath = uri.host.isNotEmpty
        ? '/${uri.host}${uri.path}'
        : (uri.path.startsWith('/') ? uri.path : '/${uri.path}');
    normalizedUri = Uri(
      path: reconstructedPath,
      query: uri.hasQuery ? uri.query : null,
      fragment: uri.hasFragment ? uri.fragment : null,
    );
  } else {
    if (!trimmed.startsWith('/')) return null;
    normalizedUri = uri;
  }

  var path = normalizedUri.path;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  final lowerPath = path.toLowerCase();

  // Handle legacy web dashboard tab/fragment destinations from contracts/notification-types.ts.
  if (lowerPath == '/' && normalizedUri.fragment == 'budget') {
    return '/more/budgets';
  }
  if (lowerPath == '/dashboard') {
    if (normalizedUri.fragment == 'budget') return '/more/budgets';
    return switch (normalizedUri.queryParameters['tab']) {
      'stats' => '/stats',
      'ai' => '/ai',
      'calendar' => '/calendar',
      'more' => '/more',
      _ => '/record',
    };
  }
  if (lowerPath == '/settings' &&
      normalizedUri.queryParameters['tab'] == 'passkeys') {
    return '/more/security';
  }

  final aliased = _routeAliases[lowerPath];
  if (aliased != null) {
    return aliased;
  }

  if (lowerPath == '/stats/category') {
    return normalizedUri.hasQuery
        ? '/stats/category?${normalizedUri.query}'
        : '/stats/category';
  }

  if (_exactRoutes.contains(lowerPath)) {
    return lowerPath;
  }

  final txMatch = _transactionDetailPattern.firstMatch(lowerPath);
  if (txMatch != null) return '/transaction/${txMatch.group(1)}';

  final commitmentMatch = _commitmentDetailPattern.firstMatch(lowerPath);
  if (commitmentMatch != null) {
    return '/commitments/${commitmentMatch.group(1)}';
  }

  final walletMatch = _walletDetailPattern.firstMatch(lowerPath);
  if (walletMatch != null) return '/more/wallets/${walletMatch.group(1)}';

  return null;
}

const _routeAliases = <String, String>{
  '/budgets': '/more/budgets',
  '/plan': '/more/plan',
  '/pro': '/more/plan',
  '/cancel-plan': '/more/cancel-plan',
  '/settings/security': '/more/security',
  '/settings/security/pin': '/more/security/pin',
  '/wallets': '/more/wallets',
  '/goals': '/more/goals',
  '/settings': '/more/settings',
  '/support': '/more/help',
  '/help': '/more/help',
  '/ai-center': '/ai',
  '/capture': '/more/capture',
  '/capture-settings': '/more/capture-settings',
  '/business': '/more/business',
  '/contacts': '/more/contacts',
  '/installments': '/commitments',
  '/more/installments': '/commitments',
  '/more/commitments': '/commitments',
  '/export': '/more/export',
  '/seasons': '/more/seasons',
  '/profile': '/more/profile',
  '/sessions': '/more/sessions',
  '/money-prefs': '/more/money-prefs',
  '/onboarding': '/more/onboarding',
  '/terms': '/more/terms',
  '/data-stored': '/more/data-stored',
  '/transactions': '/record/transactions',
};

const _exactRoutes = <String>{
  '/record',
  '/record/transactions',
  '/stats',
  '/ai',
  '/calendar',
  '/more',
  '/more/settings',
  '/more/profile',
  '/more/money-prefs',
  '/more/sessions',
  '/more/onboarding',
  '/more/help',
  '/more/plan',
  '/more/cancel-plan',
  '/more/terms',
  '/more/data-stored',
  '/more/capture',
  '/more/capture-settings',
  '/more/wallets',
  '/more/contacts',
  '/more/budgets',
  '/more/goals',
  '/more/seasons',
  '/more/export',
  '/more/business',
  '/more/security',
  '/more/security/pin',
  '/search',
  '/commitments',
  '/commitments/add',
  '/notifications',
  '/settings/notifications',
};

final _transactionDetailPattern = RegExp(r'^/transaction/(\d+)$');
final _commitmentDetailPattern = RegExp(r'^(?:/more)?/commitments/(\d+)$');
final _walletDetailPattern = RegExp(r'^(?:/more)?/wallets/(\d+)$');
