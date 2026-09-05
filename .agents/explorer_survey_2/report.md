# Technical Investigation & Architectural Report: R2 & R3 Mobile Native UX

**Date**: 2026-08-28  
**Author**: Explorer Survey 2  
**Target Repository**: `smartspend_V1_fixed`  
**Focus Areas**:
- **R2: Spatial Navigation Transitions & Tab State Preservation** (hardware-accelerated slide transitions, directional awareness, scroll offset & sub-component state retention across switches)
- **R3: Universal Native Bottom Sheet Architecture** (gesture-dismissible Vaul/native bottom sheets for mobile dialogs/modals with grabber handles, snap detents, flick-to-dismiss)

---

## 1. Executive Summary

SmartSpend AI is an Arabic-first behavioral financial platform targeting the Egyptian mobile market. While the backend and business logic are mature (Hono v4, tRPC v11, Drizzle ORM, dual-auth, SQLite/MySQL), the frontend client currently retains web-first patterns that hinder its native mobile app experience:

1. **Spatial Navigation & Transitions (R2)**:
   - Page transitions in `src/components/layout/PageTransition.tsx` are a bare pass-through `<div>` without slide animations, directional awareness, or backdrop parallax.
   - Tab switching in `src/pages/Home.tsx` relies on toggling `display: none` (`hidden` / `block`), causing abrupt visual jumps without 1:1 finger tracking, rubber-banding, or per-tab scroll offset preservation.
   - In `src/pages/AICenter.tsx`, tabs unmount completely on switch via `AnimatePresence mode="wait"` with conditional rendering, destroying active chat messages, uncommitted drafts, voice call state, and scroll position.
   - Route-level navigation (e.g. `/dashboard` <-> `/ai` <-> `/settings`) unmounts views without recording `<main>` scroll offsets, resetting the user to the top (0px) whenever they navigate back.

2. **Dialogs & Bottom Sheets (R3)**:
   - Modals across the application (transaction details in `RecentExpenses.tsx`, camera tips and upgrade recommendations in `ExpenseForm.tsx`, calendar day views in `MonthlyCalendar.tsx`, chart breakdowns in `ExpenseChart.tsx`, settings dialogs, passkey PIN setups, and onboarding prompts) render as desktop-centered `@radix-ui/react-dialog` popups.
   - These centered dialogs on mobile phones are ergonomically awkward (cannot be reached with one thumb), lack grabber handles, do not support downward flick-to-dismiss gestures, and clip against virtual keyboards.
   - Although `vaul` (`^1.1.2`) and `src/components/ui/drawer.tsx` are installed, only `PeopleSettingsView.tsx` attempted a manual `isMobile ? <Drawer> : <Dialog>` pattern, leaving over 17 other dialog call sites as desktop popups.

This report provides an exhaustive inventory of the codebase, technical gap analysis, and a unified architectural blueprint for implementing R2 and R3 with zero regressions and native iOS/Android fidelity.

---

## 2. Codebase Inventory & Current State Analysis

### 2.1 Navigation & Routing Topology

| File | Exact Lines | Current Implementation & Behavior |
| :--- | :--- | :--- |
| `src/App.tsx` | Lines 4–9, 352–481 | Uses React Router v7 (`react-router-dom` 7.6.1). `AnimatedRoutes` wraps each `<Route>` element inside `<PageTransition>`. |
| `src/components/layout/PageTransition.tsx` | Lines 1–18 | **Pass-through wrapper**: Returns `<div className="w-full min-h-full flex flex-col flex-1">{children}</div>`. No animation, no slide, no directional awareness. |
| `src/components/layout/MobileBottomNav.tsx` | Lines 24–30, 126–223 | Floating glass capsule navigation bar for mobile (`lg:hidden`). Supports 5 tabs (`record`, `stats`, `ai`, `calendar`, `more`). Uses `framer-motion` for active glass pill indicator, but navigates via `navigate(item.href)`. |
| `src/App.tsx` (Layout) | Lines 270–285 | Main scroll container `<main ref={scrollRef} className="app-content hide-scrollbar transition-all duration-500 ...">`. Does not track or restore scroll position across route changes. |
| `src/hooks/useHistoryBound.ts` | Lines 1–40 | Manages `window.history.pushState` on modal open. Lacks integration with Capacitor native Android back button event listener. |

### 2.2 Tab State Management & View Switching

