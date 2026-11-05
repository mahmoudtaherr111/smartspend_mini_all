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

/** The Cairo wall time of an instant, as a `datetime-local` field wants it ("2027-12-01T10:00"). */
export function cairoInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * The instant a `datetime-local` value names when read as Cairo time, whatever the browser's own zone: the console shows
 * every time in Cairo, so a time typed into it is Cairo time too.
 */
export function cairoInputToIso(local: string): string {
  const [date, time = "00:00"] = local.split("T");
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  const offsetAt = (instant: number) => {
    const [y, mo, d, h, mi] = cairoInputValue(new Date(instant)).split(/[-T:]/).map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) - instant;
  };
  // Twice, so an instant next to a daylight-saving change lands on the right side of it.
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first)).toISOString();
}

/** What each admin action in the audit log was, in plain words. */
export const AUDIT_ACTION: Record<string, string> = {
  UPDATE_SYSTEM_SETTINGS: "غيّر الإعدادات",
  UPDATE_USER_PLAN: "غيّر باقة مستخدم",
  UPDATE_USER_ROLE: "غيّر صلاحية مستخدم",
  DELETE_USER: "مسح حساب",
  REVOKE_SESSION: "سجّل خروج جهاز",
  SET_USER_TOKEN_LIMIT: "حدد حد ذكاء لمستخدم",
  RESET_USER_TOKENS: "صفّر استهلاك ذكاء",
  EXPORT_ALL_USERS: "نزّل قايمة المستخدمين",
  RESPOND_SUPPORT_TICKET: "رد على تذكرة",
  ASSIGN_SUPPORT_TICKET: "استلم تذكرة",
  ADD_AI_PROVIDER: "ضاف موصل",
  UPDATE_AI_PROVIDER: "عدّل موصل",
  DELETE_AI_PROVIDER: "شال موصل",
  ADD_AI_MODEL: "ضاف موديل",
  UPDATE_AI_MODEL: "عدّل موديل",
  DELETE_AI_MODEL: "شال موديل",
  SAVE_AI_MODELS: "حفظ موديلات",
  REORDER_AI_MODELS: "غيّر ترتيب الموديلات",
  RESOLVE_API_KEY_ERROR: "قفل خطأ مفتاح",
  CLEAR_ALL_API_KEY_ERRORS: "قفل كل أخطاء المفاتيح",
  DELETE_LEARNED_RULE: "شال كلمة من القاموس",
  RESOLVE_CLARIFICATION: "قفل سؤال",
  CREATE_NOTIFICATION_TEMPLATE: "عمل إشعار",
  UPDATE_NOTIFICATION_TEMPLATE: "عدّل إشعار",
  TOGGLE_NOTIFICATION_TEMPLATE: "شغّل أو وقّف إشعار",
  DELETE_NOTIFICATION_TEMPLATE: "شال إشعار",
  SEND_INSTANT_NOTIFICATION: "بعت إشعار",
  SEND_PUSH_NOTIFICATION: "بعت إشعار",
  UPDATE_WHATSAPP_SETTINGS: "غيّر إعدادات واتساب",
  TOGGLE_WHATSAPP_OTP: "غيّر كود التحقق على واتساب",
  SEND_WHATSAPP_DIRECT: "رد على واتساب",
  BROADCAST_WHATSAPP_TEMPLATE: "بعت قالب واتساب لمجموعة",
  CREATE_AD: "عمل حملة",
  UPDATE_AD: "عدّل حملة",
  DELETE_AD: "شال حملة",
  BULK_UNDO_CAPTURE: "لغى عمليات رسايل بنك بالجملة",
  "capture.simulate": "جرّب رسالة بنك",
  CREATE_CAPTURE_SOURCE: "ضاف بنك أو محفظة",
  UPDATE_CAPTURE_SOURCE: "عدّل بنك أو محفظة",
  CREATE_CAPTURE_SUBSCRIPTION: "ضاف اشتراك",
  UPDATE_CAPTURE_SUBSCRIPTION: "عدّل اشتراك",
  SET_CAPTURE_SOURCE_STATUS: "شغّل أو وقّف بنك",
  SET_CAPTURE_SUBSCRIPTION_STATUS: "شغّل أو وقّف اشتراك",
  SYNC_CAPTURE_SEED: "حدّث قايمة البنوك",
  RESTORE_CAPTURE_SEED: "رجّع قايمة البنوك الأصلية",
  DATABASE_BACKUP_EXPORTED: "نزّل نسخة الإعدادات",
};
