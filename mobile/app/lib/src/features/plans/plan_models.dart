/// Plan information and catalog models as returned by `pro.myPlan` and `pro.planCatalog`.
final class UserPlanInfo {
  const UserPlanInfo({
    required this.plan,
    required this.role,
    bool? receiptsEnabled,
    bool? businessEnabled,
    bool? proReportEnabled,
    bool? goalAnalysisEnabled,
    bool? whatsappReportEnabled,
    bool? commitmentsEnabled,
    bool? adsEnabled,
    this.goalsActiveLimit,
    this.commitmentsActiveLimit,
    this.offlineLimit,
    this.captureMonthlyLimit,
    this.included = const [],
  }) : _rawReceipts = receiptsEnabled,
       _rawBusiness = businessEnabled,
       _rawProReport = proReportEnabled,
       _rawGoalAnalysis = goalAnalysisEnabled,
       _rawWhatsappReport = whatsappReportEnabled,
       _rawCommitments = commitmentsEnabled,
       _rawAds = adsEnabled;

  factory UserPlanInfo.fromJson(Map<String, Object?> json) {
    final features = json['features'] as Map<String, Object?>? ?? const {};
    final limits = json['limits'] as Map<String, Object?>? ?? const {};
    final includedRaw = json['included'] as List<Object?>? ?? const [];
    bool? flag(String key) =>
        features.containsKey(key) ? features[key] == true : null;
    int? number(String key) => (limits[key] as num?)?.toInt();

    return UserPlanInfo(
      plan: json['plan'] as String? ?? 'free',
      role: json['role'] as String? ?? 'user',
      receiptsEnabled: flag('receipts'),
      businessEnabled: flag('business'),
      proReportEnabled: flag('proReport'),
      goalAnalysisEnabled: flag('goalAnalysis'),
      whatsappReportEnabled: flag('whatsappReport'),
      commitmentsEnabled: flag('commitments'),
      adsEnabled: features.containsKey('ads') ? features['ads'] != false : null,
      goalsActiveLimit: number('goalsActiveLimit'),
      commitmentsActiveLimit: number('commitmentsActiveLimit'),
      offlineLimit: number('offlineLimit'),
      captureMonthlyLimit: number('captureMonthlyLimit'),
      included: [
        for (final item in includedRaw)
          if (item is Map<String, Object?>) PlanCatalogItem.fromJson(item),
      ],
    );
  }

  final String plan;
  final String role;
  final bool? _rawReceipts;
  final bool? _rawBusiness;
  final bool? _rawProReport;
  final bool? _rawGoalAnalysis;
  final bool? _rawWhatsappReport;
  final bool? _rawCommitments;
  final bool? _rawAds;
  final int? goalsActiveLimit;
  final int? commitmentsActiveLimit;
  final int? offlineLimit;
  final int? captureMonthlyLimit;
  final List<PlanCatalogItem> included;

  bool get isPro => plan == 'pro' || plan == 'ultra' || role == 'admin';
  bool get isUltra => plan == 'ultra' || role == 'admin';

  bool get receiptsEnabled => _rawReceipts ?? isPro;
  bool get businessEnabled => _rawBusiness ?? isPro;
  bool get proReportEnabled => _rawProReport ?? isPro;
  bool get goalAnalysisEnabled => _rawGoalAnalysis ?? isPro;
  bool get whatsappReportEnabled => _rawWhatsappReport ?? isPro;
  bool get commitmentsEnabled => _rawCommitments ?? true;
  bool get adsEnabled => _rawAds ?? !isPro;
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
