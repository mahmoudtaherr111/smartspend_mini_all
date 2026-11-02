import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'account_providers.dart';

/// Screen presenting personalization onboarding questions (ACC-13).
class OnboardingQuestionsScreen extends ConsumerStatefulWidget {
  const OnboardingQuestionsScreen({super.key});

  static const path = '/more/onboarding';

  @override
  ConsumerState<OnboardingQuestionsScreen> createState() =>
      _OnboardingQuestionsScreenState();
}

class _OnboardingQuestionsScreenState
    extends ConsumerState<OnboardingQuestionsScreen> {
  bool _loading = true;
  bool _submitting = false;
  Map<String, Object?>? _currentQuestion;
  final _answerController = TextEditingController();
  Object? _selectedOption;

  @override
  void initState() {
    super.initState();
    _loadNext();
  }

  @override
  void dispose() {
    _answerController.dispose();
    super.dispose();
  }

  Future<void> _loadNext() async {
    setState(() {
      _loading = true;
      _answerController.clear();
      _selectedOption = null;
    });

    try {
      final q = await ref
          .read(accountRepositoryProvider)
          .getNextOnboardingQuestion();
      if (!mounted) return;
      setState(() {
        _currentQuestion = q;
        _loading = false;
      });
    } on Object {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_currentQuestion == null) return;
    final id = _currentQuestion!['id'] as String? ?? '';
    final answer = _selectedOption ?? _answerController.text.trim();
    if (answer is String && answer.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(accountRepositoryProvider)
          .submitOnboardingAnswer(questionId: id, answer: answer);
      if (!mounted) return;
      await _loadNext();
    } on ApiException catch (e) {
      if (!mounted) return;
      showSmartSpendNotice(context, e.message);
    } on Object {
      if (!mounted) return;
      showSmartSpendNotice(
        context,
        AppLocalizations.of(context).appWeCouldnTSaveYour,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _skip() async {
    setState(() => _submitting = true);
    try {
      await ref.read(accountRepositoryProvider).dismissOnboarding();
      if (!mounted) return;
      Navigator.of(context).pop();
    } on Object {
      if (!mounted) return;
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.onboardingQuestionsTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _currentQuestion == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(SmartSpendSpacing.screen),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.check_circle_outline_rounded,
                      color: colors.accent,
                      size: 64,
                    ),
                    const SizedBox(height: SmartSpendSpacing.lg),
                    Text(l10n.onboardingDone, style: textTheme.titleLarge),
                    const SizedBox(height: SmartSpendSpacing.xl),
                    SmartSpendButton(
                      label: AppLocalizations.of(context).appBack,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(SmartSpendSpacing.screen),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    _currentQuestion!['title'] as String? ??
                        _currentQuestion!['question'] as String? ??
                        '',
                    style: textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (_currentQuestion!['subtitle'] != null) ...[
                    const SizedBox(height: SmartSpendSpacing.sm),
                    Text(
                      _currentQuestion!['subtitle'] as String,
                      style: textTheme.bodyMedium?.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                  const SizedBox(height: SmartSpendSpacing.xl),
                  if (_currentQuestion!['options'] is List) ...[
                    for (final opt in _currentQuestion!['options'] as List)
                      Padding(
                        padding: const EdgeInsets.only(
                          bottom: SmartSpendSpacing.sm,
                        ),
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: _selectedOption == opt
                                ? colors.accent.withValues(alpha: 0.1)
                                : null,
                            side: BorderSide(
                              color: _selectedOption == opt
                                  ? colors.accent
                                  : colors.border,
                              width: _selectedOption == opt ? 2 : 1,
                            ),
                            padding: const EdgeInsets.all(SmartSpendSpacing.md),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(
                                SmartSpendRadii.md,
                              ),
                            ),
                          ),
                          onPressed: () =>
                              setState(() => _selectedOption = opt),
                          child: Text(
                            opt is Map
                                ? (opt['label'] as String? ?? opt.toString())
                                : opt.toString(),
                            style: textTheme.bodyMedium?.copyWith(
                              fontWeight: _selectedOption == opt
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                            ),
                          ),
                        ),
                      ),
                  ] else ...[
                    TextField(
                      controller: _answerController,
                      decoration: InputDecoration(
                        hintText: AppLocalizations.of(context)
                            .appWriteYourAnswerHere,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(
                            SmartSpendRadii.md,
                          ),
                        ),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                  const SizedBox(height: SmartSpendSpacing.xl),
                  SmartSpendButton(
                    label: l10n.onboardingSubmit,
                    busy: _submitting,
                    onPressed:
                        (_selectedOption != null ||
                                _answerController.text.trim().isNotEmpty) &&
                            !_submitting
                        ? _submit
                        : null,
                  ),
                  const SizedBox(height: SmartSpendSpacing.sm),
                  SmartSpendButton(
                    label: l10n.onboardingSkip,
                    variant: ButtonVariant.quiet,
                    onPressed: _submitting ? null : _skip,
                  ),
                ],
              ),
            ),
    );
  }
}
