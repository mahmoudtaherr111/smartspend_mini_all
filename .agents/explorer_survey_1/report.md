# Comprehensive Technical Survey Report: R1 (Native Touch Physics & Tab Pager) and R5 (Multi-Tier Micro-Haptics Engine)

**Surveyor**: Survey Explorer 1  
**Project**: SmartSpend AI (Web & PWA / Capacitor Monorepo)  
**Target Milestones**:
- **R1: Native Touch Physics & Interactive Tab Pager**
- **R5: Multi-Tier Micro-Haptics Engine**  
**Date**: 2026-08-28

---

## 1. Executive Summary

SmartSpend AI aims to achieve 100% native-grade tactile fidelity matching iOS Swift (UIKit/SwiftUI) and Flutter. A comprehensive architectural audit of the current frontend UI and interaction layers was conducted, focusing on **R1** (touch physics, continuous tab carousel, button active response, viewport stability) and **R5** (tactile feedback across switches, segmented controls, tabs, sheets, pull-to-refresh, swipe-to-delete).

### Key Findings Overview:
1. **Dashboard Tab Pager (R1)**: Currently in `src/pages/Home.tsx`, tabs (`record`, `stats`, `calendar`) are rendered using discrete conditional classes (`hidden opacity-0` vs `block opacity-100`). The swipe navigation (`src/hooks/useSwipeNavigation.ts`) only performs a static threshold check (75px) on touch end without any continuous 1:1 finger tracking, momentum scrolling, rubber-band resistance, or spring settling physics.
2. **Button Active States & Scroll Stickiness (R1)**: Button styles (`src/components/ui/button.tsx`, `src/index.css`, `src/3d-effects.css`) suffer from two major issues: (a) a sluggish 200ms transition curve on touch-down (`transition: transform 0.2s`), and (b) persistent `:active` lock / stickiness during scrolling on mobile WebKit/Chromium browsers.
3. **Viewport & Pinch-to-Zoom (R1)**: `index.html` specifies `maximum-scale=5`, allowing accidental double-tap and pinch-to-zoom gestures that distort the fixed native app shell layout.
4. **Micro-Haptics Engine (R5)**: The current `src/hooks/useHaptics.ts` supports only 4 basic calls (`lightTap`, `mediumTap`, `success`, `error`). Key tactile tiers (`selection` for segmented controls / tab switches / slider steps, `heavyTap` for high-impact actions, and `warning`) are missing.
5. **Interactive UI Touchpoints (R5)**: Key interactive controls (`src/components/ui/switch.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/slider.tsx`, `src/components/ui/toggle-group.tsx`, `src/components/ui/drawer.tsx`, `src/components/expenses/RecentExpenses.tsx`) lack integrated haptic feedback on state change, snap detent, and real-time swipe threshold crossing.

---

## 2. Problem Boundary & Codebase Inventory

| Area | Key Files Involved | Current Behavior / Limitations |
| :--- | :--- | :--- |
| **Home Tab Pager** | `src/pages/Home.tsx`<br>`src/hooks/useSwipeNavigation.ts`<br>`src/components/dashboard/HomeHeader.tsx`<br>`src/components/layout/MobileBottomNav.tsx` | Discrete CSS `opacity-0`/`100` and `hidden`/`block` toggle; threshold-only touch detection on touch end; no 1:1 finger tracking during gesture; no momentum scrolling or spring physics. |
| **Button Active States** | `src/components/ui/button.tsx`<br>`src/index.css` (lines 180-188)<br>`src/3d-effects.css` (lines 240-243)<br>`src/components/ui/haptic-button.tsx` | CSS `:active` with 200ms transition delay; no scroll cancellation; buttons remain pressed while scrolling (stickiness); inconsistent styling across `.btn-press`, `.active-press`, `active:scale-95`. |
| **Viewport & Zoom** | `index.html` (lines 5-8) | `<meta name="viewport" content="... maximum-scale=5 ...">` allows accidental viewport zooming and layout distortion on mobile devices. |
| **Haptics Subsystem** | `src/hooks/useHaptics.ts`<br>`src/hooks/useHaptics.test.ts` | Limited to 4 feedback types; lacks `selection()`, `heavyTap()`, `warning()`, and continuous selection session methods (`selectionStart`, `selectionEnd`). |
| **UI Control Touchpoints** | `src/components/ui/switch.tsx`<br>`src/components/ui/tabs.tsx`<br>`src/components/ui/slider.tsx`<br>`src/components/ui/toggle.tsx`<br>`src/components/ui/toggle-group.tsx`<br>`src/components/ui/drawer.tsx`<br>`src/components/expenses/RecentExpenses.tsx`<br>`src/components/pwa/PullToRefreshWrapper.tsx` | Switches, tabs, sliders, segmented toggles, and drawer snap detents have zero tactile feedback on state change; swipe-to-delete only vibrates upon release instead of upon crossing the deletion threshold. |

