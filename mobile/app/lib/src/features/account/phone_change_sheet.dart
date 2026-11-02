import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/auth_api.dart';
import '../auth/session_controller.dart';
import 'account_providers.dart';

/// Modal bottom sheet for changing account phone number via WhatsApp Cloud API challenge (ACC-03, GAP-24).
class PhoneChangeSheet extends ConsumerStatefulWidget {
  const PhoneChangeSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(SmartSpendRadii.sheet),
        ),
      ),
      builder: (ctx) => const PhoneChangeSheet(),
    );
  }

  @override
  ConsumerState<PhoneChangeSheet> createState() => _PhoneChangeSheetState();
}

enum _Step { inputPhone, verifyCode }

class _PhoneChangeSheetState extends ConsumerState<PhoneChangeSheet> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  var _step = _Step.inputPhone;
  bool _busy = false;
  String? _errorMessage;
  String? _verificationTicket;
  int _resendInSeconds = 60;
  Timer? _countdownTimer;

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (_resendInSeconds > 0) {
          _resendInSeconds--;
        } else {
          timer.cancel();
        }
      });
    });
  }

  Future<void> _requestChallenge() async {
    final l10n = AppLocalizations.of(context);
    final phone = normalizePhoneNumber(_phoneController.text.trim());
    if (phone.isEmpty || !RegExp(r'^01[0125]\d{8}$').hasMatch(phone)) {
      setState(() {
        _errorMessage =
            'يرجى إدخال رقم هاتف مصري صحيح مكون من 11 رقماً يبدأ بـ 01';
      });
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      final res = await ref
          .read(accountRepositoryProvider)
          .requestPhoneChange(phone);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _verificationTicket = res['ticket'] as String?;
        _resendInSeconds = (res['resendInSeconds'] as int?) ?? 60;
        _step = _Step.verifyCode;
      });
      _startCountdown();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errorMessage = e.message;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errorMessage = l10n.captureStatusFailed;
      });
    }
  }

  Future<void> _confirmChallenge() async {
    final l10n = AppLocalizations.of(context);
    final code = _codeController.text.trim();
    if (code.length != 6) {
      setState(() {
        _errorMessage = 'أدخل كود التأكيد المكون من 6 أرقام';
      });
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      await ref
          .read(accountRepositoryProvider)
          .confirmPhoneChange(
            code: code,
            verificationTicket: _verificationTicket ?? '',
          );

      if (!mounted) return;
      showSmartSpendNotice(context, l10n.phoneChangeSuccess);
      await ref.read(sessionProvider.notifier).refresh();
      ref.invalidate(userProfileProvider);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errorMessage = e.message;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errorMessage = l10n.captureStatusFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(SmartSpendSpacing.screen),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
                  decoration: BoxDecoration(
                    color: colors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  Icon(
                    Icons.phone_android_rounded,
                    color: colors.accent,
                    size: 28,
                  ),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Text(
                      l10n.phoneChangeTitle,
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: SmartSpendSpacing.md),
              Text(
                l10n.phoneChangeBody,
                style: textTheme.bodyMedium?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              if (_step == _Step.inputPhone) ...[
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    labelText: l10n.phoneChangeNewNumber,
                    hintText: '01xxxxxxxxx',
                    prefixIcon: const Icon(Icons.phone_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xl),
                SmartSpendButton(
                  label: l10n.phoneChangeSendCode,
                  busy: _busy,
                  onPressed: _requestChallenge,
                ),
              ] else ...[
                TextField(
                  controller: _codeController,
                  keyboardType: TextInputType.number,
                  enabled: !_busy,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    letterSpacing: 8,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    labelText: l10n.phoneChangeEnterCode,
                    counterText: '',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                if (_resendInSeconds > 0)
                  Text(
                    'يمكنك إعادة طلب الكود بعد $_resendInSeconds ثانية',
                    textAlign: TextAlign.center,
                    style: textTheme.bodySmall?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  )
                else
                  TextButton(
                    onPressed: _busy ? null : _requestChallenge,
                    child: Text(l10n.phoneChangeSendCode),
                  ),
                const SizedBox(height: SmartSpendSpacing.lg),
                SmartSpendButton(
                  label: l10n.profileSave,
                  busy: _busy,
                  onPressed: _confirmChallenge,
                ),
              ],
              if (_errorMessage != null) ...[
                const SizedBox(height: SmartSpendSpacing.md),
                Text(
                  _errorMessage!,
                  style: textTheme.bodySmall?.copyWith(color: colors.danger),
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
