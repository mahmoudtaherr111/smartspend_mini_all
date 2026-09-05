# Pull-To-Refresh (PTR) Optimization Briefing

## Overview
The Pull-To-Refresh (PTR) component in `src/components/pwa/PullToRefreshWrapper.tsx` previously suffered from high re-render overhead during touch tracking, overly long artificial delays (1200ms), and accidental triggering during horizontal gestures or multi-touch actions.

## Key Changes
1. **Direct DOM & rAF Updates**: Eliminated continuous React state updates during drag. DOM element heights and transforms are directly updated on animation frames.
2. **Direction Lock & Multi-touch Filter**: Horizontal swipes (`|dx| > |dy|`) and multi-touch events are rejected immediately.
3. **Scroll Offset Check**: PTR initiates exclusively when `scrollTop <= 0`.
4. **Snappy 450ms Refresh**: Reduced minimum refresh delay to 450ms while ensuring query invalidation completes.
5. **Haptics**: Maintained calibrated light tap at 80px threshold and medium tap on trigger.
