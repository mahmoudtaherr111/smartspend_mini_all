# 0042. No discount or referral codes until the stores carry the offer

- Status: accepted
- Date: 2026-11-03

## Context
Admins could create discount codes, every user had a referral code on the plans screen, and phone sign-up on the web
and in the mobile app asked for a friend's code. Checkout never applied a discount and nothing rewarded the person who
invited, so each of these screens promised something that did not happen. Paid plans on mobile are sold through Google
Play and the App Store (decision 0022), where a price change has to be an offer set up in the store itself: a code typed
into our app cannot lower a store price.

## Decision
Remove the codes from every screen and from the API until an offer can be honoured end to end:
- the referral field at sign-up (web and mobile), the referral card on the web plans page and the mobile invite
  screen;
- the referral router, the admin discount-code procedures and tab, and the `promo_code_discount` setting.

The `discount_codes` and `referrals` tables and each account's `referral_code` stay, so no migration is needed, account
deletion still clears old rows, and a later offer can start from them. Sign-up ignores a `referralCode` an older build
still sends.

## Consequences
- No screen promises a discount the payment does not give.
- Bringing offers back means store offers (Play promo codes or offers, App Store offer codes) granted and checked by the
  server, with the screens rebuilt on that.
