# 0047: Post-save feedback, renewed consent and explicit wallet meaning

Date: 2026-11-04
Status: accepted; guarded, production migration/activation pending

## Decision
Keep capture automatic. Purpose feedback edits the stored row and is optional: one shown question per owner,
three new questions per Cairo day, first answer wins and stale questions never overwrite a newer edit. Persist
bounded questions in an additive, separately gated table. Use the existing transaction-scoped writer for feedback,
fees and owner-scoped learning; never pay for a purpose classifier inside a transaction.

Automatic AI reading has a distinct consent version. Legacy unclear-message consent cannot authorize all-message
processing. Renew both grants explicitly and require them at ingest, provider admission, held release and posting.
A dialog accepted for an older mode cannot silently enroll the person into the broader mode.

Keep fee amounts separate in storage while grouping display through a single owned SQL join. Do not round away
piastres in visual or spoken amounts. Keep instrument roles local and conservative: a recipient account/reference
must not become the funding wallet. Redact three-digit tails as well. Known credit is not cash; wallet balance type
is independent of card branding, survives capture-data deletion and is removed on full account deletion.

Learn contact links only from a complete private phone HMAC after an explicit owned-contact choice. Names alone
cannot auto-link people. Serialize contact lifecycle mutations with ledger links. Standing follows economic kind,
not mutable category text, and unknown people do not cancel one another without stable identity.

## Validation limits
Synthetic HTTP/MySQL and client tests exercise these mechanics. No live model, customer messages, physical-phone
coverage, production migration or production activation is implied. Native delivery, missing-evidence/reversal
coverage, measured capacity and the private held-out rollout qualification remain required.