| Component / Page | Location | Current View Switching Mechanism | State & Scroll Preservation Status |
| :--- | :--- | :--- | :--- |
| **Home (Dashboard)** | `src/pages/Home.tsx`<br>Lines 56–70, 260–399 | Uses `activeTab === "record" ? "block opacity-100" : "hidden opacity-0"` on 3 separate `<div>` containers. URL synced via `?tab=record\|stats\|calendar`. | **Partial / Flawed**: DOM elements remain mounted, but `display: none` resets container layout metrics. Parent scroll position in `<main>` jumps because heights vary between Record (tall), Stats (medium), and Calendar (short). No swipe carousel or spring physics. |
| **AI Center** | `src/pages/AICenter.tsx`<br>Lines 126–141 | Uses `<AnimatePresence mode="wait">` with conditional rendering `{activeTab === "chat" && <AIChatbot />}`. | **Severe Data Loss**: Inactive tab components are completely unmounted. Chat scroll position, in-progress voice calls, monthly report state, and input drafts are erased on tab switch. |
| **Settings** | `src/pages/Settings.tsx`<br>Lines 182–192 | Uses `<AnimatePresence mode="wait">` with conditional rendering `{currentView === "main" && ...}`. | **Unmounted**: Sub-views (`profile`, `notifications`, `passkeys`, `theme`, `ai_report`, `people`, `business`) are unmounted when returning to `main`. Sub-view form drafts and scroll offsets are not preserved. |
| **Global Route Switching** | `src/App.tsx`<br>Lines 352–481 | `<Routes>` unmounts previous page component on route change. | **Reset to Top**: Navigating from `/dashboard` (scrolled down 800px) to `/ai` and back to `/dashboard` remounts `Home` and resets `<main>` scroll position to `0px`. |

---

### 2.3 Comprehensive Inventory of Dialogs, Modals, Popups & Sheets

The codebase contains **22 distinct modal/dialog/sheet call sites** across user-facing pages, admin panels, and onboarding flows:

#### A. User-Facing Modal & Dialog Inventory

