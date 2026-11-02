import 'dart:io' show Platform;
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../l10n/app_localizations.dart';
import '../plans/plan_providers.dart';

/// One campaign an admin runs, as `ads.list` returns it.
final class SponsoredAd {
  const SponsoredAd({
    required this.id,
    required this.title,
    required this.content,
    required this.placement,
    this.linkUrl,
  });

  factory SponsoredAd.fromJson(Map<String, Object?> json) => SponsoredAd(
    id: (json['id'] as num?)?.toInt() ?? 0,
    title: json['title'] as String? ?? '',
    content: json['content'] as String? ?? '',
    placement: json['placement'] as String? ?? 'sidebar',
    linkUrl: json['linkUrl'] as String?,
  );

  final int id;
  final String title;
  final String content;
  final String placement;
  final String? linkUrl;
}

/// A failed campaign never shows as an error: the card just stays away.
final sponsoredAdProvider = FutureProvider<SponsoredAd?>((ref) async {
  try {
    final data = await ref
        .watch(trpcClientProvider)
        .query(
          Procedures.ads.list,
          input: {'platform': Platform.isIOS ? 'ios' : 'android'},
        );
    if (data is! List<Object?> || data.isEmpty) return null;
    final first = data.first;
    return first is Map<String, Object?> ? SponsoredAd.fromJson(first) : null;
  } on Object {
    return null;
  }
});

/// A clearly labelled campaign for people on the free plan, below their own records so it never stands between them
/// and their money. Pro includes no sponsored cards, so nothing shows until the plan is known.
class SponsoredCard extends ConsumerStatefulWidget {
  const SponsoredCard({super.key});

  @override
  ConsumerState<SponsoredCard> createState() => _SponsoredCardState();
}

class _SponsoredCardState extends ConsumerState<SponsoredCard> {
  int? _countedAd;

  void _countImpression(SponsoredAd ad) {
    if (_countedAd == ad.id) return;
    _countedAd = ad.id;
    final token = '${ad.id}-${Random.secure().nextInt(1 << 32)}';
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref
            .read(trpcClientProvider)
            .mutate(
              Procedures.ads.recordImpression,
              input: {
                'adId': ad.id,
                'placement': ad.placement,
                'impressionToken': token,
              },
            );
      } on Object {
        // A count lost to the network changes nothing for the person.
      }
    });
  }

  Future<void> _open(SponsoredAd ad) async {
    final uri = Uri.tryParse(ad.linkUrl ?? '');
    if (uri == null || !uri.hasScheme) return;
    try {
      await ref
          .read(trpcClientProvider)
          .mutate(Procedures.ads.click, input: {'adId': ad.id});
    } on Object {
      // The link still opens.
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final plan = ref.watch(userPlanProvider).value;
    final ad = ref.watch(sponsoredAdProvider).value;
    if (plan == null || plan.isPro || ad == null) {
      return const SizedBox.shrink();
    }
    _countImpression(ad);
    final textTheme = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: ad.linkUrl == null ? null : () => _open(ad),
        child: Padding(
          padding: const EdgeInsets.all(SmartSpendSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StatusTag(
                AppLocalizations.of(context).adLabel,
                color: context.smartSpendColors.mutedForeground,
              ),
              const SizedBox(height: SmartSpendSpacing.sm),
              Text(ad.title, style: textTheme.titleMedium),
              const SizedBox(height: SmartSpendSpacing.xs),
              Text(ad.content, style: textTheme.bodyMedium),
            ],
          ),
        ),
      ),
    );
  }
}
