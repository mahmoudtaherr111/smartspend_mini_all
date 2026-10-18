# Designing the mobile app

The rules every screen of the Flutter app in `mobile/` follows, so the app looks and behaves like the work of one
careful company on both Android and iOS. Each rule comes from a primary source (listed at the end) or from a fact
about our users, and names the check that enforces it; `unenforced` means review is the only check for now.

Related: how texts are worded, `docs/guides/writing-app-messages.md`; why the app is built in Flutter and what comes
next, `docs/decisions/0022-flutter-mobile-app.md`; rules for the code, `mobile/AGENTS.md`.

## Who we design for
- **Egypt is an Android country.** Android runs on about 88–91% of phones, iOS on about 9–12% (StatCounter, May to
  August 2026). Samsung, Oppo, Xiaomi and Realme lead, and budget phones are common. Every screen is tried on a
  mid-range Android phone first; iOS gets the same quality, not a second place in design.
- **People already move money on their phones.** InstaPay had about 22 million registered customers by mid-2026
  (Central Bank of Egypt). Their bank and wallet messages are where our data comes from, so the vocabulary of those
  messages (تحويل، سحب، إيداع، رصيد) is familiar.
- **Arabic first, in Egyptian Arabic**, with Western digits, as the web app shows money
  (`src/i18n/format.ts#formatCurrency`: «1,250 ج.م»).
- **Money is sensitive.** Egypt's personal data protection law (151 of 2020) has executive regulations since November
  2025, with enforcement expected from about November 2026; app stores also ask how financial data is used.
  Trust is earned on every screen.

## 1. Identity
1. **One brand interface on both platforms**, built only from the tokens in
   `mobile/packages/smartspend_ui/lib/src/tokens.dart` and the theme in `mobile/packages/smartspend_ui/lib/src/theme.dart`.
   A screen never hard-codes a colour, font, size or radius. (unenforced)
2. **Dark first, light equally finished.** The dark theme's near-black navy lets the money and chart colours carry
   the screen, as Google's Rally finance study does; surfaces step up in tone instead of casting shadows. The light
   theme passes every rule below too: the phone chooses, as the web app does by default. (contrast: rule 6.1)
3. **Colours have one meaning each.** Emerald is the action, the selected tab and money that arrived; indigo is the
   AI Center; red is an error or spending over a budget; amber is waiting or close to a limit. They are never
   decoration. (unenforced)
4. **Cairo for every letter and digit**, Arabic and Latin, from the font bundled in `mobile/packages/smartspend_ui`.
   (unenforced)

## 2. Arabic and right to left
1. **Mirror what shows direction or order:** back and next, progress, sliders, the order of tabs and of items in a
   row. (Apple, right to left)
2. **Never mirror** the digits inside a number, phone and card numbers, logos, check marks, clocks, objects from the
   real world, or photos. (Apple, right to left)
3. **Western digits, from one formatter.** Amounts read «1,250 ج.م» as on the web. Cairo draws its Western digits at
   one width (560 units each), so columns of amounts line up; its Arabic-Indic digits have different widths. Money
   is formatted in one place, never by joining strings in a screen. (unenforced)
4. **Latin names inside Arabic stay in one piece.** Merchant and sender names from bank messages ("UBER *TRIP",
   "Talabat", "CIB") are shown as an isolated left-to-right run, so their punctuation does not jump to the other
   end of the line. (unenforced)
5. **Arabic needs room.** No letter spacing on Arabic; body lines at 1.5–1.7 of the font size; labels leave about a
   fifth more room than their English; no text in fixed-width boxes. (unenforced)
6. **Align a paragraph by its own language** and keep one alignment within a list. (Apple, right to left)

## 3. Layout and touch
1. **Every target is at least 48 by 48** (Android asks 48 dp, Apple 44 pt; we use the larger everywhere).
   (`androidTapTargetGuideline` and `iOSTapTargetGuideline` in the component tests)
2. **Spacing on a 4-point grid**, 20 at the sides of a screen (`SmartSpendSpacing`). (unenforced)
3. **One main action per screen, within reach of the thumb**, at the bottom. (unenforced)
4. **Edge to edge, inside the safe areas.** Android 15 draws apps under the system bars and Android 16 removes the
   way out for apps targeting it; nothing important sits under a bar, notch or home indicator. (screenshots review)
5. **Reading text keeps 45–75 characters a line.** (Android core app quality)
6. **Text can grow to twice its size** without being cut off, and the app survives rotation and folding without
   losing what was on screen. (Apple accessibility; Android core app quality) (unenforced)

## 4. Navigation
1. **The bottom bar is for going places, not doing things:** at most five tabs, always labelled, never hidden or
   greyed out; an empty section says why it is empty. Today's five match the web app's bar. (Apple, tab bars)
