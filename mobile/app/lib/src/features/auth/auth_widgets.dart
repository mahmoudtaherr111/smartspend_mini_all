import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';

/// The frame of the sign-in screens: a heading, then the content, centred and scrollable above the keyboard.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.leading,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  /// A back button, on the screens reached from another one.
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: leading == null
          ? null
          : AppBar(leading: leading, automaticallyImplyLeading: false),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(SmartSpendSpacing.screen),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(title, style: textTheme.headlineMedium),
                  const SizedBox(height: SmartSpendSpacing.xs),
                  Text(
                    subtitle,
                    style: textTheme.bodyLarge?.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: SmartSpendSpacing.xl),
                  ...children,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A message above or below a form: an error in the danger colour, or a notice in the warning colour.
class FormMessage extends StatelessWidget {
  const FormMessage(this.text, {super.key, this.warning = false});

  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final colors = context.smartSpendColors;
    final color = warning ? colors.warning : colors.danger;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(SmartSpendSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(SmartSpendRadii.sm),
        ),
        child: Text(
          text,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color),
        ),
      ),
    );
  }
}

/// A phone number field: digits, Arabic digits accepted, written left to right like any number.
class PhoneField extends StatelessWidget {
  const PhoneField({
    super.key,
    required this.controller,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.phone,
      textInputAction: textInputAction,
      textDirection: TextDirection.ltr,
      autofillHints: const [AutofillHints.telephoneNumber],
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp('[0-9٠-٩+ ]')),
        LengthLimitingTextInputFormatter(16),
      ],
      decoration: InputDecoration(
        labelText: AppLocalizations.of(context).phoneLabel,
        hintText: '01xxxxxxxxx',
        hintTextDirection: TextDirection.ltr,
        prefixIcon: const Icon(Icons.phone_iphone),
      ),
      onSubmitted: onSubmitted,
    );
  }
}

/// A password field with a button that shows what was typed.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    this.helperText,
    this.newPassword = false,
    this.textInputAction = TextInputAction.done,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String? helperText;

  /// Whether the password is being chosen, for the phone's password manager.
  final bool newPassword;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return TextField(
      controller: widget.controller,
      obscureText: !_visible,
      enableSuggestions: false,
      autocorrect: false,
      textInputAction: widget.textInputAction,
      autofillHints: [
        widget.newPassword ? AutofillHints.newPassword : AutofillHints.password,
      ],
      decoration: InputDecoration(
        labelText: l10n.passwordLabel,
        helperText: widget.helperText,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          tooltip: _visible ? l10n.hidePassword : l10n.showPassword,
          icon: Icon(_visible ? Icons.visibility_off : Icons.visibility),
          onPressed: () => setState(() => _visible = !_visible),
        ),
      ),
      onSubmitted: widget.onSubmitted,
    );
  }
}

/// A full-width button that shows a spinner instead of its label while its action runs.
class BusyButton extends StatelessWidget {
  const BusyButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final bool busy;

  /// Null disables the button.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox.square(
              dimension: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            )
          : Text(label),
    );
  }
}
