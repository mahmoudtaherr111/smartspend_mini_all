# Mobile Dashboard Header & Top Metrics Compaction Survey Report

**Author:** Explorer 2 (Senior Full-Stack & UI Architecture Specialist)  
**Date:** 2026-08-26  
**Target Files:** `src/pages/Home.tsx`, `src/components/dashboard/StreakCounter.tsx`, `src/components/expenses/ExpenseForm.tsx`, `src/components/expenses/RecentExpenses.tsx`  
**Target Viewports:** iPhone 14 Pro (`390x844`), Android Pixel 7 / Samsung Galaxy (`412x915`)

---

## 1. Executive Summary

SmartSpend AI's mobile landing experience is critically compromised by excessive vertical padding, stacked header elements, multi-line greeting descriptions, and bulky financial summary cards. Currently on mobile viewports:
- `StreakCounter` occupies an isolated full-width row beneath the title.
- The two-line subtitle consumes ~52px of vertical space for repetitive static text.
- `SummaryChip` cards are tall, multi-line frosted glass cards (`py-2.5`, height ~62px).
- Combined with `ExpenseForm`'s uncollapsed discovery banner, **`RecentExpenses` starts 614px below the content top**.

On standard mobile devices (iPhone 14 Pro: 637px usable scroll viewport; Android Pixel 7: 734px usable scroll viewport), **recent transactions are pushed completely below the fold or show only ~23px of the card header**, requiring immediate downward scrolling to view any financial activity.

By re-architecting `src/pages/Home.tsx` to:
1. **Integrate `StreakCounter` into the Title Bar flex row** (saving ~46px).
2. **Streamline the Subtitle into a single compact greeting line** (saving ~24px).
3. **Refactor `SummaryChip` into high-density Financial Metric Pills (`py-2 px-3`)** (saving ~38px).
4. **Tighten container padding and section gaps (`p-3`, `space-y-3`)** (saving ~12px).

We achieve **~120px of direct height savings in `Home.tsx` alone**, and **~318px of cumulative vertical lift** when combined with the `ExpenseForm` input card compaction. This brings the top of `RecentExpenses` up to **296px**, guaranteeing **4 full transaction rows above the fold on iPhone 14 Pro** and **5+ rows on Android Pixel 7**.

---

## 2. Current State Analysis

### 2.1 Top Header & StreakCounter Layout
- **Source Location:** `src/pages/Home.tsx:548-652` & `src/components/dashboard/StreakCounter.tsx`
- **Current Component Tree:**
  ```tsx
  <header className="flex flex-col gap-3 -mx-1 px-1 py-2">
    <div className="space-y-3">
      {/* Container row/col */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        {/* Title Group */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{pageTitle}</h1>
          <HealthBadge ratio={...} />
          {hasBusiness && <button ... />}
        </div>
        
        {/* Month Navigation (Stats/Calendar only) */}
        {(activeTab === "stats" || activeTab === "calendar") && ( ... )}

        {/* Streak Counter Wrapper */}
        <div className="flex items-center gap-3">
          <StreakCounter currentStreak={profile?.gamification?.currentStreak || 0} />
        </div>
      </div>
      ...
  ```
- **Mobile vs Desktop Behavior:**
  - **Desktop (`>=640px` / `sm:`):** `sm:flex-row sm:items-center justify-between` renders the Title on the right (RTL start) and `StreakCounter` on the left (RTL end) on a single horizontal plane.
  - **Mobile (`<640px`):** The parent defaults to `flex-col`. Because `StreakCounter` is placed in a separate child `<div>`, it breaks into its own distinct row below the title.
  - **StreakCounter Internal Dimensions:** In `StreakCounter.tsx:11-46`, the pill has `px-3 py-1.5 rounded-full text-sm font-medium border` (~34px height) plus parent `gap-3` (12px), wasting **46px of vertical screen real estate** on mobile.

---

