import 'package:flutter/material.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../../l10n/app_localizations.dart';

enum ReceiptSource { camera, gallery }

/// Bottom sheet offering camera or gallery selection.
class ReceiptSourceSheet extends StatelessWidget {
  const ReceiptSourceSheet({super.key});

  static Future<ReceiptSource?> show(BuildContext context) {
    return showSmartSpendSheet<ReceiptSource>(
      context: context,
      builder: (context) => const ReceiptSourceSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: SmartSpendSpacing.lg,
        vertical: SmartSpendSpacing.md,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            AppLocalizations.of(context).monPhotographTheReceipt,
            style: Theme.of(context).textTheme.titleLarge!,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.xs),
          Text(
            AppLocalizations.of(context).monTakeAPhotoOfThe,
            style: Theme.of(context).textTheme.bodySmall!
                .copyWith(color: colors.mutedForeground),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SmartSpendSpacing.md),
          ListTile(
            leading: CircleAvatar(
              backgroundColor: colors.accent.withValues(alpha: 0.12),
              child: Icon(Icons.camera_alt_rounded, color: colors.accent),
            ),
            title: Text(
              AppLocalizations.of(context).monCamera,
              style: Theme.of(context).textTheme.titleMedium!,
            ),
            subtitle: Text(
              AppLocalizations.of(context).monTakeAClearPhotoOf,
              style: Theme.of(context).textTheme.bodySmall!
                  .copyWith(color: colors.mutedForeground),
            ),
            onTap: () => Navigator.of(context).pop(ReceiptSource.camera),
          ),
          const Divider(),
          ListTile(
            leading: CircleAvatar(
              backgroundColor: colors.surfaceRaised,
              child: Icon(
                Icons.photo_library_outlined,
                color: colors.foreground,
              ),
            ),
            title: Text(
              AppLocalizations.of(context).monChooseFromTheGallery,
              style: Theme.of(context).textTheme.titleMedium!,
            ),
            subtitle: Text(
              AppLocalizations.of(context).monPickAPhotoSavedOn,
              style: Theme.of(context).textTheme.bodySmall!
                  .copyWith(color: colors.mutedForeground),
            ),
            onTap: () => Navigator.of(context).pop(ReceiptSource.gallery),
          ),
          const SizedBox(height: SmartSpendSpacing.sm),
        ],
      ),
    );
  }
}
