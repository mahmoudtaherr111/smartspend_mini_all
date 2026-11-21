import 'package:flutter/material.dart';

import 'commitment_models.dart';

/// Each known service's own brand colour, a fact about the real world, used when the admin set no logo
/// (`subscription_catalog.brand_color` wins when set). Keys are the catalog's slugs.
const subscriptionBrandColors = <String, Color>{
  'netflix': Color(0xFFE50914),
  'shahid': Color(0xFF12A784),
  'osn_plus': Color(0xFF0D1B2A),
  'watch_it': Color(0xFFF4C430),
  'yango_play': Color(0xFFFC3F1D),
  'tod': Color(0xFF6C2BD9),
  'bein': Color(0xFF5B2C83),
  'starzplay': Color(0xFF0A0A0A),
  'jawwy_tv': Color(0xFF6A1B9A),
  'viu': Color(0xFFFFC107),
  'weyyak': Color(0xFFE91E63),
  'disney_plus': Color(0xFF113CCF),
  'prime_video': Color(0xFF00A8E1),
  'youtube_premium': Color(0xFFFF0000),
  'spotify': Color(0xFF1DB954),
  'anghami': Color(0xFF7B2FF7),
  'deezer': Color(0xFFA238FF),
  'apple_music': Color(0xFFFA243C),
  'chatgpt': Color(0xFF10A37F),
  'claude': Color(0xFFD97757),
  'gemini': Color(0xFF4285F4),
  'perplexity': Color(0xFF20808D),
  'cursor': Color(0xFF111111),
  'github_copilot': Color(0xFF24292F),
  'midjourney': Color(0xFF0B0B0B),
  'google_one': Color(0xFF4285F4),
  'icloud': Color(0xFF3693F3),
  'microsoft_365': Color(0xFFD83B01),
  'adobe': Color(0xFFFA0F00),
  'canva': Color(0xFF00C4CC),
  'notion': Color(0xFF000000),
  'dropbox': Color(0xFF0061FF),
  'linkedin_premium': Color(0xFF0A66C2),
  'playstation_plus': Color(0xFF003791),
  'xbox_game_pass': Color(0xFF107C10),
  'talabat_pro': Color(0xFFFF5A00),
  'careem_plus': Color(0xFF00E784),
  'uber_one': Color(0xFF000000),
};

/// A colour from the admin's "#RRGGBB", else the built-in brand colour, else the app's accent.
Color brandColorOf(String? slug, String? hex, Color fallback) {
  final match = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(hex ?? '');
  if (match != null) return Color(int.parse('FF${match.group(1)}', radix: 16));
  return subscriptionBrandColors[slug] ?? fallback;
}

/// The brand of a commitment, if it is a known service.
Color? commitmentBrandColor(Commitment item, Color fallback) =>
    item.catalog == null
    ? null
    : brandColorOf(item.catalog!.slug, item.catalog!.brandColor, fallback);
