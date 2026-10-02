# Verify consent speech before playback

Status: implemented, 2026-10-02. Amends 0018.

A short prefix hold did not prevent a later completion claim in a draft preview: a live evaluation heard
"سجلت" before consent. A post-write correction could also let the replaced amount reach the user first.
Increasing that prefix's timer cannot prove that a later claim will not escape.

The gateway holds complete audio and captions while a draft waits or a write receipt is pending, including
unsuccessful and still-uncertain attempts. Completion is checked against the attempt's actual draft status.
It releases only after generation_complete, or the completed-turn fallback, and after the brain checks the
complete transcription including its last number. The Live API specifies that the last output transcription
precedes generationComplete or interruption; precise ordering within audio/transcription chunks is not guaranteed.
[API contract](https://ai.google.dev/api/live)

Presentation is deferred until validation succeeds. A rejected preview cannot make a voice yes eligible.
False completion claims use the existing bounded recovery counter. Other rejected speech records a suppression
incident and requests a correction only when the checker knows the correction; otherwise the call ends with a
truthful notice and its actual write summary. Suppressed provider wording remains distinguishable from what
reached the user, rather than being reported as an audible failure.

The buffer is limited to 30 seconds, 3 MiB of PCM and 8,000 transcription characters. Missing transcription or
exceeding a bound fails closed. New requests, provider interruptions, reconnects, new tool calls and closing an
engine discard the held utterance; late old chunks are suppressed until the provider acknowledges interruption or
completion, and its request epoch cannot be replayed into a later request. Audio is never added
to the saved call snapshot. Receipt verification state survives resumption and clears at the next user request.

This adds generation-time latency to consent-sensitive speech. The client already delays a listening/confirmation
state until its playback queue drains. Ordinary financial answers still use the streaming numerical checker; this
decision does not prove arbitrary-language meaning, device audio quality, or the absence of every model error.