---

## 3. Deep Investigation: R1 — Native Touch Physics & Interactive Tab Pager

### 3.1 Home Dashboard Tab Pager Audit

#### Current Implementation Analysis
In `src/pages/Home.tsx` (lines 259–399), the tab views are structured as:
```tsx
<div className="relative">
  {/* Record Tab View */}
  <div className={cn("space-y-5 transition-opacity duration-150", activeTab === "record" ? "block opacity-100" : "hidden opacity-0")}>
    ...
  </div>

  {/* Stats Tab View */}
  <div className={cn("transition-opacity duration-150", activeTab === "stats" ? "block opacity-100" : "hidden opacity-0")}>
    ...
  </div>

  {/* Calendar Tab View */}
  <div className={cn("transition-opacity duration-150", activeTab === "calendar" ? "block opacity-100" : "hidden opacity-0")}>
    ...
  </div>
</div>
```

The gesture layer is managed by `useSwipeNavigation` (`src/hooks/useSwipeNavigation.ts`):
- Listens to `touchstart`, `touchmove`, `touchend` on the outer container.
- On `touchmove`, locks vertical scrolling if `absX > absY && absX > 10`.
- On `touchend`, computes `deltaX = endX - startX`. If `Math.abs(deltaX) >= 75` (threshold), it invokes `onSwipeNext` or `onSwipePrev`.
- The callback updates state via `updateView(nextTab)` which changes URL query parameters (`?tab=...`).

#### Gaps & Limitations Against Native iOS/Flutter UX:
1. **No 1:1 Finger Tracking**: The screen does not move at all while the user's finger is dragging horizontally. The user sees a completely static screen until they release their finger.
2. **Abrupt Opacity Swap**: When the gesture completes, the old tab disappears and the new tab fades in abruptly via a 150ms opacity transition.
3. **No Elastic Edge Resistance (Rubber-Banding)**: Dragging beyond the bounds (e.g. dragging right on Record tab in RTL or left on Calendar tab) has zero visual or physical resistance feedback.
4. **No Momentum Scrolling / Velocity Recognition**: Fast flick gestures that cover less than 75px distance fail to trigger a tab switch, even if the user flicked at high velocity.
5. **No Spring Physics Settling**: The transition has no spring mass, damping, or stiffness characteristics.

#### Architectural Recommendation: Native Interactive Tab Pager
To deliver authentic 1:1 finger tracking with momentum and spring physics, we utilize `embla-carousel-react` (already present in `package.json` v8.6.0) or a hardware-accelerated Framer Motion gesture viewport. 

`embla-carousel-react` provides superior advantages:
- Built-in native RTL support (`direction: 'rtl'`).
- Authentically calibrated momentum physics, flick gesture recognition, and boundary rubber-band resistance.
- Zero layout shifts and direct GPU compositing (`transform: translate3d`).
- Clean separation from vertical scrolling (enables natural vertical scrolling of tab contents while allowing horizontal page dragging).
- Event callbacks (`select`, `scroll`, `settle`) for synchronizing tab headers (`HomeHeader`) and bottom navigation bar (`MobileBottomNav`).

