/**
 * The Arabic texts of the interface: the source of truth and the default. Each text moves here
 * from its component word for word, so moving a screen never changes what Arabic users read.
 * Texts follow docs/guides/writing-app-messages.md; `tests/knowledge/user-copy.test.ts` scans
 * this file like any other.
 *
 * Keys are named by screen (`settings.appearance.title`), never by the text.
 */
export const ar = {
  "common.back": "رجوع",

  // Navigation
  "nav.record": "تسجيل",
  "nav.stats": "إحصائيات",
  "nav.ai": "مركز AI",
  "nav.calendar": "تقويم",
  "nav.more": "المزيد",
  "nav.home": "الرئيسية",
  "nav.support": "الدعم",

  // Settings
  "settings.appearance.title": "مظهر التطبيق",
  "settings.appearance.light": "فاتح (Light)",
  "settings.appearance.lightHint": "مناسب للإضاءة القوية",
  "settings.appearance.dark": "داكن (Dark)",
  "settings.appearance.darkHint": "مريح للعين بالليل",
  "settings.appearance.system": "تلقائي (System)",
  "settings.appearance.systemHint": "يتماشى مع نظام جهازك",

  "settings.language.title": "لغة الواجهة",
  "settings.language.description":
    "الأزرار والعناوين بس هي اللي بتتغير. اللي بتكتبه أو بتقوله وتصنيف مصاريفك بيفضلوا بالعربي.",
  "settings.language.arabicHint": "اللغة الأساسية",
  "settings.language.englishHint": "الواجهة بالإنجليزي",

  "settings.subview.profile": "الملف الشخصي",
  "settings.subview.security": "الأمان والدخول",
  "settings.subview.notifications": "إعدادات الإشعارات",
  "settings.subview.appearance": "مظهر التطبيق",
  "settings.subview.aiReport": "إعدادات التحليل والواتساب",
  "settings.subview.people": "الأشخاص والديون",
  "settings.subview.business": "النشاط التجاري",

  // More Page
  "more.title": "المزيد",
  "more.subtitle": "حسابك وخدمات SmartSpend في مكان واحد",
  "more.defaultUserName": "مستخدم SmartSpend",
  "more.defaultUserAccount": "حساب مسجل",
  "more.plan.free": "مجاني",
  "more.plan.pro": "Pro",
  "more.plan.ultra": "Ultra",

  "more.section.account": "الحساب والبيانات",
  "more.item.profile": "الملف الشخصي",
  "more.item.profileDesc": "بياناتك وملفك المالي الذكي",
  "more.item.people": "الأشخاص والديون",
  "more.item.peopleDesc": "إدارة جهات الاتصال، الديون، والسلف",
  "more.item.business": "النشاط التجاري",
  "more.item.businessDesc": "إدارة حسابك التجاري وفصل مصاريف العمل",

  "more.section.preferences": "التفضيلات والمظهر",
  "more.item.appearance": "مظهر التطبيق",
  "more.item.appearanceDesc": "الوضع الفاتح والداكن ولغة الواجهة",
  "more.item.notifications": "الإشعارات والتنبيهات",
  "more.item.notificationsDesc": "التحكم في التنبيهات والتذكيرات المالية",
  "more.item.aiReport": "تقرير الذكاء الاصطناعي وواتساب",
  "more.item.aiReportDesc": "التقارير الدورية وتنبيهات واتساب الذكية",

  "more.section.services": "الخدمات",
  "more.item.pro": "الخطة والاشتراك",
  "more.item.proDesc": "راجع خطتك ومزايا SmartSpend",
  "more.item.plan": "خطتك والتزاماتك",
  "more.item.planDesc": "اللي عليك لحد القبض، والخطة اللي اتفقت عليها مع سمارت",
  "more.item.bankSync": "الربط البنكي",
  "more.item.bankSyncDesc": "استيراد العمليات بأمان من هاتفك",
  "more.item.support": "المساعدة والدعم",
  "more.item.supportDesc": "الأسئلة الشائعة والتواصل معنا",

  "more.section.security": "الأمان والنظام",
  "more.item.security": "الأمان والدخول بالبصمة",
  "more.item.securityDesc": "البصمة ومفاتيح المرور وقفل التطبيق",
  "more.item.admin": "لوحة الإدارة",
  "more.item.adminDesc": "المستخدمون والدعم وإعدادات النظام",

  "more.logout.button": "تسجيل الخروج",
  "more.logout.title": "تسجيل الخروج؟",
  "more.logout.description": "هتحتاج تسجل دخولك مرة تانية للوصول لبياناتك على الجهاز ده.",
  "more.logout.unsentWarning":
    "عندك {count} تسجيل اتكتب من غير نت ولسه ماتبعتش. لو خرجت دلوقتي هيتمسحوا من الجهاز ده؛ وصّل النت واستنى لما يتبعتوا الأول.",
  "more.logout.cancel": "إلغاء",
  "more.logout.confirm": "تسجيل الخروج",
  "more.logout.loading": "جاري تسجيل الخروج...",

  // Dashboard Header & Summary
  "dashboard.income": "دخل الشهر",
  "dashboard.expense": "مصروف الشهر",
  "dashboard.currency": "ج.م",
  "dashboard.monthPrev": "الشهر السابق",
  "dashboard.monthNext": "الشهر التالي",
  "dashboard.tabs.record": "تسجيل",
  "dashboard.tabs.stats": "إحصائيات",
  "dashboard.tabs.calendar": "تقويم",
  "dashboard.subtitle.record": "سجل عملياتك اليومية بالذكاء الاصطناعي",
  "dashboard.subtitle.stats": "راجع اتجاهات صرفك واتخذ قرارك بهدوء",
  "dashboard.subtitle.calendar": "تابع عمليات الشهر يومًا بيوم",
  "dashboard.greeting": "أهلاً {name} 👋 • {subtitle}",
  "dashboard.defaultUserName": "صديقي",
  "dashboard.health.addIncome": "أضف الدخل لقراءة أدق",
  "dashboard.health.stable": "مستقر",
  "dashboard.health.monitoring": "تحت المتابعة",
  "dashboard.health.stress": "ضغط مالي",
  "dashboard.business.backPersonal": "ارجع للحساب الشخصي",
  "dashboard.business.modeProject": "لوضع المشروع",
  "dashboard.business.personal": "شخصي",

  // AI Center entry labels
  "aiCenter.title": "مركز الذكاء الاصطناعي",
  "aiCenter.subtitle": "مستشارك المالي الذكي",
  "aiCenter.tab.chat": "شات ذكي",
  "aiCenter.tab.chatDesc": "اسأل سمارت أي سؤال مالي",
  "aiCenter.tab.voice": "مكالمة صوتية",
  "aiCenter.tab.voiceDesc": "اتكلم مع مستشارك المالي",
  "aiCenter.tab.report": "تحليل شهري",
  "aiCenter.tab.reportDesc": "تقرير شهري مفصل بالـ AI",
} as const;

export type MessageKey = keyof typeof ar;
export type Dictionary = Record<MessageKey, string>;
