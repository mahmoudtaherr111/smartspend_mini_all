import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smartspend_api/smartspend_api.dart';
import 'package:smartspend_ui/smartspend_ui.dart';

import '../../l10n/app_localizations.dart';
import 'category_style.dart';
import 'ledger_models.dart';
import 'ledger_providers.dart';
import 'manual_record_sheet.dart';
import 'offline/ledger_store.dart';
import 'offline/offline_rules.dart';
import 'offline/outbox.dart';
import 'receipts/receipt_flow.dart';
import 'record_flow.dart';
import 'voice/voice_permission_sheet.dart';
import 'voice/voice_providers.dart';

/// Where a sentence is typed or recorded, at the bottom of the record tab within thumb's reach (rule 3.3).
/// Supports text, quick manual record, and hold-to-record / tap-to-record voice entry (REC-05).
class RecordComposer extends ConsumerStatefulWidget {
  const RecordComposer({super.key});

  @override
  ConsumerState<RecordComposer> createState() => _RecordComposerState();
}

class _RecordComposerState extends ConsumerState<RecordComposer> {
  final _text = TextEditingController();
  Timer? _debounceTimer;
  String _debouncedQuery = '';
  bool _busy = false;

  // Voice recording state
  bool _isRecording = false;
  int _recordingSeconds = 0;
  double _currentAmplitude = 0.0;
  StreamSubscription<double>? _amplitudeSub;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    _text.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _recordTimer?.cancel();
    unawaited(_amplitudeSub?.cancel());
    _text.removeListener(_onTextChanged);
    _text.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    setState(() {});
    _debounceTimer?.cancel();
    final raw = _text.text.trim();
    if (!RegExp(r'[0-9٠-٩]').hasMatch(raw) || raw.length < 2) {
      if (_debouncedQuery.isNotEmpty) {
        setState(() => _debouncedQuery = '');
      }
      return;
    }
    _debounceTimer = Timer(const Duration(milliseconds: 400), () {
      if (mounted) {
        final current = _text.text.trim();
        if (current != _debouncedQuery) {
          setState(() => _debouncedQuery = current);
        }
      }
    });
  }

  Future<void> _startVoiceRecording() async {
    if (_busy || _isRecording) return;
    final isOnline = ref.read(networkStatusProvider);
    if (!isOnline) {
      _tell('التسجيل بالصوت محتاج نت، تقدر تكتب الجملة يدوي دلوقتي');
      return;
    }

    final recorder = ref.read(audioRecorderServiceProvider);
    final hasPerm = await recorder.hasPermission();
    if (!hasPerm) {
      if (!mounted) return;
      final allowed = await showVoicePermissionSheet(context);
      if (!allowed || !mounted) return;
      final granted = await recorder.requestPermission();
      if (!granted || !mounted) {
        _tell('محتاجين إذن الميكروفون عشان تسجل بالصوت');
        return;
      }
    }

    try {
      await recorder.startRecording();
      await _amplitudeSub?.cancel();
      _amplitudeSub = recorder.amplitudeStream.listen((amp) {
        if (mounted) setState(() => _currentAmplitude = amp);
      });
      _recordingSeconds = 0;
      _recordTimer?.cancel();
      _recordTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (mounted) setState(() => _recordingSeconds = timer.tick);
      });
      unawaited(SmartSpendHaptics.selection());
      setState(() {
        _isRecording = true;
      });
    } catch (_) {
      _tell('تعذر بدء التسجيل، حاول مرة ثانية');
    }
  }

  Future<void> _cancelVoiceRecording() async {
    if (!_isRecording) return;
    _recordTimer?.cancel();
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
      _currentAmplitude = 0.0;
    });
    unawaited(_amplitudeSub?.cancel());
    final recorder = ref.read(audioRecorderServiceProvider);
    await recorder.cancelRecording();
    unawaited(SmartSpendHaptics.warning());
    if (mounted) {
      showSmartSpendNotice(context, 'تم إلغاء التسجيل');
    }
  }

  Future<void> _stopAndProcessVoice() async {
    // ignore: avoid_print
    if (!_isRecording) return;
    _recordTimer?.cancel();
    final duration = _recordingSeconds;
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
      _currentAmplitude = 0.0;
    });
    unawaited(_amplitudeSub?.cancel());

    final recorder = ref.read(audioRecorderServiceProvider);
    final result = await recorder.stopRecording();
    if (result == null || result.audioBase64.trim().isEmpty) return;

    final effectiveDuration = duration > 0 ? duration : result.durationSeconds;

    UpgradeLimitReason? upgradeReason;
    String? errorMessage;
    ParseResult? parse;

    await _working(() async {
      try {
        final api = ref.read(ledgerApiProvider);
        parse = await api.parseVoice(
          audioBase64: result.audioBase64,
          mimeType: result.mimeType,
          durationSeconds: effectiveDuration,
        );
      } on ApiException catch (e) {
        final msg = e.message.toLowerCase();
        if (e.code == 'FORBIDDEN' ||
            msg.contains('voice') ||
            msg.contains('رصيد') ||
            msg.contains('ثواني') ||
            msg.contains('باقة')) {
          upgradeReason = UpgradeLimitReason.voiceSeconds;
        } else {
          errorMessage = e.message;
        }
      } catch (e) {
        final msg = e.toString().toLowerCase();
        if (msg.contains('voice') ||
            msg.contains('رصيد') ||
            msg.contains('ثواني')) {
          upgradeReason = UpgradeLimitReason.voiceSeconds;
        } else {
          errorMessage = 'حصل خطأ في معالجة التسجيل، جرّب مرة تانية';
        }
      }
    });

    if (!mounted) return;

    if (upgradeReason != null) {
      await showUpgradePromptSheet(context: context, reason: upgradeReason!);
      return;
    }

    if (errorMessage != null) {
      _tell(errorMessage!);
      return;
    }

    if (parse == null || parse!.items.isEmpty) {
      _tell('لم نتمكن من سماع شيء أو استخراج مصاريف');
      return;
    }

    final p = parse!;
    if (p.decision == ParseDecision.autoSave) {
      final api = ref.read(ledgerApiProvider);
      final ids = await api.save(
        p.items,
        rawText: 'تسجيل صوتي',
        classificationLogId: p.classificationLogId,
      );
      if (!mounted) return;
      announceSaved(context, ref, p.items, ids, automatic: true);
      refreshLedger(ref);
    } else {
      final api = ref.read(ledgerApiProvider);
      final outboxItem = OutboxItem(
        id: api.newRequestId(),
        text: 'تسجيل صوتي',
        createdAt: clock.now(),
        parse: p,
      );
      if (p.decision == ParseDecision.review) {
        final saved = await reviewAndSave(context, ref, outboxItem);
        if (saved == true && mounted) {
          refreshLedger(ref);
        }
      } else if (p.decision == ParseDecision.clarify) {
        await answerAndSave(context, ref, outboxItem);
      }
    }
  }

  Future<void> _submit() async {
    _debounceTimer?.cancel();
    if (_debouncedQuery.isNotEmpty) {
      setState(() => _debouncedQuery = '');
    }
    final sentence = _text.text.trim();
    if (sentence.isEmpty || _busy) return;
    final l10n = AppLocalizations.of(context);
    final outbox = ref.read(outboxProvider.notifier);
    final outcome = await _working(() async {
      await ref.read(outboxProvider.future);
      return outbox.submit(sentence);
    });
    if (!mounted) return;
    switch (outcome) {
      case SubmitSaved(:final items, :final ids, :final automatic):
        _text.clear();
        announceSaved(context, ref, items, ids, automatic: automatic);
      case SubmitNeedsReview(:final item):
        final saved = await reviewAndSave(context, ref, item);
        if (saved == true) {
          _text.clear();
        } else {
          await outbox.discard(item);
        }
      case SubmitNeedsAnswer(:final item):
        _text.clear();
        await answerAndSave(context, ref, item);
      case SubmitQueued():
        _text.clear();
        _tell(l10n.queuedOffline);
      case SubmitRefused(:final reason, :final fullAt):
        _tell(switch ((reason, fullAt)) {
          (OfflineRefusal.tooShort, _) => l10n.offlineTooShort,
          (OfflineRefusal.unreadable, _) => l10n.offlineUnreadable,
          (OfflineRefusal.noAmount, _) => l10n.offlineNoAmount,
          (_, final int limit) => l10n.offlineFull(limit),
          _ => l10n.offlineNoAmount,
        });
      case SubmitFailed(:final message):
        _tell(message);
      case SubmitEmpty():
        _tell(l10n.nothingToSave);
    }
  }

  Future<T> _working<T>(Future<T> Function() task) async {
    setState(() => _busy = true);
    try {
      return await task();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _tell(String message) {
    if (!mounted) return;
    SmartSpendHaptics.warning();
    showSmartSpendNotice(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.smartSpendColors;
    final isTapToRecord = ref.watch(tapToRecordModeProvider);

    ref.listen(composerDraftProvider, (_, draft) {
      if (draft == null) return;
      _text.text = draft;
      ref.read(composerDraftProvider.notifier).taken();
    });

    final previewAsync = _debouncedQuery.isNotEmpty
        ? ref.watch(categoryPreviewProvider(_debouncedQuery))
        : null;
    final preview = previewAsync?.asData?.value;

    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            SmartSpendSpacing.lg,
            SmartSpendSpacing.sm,
            SmartSpendSpacing.lg,
            SmartSpendSpacing.sm,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (preview != null && !_isRecording)
                Padding(
                  padding: const EdgeInsets.only(bottom: SmartSpendSpacing.xs),
                  child: ExcludeSemantics(
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Container(
                        key: const Key('category-hint'),
                        padding: const EdgeInsets.symmetric(
                          horizontal: SmartSpendSpacing.sm,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: colors.accent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: colors.accent.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              categoryIcon(preview.category),
                              size: 14,
                              color: colors.accent,
                            ),
                            const SizedBox(width: SmartSpendSpacing.xs),
                            Text(
                              preview.subCategory.isNotEmpty &&
                                      preview.subCategory != 'عام'
                                  ? '${preview.category} / ${preview.subCategory}'
                                  : preview.category,
                              style: SmartSpendTypography.style(
                                12,
                                FontWeight.w600,
                              ).copyWith(color: colors.accent),
                            ),
                            if (preview.amount > 0) ...[
                              const SizedBox(width: SmartSpendSpacing.xs),
                              Text(
                                '· ${formatMoney(preview.amount)}',
                                style: SmartSpendTypography.style(
                                  12,
                                  FontWeight.w500,
                                ).copyWith(color: colors.mutedForeground),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (_busy && _text.text.isEmpty && !_isRecording)
                _buildProcessingBar(colors)
              else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: _isRecording
                          ? _buildRecordingStatus(colors, isTapToRecord)
                          : TextField(
                              controller: _text,
                              minLines: 1,
                              maxLines: 4,
                              enabled: !_busy,
                              textInputAction: TextInputAction.send,
                              keyboardType: TextInputType.text,
                              onSubmitted: (_) => _submit(),
                              decoration: InputDecoration(
                                hintText: l10n.composerHint,
                                prefixIcon: IconButton(
                                  tooltip: l10n.manualRecordTitle,
                                  icon: const Icon(Icons.dialpad_rounded),
                                  onPressed: () =>
                                      showManualRecordSheet(context),
                                ),
                                suffixIcon: IconButton(
                                  tooltip: isTapToRecord
                                      ? 'الوضع: ضغطة واحدة'
                                      : 'الوضع: ضغط مطول',
                                  icon: Icon(
                                    isTapToRecord
                                        ? Icons.touch_app_rounded
                                        : Icons.gesture_rounded,
                                    size: 20,
                                    color: colors.mutedForeground,
                                  ),
                                  onPressed: () {
                                    ref
                                        .read(tapToRecordModeProvider.notifier)
                                        .toggle();
                                  },
                                ),
                              ),
                            ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.xs),
                    Visibility(
                      visible: !_isRecording,
                      maintainSize: true,
                      maintainAnimation: true,
                      maintainState: true,
                      child: SizedBox.square(
                        dimension: 48,
                        child: IconButton(
                          tooltip: 'تصوير فاتورة',
                          onPressed: _busy
                              ? null
                              : () => startReceiptIntake(
                                  context: context,
                                  ref: ref,
                                ),
                          icon: Icon(
                            Icons.camera_alt_outlined,
                            color: colors.foreground,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: SmartSpendSpacing.xs),
                    _buildMicButton(
                      colors,
                      isTapToRecord,
                      isRecording: _isRecording,
                    ),
                    const SizedBox(width: SmartSpendSpacing.xs),
                    Visibility(
                      visible: !_isRecording,
                      maintainSize: true,
                      maintainAnimation: true,
                      maintainState: true,
                      child: SizedBox.square(
                        dimension: 48,
                        child: IconButton.filled(
                          tooltip: l10n.composerSend,
                          onPressed: _busy ? null : _submit,
                          icon: _busy
                              ? SizedBox.square(
                                  dimension: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.5,
                                    color: colors.foreground,
                                  ),
                                )
                              : const Icon(Icons.arrow_upward),
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecordingStatus(SmartSpendColors colors, bool isTapToRecord) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.accent.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: const BoxDecoration(
              color: Color(0xFFEF4444),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.sm),
          Text(
            '00:${_recordingSeconds.toString().padLeft(2, '0')}',
            style: SmartSpendTypography.style(
              14,
              FontWeight.w600,
            ).copyWith(color: colors.foreground),
          ),
          const SizedBox(width: SmartSpendSpacing.md),
          Expanded(
            child: Center(child: VoiceLevelMeter(level: _currentAmplitude)),
          ),
          Text(
            isTapToRecord ? 'إلغاء' : 'اسحب للإلغاء',
            style: SmartSpendTypography.style(
              12,
              FontWeight.w400,
            ).copyWith(color: colors.mutedForeground),
          ),
          const SizedBox(width: SmartSpendSpacing.xs),
          IconButton(
            key: const Key('voice-cancel-button'),
            icon: const Icon(Icons.close_rounded, size: 20),
            tooltip: 'إلغاء التسجيل',
            onPressed: () => unawaited(_cancelVoiceRecording()),
          ),
        ],
      ),
    );
  }

  Widget _buildProcessingBar(SmartSpendColors colors) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: SmartSpendSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: colors.accent,
            ),
          ),
          const SizedBox(width: SmartSpendSpacing.md),
          Text(
            'بنسمع التسجيل...',
            style: SmartSpendTypography.style(
              14,
              FontWeight.w500,
            ).copyWith(color: colors.mutedForeground),
          ),
        ],
      ),
    );
  }

  Widget _buildMicButton(
    SmartSpendColors colors,
    bool isTapToRecord, {
    bool isRecording = false,
  }) {
    final keyName = isRecording && isTapToRecord
        ? 'voice-stop-button'
        : 'voice-mic-button';

    return SizedBox.square(
      dimension: 48,
      child: Tooltip(
        message: isTapToRecord
            ? (isRecording ? 'إيقاف التسجيل' : 'تسجيل بالصوت (ضغطة للبدء)')
            : 'تسجيل بالصوت (اضغط مطولاً)',
        child: GestureDetector(
          key: Key(keyName),
          behavior: HitTestBehavior.opaque,
          onTap: isTapToRecord
              ? (isRecording
                    ? () => unawaited(_stopAndProcessVoice())
                    : () => unawaited(_startVoiceRecording()))
              : () {
                  SmartSpendHaptics.selection();
                  showSmartSpendNotice(
                    context,
                    'اضغط مطولاً على المايك للتسجيل',
                  );
                },
          onLongPressStart: isTapToRecord
              ? null
              : (details) {
                  // ignore: avoid_print
                  unawaited(_startVoiceRecording());
                },
          onLongPressEnd: isTapToRecord
              ? null
              : (details) {
                  // ignore: avoid_print
                  unawaited(_stopAndProcessVoice());
                },
          onLongPressUp: isTapToRecord
              ? null
              : () {
                  // ignore: avoid_print
                  unawaited(_stopAndProcessVoice());
                },
          onLongPressCancel: isTapToRecord
              ? null
              : () {
                  // ignore: avoid_print
                },
          onLongPressMoveUpdate: isTapToRecord
              ? null
              : (details) {
                  if (details.offsetFromOrigin.dx.abs() > 60 ||
                      details.offsetFromOrigin.dy < -50) {
                    unawaited(_cancelVoiceRecording());
                  }
                },
          child: Container(
            decoration: BoxDecoration(
              color: isRecording ? colors.danger : colors.surfaceRaised,
              shape: BoxShape.circle,
              border: Border.all(
                color: isRecording ? colors.danger : colors.border,
              ),
            ),
            child: Center(
              child: Icon(
                isRecording && isTapToRecord
                    ? Icons.stop_rounded
                    : Icons.mic_rounded,
                color: isRecording ? colors.onAccent : colors.accent,
                size: 22,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
