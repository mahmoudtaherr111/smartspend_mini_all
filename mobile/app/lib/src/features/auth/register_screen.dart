import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import 'auth_api.dart';
import 'auth_widgets.dart';
import 'challenge_follower.dart';
import 'human_check.dart';
import 'session_controller.dart';
import 'sign_in_screen.dart';

/// Opens a link outside the app (WhatsApp), and says whether something opened it.
typedef ExternalLinkOpener = Future<bool> Function(Uri uri);

/// One connection to a phone challenge's event stream; tests answer it without a server.
final nextChallengeOutcomeProvider = Provider<NextChallengeOutcome>(
  (ref) => ref.watch(phoneChallengeEventsProvider).next,
);

final externalLinkOpenerProvider = Provider<ExternalLinkOpener>(
  (ref) => (uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on PlatformException {
      return false;
    }
  },
);

/// A new phone account (`localAuth.register`), as the website's sign-up form makes it.
///
/// With WhatsApp verification on (`localAuth.getVerificationSettings`), the number is proved first: the server
/// hands out a code (`localAuth.generateVerificationCode`, behind the Turnstile check when the build has a site
/// key), the person sends it to the bot from that number's WhatsApp, and once `/api/sse/otp` reports it verified
/// the account is created with the challenge's ticket. See "WhatsApp verification" in `docs/systems/accounts.md`.
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
  late final AppLifecycleListener _lifecycle;

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
    // Back from WhatsApp, the challenge's connection is opened again at once.
    _lifecycle = AppLifecycleListener(
      onResume: () => _verification?.follower.resume(),
    );
    // Without an answer now, the form asks again when it is sent.
    unawaited(_loadVerificationSetting().then((_) {}, onError: (Object _) {}));
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _verification?.dispose();
    _name.dispose();
    _phone.dispose();
    _password.dispose();
    _referral.dispose();
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
      final api = ref.read(authApiProvider);
      final required =
          _verificationRequired ?? await _loadVerificationSetting();
      if (!required) {
        await _createAccount();
        return;
      }
      final humanCheck = ref.read(humanCheckProvider);
      final humanToken = _humanToken;
      if (humanCheck != null && humanToken == null) {
        _showError(l10n.humanCheckPending);
        return;
      }
      // A Turnstile token is good for one request: ask for a fresh one whatever happens to this one.
      setState(() {
        _humanToken = null;
        _humanReset++;
      });
      final challenge = await api.startPhoneChallenge(
        phone: phone,
        turnstileToken: humanToken,
      );
      if (mounted) _follow(challenge);
    } on ApiException catch (error) {
      _showError(error.message);
    } on ApiNetworkException catch (error) {
      _showError(error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
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
    final deadline = clock.now().add(challenge.expiresIn);
    final verification = _Verification(
      challenge: challenge,
      deadline: deadline,
      follower: ChallengeFollower(
        next: ref.read(nextChallengeOutcomeProvider),
        watch: challenge.watch,
        deadline: deadline,
        onOutcome: _onOutcome,
      ),
      ticker: Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        if (!clock.now().isBefore(deadline)) {
          _onOutcome(PhoneChallengeOutcome.expired);
        } else {
          setState(() {});
        }
      }),
    );
    setState(() => _verification = verification);
    verification.follower.start();
    unawaited(_loadBotNumber(verification));
  }

  Future<void> _loadBotNumber(_Verification verification) async {
    try {
      final number = await ref.read(authApiProvider).verificationBotNumber();
      if (mounted) setState(() => verification.botNumber = number);
    } on Object {
      // The button asks again when it is pressed.
    }
  }

  void _onOutcome(PhoneChallengeOutcome outcome) {
    final verification = _verification;
    if (!mounted || verification == null || verification.confirmed) return;
    final l10n = AppLocalizations.of(context);
    switch (outcome) {
      case PhoneChallengeOutcome.wrongSender:
        setState(() => verification.wrongSender = true);
      case PhoneChallengeOutcome.expired:
        _stopVerifying(error: l10n.verifyExpired);
      case PhoneChallengeOutcome.verified:
        verification.stopFollowing();
        setState(() => verification.confirmed = true);
        unawaited(_finishVerified(verification.challenge.ticket));
    }
  }

  Future<void> _finishVerified(String ticket) async {
    try {
      await _createAccount(verificationTicket: ticket);
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

  Future<void> _openWhatsApp(_Verification verification) async {
    final l10n = AppLocalizations.of(context);
    var bot = verification.botNumber;
    if (bot == null) {
      try {
        bot = await ref.read(authApiProvider).verificationBotNumber();
      } on Object {
        bot = null;
      }
      if (!mounted) return;
      setState(() => verification.botNumber = bot);
    }
    if (bot == null) {
      setState(() => verification.notice = l10n.verifyBotUnavailable);
      return;
    }
    final text = l10n.verifyWhatsAppText(verification.challenge.code);
    final link = Uri.parse(
      'https://wa.me/$bot?text=${Uri.encodeComponent(text)}',
    );
    final opened = await ref.read(externalLinkOpenerProvider)(link);
    if (!opened && mounted) {
      setState(() => verification.notice = l10n.whatsappNotOpened);
    }
  }

  Future<void> _copyCode(String code) async {
    final copied = AppLocalizations.of(context).verifyCodeCopied;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(copied)));
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
        FormMessage(error),
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
      BusyButton(label: l10n.registerButton, busy: _busy, onPressed: _submit),
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
    final code = verification.challenge.code;
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

    return [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          child: Column(
            children: [
              Text(
                l10n.verifyCodeLabel,
                style: textTheme.labelLarge?.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Directionality(
                    textDirection: TextDirection.ltr,
                    child: SelectableText(
                      code,
                      style: textTheme.headlineMedium?.copyWith(
                        color: colors.accent,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.verifyCopyCode,
                    icon: const Icon(Icons.copy_rounded),
                    onPressed: () => _copyCode(code),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: SmartSpendSpacing.lg),
      FilledButton.icon(
        onPressed: () => _openWhatsApp(verification),
        icon: const Icon(Icons.chat_outlined),
        label: Text(l10n.verifySendOnWhatsApp),
      ),
      const SizedBox(height: SmartSpendSpacing.lg),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox.square(
            dimension: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Text(l10n.verifyWaiting, style: textTheme.bodyMedium),
        ],
      ),
      const SizedBox(height: SmartSpendSpacing.xs),
      Text(
        l10n.verifyTimeLeft(_clock(verification.deadline)),
        textAlign: TextAlign.center,
        style: textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
      ),
      if (verification.wrongSender) ...[
        const SizedBox(height: SmartSpendSpacing.lg),
        FormMessage(l10n.verifyWrongSender, warning: true),
      ],
      if (notice != null) ...[
        const SizedBox(height: SmartSpendSpacing.lg),
        FormMessage(notice, warning: true),
      ],
      const SizedBox(height: SmartSpendSpacing.lg),
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

/// One phone challenge being waited on.
final class _Verification {
  _Verification({
    required this.challenge,
    required this.deadline,
    required this.follower,
    required this.ticker,
  });

  final PhoneChallenge challenge;
  final DateTime deadline;
  final ChallengeFollower follower;
  final Timer ticker;
  String? botNumber;
  bool wrongSender = false;

  /// The bot saw the code; the account is being created.
  bool confirmed = false;

  /// What went wrong with sending the code, shown under the panel.
  String? notice;

  void stopFollowing() {
    follower.dispose();
    ticker.cancel();
  }

  void dispose() => stopFollowing();
}
