import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import '../auth/session_controller.dart';
import '../ledger/offline/outbox.dart';
import 'app_lock.dart';
import 'pin_entry.dart';

/// Puts the lock over the whole app while it is locked, above every route and sheet.
///
/// The app under it keeps its place (the tab, the scroll, a half-written sentence) but is not drawn, not read by a
/// screen reader and not touchable. Android's back button on the lock leaves the app instead of moving the hidden
/// screens. Amounts are hidden here for every screen when the person chose to hide them.
class LockGate extends ConsumerStatefulWidget {
  const LockGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate>
    with WidgetsBindingObserver {
  bool _covered = false;

  @override
  void initState() {
    super.initState();
    // Registered before the router's own back button handler, which mounts below this widget, so it is asked first.
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Future<bool> didPopRoute() async {
    if (!_covered) return false;
    await SystemNavigator.pop();
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(sessionProvider) is SignedIn;
    final lock = ref.watch(appLockProvider);
    _covered = signedIn && (!lock.ready || lock.locked);
    final colors = context.smartSpendColors;
    return MoneyPrivacy(
      hidden: lock.hideAmounts,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Offstage(
            offstage: _covered,
            child: TickerMode(enabled: !_covered, child: widget.child),
          ),
          if (_covered)
            lock.ready
                ? const _LockLayer()
                // The stored lock is still being read: nothing of the account shows meanwhile.
                : ColoredBox(color: colors.background),
        ],
      ),
    );
  }
}

/// The lock screen in its own navigator, so its tooltips and messages have an overlay of their own.
class _LockLayer extends StatelessWidget {
  const _LockLayer();

  @override
  Widget build(BuildContext context) {
    return Navigator(
      onGenerateRoute: (_) =>
          PageRouteBuilder<void>(pageBuilder: (_, _, _) => const LockScreen()),
    );
  }
}

class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key});

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  final _entry = GlobalKey<PinEntryState>();
  bool _forgot = false;
  bool _signingOut = false;

  /// The lock (by [LockView.lockCount]) biometrics were last offered for: once per lock, when the app is in front.
  int _offeredFor = 0;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: _offerBiometrics);
    WidgetsBinding.instance.addPostFrameCallback((_) => _offerBiometrics());
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  void _offerBiometrics() {
    final lock = ref.read(appLockProvider);
    final inFront =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    if (!mounted || !lock.biometrics || !inFront) return;
    if (_offeredFor == lock.lockCount) return;
    _offeredFor = lock.lockCount;
    unawaited(_entry.currentState?.askBiometrics());
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    await ref.read(sessionProvider.notifier).signOut();
    if (mounted) setState(() => _signingOut = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final damaged = ref.watch(appLockProvider.select((l) => l.record.damaged));
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_outline, size: 40, color: colors.accent),
                  const SizedBox(height: SmartSpendSpacing.lg),
                  if (_forgot || damaged)
                    _ForgotPanel(
                      damaged: damaged,
                      signingOut: _signingOut,
                      onSignOut: _signOut,
                      onBack: damaged
                          ? null
                          : () => setState(() => _forgot = false),
                    )
                  else ...[
                    PinEntry(
                      key: _entry,
                      title: l10n.lockTitle,
                      onUnverifiable: () => setState(() => _forgot = true),
                    ),
                    const SizedBox(height: SmartSpendSpacing.md),
                    SmartSpendButton(
                      label: l10n.lockForgot,
                      variant: ButtonVariant.quiet,
                      onPressed: () => setState(() => _forgot = true),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The way out when the PIN is forgotten: signing out removes the lock, and signing in again sets a new one.
class _ForgotPanel extends ConsumerWidget {
  const _ForgotPanel({
    required this.damaged,
    required this.signingOut,
    required this.onSignOut,
    required this.onBack,
  });

  final bool damaged;
  final bool signingOut;
  final VoidCallback onSignOut;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    final unsent = ref.watch(outboxProvider).value?.items.length ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          damaged ? l10n.lockDamaged : l10n.lockForgotBody,
          style: textTheme.bodyLarge,
          textAlign: TextAlign.center,
        ),
        if (unsent > 0) ...[
          const SizedBox(height: SmartSpendSpacing.md),
          InlineMessage(l10n.lockForgotUnsent(unsent), warning: true),
        ],
        const SizedBox(height: SmartSpendSpacing.xl),
        SmartSpendButton(
          label: l10n.lockSignOut,
          variant: ButtonVariant.destructive,
          icon: Icons.logout,
          busy: signingOut,
          onPressed: onSignOut,
        ),
        if (onBack != null) ...[
          const SizedBox(height: SmartSpendSpacing.sm),
          SmartSpendButton(
            label: l10n.lockBack,
            variant: ButtonVariant.quiet,
            onPressed: onBack,
          ),
        ],
      ],
    );
  }
}
