import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'auth_api.dart';
import 'auth_widgets.dart';
import 'human_check.dart';
import 'session_controller.dart';
import 'sign_in_screen.dart';

/// A new phone account (`localAuth.register`), as the website's sign-up form makes it.
///
/// With WhatsApp verification on (`localAuth.getVerificationSettings`), the number is proved first: the server
/// sends a six-digit code to the number's WhatsApp (`localAuth.generateVerificationCode`, behind the Turnstile check
/// when the build has a site key), the person types it here (the keyboard suggests it), `localAuth
/// .confirmVerificationCode` accepts it, and the account is created with the challenge's ticket. See "WhatsApp
/// verification" in `docs/systems/accounts.md` and decision 0038.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  /// Below sign-in, so the route guard lets a signed-out person reach it.
  static const path = '${SignInScreen.path}/register';

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _referral = TextEditingController();
  final _code = TextEditingController();

  bool _busy = false;
  String? _error;

  /// Whether the number must be proved over WhatsApp; null until the server has said.
  bool? _verificationRequired;

  String? _humanToken;
  int _humanReset = 0;

  _Verification? _verification;

  @override
  void initState() {
    super.initState();
    // Without an answer now, the form asks again when it is sent.
    unawaited(_loadVerificationSetting().then((_) {}, onError: (Object _) {}));
  }

  @override
  void dispose() {
    _verification?.dispose();
    _name.dispose();
    _phone.dispose();
    _password.dispose();
    _referral.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<bool> _loadVerificationSetting() async {
    final required = await ref
        .read(authApiProvider)
        .phoneVerificationRequired();
    if (mounted) setState(() => _verificationRequired = required);
    return required;
  }

  Future<void> _submit() async {
    if (_busy) return;
    final l10n = AppLocalizations.of(context);
    final name = _name.text.trim();
    final phone = normalizePhoneNumber(_phone.text);
    final password = _password.text;
    if (name.isEmpty || phone.isEmpty || password.isEmpty) {
      setState(() => _error = l10n.enterRegisterFields);
      return;
    }
    if (name.length < 2) {
      setState(() => _error = l10n.nameTooShort);
      return;
    }
    if (password.length < 6) {
      setState(() => _error = l10n.passwordTooShort);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final required =
          _verificationRequired ?? await _loadVerificationSetting();
      if (!required) {
        await _createAccount();
        return;
      }
      await _sendCode();
    } on _Shown catch (error) {
      _showError(error.message);
    } on ApiException catch (error) {
      _showError(error.message);
    } on ApiNetworkException catch (error) {
      _showError(error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Asks the server to send a code to the number's WhatsApp. Throws what the API throws.
  Future<void> _sendCode() async {
    final l10n = AppLocalizations.of(context);
    final humanCheck = ref.read(humanCheckProvider);
    final humanToken = _humanToken;
    if (humanCheck != null && humanToken == null) {
      throw _Shown(l10n.humanCheckPending);
    }
    // A Turnstile token is good for one request: ask for a fresh one whatever happens to this one.
    setState(() {
      _humanToken = null;
      _humanReset++;
    });
    final challenge = await ref
        .read(authApiProvider)
        .startPhoneChallenge(
          phone: normalizePhoneNumber(_phone.text),
          turnstileToken: humanToken,
        );
    if (mounted) _follow(challenge);
  }

  Future<void> _resend() async {
    final verification = _verification;
    if (verification == null || verification.busy) return;
    final sent = AppLocalizations.of(context).verifyResent;
    setState(() {
      verification.busy = true;
      verification.error = null;
    });
    try {
      await _sendCode();
      if (mounted) setState(() => _verification?.notice = sent);
    } on _Shown catch (error) {
      if (mounted) setState(() => verification.error = error.message);
    } on ApiException catch (error) {
      if (mounted) setState(() => verification.error = error.message);
    } on ApiNetworkException catch (error) {
      if (mounted) setState(() => verification.error = error.message);
    } finally {
      if (mounted) setState(() => verification.busy = false);
    }
  }

  Future<void> _createAccount({String? verificationTicket}) async {
    final answer = await ref
        .read(authApiProvider)
        .register(
          name: _name.text.trim(),
          phone: normalizePhoneNumber(_phone.text),
          password: _password.text,
          referralCode: _referral.text.trim(),
          verificationTicket: verificationTicket,
        );
    await ref.read(sessionProvider.notifier).signIn(answer);
  }

  void _follow(PhoneChallenge challenge) {
    final now = clock.now();
    _verification?.dispose();
    _code.clear();
    final verification = _Verification(
      challenge: challenge,
      deadline: now.add(challenge.expiresIn),
      resendAt: now.add(challenge.resendIn),
      ticker: Timer.periodic(const Duration(seconds: 1), (_) => _tick()),
    );
    setState(() => _verification = verification);
  }

  void _tick() {
    final verification = _verification;
    if (!mounted || verification == null || verification.confirmed) return;
    if (!clock.now().isBefore(verification.deadline)) {
      _stopVerifying(error: AppLocalizations.of(context).verifyExpired);
    } else {
      setState(() {});
    }
  }

  Future<void> _confirm() async {
    final verification = _verification;
    if (verification == null || verification.busy || verification.confirmed) {
      return;
    }
    final l10n = AppLocalizations.of(context);
    final code = readDigits(_code.text);
    if (code.length != 6) {
      setState(() => verification.error = l10n.verifyCodeIncomplete);
      return;
    }
    setState(() {
      verification.busy = true;
      verification.error = null;
      verification.notice = null;
    });
    try {
      await ref
          .read(authApiProvider)
          .confirmPhoneCode(ticket: verification.challenge.ticket, code: code);
    } on ApiException catch (error) {
      _code.clear();
      if (mounted) {
        setState(() {
          verification.busy = false;
          verification.error = error.message;
        });
      }
      return;
    } on ApiNetworkException catch (error) {
      if (mounted) {
        setState(() {
          verification.busy = false;
          verification.error = error.message;
        });
      }
      return;
    }
    if (!mounted) return;
    verification.ticker.cancel();
    setState(() => verification.confirmed = true);
    try {
      await _createAccount(verificationTicket: verification.challenge.ticket);
    } on ApiException catch (error) {
      _stopVerifying(error: error.message);
    } on ApiNetworkException catch (error) {
      _stopVerifying(error: error.message);
    }
  }

  void _stopVerifying({String? error}) {
    if (!mounted) return;
    _verification?.dispose();
    setState(() {
      _verification = null;
      _error = error;
    });
  }

  void _showError(String message) {
    if (mounted) setState(() => _error = message);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final verification = _verification;
    return AuthScaffold(
      title: verification == null ? l10n.registerTitle : l10n.verifyTitle,
      subtitle: verification == null ? l10n.registerSubtitle : l10n.verifyBody,
      leading: BackButton(
        onPressed: verification != null && !verification.confirmed
            ? _stopVerifying
            : () => context.go(SignInScreen.path),
      ),
      children: verification == null
          ? _form(l10n)
          : _verificationPanel(l10n, verification),
    );
  }

  List<Widget> _form(AppLocalizations l10n) {
    final humanCheck = ref.watch(humanCheckProvider);
    final error = _error;
    return [
      if (error != null) ...[
        InlineMessage(error),
        const SizedBox(height: SmartSpendSpacing.lg),
      ],
      AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _name,
              textInputAction: TextInputAction.next,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              decoration: InputDecoration(
                labelText: l10n.nameLabel,
                prefixIcon: const Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            PhoneField(controller: _phone),
            const SizedBox(height: SmartSpendSpacing.md),
            PasswordField(
              controller: _password,
              newPassword: true,
              helperText: l10n.passwordHint,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: SmartSpendSpacing.md),
            TextField(
              controller: _referral,
              textInputAction: TextInputAction.done,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: l10n.referralLabel,
                prefixIcon: const Icon(Icons.card_giftcard_outlined),
              ),
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      if (_verificationRequired == true && humanCheck != null) ...[
        const SizedBox(height: SmartSpendSpacing.lg),
        humanCheck((token) => setState(() => _humanToken = token), _humanReset),
      ],
      const SizedBox(height: SmartSpendSpacing.xl),
      SmartSpendButton(
        label: l10n.registerButton,
        busy: _busy,
        onPressed: _submit,
      ),
      const SizedBox(height: SmartSpendSpacing.lg),
      Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            l10n.haveAccountPrompt,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          TextButton(
            onPressed: _busy ? null : () => context.go(SignInScreen.path),
            child: Text(l10n.goToSignIn),
          ),
        ],
      ),
    ];
  }

  List<Widget> _verificationPanel(
    AppLocalizations l10n,
    _Verification verification,
  ) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final humanCheck = ref.watch(humanCheckProvider);
    final error = verification.error;
    final notice = verification.notice;

    if (verification.confirmed) {
      return [
        const SizedBox(height: SmartSpendSpacing.xl),
        const Center(child: CircularProgressIndicator()),
        const SizedBox(height: SmartSpendSpacing.lg),
        Text(
          l10n.verifyDone,
          textAlign: TextAlign.center,
          style: textTheme.titleMedium,
        ),
      ];
    }

    final resendLeft = verification.resendAt.difference(clock.now());
    final resendSeconds = resendLeft.isNegative
        ? 0
        : (resendLeft.inMilliseconds / 1000).ceil();
    final canResend =
        resendSeconds == 0 &&
        !verification.busy &&
        (humanCheck == null || _humanToken != null);

    return [
      if (error != null) ...[
        InlineMessage(error),
        const SizedBox(height: SmartSpendSpacing.lg),
      ],
      if (notice != null) ...[
        InlineMessage(notice, warning: true),
        const SizedBox(height: SmartSpendSpacing.lg),
      ],
      // Digits in a code read left to right in Arabic too.
      Directionality(
        textDirection: TextDirection.ltr,
        child: TextField(
          controller: _code,
          autofocus: true,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          textAlign: TextAlign.center,
          maxLength: 6,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp('[0-9٠-٩]')),
          ],
          style: textTheme.headlineSmall,
          decoration: InputDecoration(
            labelText: l10n.verifyCodeField,
            counterText: '',
          ),
          onChanged: (value) {
            if (readDigits(value).length == 6) unawaited(_confirm());
          },
          onSubmitted: (_) => _confirm(),
        ),
      ),
      const SizedBox(height: SmartSpendSpacing.lg),
      SmartSpendButton(
        label: l10n.verifyConfirm,
        busy: verification.busy,
        onPressed: _confirm,
      ),
      const SizedBox(height: SmartSpendSpacing.md),
      Text(
        l10n.verifyTimeLeft(_clock(verification.deadline)),
        textAlign: TextAlign.center,
        style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
      ),
      if (resendSeconds == 0 && humanCheck != null) ...[
        const SizedBox(height: SmartSpendSpacing.lg),
        humanCheck((token) => setState(() => _humanToken = token), _humanReset),
      ],
      const SizedBox(height: SmartSpendSpacing.sm),
      TextButton(
        onPressed: canResend ? _resend : null,
        child: Text(
          resendSeconds > 0
              ? l10n.verifyResendIn(resendSeconds)
              : l10n.verifyResend,
        ),
      ),
      TextButton(onPressed: _stopVerifying, child: Text(l10n.verifyBack)),
    ];
  }

  /// Minutes and seconds left, `9:05`.
  static String _clock(DateTime deadline) {
    final left = deadline.difference(clock.now());
    final seconds = left.isNegative ? 0 : (left.inMilliseconds / 1000).ceil();
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }
}

/// Western digits from what was typed, Arabic-Indic digits included; everything else dropped.
String readDigits(String text) => text
    .replaceAllMapped(
      RegExp('[٠-٩]'),
      (match) => String.fromCharCode(match[0]!.codeUnitAt(0) - 0x0660 + 0x30),
    )
    .replaceAll(RegExp(r'\D'), '');

/// A message for the person that did not come from the server.
final class _Shown implements Exception {
  const _Shown(this.message);

  final String message;
}

/// One code sent on WhatsApp, waiting to be typed back.
final class _Verification {
  _Verification({
    required this.challenge,
    required this.deadline,
    required this.resendAt,
    required this.ticker,
  });

  final PhoneChallenge challenge;
  final DateTime deadline;
  final DateTime resendAt;
  final Timer ticker;

  /// A code is being checked or a new one asked for.
  bool busy = false;

  /// The code was accepted; the account is being created.
  bool confirmed = false;

  /// Why the last code or resend failed, in the server's words.
  String? error;

  /// A new code was sent.
  String? notice;

  void dispose() => ticker.cancel();
}