| # | File Path | Line Range | Current Component | Trigger / Purpose | Mobile Viewport Experience |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `src/components/expenses/RecentExpenses.tsx` | 624–754 | `<Dialog>`, `<DialogContent>` | Clicking transaction card info icon (`MessageSquare`) to view full details (amount, provider badge, service fee, balance after, category, subcategory, raw SMS text, timestamp). | Centered desktop dialog. Long SMS text requires awkward vertical scroll inside small popup. |
| 2 | `src/components/expenses/RecentExpenses.tsx` | 452–476 | `<AlertDialog>`, `<AlertDialogContent>` | Clicking delete button on a transaction to confirm deletion. | Centered desktop popup dialog. |
| 3 | `src/components/expenses/ExpenseForm.tsx` | 1654–1718 | `<Dialog>`, `<DialogContent>` | First-time receipt camera scan tips modal (`showCameraTip`). | Centered popup with receipt illustration. |
| 4 | `src/components/expenses/ExpenseForm.tsx` | 1721–1762 | `<Dialog>`, `<DialogContent>` | AI quota limit reached prompt / Pro upgrade recommendation (`showProUpgrade`). | Centered popup with tier feature list. |
| 5 | `src/components/dashboard/MonthlyCalendar.tsx` | 52–120 | `<Dialog>`, `<DialogContent>` (`DayTransactionsDialog`) | Clicking a day cell in the monthly calendar grid to view all transactions for that date. | Centered modal list (`sm:max-w-md max-w-[92vw]`). |
| 6 | `src/components/dashboard/ExpenseChart.tsx` | 904–1031 | `<Dialog>`, `<DialogContent>` | Clicking a category pie slice or bar in chart to view detailed breakdown & transactions (`isModalOpen`). | Centered popup dialog with nested transaction list. |
| 7 | `src/components/dashboard/ExpenseChart.tsx` | 1034–1119 | `<Dialog>`, `<DialogContent>` | Clicking a wallet / e-wallet provider card to inspect balance and provider-specific transactions (`isWalletModalOpen`). | Centered popup dialog. |
| 8 | `src/components/profile/SmartProfileView.tsx` | 510–535 | `<Dialog>`, `<DialogContent>` | Clicking "إضافة هدف جديد" button to open `FinancialGoalsPanel mode="dialog"`. | Centered modal dialog containing goal creation form. |
| 9 | `src/components/settings/BusinessSettingsView.tsx` | 615–652 | `<Dialog>`, `<DialogContent>` | Clicking "تعديل بيانات المشروع" (Edit business name, currency, capital). | Centered popup form. |
| 10 | `src/components/settings/BusinessSettingsView.tsx` | 717–784 | `<Dialog>`, `<DialogContent>` (`AddCategoryDialog`) | Clicking "إضافة فئة جديدة" to add custom business expense/income category. | Centered popup dialog with color picker and icon selection. |
| 11 | `src/components/settings/PeopleSettingsView.tsx` | 612–635 | Manual `if (isMobile) <Drawer> else <Dialog>` (`AddContactDialog`) | Adding a person / debtor / creditor. | Bottom sheet on mobile, dialog on desktop. (Proof of concept implementation). |
| 12 | `src/components/settings/PeopleSettingsView.tsx` | 690–710 | Manual `if (isMobile) <Drawer> else <Dialog>` (`EditContactDialog`) | Editing person details. | Bottom sheet on mobile, dialog on desktop. |
| 13 | `src/components/settings/PeopleSettingsView.tsx` | 808–830 | Manual `if (isMobile) <Drawer> else <Dialog>` (`MergeDialog`) | Merging duplicate contacts. | Bottom sheet on mobile, dialog on desktop. |
| 14 | `src/components/settings/PeopleSettingsView.tsx` | 445–482 | `<Drawer>`, `<DrawerContent>` | Tapping contact row actions on mobile (call, edit, delete, silence). | Native bottom sheet via Vaul. |
| 15 | `src/components/settings/PeopleSettingsView.tsx` | 485–505 | `<AlertDialog>` | Confirming contact deletion. | Centered popup. |
| 16 | `src/components/auth/PasskeySettings.tsx` | 360–410 | `<Dialog>`, `<DialogContent>` | Setting up or updating 4-digit Biometric Security PIN (`isPinDialogOpen`). | Centered popup with PIN keypad. |
| 17 | `src/components/auth/BiometricOnboardingModal.tsx` | 33–128 | Custom Portal + `motion.div` | First-time prompt inviting user to enable Face ID / Touch ID passkey. | Bottom-anchored on mobile (`items-end`) but lacks drag-down dismissal and snap points. |
| 18 | `src/components/notifications/PushNotificationPrompt.tsx` | 52–113 | Custom Portal (`createPortal`) | Prompt inviting user to enable web/mobile push notifications. | Centered popup dialog (`animate-in zoom-in-95`). |
| 19 | `src/components/onboarding/OnboardingFlow.tsx` | 82–155 | Custom Portal | 4-step interactive app walkthrough tour for new users. | Centered card modal. |
| 20 | `src/components/FeedbackButton.tsx` | 41–80 | `<Dialog>`, `<DialogContent>` | Floating support & feedback ticket submission button. | Centered popup form. |
| 21 | `src/components/Sidebar.tsx` | 280–310 | `<AlertDialog>` | Confirming user account sign out. | Centered popup. |

#### B. Admin-Facing Modal & Dialog Inventory

| # | File Path | Line Range | Current Component | Trigger / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| 22 | `src/pages/Admin.tsx` | 962–1002 | `<Dialog>` | Admin user deletion confirmation (`userToDelete`). |
| 23 | `src/pages/Admin.tsx` | 1005–1048 | `<Dialog>` | Active user sessions inspector (`showSessions`). |
| 24 | `src/pages/Admin.tsx` | 1051–1289 | `<Dialog>` | Comprehensive User Profile & Financial Audit Inspector (`showProfile`). |
| 25 | `src/pages/Admin.tsx` | 1291–1322 | `<Dialog>` | Database export options modal (`showExports`). |
| 26 | `src/pages/Admin.tsx` | 1325–1408 | `<Dialog>` | Send direct WhatsApp / Push message to user (`messageUser`). |
| 27 | `src/components/admin/AdminAdsTab.tsx` | 267–374 | `<Dialog>` | Create new in-app advertisement banner (`isCreateOpen`). |
| 28 | `src/components/admin/AdminAdsTab.tsx` | 377–410 | `<Dialog>` | Delete ad confirmation (`adToDelete`). |
| 29 | `src/components/admin/AdminRulesTab.tsx` | 180–213 | `<Dialog>` | Delete categorization rule confirmation (`ruleToDelete`). |
| 30 | `src/components/admin/AdminWhatsAppTab.tsx` | 473–556 | `<Dialog>` | Send WhatsApp template message modal (`messageUser`). |
| 31 | `src/components/admin/NotificationsTab.tsx` | 810–880 | `<Dialog>` | Edit notification template modal (`editingTemplate`). |
| 32 | `src/components/admin/ai-center/modals/TokenAnatomyModal.tsx` | 8–80 | `<Dialog>` | AI Token Usage Anatomy breakdown modal. |
| 33 | `src/components/admin/ai-center/tabs/AiProviderManagerTab.tsx` | 15–120 | `<Dialog>` | Add / Edit AI Provider configuration. |

