import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../more/language_card.dart';
import 'auth_api.dart';
import 'auth_widgets.dart';
import 'google_identity.dart';
import 'register_screen.dart';
import 'session_controller.dart';

/// Sign-in with a phone number and password (`localAuth.login`) or with Google (`auth.signInWithGoogle`). The
/// router leaves this screen on its own once a session starts.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  static const path = '/sign-in';

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  /// Login protection asked this phone to wait (`retryAfterSeconds`); the button stays off until then.
  DateTime? _retryAt;
  Timer? _retryTimer;

  @override
  void dispose() {
    _retryTimer?.cancel();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  int get _secondsToWait {
    final retryAt = _retryAt;
    if (retryAt == null) return 0;
    final left = retryAt.difference(clock.now());
    return left.isNegative ? 0 : (left.inMilliseconds / 1000).ceil();
  }

  Future<void> _signInWithPhone() async {
    if (_busy || _secondsToWait > 0) return;
    final phone = normalizePhoneNumber(_phone.text);
    final password = _password.text;
    if (phone.isEmpty || password.isEmpty) {
      setState(
        () => _error = AppLocalizations.of(context).enterPhoneAndPassword,
      );
      return;
    }
    await _run(
      () => ref
          .read(authApiProvider)
          .signInWithPhone(phone: phone, password: password),
    );
  }

  Future<void> _signInWithGoogle() async {
    if (_busy) return;
    final failed = AppLocalizations.of(context).googleFailed;
    await _run(() async {
      final String? idToken;
      try {
        idToken = await ref.read(googleIdentityProvider).requestIdToken();
      } on GoogleIdentityFailure {
        throw _Shown(failed);
      }
      if (idToken == null) return null;
      return ref.read(authApiProvider).signInWithGoogle(idToken);
    });
  }

  /// Runs one sign-in attempt; an answer starts the session, null means the person stopped.
  Future<void> _run(Future<SignedInAnswer?> Function() attempt) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final answer = await attempt();
      if (answer != null) {
        await ref.read(sessionProvider.notifier).signIn(answer);
      }
    } on ApiException catch (error) {
      _showError(error.message, retryAfter: error.retryAfter);
    } on ApiNetworkException catch (error) {
      _showError(error.message);
    } on _Shown catch (error) {
      _showError(error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String message, {Duration? retryAfter}) {
    if (!mounted) return;
    setState(() {
      _error = message;
      if (retryAfter != null && retryAfter > Duration.zero) {
        _retryAt = clock.now().add(retryAfter);
        _retryTimer?.cancel();
        _retryTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
          if (!mounted) return;
          if (_secondsToWait == 0) timer.cancel();
          setState(() {});
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    final session = ref.watch(sessionProvider);
    final google = ref.watch(googleIdentityProvider);
    final wait = _secondsToWait;
    final error = _error;

    return AuthScaffold(
      title: l10n.signInTitle,
      subtitle: l10n.signInSubtitle,
      children: [
        if (error != null) ...[
          InlineMessage(error),
          const SizedBox(height: SmartSpendSpacing.lg),
        ] else if (session case SignedOut(expired: true)) ...[
          InlineMessage(l10n.sessionEnded, warning: true),
          const SizedBox(height: SmartSpendSpacing.lg),
        ],
        AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PhoneField(controller: _phone),
              const SizedBox(height: SmartSpendSpacing.md),
              PasswordField(
                controller: _password,
                onSubmitted: (_) => _signInWithPhone(),
              ),
            ],
          ),
        ),
        const SizedBox(height: SmartSpendSpacing.xl),
        SmartSpendButton(
          label: l10n.signInButton,
          busy: _busy,
          onPressed: wait > 0 ? null : _signInWithPhone,
        ),
        if (wait > 0) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          Text(
            l10n.tryAgainIn(wait),
            textAlign: TextAlign.center,
            style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
          ),
        ],
        if (google.isAvailable) ...[
          const SizedBox(height: SmartSpendSpacing.lg),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: SmartSpendSpacing.md,
                ),
                child: Text(
                  l10n.orSeparator,
                  style: textTheme.bodySmall?.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: SmartSpendSpacing.lg),
          SmartSpendButton(
            label: l10n.signInWithGoogle,
            variant: ButtonVariant.secondary,
            icon: Icons.account_circle_outlined,
            onPressed: _busy ? null : _signInWithGoogle,
          ),
        ],
        const SizedBox(height: SmartSpendSpacing.xl),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(l10n.noAccountPrompt, style: textTheme.bodyMedium),
            TextButton(
              onPressed: _busy ? null : () => context.go(RegisterScreen.path),
              child: Text(l10n.createAccount),
            ),
          ],
        ),
        const SizedBox(height: SmartSpendSpacing.sm),
        const LanguageSwitchButton(),
      ],
    );
  }
}

/// A failure whose message is already written for the user.
final class _Shown implements Exception {
  const _Shown(this.message);

  final String message;
}
