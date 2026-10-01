# 0018. Voice request ownership, consent and recovery boundaries

- Status: implemented, 2026-10-01. Amends 0017.

A financial call must remain correct when speech is interrupted, a model is switched, a server is replaced or a
write returns late. Passing isolated provider probes or hiding an apology is insufficient evidence for release.

Each spoken request gets an epoch when its first audio arrives. Tool answers retain that epoch. Extended
IN_PROGRESS is not interrupted by a post-tool timer; a separate request deadline ends an unanswered request
explicitly. Recovery emits one decision per suppressed utterance, retains its limit across resumption, and permits
the final honest inability answer. Financial speech about broken objects is not a technical failure.

A switch buffers bounded input and carries the history and server brain; it refuses pending consent or writes.
Connection generations close cancelled engines, and switching time does not count as connected time. Model-pool
release retains the user's seat during a move. Redis outages refuse shared admission where memory fallback is
forbidden. Call snapshots reject older owner/epoch/revision updates and an ended-call tombstone rejects revival.

Before an expense or action draft executes, its gate and current ownership are checked and MySQL claims its id
once in the call's metrics. Checkpoints merge metrics so they cannot erase claims. A write with an unknown outcome
is checked in the app before any new draft; an automatic retry is unsafe. Model segments provide time, tokens and
cost attribution to effective models. Explicit financial nouns are checked against the fact metric, with stale
facts excluded from correction targets; this remains a bounded semantic guard, not arbitrary-language proof.

Memory writes and deletions share the account-row transaction lock. A slot update compares the observation time,
and replacement/insertion commit together. Forgetting clears recalled summaries, advances the processed-message
watermark and suppresses unfinished voice summaries. This conservatively omits the whole unfinished summary and
clears conversation capsules; existing conversation messages and other saved memories remain available. Account
deletion uses the same lock, and asynchronous embeddings recheck the active memory before insertion.

Capacity combines seat caps with 80% of the configured input-TPM quota divided by a measured per-call reservation.
The visible project's 65k limit implies one standard seat with the current 30k reservation, and no Extended seat
with 60k reserved. Lowering a reservation needs new load evidence. Real Egyptian audio/device tests and repeated
task qualification, including financially correct before/after mutation checks, remain necessary. Standard is the
default; coach rollout and Ultra remain off until qualified. Paid-service data suitability is separate from model
reliability and capacity.

A separate bounded preview guard also applies to standard calls while a financial draft waits. It suppresses early done claims and requests a complete preview; missing amount read-backs never authorize voice confirmation. The evaluation permits only budget alert bookkeeping as a derived effect of an approved expense, and still rejects changes to financial configuration or unapproved entities. A filing destination is not an additional financial event.