```tsx
// Architectural Sketch: InteractiveTabPager.tsx
import useEmblaCarousel from "embla-carousel-react";

export function InteractiveTabPager({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: "record" | "stats" | "calendar";
  onTabChange: (tab: "record" | "stats" | "calendar") => void;
  children: [React.ReactNode, React.ReactNode, React.ReactNode];
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    direction: "rtl",
    loop: false,
    skipSnaps: false,
    duration: 25,
    inViewThreshold: 0.7,
    watchDrag: (emblaApi, event) => {
      // Exclude nested interactive elements (charts, sliders, swipe-to-delete cards)
      const target = event.target as HTMLElement | null;
      if (target?.closest(".no-swipe, .recharts-wrapper, input, textarea, [data-no-swipe]")) {
        return false;
      }
      return true;
    },
  });

  // Bidirectional synchronization: URL/State -> Embla, and Embla -> URL/State
  ...
}
```

---

### 3.2 Button Active States & Scroll Stickiness Audit

#### Current Implementation Analysis
- In `src/index.css` (lines 180-188):
```css
.active-press {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.active-press:active {
  transform: scale(0.95);
}
```
- In `src/3d-effects.css` (lines 240-243):
```css
.btn-press:active {
  transform: scale(0.95);
}
```
- In `src/components/ui/button.tsx` (line 8): `buttonVariants` specifies `transition-all btn-press`.

#### Root Causes of Tactile Sluggishness and Scroll Stickiness:
1. **Slow Touch-Down Curve**: `transition: transform 0.2s` applies equally to touch-down and touch-up. When touching a button, it takes a full 200ms to compress to `scale(0.95)`. Native iOS UIButtons depress immediately (0ms touch-down) and bounce back with a spring curve upon release.
2. **Scroll Gesture Stickiness**: When a user begins a scroll gesture starting on a button or card, WebKit and Blink maintain the `:active` state until the gesture ends or the finger leaves the element boundary. This causes buttons in lists to remain shrunk/highlighted while the user scrolls down the page.
3. **Inconsistent Class Usage**: The codebase uses `.btn-press`, `.active-press`, `active:scale-95`, and inline classes across different components with disparate transition durations.

#### Architectural Recommendation: Native Active Press Engine
1. **Asymmetric CSS Transitions**: Fast/instant compression on `:active` (0ms to 40ms) and elastic spring recovery on release (250ms cubic-bezier):
```css
/* Native Instant Active Press with Spring Release */
.native-active,
.btn-press,
.active-press {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  will-change: transform;
}

.native-active:active,
.btn-press:active,
.active-press:active {
  transform: scale(0.96) translateZ(0);
  transition: transform 0.04s cubic-bezier(0, 0, 0.2, 1); /* Instant 0ms-40ms press */
}
```
2. **Touch-Cancel on Scroll Protocol**:
Ensure container scroll views have `touch-action: pan-y` so that the browser's touch pipeline immediately aborts tap gestures and drops `:active` states when vertical scroll displacement exceeds 4px.

---

### 3.3 Viewport Configuration & Pinch-to-Zoom Prevention

#### Current Implementation Analysis
In `index.html` (lines 5-8):
```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=5, interactive-widget=resizes-visual"
/>
```

#### Flaw:
`maximum-scale=5` permits pinch-to-zoom gestures. In a native-grade mobile PWA/app shell, pinch-to-zoom causes accidental screen distortion, breaking fixed headers, floating navigation bars, and modals.

#### Architectural Recommendation:
1. Update `index.html` viewport meta tag to strictly disable zooming while maintaining `viewport-fit=cover` and `interactive-widget=resizes-visual`:
```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual"
/>
```
2. Add defensive iOS WebKit gesture event suppression in `src/main.tsx` (as Safari standalone PWAs occasionally ignore `user-scalable=no` on multi-touch gestures):
```ts
// Suppress multi-touch pinch zoom gestures in Safari PWA
if (typeof window !== "undefined") {
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
}
```

---

## 4. Deep Investigation: R5 — Multi-Tier Micro-Haptics Engine

### 4.1 Current Subsystem State (`useHaptics.ts`)

`src/hooks/useHaptics.ts` currently provides:
- `lightTap()`: `ImpactStyle.Light` (Capacitor) / `10ms` (Web)
- `mediumTap()`: `ImpactStyle.Medium` (Capacitor) / `30ms` (Web)
- `success()`: `NotificationType.Success` (Capacitor) / `[30, 50, 40]` (Web)
- `error()`: `NotificationType.Error` (Capacitor) / `[50, 100, 50, 100, 50]` (Web)

