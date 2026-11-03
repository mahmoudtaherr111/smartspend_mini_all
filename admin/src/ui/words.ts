// The words the console shows for the values the server stores, so no screen prints a raw code.

export const PLAN: Record<string, string> = { free: "مجاني", pro: "Pro", ultra: "Ultra" };
export const ROLE: Record<string, string> = { user: "مستخدم", moderator: "مشرف دعم", admin: "أدمن" };
export const ACCOUNT: Record<string, string> = { oauth: "حساب Google", local: "رقم تليفون" };
export const PLATFORM: Record<string, string> = { android: "أندرويد", ios: "آيفون", web: "المتصفح", unknown: "مش معروف" };
export const SOURCE: Record<string, string> = {
  manual: "يدوي",
  ai_parsed: "جملة مكتوبة",
  voice: "صوت",
  image: "فاتورة",
  sms: "رسالة بنك",
};
// What the AI was asked to do, by the channel the cost ledger records.
export const CHANNEL: Record<string, string> = {
  parse: "فهم جملة",
  chat: "محادثة",
  speech: "تحويل صوت لكلام",
  image: "قراءة فاتورة",
  report: "تقرير",
  sms: "رسالة بنك",
  goal: "تحليل هدف",
  business: "حساب الشغل",
  voice: "مكالمة",
  embedding: "ذاكرة المساعد",
};
export const STORE: Record<string, string> = { google_play: "Google Play", app_store: "App Store" };
export const TICKET: Record<string, string> = {
  open: "مستنية رد",
  in_progress: "بنراجعها",
  resolved: "اترد عليها",
  closed: "مقفولة",
};
export const SUBSCRIPTION: Record<string, string> = {
  active: "نشط",
  cancelled: "ملغي (شغال لحد نهايته)",
  expired: "خلص",
  grace: "مهلة دفع",
  on_hold: "متوقف",
  revoked: "اترد فلوسه",
};

export const word = (map: Record<string, string>, value: string | null | undefined) =>
  value ? (map[value] ?? value) : "—";

export function day(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function dayTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export const money = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(Number(value)).toLocaleString("en-US")} ج.م`;

export const usd = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : `$${Number(value).toFixed(Number(value) < 1 ? 4 : 2)}`;

export const count = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("en-US");