### 2.2 Subtitle Styling & Layout
- **Source Location:** `src/pages/Home.tsx:630-633`
- **Current Implementation:**
  ```tsx
  <p className="text-muted-foreground text-sm">
    أهلاً {user?.name || "صديقي"}، ابدأ بتسجيل العملية بسرعة واترك
    التحليلات لقسم الإحصائيات.
  </p>
  ```
- **Mobile Behavior:**
  - At `text-sm` (14px font, 20px line-height), on 390px / 412px screens with container padding `p-4`, this 74-character Arabic string wraps across **2 full lines**.
  - Total vertical footprint = 40px text height + 12px margin from `space-y-3` = **52px**.
  - The message is instructional and static; showing it continuously introduces unnecessary cognitive clutter and dead vertical space for frequent daily loggers.

---

### 2.3 `SummaryChip` and Top Financial Metrics
- **Source Location:** `src/pages/Home.tsx:93-129` (Definition) & `src/pages/Home.tsx:654-667` (Usage)
- **Current Implementation:**
  ```tsx
  const SummaryChip = memo(function SummaryChip({
    label,
    value,
    icon,
    tone,
    helper,
  }: {
    label: string;
    value: string;
    icon: ReactNode;
    tone: "income" | "expense" | "neutral";
    helper?: string;
  }) {
    const toneClass =
      tone === "income"
        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 shadow-sm"
        : tone === "expense"
          ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300 shadow-sm"
          : "border-slate-200/50 bg-white/70 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 shadow-sm";

    return (
      <div
        className={`premium-card px-2 xs:px-3 py-2.5 transition-all duration-300 hover:scale-[1.02] hover:translate-y-0 ${toneClass}`}
      >
        <div className="flex items-center gap-1.5 xs:gap-2">
          <div className="shrink-0 p-1 xs:p-1.5 rounded-md bg-background/50">{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] xs:text-[10px] text-muted-foreground">{label}</p>
            <p className="text-xs xs:text-sm font-bold break-words">{value}</p>
          </div>
        </div>
        {helper && (
          <p className="mt-1 text-[9px] xs:text-[10px] text-muted-foreground">{helper}</p>
        )}
      </div>
    );
  });
  ```
- **Current Dimension & Visual Breakdown:**
  - Uses `.premium-card` (`border-radius: 1.25rem` / 20px).
  - Vertical padding: `py-2.5` (10px top + 10px bottom = 20px).
  - Text layout: Vertical stack of label (`text-[10px]`, 14px height) over value (`text-sm`, 20px height).
  - Total Chip Height: 20px (padding) + 14px (label) + 20px (value) + 4px (internal gap/border) + 4px shadow/border = **~62px**.
  - Section Spacing: `grid grid-cols-2 gap-3` (12px gap) with parent `space-y-4` (16px top + 16px bottom).
  - Total Section Vertical Footprint = 16px (top space) + 62px (chip height) + 16px (bottom space) = **94px**.

---

### 2.4 Recent Transactions Relative to Mobile Viewport Fold
- **Source Location:** `src/pages/Home.tsx:691-698` & `src/components/expenses/RecentExpenses.tsx:406-451`
- **Current Cumulative Height Calculation (Top-of-Content to `RecentExpenses`):**

```
┌────────────────────────────────────────────────────────┐
│ App Shell Top Navbar (pt-safe + py-3 + logo h-12)      │ ~119px (iOS) / 96px (Android)
├────────────────────────────────────────────────────────┤
│ Page Content Container Padding (p-4 top)               │ 16px
│ Header Title (h1 + HealthBadge)                        │ 32px
│ Header Gap + StreakCounter Row                         │ 46px (34px pill + 12px gap)
│ Header Gap + Subtitle (2 lines)                        │ 52px (40px text + 12px gap)
│ Header py-2 padding                                    │ 16px
│ space-y-4 margin                                       │ 16px
│ SummaryChip Row (Income & Expense)                     │ 62px
│ space-y-4 margin                                       │ 16px
│ ExpenseForm Discovery Banner (CardHeader + Title)      │ 68px
│ ExpenseForm Status Indicator ("الحالة: جاهز")          │ 28px
│ ExpenseForm CardContent space-y-6                      │ 24px
│ ExpenseForm Textarea (min-h-[140px] + p-5)             │ 142px
│ ExpenseForm form space-y-4                             │ 16px
│ ExpenseForm Action Bar (h-14 buttons)                  │ 56px
│ ExpenseForm Card bottom padding                        │ 24px
├────────────────────────────────────────────────────────┤
│ START OF RECENT TRANSACTIONS (RecentExpenses Card)     │ = 614px Cumulative
└────────────────────────────────────────────────────────┘
```