### 4.2 Gaps in Haptic Taxonomy

| Haptic Tier | Capacitor API | Web API Fallback | Intended UI Use Cases |
| :--- | :--- | :--- | :--- |
| **`selection`** *(Missing)* | `Haptics.selectionChanged()` | `navigator.vibrate(5)` | Tab selection, segmented controls, slider ticks, bottom sheet snap detents, date picker wheel. |
| **`lightTap`** *(Present)* | `Haptics.impact({ style: Light })` | `navigator.vibrate(12)` | Standard button presses, pill clicks, link taps. |
| **`mediumTap`** *(Present)* | `Haptics.impact({ style: Medium })` | `navigator.vibrate(28)` | Switch toggles, bottom sheet open/close, pull-to-refresh trigger snap. |
| **`heavyTap`** *(Missing)* | `Haptics.impact({ style: Heavy })` | `navigator.vibrate(45)` | Destructive deletions, high-value transaction commits. |
| **`warning`** *(Missing)* | `Haptics.notification({ type: Warning })` | `navigator.vibrate([40, 60, 40])` | Over-budget alerts, destructive confirmation dialogs. |
| **`success`** *(Present)* | `Haptics.notification({ type: Success })` | `navigator.vibrate([30, 50, 40])` | Operation successfully saved, sync completed. |
| **`error`** *(Present)* | `Haptics.notification({ type: Error })` | `navigator.vibrate([50, 100, 50, 100, 50])` | Network failure, invalid input, auth rejection. |
| **`selectionSession`** *(Missing)* | `Haptics.selectionStart()`, `selectionEnd()` | No-op | Continuous scrubbing (bottom nav scrubber, slider drag). |

### 4.3 UI Control Touchpoint Audit

#### 1. Switch Component (`src/components/ui/switch.tsx`)
- **Current**: Direct wrapper around `@radix-ui/react-switch`. Zero haptic feedback when toggled.
- **Fix**: Intercept `onCheckedChange` to invoke `mediumTap()` or `lightTap()` upon toggling.

#### 2. Tabs Component (`src/components/ui/tabs.tsx`)
- **Current**: Direct wrapper around `@radix-ui/react-tabs`. Clicking `TabsTrigger` triggers zero haptics.
- **Fix**: Attach `selection()` to `TabsTrigger` click/press events.

#### 3. Slider Component (`src/components/ui/slider.tsx`)
- **Current**: Direct wrapper around `@radix-ui/react-slider`. Moving thumb produces no tactile feedback.
- **Fix**: Trigger `selection()` when value steps increment/decrement during dragging.

#### 4. Toggle & ToggleGroup (`src/components/ui/toggle.tsx`, `toggle-group.tsx`)
- **Current**: Radix primitives with zero haptics.
- **Fix**: Trigger `selection()` on item click / state toggle.

#### 5. Drawer / Bottom Sheet Detents (`src/components/ui/drawer.tsx` / `vaul`)
- **Current**: Vaul drawer without snap detent haptic integration.
- **Fix**: Hook into `onSnapPointChange` to invoke `selection()` whenever the sheet locks into a snap detent (e.g. 50% vs 90%).

#### 6. Pull-To-Refresh (`src/components/pwa/PullToRefreshWrapper.tsx`)
- **Current**: Has `lightTap()` at threshold and `mediumTap()` on trigger.
- **Refinement**: Ensure `selection()` fires exactly once when crossing the pull threshold, `mediumTap()` fires on snap to refreshing, and `success()` fires upon query resolution.

#### 7. Swipe-To-Delete in Recent Expenses (`src/components/expenses/RecentExpenses.tsx`)
- **Current**: Lines 534–545:
```tsx
const handleDragEnd = async (e: any, info: PanInfo) => {
  const threshold = 60;
  const hasDraggedPastThreshold = isRTL ? info.offset.x < -threshold : info.offset.x > threshold;
  if (hasDraggedPastThreshold) {
    mediumTap();
    onRequestDelete(expense.id);
  }
};
```
- **Flaw**: Haptics only fire on release (`onDragEnd`)! While dragging, there is zero tactile feedback when the finger passes the 60px deletion threshold.
- **Fix**: Track motion value `x` or `onDrag` displacement and trigger `selection()` / `lightTap()` the moment the threshold is crossed during the active drag, giving the user immediate tactile awareness that releasing will delete.

