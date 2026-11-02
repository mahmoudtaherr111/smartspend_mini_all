import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'auth_api.dart';
import 'session_controller.dart';

/// Bottom sheet guiding forgotten password recovery via WhatsApp OTP (AUTH-04, GAP-22, GAP-23).
class ForgotPasswordSheet extends ConsumerStatefulWidget {
  const ForgotPasswordSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(SmartSpendRadii.sheet),
        ),
      ),
      builder: (ctx) => const ForgotPasswordSheet(),
    );
  }

  @override
  ConsumerState<ForgotPasswordSheet> createState() =>
      _ForgotPasswordSheetState();
}

enum _Step { phone, code, newPassword }

class _ForgotPasswordSheetState extends ConsumerState<ForgotPasswordSheet> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  var _step = _Step.phone;
  bool _busy = false;
  String? _errorMessage;
  String? _ticket;
  int _resendInSeconds = 60;
  Timer? _countdown;

  @override
  void dispose() {
    _countdown?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdown?.cancel();
    _countdown = Timer.periodic(const Duration(seconds: 1), (timer) {
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

  Future<void> _sendCode() async {
    final phone = normalizePhoneNumber(_phoneController.text.trim());
    if (phone.isEmpty || !RegExp(r'^01[0125]\d{8}$').hasMatch(phone)) {
      setState(
        () => _errorMessage = 'يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 01',
      );
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      final challenge = await ref
          .read(authApiProvider)
          .startPhoneChallenge(phone: phone);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _ticket = challenge.ticket;
        _resendInSeconds = challenge.resendIn.inSeconds;
        _step = _Step.code;
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
        _errorMessage = 'مش قادرين نبعت كود دلوقتي. تأكد من النت وجرّب تاني.';
      });
    }
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (code.length != 6) {
      setState(() => _errorMessage = 'أدخل الكود المكون من 6 أرقام');
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      await ref
          .read(authApiProvider)
          .confirmPhoneCode(ticket: _ticket ?? '', code: code);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _Step.newPassword;
      });
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
        _errorMessage = 'فشل التحقق من الكود.';
      });
    }
  }

  Future<void> _resetPassword() async {
    final l10n = AppLocalizations.of(context);
    final password = _passwordController.text;
    final confirm = _confirmPasswordController.text;

    if (password.length < 6) {
      setState(() => _errorMessage = 'كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }
    if (password != confirm) {
      setState(() => _errorMessage = 'كلمتا المرور غير متطابقتين');
      return;
    }

    setState(() {
      _busy = true;
      _errorMessage = null;
    });

    try {
      final answer = await ref
          .read(authApiProvider)
          .resetPassword(
            verificationTicket: _ticket ?? '',
            newPassword: password,
          );
      if (!mounted) return;
      showSmartSpendNotice(context, l10n.resetPasswordSuccess);
      await ref.read(sessionProvider.notifier).signIn(answer);
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
        _errorMessage = 'تعذر تغيير كلمة المرور.';
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
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: SmartSpendSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Row(
                children: [
                  Icon(
                    Icons.lock_reset_rounded,
                    color: colors.accent,
                    size: 28,
                  ),
                  const SizedBox(width: SmartSpendSpacing.md),
                  Expanded(
                    child: Text(
                      l10n.resetPasswordTitle,
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: SmartSpendSpacing.lg),
              if (_step == _Step.phone) ...[
                Text(
                  'أدخل رقم هاتفك المسجل لنرسل لك كود استعادة الحساب على واتساب:',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    labelText: l10n.profilePhone,
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
                  onPressed: _sendCode,
                ),
              ] else if (_step == _Step.code) ...[
                Text(
                  'أدخل كود التحقق المكون من 6 أرقام المرسل إلى واتساب:',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
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
                    onPressed: _busy ? null : _sendCode,
                    child: Text(l10n.phoneChangeSendCode),
                  ),
                const SizedBox(height: SmartSpendSpacing.lg),
                SmartSpendButton(
                  label: 'تأكيد الكود',
                  busy: _busy,
                  onPressed: _verifyCode,
                ),
              ] else ...[
                Text(
                  'اختر كلمة مرور جديدة لحسابك:',
                  style: textTheme.bodyMedium?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    labelText: l10n.resetPasswordNew,
                    prefixIcon: const Icon(Icons.lock_outline),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.md),
                TextField(
                  controller: _confirmPasswordController,
                  obscureText: true,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    labelText: l10n.resetPasswordConfirm,
                    prefixIcon: const Icon(Icons.lock_outline),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(SmartSpendRadii.md),
                    ),
                  ),
                ),
                const SizedBox(height: SmartSpendSpacing.xl),
                SmartSpendButton(
                  label: l10n.resetPasswordSubmit,
                  busy: _busy,
                  onPressed: _resetPassword,
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
