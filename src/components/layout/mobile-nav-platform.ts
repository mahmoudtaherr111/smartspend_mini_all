export function detectMobileNavPlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined"
    ? navigator.maxTouchPoints
    : 0,
): "ios" | "android" {
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (userAgent.includes("Macintosh") && maxTouchPoints > 2);
  return isIos ? "ios" : "android";
}

export interface HorizontalTabRect {
  left: number;
  width: number;
}

export type IosScrubIntent = "pending" | "horizontal" | "vertical";

export const IOS_SCRUB_START_DISTANCE = 5;
export const IOS_SCRUB_AXIS_DOMINANCE = 1.08;
export const IOS_VERTICAL_CANCEL_DISTANCE = 22;
export const IOS_VERTICAL_AXIS_DOMINANCE = 1.35;
export const IOS_SCRUB_HYSTERESIS = 4;

export function supportsIphoneNavScrub(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  return /iPhone|iPod/.test(userAgent);
}

export function classifyIosScrubIntent(
  deltaX: number,
  deltaY: number,
  startDistance = IOS_SCRUB_START_DISTANCE,
  axisDominance = IOS_SCRUB_AXIS_DOMINANCE,
  verticalCancelDistance = IOS_VERTICAL_CANCEL_DISTANCE,
  verticalAxisDominance = IOS_VERTICAL_AXIS_DOMINANCE,
): IosScrubIntent {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (
    horizontalDistance >= startDistance &&
    horizontalDistance >= verticalDistance * axisDominance
  ) {
    return "horizontal";
  }

  if (
    verticalDistance >= verticalCancelDistance &&
    verticalDistance > horizontalDistance * verticalAxisDominance
  ) {
    return "vertical";
  }

  return "pending";
}

export function findContinuousTabPosition(
  pointerX: number,
  tabRects: HorizontalTabRect[],
): number {
  if (tabRects.length === 0) return -1;
  if (tabRects.length === 1) return 0;

  const firstCenter = tabRects[0].left + tabRects[0].width / 2;
  const lastRect = tabRects[tabRects.length - 1];
  const lastCenter = lastRect.left + lastRect.width / 2;
  const centerSpan = lastCenter - firstCenter;
  if (centerSpan === 0) return 0;

  const position =
    ((pointerX - firstCenter) / centerSpan) * (tabRects.length - 1);
  return Math.min(tabRects.length - 1, Math.max(0, position));
}

export function findClosestTabIndex(
  pointerX: number,
  tabRects: HorizontalTabRect[],
): number {
  if (tabRects.length === 0) return -1;

  return tabRects.reduce((closestIndex, rect, index) => {
    const center = rect.left + rect.width / 2;
    const closest = tabRects[closestIndex];
    const closestCenter = closest.left + closest.width / 2;
    return Math.abs(pointerX - center) < Math.abs(pointerX - closestCenter)
      ? index
      : closestIndex;
  }, 0);
}

export function findTabIndexWithHysteresis(
  pointerX: number,
  tabRects: HorizontalTabRect[],
  currentIndex: number,
  hysteresis = IOS_SCRUB_HYSTERESIS,
): number {
  const candidateIndex = findClosestTabIndex(pointerX, tabRects);
  if (candidateIndex < 0) return -1;
  if (
    candidateIndex === currentIndex ||
    currentIndex < 0 ||
    currentIndex >= tabRects.length
  ) {
    return candidateIndex;
  }

  const current = tabRects[currentIndex];
  const candidate = tabRects[candidateIndex];
  const currentCenter = current.left + current.width / 2;
  const candidateCenter = candidate.left + candidate.width / 2;
  const boundary = (currentCenter + candidateCenter) / 2;

  if (candidateCenter < currentCenter) {
    return pointerX <= boundary - hysteresis ? candidateIndex : currentIndex;
  }

  return pointerX >= boundary + hysteresis ? candidateIndex : currentIndex;
}
