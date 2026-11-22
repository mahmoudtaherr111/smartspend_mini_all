import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import 'plan_providers.dart';

/// Screen allowing users to cancel Pro renewal with feedback survey (PLN-03).
class CancelPlanScreen extends ConsumerStatefulWidget {
  const CancelPlanScreen({super.key});

  static const path = '/more/cancel-plan';

  @override
  ConsumerState<CancelPlanScreen> createState() => _CancelPlanScreenState();
}

class _CancelPlanScreenState extends ConsumerState<CancelPlanScreen> {
  bool _opening = false;
  bool _cancellingPaymob = false;

  /// A store subscription renews at the store until it is cancelled there: nothing the server does stops the charge,
  /// so the app opens the person's subscriptions page.
  Future<void> _openStore() async {
    setState(() => _opening = true);
    final page = Theme.of(context).platform == TargetPlatform.iOS
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    try {
      final opened = await launchUrl(
        Uri.parse(page),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appWeCanTCancelRight,
        );
      }
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appWeCanTCancelRight,
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Future<void> _cancelPaymob() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.upgradePaymobCancelConfirmTitle),
        content: Text(l10n.upgradePaymobCancelConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.appKeepMyPlan),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.upgradePaymobCancelAction),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancellingPaymob = true);
    try {
      final res = await ref
          .read(trpcClientProvider)
          .mutate(Procedures.pro.cancel);
      ref.invalidate(userPlanProvider);
      if (!mounted) return;
      final msg = res is Map<String, Object?> && res['message'] is String
          ? res['message']! as String
          : l10n.cancelPlanRetainNotice;
      showSmartSpendNotice(context, msg);
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) showSmartSpendNotice(context, e.message);
    } on Object {
      if (mounted) {
        showSmartSpendNotice(
          context,
          AppLocalizations.of(context).appWeCanTCancelRight,
        );
      }
    } finally {
      if (mounted) setState(() => _cancellingPaymob = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.cancelPlanTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(SmartSpendSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InlineMessage(l10n.cancelPlanRetainNotice, tone: MessageTone.info),
            const SizedBox(height: SmartSpendSpacing.lg),
            Text(
              l10n.cancelPlanAtStore,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: SmartSpendSpacing.xl),
            SmartSpendButton(
              label: l10n.cancelPlanOpenStore,
              icon: Icons.open_in_new_rounded,
              busy: _opening,
              onPressed: _cancellingPaymob ? null : _openStore,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            SmartSpendButton(
              label: l10n.upgradePaymobCancelAction,
              variant: ButtonVariant.destructive,
              busy: _cancellingPaymob,
              onPressed: _opening ? null : _cancelPaymob,
            ),
            const SizedBox(height: SmartSpendSpacing.sm),
            SmartSpendButton(
              label: l10n.appKeepMyPlan,
              variant: ButtonVariant.quiet,
              onPressed: (_opening || _cancellingPaymob)
                  ? null
                  : () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