#### Viewport Fold Comparison (Current vs Usable Screen):
- **iPhone 14 Pro (`390 x 844 px`):**
  - Physical height: 844px.
  - Safe Area Top + App Bar: 119px.
  - Bottom Floating Nav (`MobileBottomNav` + safe area): 88px.
  - **Usable Scroll Viewport Height: 637px**.
  - `RecentExpenses` starts at **614px**.
  - **Visible portion above fold: 23px** (Only the topmost border of the card; **0 transactions visible**).
- **Android Pixel 7 (`412 x 915 px`):**
  - Physical height: 915px.
  - Status Bar + App Bar: 96px.
  - Bottom Floating Nav: 85px.
  - **Usable Scroll Viewport Height: 734px**.
  - `RecentExpenses` starts at **614px**.
  - **Visible portion above fold: 120px** (Card title + half of 1 transaction item).

---

## 3. Quantitative Vertical Budget & Compaction Model

### 3.1 Itemized Height Savings Table

| Section / Element | Current Classes / Height | Proposed Optimization | New Height | Absolute Height Saved |
|:---|:---|:---|:---|:---|
| **Page Outer Padding** | `p-4` (16px top) | `p-3 sm:p-4 md:p-6` (12px top) | 12px | **+4px** |
| **Title & Streak Header** | `flex-col` with separate Streak row (78px) | Unified horizontal flex row `flex items-center justify-between` | 36px | **+42px** |
| **StreakCounter Pill** | `px-3 py-1.5 text-sm` (34px) | `px-2.5 py-1 text-xs sm:text-sm` (28px inline) | 0px (inline in title) | **+4px** |
| **Subtitle Description** | 2-line text `text-sm` (52px with gap) | Single-line compact greeting `text-xs truncate` | 16px | **+36px** |
| **Header Spacing** | `py-2 gap-3 space-y-3` (28px total overhead) | `py-1 gap-2 space-y-2` (10px overhead) | 10px | **+18px** |
| **Financial Metrics Pills** | `premium-card py-2.5 px-3` (62px) | Compact inline pill `py-2 px-3 rounded-xl` (36px) | 36px | **+26px** |
| **Metrics Grid Spacing** | `gap-3 space-y-4` (28px overhead) | `gap-2 space-y-3` (16px overhead) | 16px | **+12px** |
| **Subtotal (Home.tsx Header + Metrics)** | **280px total** | **138px total** | **138px** | **+142px SAVED** |
| **ExpenseForm Banner** | `CardHeader` title banner (68px) | Fluid inline badge `✨ تسجيل ذكي` (0px) | 0px | **+68px** |
| **ExpenseForm Status** | Static `"الحالة: جاهز"` (28px) | Dynamic recording pill / 0 idle (0px) | 0px | **+28px** |
| **ExpenseForm Textarea** | `min-h-[140px] p-5` (142px) | `min-h-[88px] p-3 text-base` (90px) | 90px | **+52px** |
| **ExpenseForm Action Bar** | `h-14` buttons (56px) | Compact elevated `h-11 sm:h-12` (46px) | 46px | **+10px** |
| **ExpenseForm Card Spacing** | `space-y-6 p-6` (40px overhead) | `space-y-3 p-3` (22px overhead) | 22px | **+18px** |
| **GRAND TOTAL CUMULATIVE** | **614px (from top of page)** | **296px (from top of page)** | **296px** | **+318px SAVED** |

---

### 3.2 Viewport Fold Real-Estate Comparison