2. **The system's back works everywhere:** Android's back gesture and predictive back, on by default for apps
   targeting Android 16, and iOS's edge swipe, from the right edge in Arabic. No on-screen back button that behaves
   differently. (Android core app quality)
3. **Each tab keeps its own history and scroll position;** tapping the open tab again returns it to its first
   screen (`mobile/app/lib/src/routing/app_shell.dart`). (`mobile/app/test/app_test.dart`)
4. **Short tasks in a bottom sheet, long ones on a screen.** A sheet closes with a swipe down or a tap outside, and
   also has a visible way to close for people who cannot swipe. A sheet that must end in a choice, such as deleting
   data, cannot be swiped away (`showSmartSpendSheet` with `isDismissible: false`).
   (`mobile/packages/smartspend_ui/test/smartspend_ui_test.dart`)
5. **Nothing typed is lost.** Leaving the app, an error or an expired session keeps the draft. (Android core app
   quality) (unenforced)

## 5. Type
1. **Only the type scale** in `mobile/packages/smartspend_ui/lib/src/typography.dart`; nothing under 11 points
   (Apple's minimum), body text 14–16. (unenforced)
2. **Weight moves the variable font**, through `SmartSpendTypography.style`.
   (`mobile/packages/smartspend_ui/test/smartspend_ui_test.dart`)
3. **Amounts are the heroes:** bold, Western digits, the currency after the number. (unenforced)

## 6. Colour and contrast
1. **Text stands out from what is behind it:** 4.5 to 1 for normal text, 3 to 1 for large text (18 points, or 14
   points bold) and for the shapes a control needs to be seen, in both themes (WCAG 2 level AA, which Apple and
   Android both ask for). (`mobile/packages/smartspend_ui/test/contrast_test.dart`)
2. **Colour is never the only signal.** Money in and out also differ by sign, icon or word; chart series also differ
   by label or shape. (Apple, accessibility and charts) (unenforced)

## 7. Feedback, states and speed
1. **Answer at the speed of thought.** A touch shows its pressed state within 0.1 s; past 1 s the app shows it is
   working; past 10 s it shows progress and a way to cancel. (Nielsen Norman Group, response times)
2. **No spinner for waits under a second.** A whole screen loading shows a skeleton of its real layout, one card
   loading shows a spinner, a long task shows a progress bar. (Nielsen Norman Group, skeleton screens)
3. **Every screen is designed in five states:** loading, empty, error, offline and filled. An empty state says what
   belongs there and offers the action that fills it; "nothing here" is never shown while loading. (Nielsen Norman
   Group, empty states) (screenshots review)
4. **Errors speak the guide's voice** and offer a way forward: the server's Arabic message, or one from
   `docs/guides/writing-app-messages.md`, with a retry. Never a code. (unenforced)
5. **Recording feels instant.** A recorded expense appears at once, marked as waiting until the server confirms.
   What can be undone gets an undo instead of a confirmation; only what cannot be undone asks first. (unenforced)
6. **Fast on the phones people own:** the first screen within 2 seconds on a mid-range phone, or visible progress;
   frames within 16 ms at 60 Hz and 8 ms at 120 Hz, measured in profile mode on a low-end device. (Android core app
   quality; Flutter performance) (unenforced)

## 8. Motion and haptics
1. **Haptics only with their system meaning:** a selection tick when a value or tab changes, an impact for a snap,
   success, warning or error for an outcome. Never the same pattern for opposite outcomes, never on every touch,
   and the app works the same with haptics off. (Apple, playing haptics)
   (`mobile/packages/smartspend_ui/test/smartspend_ui_test.dart` for the tab bar)
2. **Motion explains a change** and stays short (150–300 ms). When the phone asks for reduced motion, animations
   become fades or disappear (Flutter's `MediaQuery.disableAnimationsOf`). (Apple, accessibility) (unenforced)

## 9. Charts and money
1. **Bars compare categories and daily totals; lines show a trend;** bars start at zero. (Apple, charts)
2. **The title says the finding in words with the real number**, for example «صرفت على الأكل 1,250 ج.م، أقل من الشهر
   اللي فات بـ 200». A few points are highlighted, not every value; grid lines are few. (Apple, charts)
3. **Charts can be heard:** a screen reader gets a summary and the values, and nothing important needs a tap or a
   scrub to be seen. (Apple, charts) (unenforced)

## 10. Forms and input
1. **Amounts accept both kinds of digits.** The numeric keypad opens, Arabic-Indic and Western digits are both read,
   and the amount is shown formatted as it is typed. (unenforced)
2. **Autofill works** for phone numbers and passwords. (Android core app quality; Apple, privacy) (unenforced)
3. **Mistakes are explained beside the field** in the guide's voice, and the keyboard never covers the field in
   use (`showSmartSpendSheet` lifts its content above the keyboard). (unenforced)

## 11. Permissions and trust
1. **Ask when the feature is used,** never at launch unless the app cannot work without it. (Apple, privacy; Android
   core app quality) (unenforced)
2. **An explanation screen before a system prompt has one button, «متابعة».** It never says "allow", never imitates
   the system dialog, never offers a reward, and the app keeps working when the person says no. (Apple, privacy;
   Android core app quality) (unenforced)
3. **Purpose strings say exactly how and why,** in one sentence. (Apple, privacy) (unenforced)

## 12. Accessibility
1. **Every control has an Arabic label** for TalkBack and VoiceOver, and amounts and dates are read as words.
   (`labeledTapTargetGuideline` in the component tests; amounts unenforced)
2. **Important messages stay until dismissed,** and every gesture has an on-screen alternative. (Apple,
   accessibility) (unenforced)

## 13. Security people can see
1. **The session lives in the Keychain or Keystore only** (`mobile/AGENTS.md`, rule 7).
2. **Amounts never show in the app switcher,** and the person can lock the app with biometrics and hide amounts while
   in public. (unenforced, planned)
3. **Screens showing a secret** (the bank message token, a one-time code) cannot be captured on Android and are
   covered on iOS while the screen is recorded. (unenforced, planned)
4. **The bar is OWASP MASVS at the L2 profile,** the level for apps that handle sensitive data such as money: storage,
   cryptography, authentication with an extra step for sensitive operations, network, platform, code (including a way
   to require an update) and privacy. A rooted or jailbroken phone is reported to the server and weighed there; a
   check on the phone alone is never trusted. (unenforced, planned)

## 14. One app, two platforms
1. **Platform manners, brand looks.** iOS scrolls with a bounce and goes back with an edge swipe; Android stretches
   and uses its back gesture; both use their own share sheet, date pickers and haptics. Flutter gives these per
   platform; screens do not override them. (unenforced)
2. **No imitation glass.** iOS 26's Liquid Glass is not available to Flutter (Flutter issue 170310); a blur imitation
   costs frames on low-end phones, so the bar stays a solid brand surface. (unenforced)
3. **Store requirements:** Google Play requires targeting Android 16 (API level 36) for new apps and updates from
   31 August 2026; the App Store requires building with the iOS 26 SDK since 28 April 2026. (release checklist)

## How a change is reviewed
- **Component tests** in `mobile/packages/smartspend_ui/test/` check contrast, target sizes, labels and behaviour.
- **Screenshots:** every screen is added to `mobile/app/integration_test/screenshots_test.dart`, so its picture in
  both themes, on both platforms, lands in the gallery `.github/workflows/mobile-screenshots.yml` publishes.
- **Words** follow `docs/guides/writing-app-messages.md`.

## Sources
- Apple Human Interface Guidelines: [right to left](https://developer.apple.com/design/human-interface-guidelines/right-to-left),
  [tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
  [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
  [charts](https://developer.apple.com/design/human-interface-guidelines/charts),
  [privacy](https://developer.apple.com/design/human-interface-guidelines/privacy),
  [playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics).
- Android: [core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality),
  [behaviour changes in Android 16](https://developer.android.com/about/versions/16/behavior-changes-16),
  [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk).
- Google Material: [Rally, a finance study](https://material.io/design/material-studies/rally.html);
  Google Research, [Usability hasn't peaked](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/)
  (Material 3 Expressive).
- Flutter: [performance best practices](https://docs.flutter.dev/perf/best-practices),
  [Flutter on the latest iOS](https://docs.flutter.dev/platform-integration/ios/ios-latest).
- Nielsen Norman Group: [response times](https://www.nngroup.com/articles/response-times-3-important-limits/),
  [skeleton screens](https://www.nngroup.com/articles/skeleton-screens/),
  [empty states](https://www.nngroup.com/articles/empty-state-interface-design/).
- Security: [OWASP MASVS](https://mas.owasp.org/MASVS/).
- Egypt: [StatCounter, mobile OS share](https://gs.statcounter.com/os-market-share/mobile/egypt) and
  [vendor share](https://gs.statcounter.com/vendor-market-share/mobile/egypt);
  [instant payments in Q2 2026](https://www.egypttoday.com/Article/3/149807/Egypt’s-instant-payment-transactions-reach-LE-4-33TN-in-Q2);
  [the data protection regulations](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins).
- Nubank, a bank with about 100 million customers, builds its app in Flutter on its own design system:
  [Flutter showcase](https://flutter.cn/showcase/nubank/).
