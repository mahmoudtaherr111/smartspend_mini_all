import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import 'contacts_providers.dart';

/// Bottom sheet to add a new contact (`profile.addContact`).
class AddContactSheet extends ConsumerStatefulWidget {
  const AddContactSheet({super.key});

  @override
  ConsumerState<AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends ConsumerState<AddContactSheet> {
  final _nameController = TextEditingController();
  final _relationController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _relationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'اكتب اسم الشخص أولاً');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final api = ref.read(contactsApiProvider);
      await api.addContact(
        name: name,
        relation: _relationController.text.trim().isEmpty
            ? null
            : _relationController.text.trim(),
      );
      invalidateContactsAndDebts(ref);
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'تعذر إضافة الشخص، اتأكد من النت وجرب تاني';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        SmartSpendSpacing.screen,
        0,
        SmartSpendSpacing.screen,
        MediaQuery.of(context).viewInsets.bottom + SmartSpendSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'إضافة شخص جديد',
            style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            'عشان تسجل معاه مصاريف أو سلف أو ديون بسهولة.',
            style: textTheme.bodyMedium?.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          TextField(
            controller: _nameController,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'اسم الشخص *',
              hintText: 'مثلاً: محمد إبراهيم أو أحمد كهربائي',
              errorText: _error,
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          TextField(
            controller: _relationController,
            decoration: const InputDecoration(
              labelText: 'صلة القرابة أو الوصف (اختياري)',
              hintText: 'مثلاً: زميل شغل، صاحبي، أخويا...',
            ),
          ),
          const SizedBox(height: SmartSpendSpacing.xl),
          SmartSpendButton(
            label: _submitting ? 'جاري الحفظ...' : 'حفظ الشخص',
            onPressed: _submitting ? null : _submit,
          ),
        ],
      ),
    );
  }
}
