import 'package:flutter/material.dart';

import 'typography.dart';

/// A service's mark in a circle: its logo when [imageUrl] loads, else its first letters on its brand [color]
/// (Netflix's red, Shahid's green). Used wherever a commitment to a known service shows: the commitments list, a
/// commitment's page and the calendar's days. The colour is the service's, so the letters are always white or black,
/// whichever reads on it.
class LogoBadge extends StatelessWidget {
  const LogoBadge({
    super.key,
    required this.label,
    required this.color,
    this.imageUrl,
    this.size = 40,
    this.semanticLabel,
  });

  /// The service's name; its first letters are drawn when there is no logo.
  final String label;
  final Color color;
  final String? imageUrl;
  final double size;
  final String? semanticLabel;

  /// One or two letters of [name]: "N" for Netflix, "OS" for OSN+, "ش" for شاهد.
  static String initials(String name) {
    final words = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();
    if (words.isEmpty) return '';
    final first = words.first.characters;
    if (words.length == 1) {
      final letters = first
          .where(
            (char) => RegExp(r'[\p{L}\p{N}]', unicode: true).hasMatch(char),
          )
          .take(2)
          .toList();
      final short = letters.length > 1 && RegExp(r'[A-Z]').hasMatch(letters[1])
          ? letters.join()
          : letters.take(1).join();
      return short.toUpperCase();
    }
    return (first.first + words[1].characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final onColor =
        ThemeData.estimateBrightnessForColor(color) == Brightness.dark
        ? Colors.white
        : Colors.black;
    final letters = Center(
      child: Text(
        initials(label),
        maxLines: 1,
        style: SmartSpendTypography.style(
          size * 0.38,
          FontWeight.w700,
          height: 1,
        ).copyWith(color: onColor),
      ),
    );
    final url = imageUrl;
    return Semantics(
      label: semanticLabel ?? label,
      image: true,
      // The letters stand for the name; a screen reader says the name once.
      excludeSemantics: true,
      child: SizedBox.square(
        dimension: size,
        child: DecoratedBox(
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          child: ClipOval(
            child: url == null || url.isEmpty
                ? letters
                : Image.network(
                    url,
                    width: size,
                    height: size,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => letters,
                  ),
          ),
        ),
      ),
    );
  }
}