```
IPHONE 14 PRO (390 x 844) VIEWPORT FOLD ANALYSIS:

CURRENT (Uncompacted):
0px ──────────────────────────────── Top of Content
    │ Header & Streak (146px)
    │ Summary Chips (62px)
    │ ExpenseForm (358px)
614px ────────────────────────────── RecentExpenses Starts
637px ────────────────────────────── VIEWPORT FOLD (Bottom of Screen)
      [Only 23px visible - NO transactions!]

AFTER FULL COMPACTION:
0px ──────────────────────────────── Top of Content
    │ Compact Integrated Header (74px)
    │ Financial Metric Pills (52px)
    │ Compact AI Input Card (170px)
296px ────────────────────────────── RecentExpenses Starts
    │ [Header: "آخر العمليات"] (48px)
    │ [Transaction 1: 150 ج.م كوفي] (60px)
    │ [Transaction 2: 450 ج.م سوبرماركت] (60px)
    │ [Transaction 3: 200 ج.م بنزين] (60px)
    │ [Transaction 4: 85 ج.م صيدلية] (60px)
637px ────────────────────────────── VIEWPORT FOLD (Bottom of Screen)
      [341px visible - 4 FULL TRANSACTIONS ABOVE THE FOLD! 🚀]
```

---

## 4. Concrete Architectural Recommendations

### 4.1 Recommendation 1: Header Bar & StreakCounter Integration
Unify the top title row into a single persistent flex container that handles Title, HealthBadge, Business Mode, Month Navigation, and StreakCounter in one horizontal line on all viewport sizes.

#### Before (`src/pages/Home.tsx:550-629`):
```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
  <div className="flex items-center gap-2 flex-wrap">
    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
      {businessMode && hasBusiness ? businessQuery.data!.business!.name : pageTitle}
    </h1>
    <HealthBadge
      ratio={
        (summary?.totalIncome ?? 0) > 0
          ? Math.round(
              ((summary?.totalExpense ?? 0) /
                (summary?.totalIncome ?? 1)) *
                100,
            )
          : null
      }
    />
    {hasBusiness && (
      <button
        onClick={toggleBusinessMode}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 shadow-sm ${
          businessMode
            ? "bg-indigo-500 text-white border border-indigo-400"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
        }`}
      >
        {businessMode ? (
          <><Store className="w-3.5 h-3.5" /> {businessQuery.data!.business!.name}</>
        ) : (
          <><UserIcon className="w-3.5 h-3.5" /> شخصي</>
        )}
      </button>
    )}
  </div>

  {(activeTab === "stats" || activeTab === "calendar") && (
    <div className="flex items-center gap-0.5 self-start sm:self-auto ...">
      ...
    </div>
  )}

  <div className="flex items-center gap-3">
    <StreakCounter
      currentStreak={profile?.gamification?.currentStreak || 0}
    />
  </div>
