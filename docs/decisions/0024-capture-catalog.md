# 0024. The capture catalog: banks, wallets and subscriptions are confirmed data the admin edits

- Status: accepted. Built in `db/schema.ts` (`capture_sources`, `subscription_catalog`), `api/lib/capture/`,
  `api/capture-router.ts`, `api/capture-admin-router.ts` and the admin console (رسايل البنوك). This is the first step
  of rebuilding automatic capture of bank, wallet and telecom messages; reading a message with templates, the model
  as a redacted fallback and the Android capture follow.
- Decided and recorded: 2026-10-20.

## Context
Which notifications are read and who sent them was code in three places that did not agree:
- the Android companion (`android-app/app/src/main/java/com/smartspend/sync/SyncService.kt`) listed twelve finance apps and eight messaging apps.
  Checked against Google Play on 2026-10-20, five of the twelve ids were wrong: CIB is
  `com.cibeg.ddc1.digitalbanking.live`, not `com.cib.digital.mb`; Ana Vodafone is `com.emeint.android.myservices`,
  not `com.vodafone.vodafone`; WE Pay is `com.TE.WEWallet`, not `com.te.wepay`; BM Wallet is
  `com.emeint.android.mwallet.bm`, not `eg.com.bm.wallet`; QNB Egypt is `eg.com.qnb.eazymobile`, not
  `com.qnb.mobilebanking`. Those notifications reached the server only through the companion's substring fallback,
  which also forwarded unrelated apps.
- `api/lib/sms-rule-parser.ts#detectProvider` knew about nineteen providers by regular expressions on the sender and
  the text.
- Nothing listed subscriptions; a few streaming services sat in the classification dictionaries for typed sentences.

Egypt has 37 licensed banks, four telecom wallets (Vodafone Cash alone carries most wallet transactions), InstaPay
and a growing set of fintech and installment apps. A bank that renames its app, or a fintech that launches, would
have needed a code change and, for the phones, an app update. No public list of their message formats or sender ids
exists, so anything not confirmed would be a guess.

## Decision
1. **Two shared tables hold the catalog.** `capture_sources` lists every bank, wallet, payment network, fintech,
   telecom operator and messaging app whose notifications are read: names in Arabic and English, countries, Android
   packages, SMS sender ids, the names messages use for it (aliases), notes such as an alert threshold, an order and
   a status. `subscription_catalog` lists the subscriptions recognised in card charges: the words that name them in a
   statement's merchant name, a spending category and subcategory from `contracts/categories.ts`, and the renewal
   cycle. Neither holds user data. The phones' allowlist and the parser's evidence of who sent a message both come
   from here.
2. **Only confirmed facts are listed.** An Android package is listed when Google Play shows it under the bank's or
   company's own developer account; a sender id only when a real message shows it. Until then the field stays
   empty. The seed lists no sender id.
3. **The seed ships in code, the admin owns the rows.** `api/lib/capture/seed-sources.ts` and
   `api/lib/capture/seed-subscriptions.ts` are written at boot, under a lock, on the servers that run background jobs, and by a
   button in the console. A missing slug is inserted and a seeded row nobody edited is brought up to date. An
   admin's edit marks the row, and the seed never overwrites it again; the console can give a seeded row back as
   shipped. Nothing is deleted by the seed.
4. **A change reaches everyone without a deploy.** Each server keeps one copy, reloaded every five minutes or within
   ten seconds of an admin change on any server (the `capturecataloggen` generation, decision 0013). Phones read
   `capture.sources` with a version and keep their copy until it changes, so a new bank needs no app update.
5. **One app belongs to one source,** so a notification never has two owners. A bank's wallet app (NBE Phone Cash,
   BM Wallet, QNB E-Wallet) belongs to its bank.
6. **A subscription is the longest matching word in the merchant name,** compared without case and never inside a
   longer word: "GOOGLE *GOOGLE" is YouTube Premium, not the Google Play store; "viu" is not found in "REVIEW". A
   store (Google Play, Apple) charges for other developers, so its charge names the store and the service is asked
   once.
7. **What a bank charges has its own subcategory:** رسوم بنكية (`bank_fees`) under أقساط وفوايد, beside loan
   interest. Card fees, transfer fees, the InstaPay fee and the fee on a purchase abroad go there, instead of a
   transfer or مصاريف متنوعة. The taxonomy version moves to `tax_v3_2026_10`, and the classification cache key now
   includes it, so an answer chosen from the older list is not reused.

## Consequences
- An admin adds a bank, an app or a subscription in the console and it works the same day, on the servers and the
  phones.
- `detectProvider` in the rules parser still uses its own patterns. Moving it onto the catalog belongs to the next
  step (the message templates), which also fixes its known misreadings.
- Sender ids have to be collected from real messages before the parser can rely on them; until then the source of
  an SMS comes from the messaging app's notification and the text.
- The 2026-10-20 check found no Play app for Citibank Egypt, American Express Egypt, onebank, the National Investment
  Bank, Nasser Social Bank or Meeza; their notifications reach phones only as SMS.