---

## 3. Technical Gap Analysis

### 3.1 Gaps in R2 (Spatial Navigation Transitions & Tab State Preservation)

1. **No Directional Route Transitions**:
   - `PageTransition.tsx` contains no CSS or Framer Motion transforms.
   - When navigating from `/dashboard` (index 0) to `/settings` (index 2), the screen flashes immediately without slide animation.
   - In Arabic RTL layout, moving deeper into the application hierarchy (forward) should slide in from the left (`x: "-100%"` -> `0%`), while popping back should slide out to the left (`0%` -> `"-100%"`), with the underlying screen receiving a 20% parallax shift and subtle dimming.
2. **Missing Scroll Restoration**:
   - `<main ref={scrollRef}>` in `src/App.tsx` handles all page-level scrolling.
   - React Router v7 does not automatically record or restore `scrollTop` across dynamic routes or tabs.
   - Tapping between tabs in `MobileBottomNav` unmounts and remounts components, resetting scroll to 0px.
3. **Tab Unmounting in `AICenter.tsx`**:
   - `AnimatePresence mode="wait"` unmounts `<AIChatbot />`, `<AIVoiceCall />`, and `<AIMonthlyReport />`.
   - When a user initiates a conversation or speech session and switches to Monthly Report to check data, switching back destroys their active conversation draft and resets scroll.
4. **Instant Opacity Jumps in `Home.tsx`**:
   - `Home.tsx` uses `hidden` vs `block` with `transition-opacity duration-150`.
   - Lacks authentic 1:1 finger tracking, rubber-band resistance, and momentum spring physics matching iOS UIKit and Flutter.

---

### 3.2 Gaps in R3 (Universal Native Bottom Sheet Architecture)

1. **Desktop-Centric Dialog Experience on Mobile**:
   - When tapping a transaction in `RecentExpenses.tsx` or an expense slice in `ExpenseChart.tsx`, a centered white rectangle appears in the middle of the screen.
   - Users cannot swipe or flick the dialog downward to dismiss it; they must tap a tiny "X" button at the top-right corner.
2. **Lack of Snap Detents & Dynamic Expansion**:
   - Modals containing variable content (e.g. `MonthlyCalendar.tsx` day transactions, which may have 1 transaction or 20 transactions) cannot snap between compact preview (50% height) and full scroll view (90% height).
3. **Duplicated Boilerplate across Files**:
   - `PeopleSettingsView.tsx` duplicated 100+ lines of JSX to render `<Drawer>` on mobile and `<Dialog>` on desktop across 3 separate dialogs.
   - Without a centralized **Adaptive Dialog Primitive**, every developer must manually write `isMobile ? <Drawer> : <Dialog>` in dozens of files.
4. **Android Hardware Back Button Unawareness**:
   - On Android devices (Capacitor shell), pressing the hardware back button when a bottom sheet is open triggers `window.history.back()` or exits the route instead of closing the sheet first.

---

## 4. Architectural Design & Implementation Blueprints

### 4.1 Architecture for R2: Spatial Navigation Transitions & Tab State Preservation

