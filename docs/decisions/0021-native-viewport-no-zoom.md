# The installed app never zooms, like a native app

Status: decided by the owner, 2026-10-18.

SmartSpend is used as an installed PWA and inside the Capacitor shells, and is meant to feel exactly like a native mobile
app: a person should not notice a difference. Native screens do not zoom with two fingers, and they do not jump in when a
field gets focus.

## Decision
1. **The viewport locks zoom.** `index.html` declares `width=device-width, initial-scale=1.0, maximum-scale=1.0,
   user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content`: edge to edge under the notch, no pinch zoom,
   and the on-screen keyboard resizes the content so the tab bar and composer stay above it.
2. **Fields are 16px on phones.** `src/index.css` sets every input, textarea and select to 16px, Tailwind's `text-sm` and
   `text-xs` included, under `(max-width: 1024px), (pointer: coarse)`, so iOS and Android never zoom into a focused field.
3. **No script handles gestures.** Nothing listens to `gesturestart` or similar on top of the viewport lock.

## Consequences
- Accessibility guidance (WCAG 1.4.4) prefers allowing zoom; the product chooses the native behaviour instead, and text
  size follows the system font settings the way native apps do. Do not "fix" the viewport back without the owner.
- Safari on iOS may still honour a pinch in some versions, since it ignores `user-scalable=no`; blocking it fully would
  need `touch-action` on the root element, which has not been decided.
- `tests/native-mobile-ux-adversarial.test.ts`, `tests/back-button-manager-adversarial.test.ts` and
  `tests/e2e/native-mobile-ux.spec.ts` hold these rules.