---

## 5. Architectural Design & Code Proposals

### 5.1 Enhanced Micro-Haptics Engine (`src/hooks/useHaptics.ts`)

```ts
import { useCallback } from "react";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

export function useHaptics() {
  const isSupportedWeb =
    typeof window !== "undefined" && "vibrate" in navigator;
  const isCapacitor = Capacitor.isNativePlatform();

  // Subtle tick for discrete item selection, tab switches, slider increments, snap detents
  const selection = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.selectionChanged();
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(6);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const lightTap = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(12);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const mediumTap = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(28);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const heavyTap = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate(45);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const success = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([30, 50, 40]);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const warning = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Warning });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  const error = useCallback(async () => {
    if (isCapacitor) {
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
    } else if (isSupportedWeb) {
      try {
        navigator.vibrate([50, 100, 50, 100, 50]);
      } catch {}
    }
  }, [isCapacitor, isSupportedWeb]);

  return {
    selection,
    lightTap,
    mediumTap,
    heavyTap,
    success,
    warning,
    error,
    isSupported: isCapacitor || isSupportedWeb,
  };
}
```

---

### 5.2 Interactive Tab Pager Architecture (`src/components/dashboard/InteractiveTabPager.tsx`)

```tsx
import React, { useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useHaptics } from "@/hooks/useHaptics";
import type { HomeTab } from "./HomeHeader";

interface InteractiveTabPagerProps {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  tabOrder?: HomeTab[];
  children: {
    record: React.ReactNode;
    stats: React.ReactNode;
    calendar: React.ReactNode;
  };
}

const DEFAULT_TAB_ORDER: HomeTab[] = ["record", "stats", "calendar"];

export function InteractiveTabPager({
  activeTab,
  onTabChange,
  tabOrder = DEFAULT_TAB_ORDER,
  children,
}: InteractiveTabPagerProps) {
  const { selection } = useHaptics();
  const activeIndex = tabOrder.indexOf(activeTab);
  const isInternalChangeRef = useRef(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    direction: "rtl",
    loop: false,
    skipSnaps: false,
    duration: 25,
    inViewThreshold: 0.7,
    watchDrag: (_api, event) => {
      // Isolate drag from nested horizontal interactive widgets
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          ".no-swipe, .recharts-wrapper, input, textarea, select, [data-no-swipe]"
        )
      ) {
        return false;
      }
      return true;
    },
  });

  // Sync external activeTab prop -> Embla Carousel
  useEffect(() => {
    if (!emblaApi) return;
    const currentSelected = emblaApi.selectedScrollSnap();
    if (currentSelected !== activeIndex && activeIndex >= 0) {
      if (!isInternalChangeRef.current) {
        emblaApi.scrollTo(activeIndex, false);
      }
    }
    isInternalChangeRef.current = false;
  }, [activeIndex, emblaApi]);

  // Handle slide selection changes from user drag gesture
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const index = emblaApi.selectedScrollSnap();
    const nextTab = tabOrder[index];
    if (nextTab && nextTab !== activeTab) {
      isInternalChangeRef.current = true;
      selection();
      onTabChange(nextTab);
    }
  }, [emblaApi, activeTab, onTabChange, tabOrder, selection]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="overflow-hidden w-full select-none" ref={emblaRef}>
      <div className="flex touch-pan-y w-full">
        {tabOrder.map((tabKey) => (
          <div
            key={tabKey}
            className="min-w-0 shrink-0 grow-0 basis-full w-full select-text"
          >
            {children[tabKey]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### 5.3 Switch Haptic Integration (`src/components/ui/switch.tsx`)

```tsx
"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";

