/**
 * Every kind of notification the app sends, and where opening it takes the user. The server stores the destination
 * with the bell item and sends it with the push; the bell, the notification page and the service worker open it
 * through `resolveNotificationTarget`, which also repairs destinations stored before this map existed.
 */

export type NotificationKind = "budget" | "plan" | "subscription" | "reminder" | "security" | "general";

export interface NotificationTypeInfo {
  kind: NotificationKind;
  /** Where opening it goes: always a page that shows what the notification is about. */
  destination: string;
}

/** The notification center: the destination of anything without a better one. */
export const NOTIFICATION_CENTER_PATH = "/notifications";

const STATS_BUDGETS = "/dashboard?tab=stats#budget";

export const NOTIFICATION_TYPES = {
  budget_near_limit: { kind: "budget", destination: STATS_BUDGETS },
  budget_category_exceeded: { kind: "budget", destination: STATS_BUDGETS },
  budget_exceeded: { kind: "budget", destination: STATS_BUDGETS },
  subscription_ending: { kind: "subscription", destination: "/pro" },
  pro_conversion_streak: { kind: "subscription", destination: "/pro" },
  inactivity_reminder: { kind: "reminder", destination: "/dashboard?tab=record" },
  dormant_reactivation: { kind: "reminder", destination: "/dashboard?tab=record" },
  coach_reminder: { kind: "plan", destination: "/plan" },
  biometric_suggestion: { kind: "security", destination: "/settings/security?highlight=biometric" },
  manual_scheduled: { kind: "general", destination: NOTIFICATION_CENTER_PATH },
} as const satisfies Record<string, NotificationTypeInfo>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function notificationType(type: string): NotificationTypeInfo {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeInfo>)[type] ?? {
    kind: "general",
    destination: NOTIFICATION_CENTER_PATH,
  };
}

/** Destinations written before the map, as they are stored in old bell items and sent in old pushes. */
const LEGACY_DESTINATIONS: Record<string, string> = {
  "/": NOTIFICATION_CENTER_PATH,
  "/#budget": STATS_BUDGETS,
  "/settings/security?highlight=1": NOTIFICATION_TYPES.biometric_suggestion.destination,
  "/settings?tab=passkeys": NOTIFICATION_TYPES.biometric_suggestion.destination,
};

/**
 * The page a stored or pushed destination opens. Only paths inside the app are followed; anything else, empty or
 * unknown goes to the notification center, never to a dead end or another site.
 */
export function resolveNotificationTarget(actionUrl: string | null | undefined): string {
  const raw = String(actionUrl ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return NOTIFICATION_CENTER_PATH;
  return LEGACY_DESTINATIONS[raw] ?? raw;
}

/** What a stored bell item is about, read from its destination (the table keeps no type). */
export function notificationKindOf(actionUrl: string | null | undefined): NotificationKind {
  const target = resolveNotificationTarget(actionUrl);
  const types = (Object.values(NOTIFICATION_TYPES) as NotificationTypeInfo[]).filter(
    (info) => info.destination !== NOTIFICATION_CENTER_PATH,
  );
  const exact = types.find((info) => info.destination === target);
  if (exact) return exact.kind;
  // Same page, other details (an admin link to /pro?ref=…): the page's kind, when only one kind opens it.
  const path = target.split(/[?#]/)[0];
  const kinds = new Set(types.filter((info) => info.destination.split(/[?#]/)[0] === path).map((info) => info.kind));
  return kinds.size === 1 ? [...kinds][0] : "general";
}
