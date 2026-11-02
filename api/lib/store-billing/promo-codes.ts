/**
 * Store Billing Helpers: Promo Codes (BUG-07), Route Redirection (GAP-30), Plan Presentation (GAP-44)
 */

export type PromoCodeType = "store_promo" | "web_discount";

/**
 * Validates promotional codes and differentiates native store promo codes
 * (Google Play / Apple App Store) from web discount codes (BUG-07).
 */
export function validatePromotionalCode(code: string): { type: PromoCodeType; validForStore: boolean } {
  if (code.startsWith("PLAY_") || code.startsWith("APPSTORE_")) {
    return { type: "store_promo", validForStore: true };
  }
  return { type: "web_discount", validForStore: false };
}

/**
 * Resolves web plan paths, ensuring legacy or ultra paths redirect to /pro (GAP-30).
 */
export function resolveWebPlanRoute(path: string): string {
  if (path === "/ultra" || path === "/plans/ultra") {
    return "/pro";
  }
  return path;
}

/**
 * Available tiers for mobile presentation, strictly Free and Pro (GAP-44).
 */
export const MOBILE_AVAILABLE_TIERS = ["free", "pro"] as const;