</div>
```

#### After (High-Density Integrated Header):
```tsx
<div className="flex items-center justify-between gap-2 w-full">
  {/* Right: Title & Badges (RTL start) */}
  <div className="flex items-center gap-2 min-w-0 flex-1">
    <h1 className="text-lg sm:text-2xl font-bold truncate">
      {businessMode && hasBusiness ? businessQuery.data!.business!.name : pageTitle}
    </h1>
    <HealthBadge
      ratio={
        (summary?.totalIncome ?? 0) > 0
          ? Math.round(
              ((summary?.totalExpense ?? 0) /
                (summary?.totalIncome ?? 1)) *
                100,
            )
          : null
      }
    />
    {hasBusiness && (
      <button
        onClick={toggleBusinessMode}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-200 shrink-0 ${
          businessMode
            ? "bg-indigo-500 text-white border border-indigo-400"
            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
        }`}
        title={businessMode ? "ارجع للحساب الشخصي" : "لوضع المشروع"}
      >
        {businessMode ? (
          <><Store className="w-3 h-3" /> <span className="max-w-[70px] truncate">{businessQuery.data!.business!.name}</span></>
        ) : (
          <><UserIcon className="w-3 h-3" /> شخصي</>
        )}
      </button>
    )}
  </div>

  {/* Left: Actions & StreakCounter (RTL end) */}
  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
    {(activeTab === "stats" || activeTab === "calendar") && (
      <div className="flex items-center gap-0.5 bg-slate-100/55 dark:bg-slate-800/30 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/20 rounded-lg p-0.5 shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
          onClick={() => handleMonthChange(getPreviousMonthString(month))}
          title="الشهر السابق"
        >
          <ChevronRight className="w-3 h-3" />
        </Button>
        <div className="relative flex items-center min-w-[85px] justify-center px-1 py-0.5 text-[10px] font-bold select-none text-slate-700 dark:text-slate-200">
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
          />
          <span className="flex items-center gap-1 cursor-pointer">
            <CalendarDays className="w-2.5 h-2.5 text-sky-600 shrink-0" />
            {getMonthLabelAr(month)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/40 active-press"
          onClick={() => handleMonthChange(getNextMonthString(month))}
          title="الشهر التالي"
        >
          <ChevronLeft className="w-3 h-3" />
        </Button>
      </div>
    )}
    <StreakCounter
      currentStreak={profile?.gamification?.currentStreak || 0}
    />
  </div>
</div>
```

---

### 4.2 Recommendation 2: Subtitle Streamlining
Replace the multi-line verbose paragraph with a concise single-line greeting on mobile that preserves personal warmth while eliminating dead whitespace.

#### Before (`src/pages/Home.tsx:630-633`):
```tsx
<p className="text-muted-foreground text-sm">
  أهلاً {user?.name || "صديقي"}، ابدأ بتسجيل العملية بسرعة واترك
  التحليلات لقسم الإحصائيات.
</p>
```

#### After:
```tsx
<p className="text-xs text-muted-foreground truncate">
  أهلاً {user?.name?.split(" ")[0] || "صديقي"} 👋 • سجل عملياتك اليومية بالذكاء الاصطناعي
</p>
```

---

### 4.3 Recommendation 3: High-Density Financial Metric Pills (`SummaryChip`)
Refactor `SummaryChip` into a streamlined single-line horizontal pill with `py-2 px-3`.

#### Before (`src/pages/Home.tsx:93-129`):
```tsx
const SummaryChip = memo(function SummaryChip({
  label,
  value,
  icon,
  tone,
  helper,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "income" | "expense" | "neutral";
  helper?: string;
}) {
  const toneClass =
    tone === "income"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 shadow-sm"
      : tone === "expense"
        ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300 shadow-sm"
        : "border-slate-200/50 bg-white/70 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 shadow-sm";

  return (
    <div
      className={`premium-card px-2 xs:px-3 py-2.5 transition-all duration-300 hover:scale-[1.02] hover:translate-y-0 ${toneClass}`}
    >
      <div className="flex items-center gap-1.5 xs:gap-2">
        <div className="shrink-0 p-1 xs:p-1.5 rounded-md bg-background/50">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] xs:text-[10px] text-muted-foreground">{label}</p>
          <p className="text-xs xs:text-sm font-bold break-words">{value}</p>
        </div>
      </div>
      {helper && (
        <p className="mt-1 text-[9px] xs:text-[10px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
});
```

#### After (Compact High-Density Financial Pill):
```tsx
const SummaryChip = memo(function SummaryChip({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "income" | "expense" | "neutral";
}) {
  const toneClass =
    tone === "income"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : tone === "expense"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-300"
        : "border-slate-200/60 bg-white/70 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 rounded-xl border backdrop-blur-md transition-all duration-200 shadow-xs",
        toneClass
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 opacity-75">{icon}</span>
        <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <span className="text-xs sm:text-sm font-bold tabular-nums shrink-0">{value}</span>
    </div>
  );
});
```

Rendered in `Home.tsx:654-667`:
```tsx
<section className="grid grid-cols-2 gap-2">
  <SummaryChip
    label="دخل الشهر"
    value={`${money(summary?.totalIncome)} ج.م`}
    tone="income"
    icon={<WalletCards className="w-3.5 h-3.5" />}
  />
  <SummaryChip
    label="مصروف الشهر"
    value={`${money(summary?.totalExpense)} ج.م`}
    tone="expense"
    icon={<TrendingDown className="w-3.5 h-3.5" />}
  />
</section>
```

---

### 4.4 Recommendation 4: StreakCounter Micro-Compaction
In `src/components/dashboard/StreakCounter.tsx`, ensure the pill is naturally compact on mobile without losing visual vibrancy:

```tsx
export function StreakCounter({ currentStreak }: StreakCounterProps) {
  if (currentStreak === 0) {
    return (
      <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700">
        <Flame className="w-3.5 h-3.5 opacity-50" />
        <span>0 يوم</span>
      </div>
    );
  }

  let flameColor = "text-orange-500 fill-orange-500";
  let bgClass = "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900";
  let textClass = "text-orange-600 dark:text-orange-400";

  if (currentStreak >= 30) {
    flameColor = "text-purple-500 fill-purple-500 animate-pulse";
    bgClass = "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900 shadow-[0_0_10px_rgba(168,85,247,0.3)]";
    textClass = "text-purple-600 dark:text-purple-400 font-bold";
  } else if (currentStreak >= 10) {
    flameColor = "text-blue-500 fill-blue-500";
    bgClass = "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900";
    textClass = "text-blue-600 dark:text-blue-400 font-bold";
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-300",
        bgClass,
        textClass,
      )}
    >
      <Flame className={cn("w-3.5 h-3.5", flameColor)} />
      <span className="tabular-nums font-bold">{currentStreak}</span>
    </div>
  );
}
```

---

## 5. Edge Cases & Resilience Analysis

1. **Business Mode Toggle:**
   - In business mode, the business name could be longer (e.g. "شركة الأمل للتجارة").
   - By applying `truncate` on `h1` and `max-w-[70px] truncate` on the business button badge, horizontal overflow on 390px screens is 100% prevented.

2. **Month Navigation in Stats/Calendar Tabs:**
   - In the "record" tab (default), month navigation is not rendered, maximizing title space.
   - In "stats" and "calendar" tabs, month navigation renders inline adjacent to `StreakCounter`.

3. **Arabic RTL Text Direction & Number Formatting:**
   - All numbers have `tabular-nums` to prevent layout jank during counter increments or dynamic currency updates.
   - Currency suffixes (`ج.م`) remain correctly aligned with RTL formatting.

4. **HealthBadge Extreme Labels:**
   - HealthBadge (`ratio <= 60` $\rightarrow$ "مستقر", `ratio <= 90` $\rightarrow$ "تحت المتابعة", `ratio > 90` $\rightarrow$ "ضغط مالي", `ratio === null` $\rightarrow$ "أضف الدخل لقراءة أدق").
   - Compact styling (`text-[10px] px-2 py-0.5 whitespace-nowrap`) prevents the badge from pushing StreakCounter off-screen.

---

## 6. Implementation Checklist for Builders

- [ ] Modify `src/components/dashboard/StreakCounter.tsx`: Update padding to `px-2.5 py-1`, text to `text-xs`, icon to `w-3.5 h-3.5`.
- [ ] Modify `src/pages/Home.tsx`:
  - [ ] Refactor `SummaryChip` (lines 93-129) into single-line horizontal pill layout.
  - [ ] Replace `space-y-4` container padding with `p-3 sm:p-4 md:p-6 space-y-3`.
  - [ ] Replace header title & streak layout (lines 550-629) with unified horizontal flex row.
  - [ ] Streamline subtitle (lines 630-633) to single-line greeting `text-xs truncate`.
  - [ ] Update `SummaryChip` section (lines 654-667) to `grid grid-cols-2 gap-2` with `w-3.5 h-3.5` icons.
- [ ] Run `npm run check` and `npm run test` to guarantee 100% type-safety and 0 regression.
