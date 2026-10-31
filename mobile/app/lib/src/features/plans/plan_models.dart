/// Plan information and catalog models as returned by `pro.myPlan` and `pro.planCatalog`.
final class UserPlanInfo {
  const UserPlanInfo({
    required this.plan,
    required this.role,
    this.receiptsEnabled = false,
    this.businessEnabled = false,
    this.adsEnabled = true,
  });

  factory UserPlanInfo.fromJson(Map<String, Object?> json) {
    final features = json['features'] as Map<String, Object?>? ?? const {};
    return UserPlanInfo(
      plan: json['plan'] as String? ?? 'free',
      role: json['role'] as String? ?? 'user',
      receiptsEnabled: features['receipts'] == true,
      businessEnabled: features['business'] == true,
      adsEnabled: features['ads'] != false,
    );
  }

  final String plan;
  final String role;
  final bool receiptsEnabled;
  final bool businessEnabled;
  final bool adsEnabled;

  bool get isPro => plan == 'pro' || role == 'admin';
}

final class PlanCatalogItem {
  const PlanCatalogItem({
    required this.key,
    required this.label,
    required this.value,
  });

  factory PlanCatalogItem.fromJson(Map<String, Object?> json) =>
      PlanCatalogItem(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        value: json['value'] ?? false,
      );

  final String key;
  final String label;
  final Object value;
}
