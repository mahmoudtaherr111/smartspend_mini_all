import 'package:smartspend_api/smartspend_api.dart';

import '../ledger/ledger_models.dart';
import 'contact_models.dart';

Map<String, Object?> _object(Object? value) =>
    value is Map<String, Object?> ? value : const {};

class ContactsApi {
  const ContactsApi(this._client);

  final TrpcClient _client;

  /// Retrieves debts, loans and standing with other people: `expense.getDebtBalances`.
  Future<DebtsSummary> getDebtBalances() async {
    final data = await _client.query(Procedures.expense.getDebtBalances);
    return DebtsSummary.fromJson(_object(data));
  }

  /// Lists the people on this account: `profile.listContacts`.
  Future<List<ContactSummary>> listContacts({
    String filter = 'all',
    String? search,
  }) async {
    final data = await _client.query(
      Procedures.profile.listContacts,
      input: {
        'filter': filter,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    final raw = _object(data)['contacts'];
    return [
      for (final item in raw as List<Object?>? ?? const [])
        if (item is Map<String, Object?>) ContactSummary.fromJson(item),
    ];
  }

  /// Adds a new contact: `profile.addContact`.
  Future<int> addContact({
    required String name,
    String? relation,
    String contactType = 'personal',
  }) async {
    final data = await _client.mutate(
      Procedures.profile.addContact,
      input: {
        'name': name.trim(),
        if (relation != null && relation.trim().isNotEmpty)
          'relation': relation.trim(),
        'contactType': contactType,
      },
    );
    return (_object(data)['id'] as num?)?.toInt() ?? 0;
  }

  /// Updates contact info: `profile.updateContact`.
  Future<bool> updateContact({
    required int id,
    String? name,
    String? relation,
    String? contactType,
    bool? isSilenced,
  }) async {
    final data = await _client.mutate(
      Procedures.profile.updateContact,
      input: {
        'id': id,
        if (name != null) 'name': name.trim(),
        if (relation != null) 'relation': relation.trim(),
        'contactType': ?contactType,
        'isSilenced': ?isSilenced,
      },
    );
    return _object(data)['success'] == true;
  }

  /// Merges [secondaryId] into [primaryId]: `profile.mergeContacts`.
  Future<String> mergeContacts({
    required int primaryId,
    required int secondaryId,
  }) async {
    final data = await _client.mutate(
      Procedures.profile.mergeContacts,
      input: {'primaryId': primaryId, 'secondaryId': secondaryId},
    );
    return _object(data)['mergedInto'] as String? ?? '';
  }

  /// Deletes a contact: `profile.deleteContact`.
  /// Note: transactions are not deleted; they have their `contactId` set to null.
  Future<bool> deleteContact(int id) async {
    final data = await _client.mutate(
      Procedures.profile.deleteContact,
      input: {'id': id},
    );
    return _object(data)['success'] == true;
  }
}
