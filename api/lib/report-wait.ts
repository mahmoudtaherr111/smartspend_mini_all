/** Days a plan waits between two AI reports when the admin set nothing (`report_limit_<plan>`). */
const DEFAULT_REPORT_WAIT_DAYS: Record<string, number> = { free: 30, pro: 14, ultra: 1 };

/**
 * Days the caller's plan waits between two AI reports. The admin's `report_limit_<plan>` wins, and 0 there means
 * no wait: it used to fall back to 30 days, so turning the wait off made it the longest one.
 */
export function reportWaitDays(
  settings: Record<string, string | undefined>,
  plan: string | null | undefined,
): number {
  const id = plan && plan in DEFAULT_REPORT_WAIT_DAYS ? plan : "free";
  const configured = settings[`report_limit_${id}`];
  const days = configured === undefined || configured.trim() === "" ? NaN : Number(configured);
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_REPORT_WAIT_DAYS[id];
}

/** What the user reads while the wait is not over (docs/guides/writing-app-messages.md). */
export function reportWaitMessage(remainingDays: number): string {
  const days = remainingDays === 1 ? "يوم واحد" : remainingDays === 2 ? "يومين" : `${remainingDays} أيام`;
  return `التقرير الذكي الجاي متاح بعد ${days}. تقدر تشوف الباقات لو عايز تقارير أكتر.`;
}