```
                    ┌────────────────────────────────────────────────────────┐
                    │               App Navigation Root                     │
                    │               (React Router v7)                        │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                 ┌─────────────▼─────────────┐
                                 │ useNavigationDirection()  │
                                 │ Tracks PUSH/POP & Index   │
                                 └─────────────┬─────────────┘
                                               │
                        ┌──────────────────────▼──────────────────────┐
                        │        DirectionalPageTransition            │
                        │  - RTL-Aware Hardware Accelerated Slides   │
                        │  - GPU translate3d() + will-change         │
                        │  - Backdrop Parallax & Scale Dimming       │
                        └──────────────────────┬──────────────────────┘
                                               │
                    ┌──────────────────────────┴──────────────────────────┐
                    │                                                     │
         ┌──────────▼──────────┐                               ┌──────────▼──────────┐
         │     Home Screen     │                               │   AI Center Screen  │
         │  Interactive Tab    │                               │  Keep-Alive Pager   │
         │  Carousel (Embla /  │                               │  (Chat, Voice,      │
         │  Framer Touch Pager)│                               │   Report Retained)  │
         │  - 1:1 Finger Track │                               │  - Scroll Memory    │
         │  - Scroll Memory    │                               │  - No Unmounting    │
         └─────────────────────┘                               └─────────────────────┘
```

#### Blueprint 1: `useNavigationDirection` Hook & Navigation Hierarchy Matrix
Determines whether navigation is moving forward (entering deeper) or backward (popping), and calculates the exact spatial offset in RTL:

```ts
// src/hooks/useNavigationDirection.ts
import { useLocation, useNavigationType } from "react-router-dom";
import { useRef, useEffect } from "react";

const ROUTE_DEPTH: Record<string, number> = {
  "/dashboard": 0,
  "/ai": 1,
  "/calendar": 2,
  "/bank-sync": 3,
  "/pro": 4,
  "/settings": 5,
  "/support": 6,
  "/admin": 7,
};

export type NavigationDirection = "forward" | "backward" | "none";

export function useNavigationDirection(): { direction: NavigationDirection; delta: number } {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPathRef = useRef(location.pathname);
  const directionRef = useRef<NavigationDirection>("none");
  const deltaRef = useRef(0);

  const prevDepth = ROUTE_DEPTH[prevPathRef.current] ?? 0;
  const currentDepth = ROUTE_DEPTH[location.pathname] ?? 0;

  if (prevPathRef.current !== location.pathname) {
    if (navType === "POP") {
      directionRef.current = "backward";
      deltaRef.current = -1;
    } else if (currentDepth > prevDepth) {
      directionRef.current = "forward";
      deltaRef.current = 1;
    } else if (currentDepth < prevDepth) {
      directionRef.current = "backward";
      deltaRef.current = -1;
    } else {
      directionRef.current = "forward";
      deltaRef.current = 1;
    }
    prevPathRef.current = location.pathname;
  }

  return { direction: directionRef.current, delta: deltaRef.current };
}
```

#### Blueprint 2: Directional Page Transition Wrapper (`src/components/layout/PageTransition.tsx`)
Features hardware-accelerated CSS 3D transforms (`translate3d`), spring physics, and subtle backdrop parallax:

```tsx
// Proposed src/components/layout/PageTransition.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useNavigationDirection } from "@/hooks/useNavigationDirection";

interface PageTransitionProps {
  children: React.ReactNode;
}

// In RTL (Arabic), "forward" slides in from the LEFT (-100%), "backward" slides in from the RIGHT (100%)
const rtlSlideVariants = {
  initial: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "-100%" : "100%",
    opacity: 0.85,
    scale: 0.98,
  }),
  animate: {
    x: "0%",
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 34,
      mass: 0.8,
    },
  },
  exit: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "30%" : "-30%",
    opacity: 0.4,
    scale: 0.96,
    transition: {
      duration: 0.28,
      ease: [0.32, 0.72, 0, 1], // Apple iOS cubic-bezier
    },
  }),
};

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const { direction } = useNavigationDirection();

  return (
    <AnimatePresence mode="popLayout" custom={direction} initial={false}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={rtlSlideVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full min-h-full flex flex-col flex-1 will-change-transform transform-gpu"
        style={{
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

#### Blueprint 3: Persistent Scroll Restoration & Tab State Retention (`src/hooks/useScrollRestoration.ts`)
Records and smoothly restores scroll offsets for any scroll container keyed by path:

```ts
// src/hooks/useScrollRestoration.ts
import { useEffect, useLayoutEffect, type RefObject } from "react";
import { useLocation } from "react-router-dom";

const scrollCache = new Map<string, number>();

