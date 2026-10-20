/**
 * Names shared by the server, the web admin and the phones for the sources SmartSpend reads bank, wallet and telecom
 * notifications from, and for the subscriptions it recognises in card charges. The data lives in the
 * `capture_sources` and `subscription_catalog` tables (`db/schema.ts`), seeded from `api/lib/capture/` and edited
 * by admins.
 */

export const CAPTURE_SOURCE_KINDS = ["bank", "wallet", "payment_network", "fintech", "telecom", "sms_app"] as const;
export type CaptureSourceKind = (typeof CAPTURE_SOURCE_KINDS)[number];

export const CAPTURE_SOURCE_KIND_LABELS: Record<CaptureSourceKind, string> = {
  bank: "بنك",
  wallet: "محفظة موبايل",
  payment_network: "شبكة دفع",
  fintech: "تطبيق مالي وتقسيط",
  telecom: "شركة اتصالات",
  sms_app: "تطبيق رسايل",
};

export const SUBSCRIPTION_KINDS = ["service", "store"] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const SUBSCRIPTION_CYCLES = ["weekly", "monthly", "quarterly", "yearly", "varies"] as const;
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export const SUBSCRIPTION_CYCLE_LABELS: Record<SubscriptionCycle, string> = {
  weekly: "كل أسبوع",
  monthly: "كل شهر",
  quarterly: "كل 3 شهور",
  yearly: "كل سنة",
  varies: "مش ثابت",
};

export const CATALOG_STATUSES = ["active", "disabled"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

/** A source as the phones receive it: only what deciding "read this notification?" needs. */
export interface CaptureSourceForPhone {
  slug: string;
  kind: CaptureSourceKind;
  nameAr: string;
  nameEn: string;
  androidPackages: string[];
  senderIds: string[];
}