function Switch({
  className,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const { selection } = useHaptics();

  const handleCheckedChange = (checked: boolean) => {
    selection();
    if (onCheckedChange) {
      onCheckedChange(checked);
    }
  };

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      onCheckedChange={handleCheckedChange}
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 active-press",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
```

---

### 5.4 TabsTrigger Haptic Integration (`src/components/ui/tabs.tsx`)

```tsx
function TabsTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { selection } = useHaptics();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    selection();
    if (onClick) onClick(e);
  };

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      onClick={handleClick}
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow,transform] active:scale-[0.97] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}
```

---

### 5.5 Live Threshold Haptics in Swipe-To-Delete (`src/components/expenses/RecentExpenses.tsx`)

```tsx
// Inside ExpenseItem in RecentExpenses.tsx:
const { selection, heavyTap } = useHaptics();
const thresholdPassedRef = useRef(false);

const handleDrag = (_e: any, info: PanInfo) => {
  const threshold = 60;
  const passed = isRTL ? info.offset.x < -threshold : info.offset.x > threshold;
  if (passed && !thresholdPassedRef.current) {
    thresholdPassedRef.current = true;
    selection(); // Fire tactile tick the instant deletion threshold is crossed
  } else if (!passed && thresholdPassedRef.current) {
    thresholdPassedRef.current = false;
  }
};

const handleDragEnd = async (_e: any, info: PanInfo) => {
  const threshold = 60;
  const hasDraggedPastThreshold = isRTL ? info.offset.x < -threshold : info.offset.x > threshold;
  thresholdPassedRef.current = false;

  if (hasDraggedPastThreshold) {
    heavyTap();
    onRequestDelete(expense.id);
  }
  controls.start({ x: 0 });
};
```

---

## 6. Step-by-Step Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Viewport Hardening & Instant Button Active Physics            │
│ 1. Update index.html meta viewport tag to disable pinch-to-zoom.      │
│ 2. Add gesture event suppression in src/main.tsx.                      │
│ 3. Refactor CSS active press curves in index.css & 3d-effects.css.     │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Multi-Tier Micro-Haptics Engine (R5)                          │
│ 1. Expand useHaptics.ts with selection, heavyTap, warning tiers.       │
│ 2. Update unit tests in useHaptics.test.ts to verify all tiers.        │
│ 3. Wire haptics into Switch, TabsTrigger, Slider, ToggleGroup.         │
│ 4. Wire detent haptics into Vaul Bottom Sheet (Drawer).                │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Interactive Tab Pager Carousel (R1)                           │
│ 1. Create src/components/dashboard/InteractiveTabPager.tsx.           │
│ 2. Configure Embla Carousel with RTL direction, momentum, spring.      │
│ 3. Integrate into src/pages/Home.tsx, replacing opacity conditionals.  │
│ 4. Ensure bidirectional sync with HomeHeader and MobileBottomNav.      │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Live Threshold Haptics & Swipe-To-Delete                      │
│ 1. Add real-time drag threshold crossing haptics to RecentExpenses.   │
│ 2. Refine PullToRefreshWrapper haptic timings.                         │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 5: Verification & Quality Assurance                              │
│ 1. Run `npm run check` across the monorepo.                           │
│ 2. Run unit tests (`npm run test`) for useHaptics and components.      │
│ 3. Verify RTL gesture alignment and gesture isolation on mobile.       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Risk Analysis & Invariants

1. **RTL Direction Coordinates in Carousel**:
   - *Risk*: In Arabic RTL, slide 0 is on the physical right, and dragging right-to-left moves to slide 1 (Stats). If direction is not set to `rtl`, swipe gestures will be inverted.
   - *Mitigation*: Ensure `direction: "rtl"` is explicitly passed to `useEmblaCarousel` and verify container layout bounds.

2. **Gesture Conflicts with Nested Sliders / Charts**:
   - *Risk*: Horizontal drag gestures on charts (Recharts) or swipe-to-delete cards could trigger parent tab paging.
   - *Mitigation*: Configure `watchDrag` filter in Embla to ignore touches on `.no-swipe`, `.recharts-wrapper`, `[data-no-swipe]`, and input elements.

3. **Silent Degradation Invariant**:
   - *Risk*: Invoking haptics on unsupported desktop browsers or Safari web could throw errors or cause performance overhead.
   - *Mitigation*: Wrap all haptic invocations in `try/catch` and maintain strict platform detection (`Capacitor.isNativePlatform()` and `"vibrate" in navigator`).