export function useScrollRestoration(
  containerRef: RefObject<HTMLElement | null>,
  customKey?: string
) {
  const location = useLocation();
  const key = customKey || `${location.pathname}${location.search}`;

  // Restore scroll before paint
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const saved = scrollCache.get(key);
    if (typeof saved === "number") {
      el.scrollTop = saved;
    }
  }, [key, containerRef]);

  // Save scroll on scroll/unmount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      scrollCache.set(key, el.scrollTop);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      handleScroll();
      el.removeEventListener("scroll", handleScroll);
    };
  }, [key, containerRef]);
}
```

#### Blueprint 4: Tab Keep-Alive Container for `AICenter.tsx`
Prevents unmounting of AI Chat, Voice Call, and Monthly Report:

```tsx
// In src/pages/AICenter.tsx (Keep-Alive implementation pattern)
<div className="flex-1 min-h-0 relative overflow-hidden">
  <div
    className={cn(
      "h-full w-full absolute inset-0 transition-opacity duration-200",
      activeTab === "chat" ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none invisible"
    )}
  >
    <Suspense fallback={<TabSkeleton />}>
      <AIChatbot />
    </Suspense>
  </div>

  <div
    className={cn(
      "h-full w-full absolute inset-0 transition-opacity duration-200",
      activeTab === "voice" ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none invisible"
    )}
  >
    <Suspense fallback={<TabSkeleton />}>
      <AIVoiceCall />
    </Suspense>
  </div>

  <div
    className={cn(
      "h-full w-full absolute inset-0 transition-opacity duration-200",
      activeTab === "report" ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none invisible"
    )}
  >
    <Suspense fallback={<TabSkeleton />}>
      <AIMonthlyReport />
    </Suspense>
  </div>
</div>
```

---

### 4.2 Architecture for R3: Universal Native Bottom Sheet Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │               ResponsiveDialog / Modal                 │
                    │               (src/components/ui/adaptive-dialog.tsx)  │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                 ┌─────────────▼─────────────┐
                                 │       useIsMobile()       │
                                 │     (breakpoint < 768px)  │
                                 └─────────────┬─────────────┘
                                               │
                     ┌─────────────────────────┴─────────────────────────┐
                     │                                                   │
          ┌──────────▼──────────┐                             ┌──────────▼──────────┐
          │   Desktop (>= 768px)│                             │   Mobile (< 768px)  │
          │   Radix UI Dialog   │                             │   Vaul Bottom Sheet │
          │ - Centered Modal    │                             │ - Grabber Handle    │
          │ - Backdrop Fade     │                             │ - Snap Detents      │
          │ - Keyboard Esc Close│                             │ - Flick-to-Dismiss  │
          │ - Desktop Formats   │                             │ - Bottom Safe Area  │
          └─────────────────────┘                             │ - Reposition Inputs │
                                                              │ - Haptic Snap Detent│
                                                              │ - HW Back Button    │
                                                              └─────────────────────┘
```

#### Blueprint 1: Universal `AdaptiveDialog` Primitive (`src/components/ui/adaptive-dialog.tsx`)
A 100% drop-in responsive component that automatically maps to Radix Dialog on desktop and Vaul Drawer on mobile:

