import 'package:smartspend_api/smartspend_api.dart';

import 'business_models.dart';

/// Calls the tRPC business router (`api/business-router.ts`).
final class BusinessApi {
  const BusinessApi(this._client);

  final TrpcClient _client;

  /// Fetches the current user's active business and its categories (BIZ-01).
  Future<BusinessState> get() async {
    final res = await _client.query(Procedures.business.get);
    if (res is Map<String, Object?>) {
      return BusinessState.fromJson(res);
    }
    return const BusinessState();
  }

  /// Lists predefined business types (BIZ-01).
  Future<List<BusinessTypeOption>> types() async {
    final res = await _client.query(Procedures.business.types);
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is Map<String, Object?>) BusinessTypeOption.fromJson(item),
      ];
    }
    return const [];
  }

  /// Generates AI category suggestions for a business (BIZ-02).
  Future<List<BusinessCategory>> suggestCategories({
    required String businessName,
    required String businessType,
    required String description,
  }) async {
    final res = await _client.mutate(
      Procedures.business.suggestCategories,
      input: {
        'businessName': businessName,
        'businessType': businessType,
        'description': description.length < 10 ? 'مشروع تجاري لـ $businessName' : description,
      },
    );
    if (res is List<Object?>) {
      return [
        for (final item in res)
          if (item is Map<String, Object?>) BusinessCategory.fromJson(item),
      ];
    }
    return const [];
  }

  /// Creates a new business with initial categories (BIZ-01).
  Future<int> create({
    required String name,
    required String type,
    String? typeLabel,
    String? description,
    List<BusinessCategory> categories = const [],
  }) async {
    final res = await _client.mutate(
      Procedures.business.create,
      input: {
        'name': name,
        'type': type,
        'typeLabel': ?typeLabel,
        'description': ?description,
        'categories': [for (final c in categories) c.toJson()],
      },
    );
    if (res is Map<String, Object?> && res['id'] is num) {
      return (res['id'] as num).toInt();
    }
    return 0;
  }

  /// Adds a category to the active business (BIZ-02).
  Future<int> addCategory({
    required String name,
    required String nameAr,
    String icon = '🛍️',
    String color = '#3b82f6',
    String type = 'expense',
    List<String> keywords = const [],
    List<String> matchExamples = const [],
  }) async {
    final res = await _client.mutate(
      Procedures.business.addCategory,
      input: {
        'name': name,
        'nameAr': nameAr,
        'icon': icon,
        'color': color,
        'type': type,
        'keywords': keywords,
        'matchExamples': matchExamples,
      },
    );
    if (res is Map<String, Object?> && res['id'] is num) {
      return (res['id'] as num).toInt();
    }
    return 0;
  }

  /// Removes a business category (BIZ-02).
  Future<bool> removeCategory(int categoryId) async {
    final res = await _client.mutate(
      Procedures.business.removeCategory,
      input: {'id': categoryId},
    );
    return res is Map<String, Object?> && res['success'] == true;
  }

  /// Deletes the active business and reverts its transactions to personal (BIZ-01).
  Future<bool> delete() async {
    final res = await _client.mutate(Procedures.business.delete);
    return res is Map<String, Object?> && res['success'] == true;
  }

  /// Links a contact to the business as customer or supplier (BIZ-04).
  Future<bool> linkContact({required int contactId, String role = 'business_supplier'}) async {
    final res = await _client.mutate(
      Procedures.business.linkContact,
      input: {'contactId': contactId, 'role': role},
    );
    return res is Map<String, Object?> && res['success'] == true;
  }
}