```tsx
// src/components/ui/adaptive-dialog.tsx
import * as React from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useSheetManager } from "@/hooks/useSheetManager";

interface AdaptiveDialogProps extends React.ComponentProps<typeof Dialog> {
  snapPoints?: (string | number)[];
  activeSnapPoint?: string | number | null;
  setActiveSnapPoint?: (snapPoint: string | number | null) => void;
  showGrabber?: boolean;
}

const AdaptiveDialogContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
});

export function AdaptiveDialog({
  children,
  open,
  onOpenChange,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  ...props
}: AdaptiveDialogProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Register with Sheet Stack for Android Hardware Back Button
  useSheetManager(Boolean(open), () => onOpenChange?.(false));

  if (isMobile) {
    return (
      <AdaptiveDialogContext.Provider value={{ isMobile: true }}>
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          snapPoints={snapPoints}
          activeSnapPoint={activeSnapPoint}
          setActiveSnapPoint={setActiveSnapPoint}
          shouldScaleBackground
          repositionInputs
          {...props}
        >
          {children}
        </Drawer>
      </AdaptiveDialogContext.Provider>
    );
  }

  return (
    <AdaptiveDialogContext.Provider value={{ isMobile: false }}>
      <Dialog open={open} onOpenChange={onOpenChange} {...props}>
        {children}
      </Dialog>
    </AdaptiveDialogContext.Provider>
  );
}

export function AdaptiveDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>
) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />;
}

export function AdaptiveDialogClose(
  props: React.ComponentProps<typeof DialogClose>
) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? <DrawerClose {...props} /> : <DialogClose {...props} />;
}

export function AdaptiveDialogContent({
  className,
  children,
  showGrabber = true,
  ...props
}: React.ComponentProps<typeof DialogContent> & { showGrabber?: boolean }) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);

  if (isMobile) {
    return (
      <DrawerContent
        className={cn(
          "max-h-[92vh] pb-safe rounded-t-3xl border-t border-slate-200 dark:border-slate-800 bg-background shadow-2xl focus:outline-hidden",
          className
        )}
        {...props}
      >
        {showGrabber && (
          <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 my-3 shrink-0" />
        )}
        <div className="overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    );
  }

  return (
    <DialogContent className={cn("rounded-2xl sm:max-w-lg", className)} {...props}>
      {children}
    </DialogContent>
  );
}

export function AdaptiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? (
    <DrawerHeader className={cn("text-right px-1 pt-1 pb-3", className)} {...props} />
  ) : (
    <DialogHeader className={cn("text-right pb-3", className)} {...props} />
  );
}

export function AdaptiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? (
    <DrawerFooter className={cn("px-1 pt-2 gap-2", className)} {...props} />
  ) : (
    <DialogFooter className={cn("pt-4 gap-2", className)} {...props} />
  );
}

export function AdaptiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? (
    <DrawerTitle className={cn("text-right text-base font-bold text-foreground", className)} {...props} />
  ) : (
    <DialogTitle className={cn("text-right text-lg font-bold text-foreground", className)} {...props} />
  );
}

export function AdaptiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const { isMobile } = React.useContext(AdaptiveDialogContext);
  return isMobile ? (
    <DrawerDescription className={cn("text-right text-xs text-muted-foreground", className)} {...props} />
  ) : (
    <DialogDescription className={cn("text-right text-sm text-muted-foreground", className)} {...props} />
  );
}
```

#### Blueprint 2: Global Sheet Stack & Capacitor Android Back Button Manager
Ensures any open bottom sheet or dialog receives the hardware back button event before the route changes:

```ts
// src/hooks/useSheetManager.ts
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

type CloseHandler = () => void;
const sheetStack: CloseHandler[] = [];
let isCapacitorListenerAttached = false;

function initCapacitorBackButton() {
  if (isCapacitorListenerAttached || !Capacitor.isNativePlatform()) return;
  isCapacitorListenerAttached = true;

  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (sheetStack.length > 0) {
      const closeTopSheet = sheetStack.pop();
      closeTopSheet?.();
      return;
    }

    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });
}

export function useSheetManager(isOpen: boolean, onClose: CloseHandler) {
  useEffect(() => {
    initCapacitorBackButton();

    if (!isOpen) return;

    sheetStack.push(onClose);
    return () => {
      const idx = sheetStack.indexOf(onClose);
      if (idx !== -1) {
        sheetStack.splice(idx, 1);
      }
    };
  }, [isOpen, onClose]);
}
```

---

## 5. Step-by-Step Implementation Roadmap for R2 & R3

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           IMPLEMENTATION PHASES                                │
├────────────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Core Primitives & Hooks                                               │
│ ├── 1.1 Create `src/hooks/useMediaQuery.ts` (if not present)                   │
│ ├── 1.2 Create `src/hooks/useNavigationDirection.ts` (RTL direction detector)  │
│ ├── 1.3 Create `src/hooks/useScrollRestoration.ts` (Per-route scroll cache)    │
│ ├── 1.4 Create `src/hooks/useSheetManager.ts` (HW back button & stack)         │
│ └── 1.5 Create `src/components/ui/adaptive-dialog.tsx` (Universal Sheet/Dialog)│
├────────────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Spatial Page Transitions & Tab State Preservation (R2)                │
│ ├── 2.1 Update `src/components/layout/PageTransition.tsx` with hardware slide  │
│ ├── 2.2 Wire scroll restoration into `src/App.tsx` `<main>` layout             │
│ ├── 2.3 Refactor `src/pages/Home.tsx` tab switcher to continuous touch pager   │
│ ├── 2.4 Refactor `src/pages/AICenter.tsx` to keep-alive offscreen tab views    │
│ └── 2.5 Refactor `src/pages/Settings.tsx` sub-views with spatial slide         │
├────────────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Universal Bottom Sheet Migration (R3 - Part 1: High Frequency Views) │
│ ├── 3.1 `RecentExpenses.tsx` — Transaction Details -> AdaptiveDialog           │
│ ├── 3.2 `RecentExpenses.tsx` — Delete Confirmation -> AdaptiveDialog           │
│ ├── 3.3 `ExpenseForm.tsx` — Camera Tips & Pro Upgrade -> AdaptiveDialog       │
│ ├── 3.4 `MonthlyCalendar.tsx` — Day Transactions -> AdaptiveDialog with Snaps  │
│ └── 3.5 `ExpenseChart.tsx` — Category & Wallet Modals -> AdaptiveDialog       │
├────────────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Universal Bottom Sheet Migration (R3 - Part 2: Settings & Onboarding) │
│ ├── 4.1 `SmartProfileView.tsx` — Financial Goal Creation Modal                 │
│ ├── 4.2 `BusinessSettingsView.tsx` — Edit Business & Add Category Modals       │
│ ├── 4.3 `PeopleSettingsView.tsx` — Clean up redundant manual Drawer boilerplate│
│ ├── 4.4 `PasskeySettings.tsx` — PIN Setup Dialog                               │
│ ├── 4.5 `BiometricOnboardingModal.tsx` & `PushNotificationPrompt.tsx`          │
│ └── 4.6 `FeedbackButton.tsx` — Support Ticket Submission                       │
├────────────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Verification & Automated Tests                                        │
│ ├── 5.1 Run TypeScript type check (`npm run check`)                            │
│ ├── 5.2 Run Vitest test suites (`npm run test`)                                │
│ ├── 5.3 Add unit tests for `useNavigationDirection` and `AdaptiveDialog`       │
│ └── 5.4 Verify touch gestures, keyboard avoidance, and transitions in browser  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Migration Code Snippets & Concrete Examples

### Example 1: Migrating Transaction Details in `RecentExpenses.tsx`

**Before (Lines 624–754)**:
```tsx
<Dialog>
  <DialogTrigger aria-label="تفاصيل العملية" ...>
    <MessageSquare className="w-5 h-5" />
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>تفاصيل العملية</DialogTitle>
    </DialogHeader>
    <div className="space-y-3" dir="rtl">...</div>
  </DialogContent>
</Dialog>
```

**After (Using `AdaptiveDialog`)**:
```tsx
<AdaptiveDialog snapPoints={[0.6, 0.95]}>
  <AdaptiveDialogTrigger aria-label="تفاصيل العملية" ...>
    <MessageSquare className="w-5 h-5" />
  </AdaptiveDialogTrigger>
  <AdaptiveDialogContent>
    <AdaptiveDialogHeader>
      <AdaptiveDialogTitle>تفاصيل العملية</AdaptiveDialogTitle>
    </AdaptiveDialogHeader>
    <div className="space-y-3" dir="rtl">...</div>
  </AdaptiveDialogContent>
</AdaptiveDialog>
```

### Example 2: Migrating Calendar Day View in `MonthlyCalendar.tsx`

**Before (Lines 52–65)**:
```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <DialogContent className="sm:max-w-md max-w-[92vw] rounded-2xl" dir="rtl">
    <DialogHeader className="text-end pb-3 border-b ...">
      <DialogTitle className="text-base sm:text-lg font-black ...">
        معاملات {formattedDate}
      </DialogTitle>
    </DialogHeader>
    {/* List */}
  </DialogContent>
</Dialog>
```

**After (Using `AdaptiveDialog` with Snap Detents)**:
```tsx
<AdaptiveDialog
  open={isOpen}
  onOpenChange={(open) => !open && onClose()}
  snapPoints={[0.5, 0.9]}
>
  <AdaptiveDialogContent dir="rtl">
    <AdaptiveDialogHeader className="text-end pb-3 border-b ...">
      <AdaptiveDialogTitle className="text-base sm:text-lg font-black ...">
        معاملات {formattedDate}
      </AdaptiveDialogTitle>
    </AdaptiveDialogHeader>
    {/* List with native momentum scrolling and grabber handle */}
  </AdaptiveDialogContent>
</AdaptiveDialog>
```

---

## 7. Conclusion

By implementing the **Adaptive Dialog System** and **Hardware-Accelerated Directional Spatial Transitions**, SmartSpend AI will eliminate all desktop modal friction, preserve critical tab state and scroll offsets across user navigation, and achieve a 100% native iOS/Android fluidity.
