import type { Dictionary } from "./ar";

/**
 * The English texts of the interface. Typed as `Dictionary`, so a missing or extra key fails
 * `npm run check`. Loaded on demand by `LanguageProvider`: Arabic users never download it.
 */
export const en: Dictionary = {
  "common.back": "Back",

  // Navigation
  "nav.record": "Record",
  "nav.stats": "Stats",
  "nav.ai": "AI Center",
  "nav.calendar": "Calendar",
  "nav.more": "More",
  "nav.home": "Home",
  "nav.support": "Support",

  // Settings
  "settings.appearance.title": "Appearance",
  "settings.appearance.light": "Light",
  "settings.appearance.lightHint": "Best in bright light",
  "settings.appearance.dark": "Dark",
  "settings.appearance.darkHint": "Easy on the eyes at night",
  "settings.appearance.system": "System",
  "settings.appearance.systemHint": "Follows your device",

  "settings.language.title": "Interface language",
  "settings.language.description":
    "Only buttons and titles change. What you type or say, and your expense categories, stay in Arabic.",
  "settings.language.arabicHint": "Primary language",
  "settings.language.englishHint": "Interface in English",

  "settings.subview.profile": "Personal Profile",
  "settings.subview.security": "Security & Sign-in",
  "settings.subview.notifications": "Notification Settings",
  "settings.subview.appearance": "App Appearance",
  "settings.subview.aiReport": "AI Report & WhatsApp",
  "settings.subview.people": "People & Debts",
  "settings.subview.business": "Business Activity",

  // More Page
  "more.title": "More",
  "more.subtitle": "Your account and SmartSpend services in one place",
  "more.defaultUserName": "SmartSpend User",
  "more.defaultUserAccount": "Registered Account",
  "more.plan.free": "Free",
  "more.plan.pro": "Pro",
  "more.plan.ultra": "Ultra",

  "more.section.account": "Account & Data",
  "more.item.profile": "Personal Account",
  "more.item.profileDesc": "Your profile and smart financial file",
  "more.item.people": "People & Debts",
  "more.item.peopleDesc": "Manage contacts, debts, and loans",
  "more.item.business": "Business Activity",
  "more.item.businessDesc": "Manage your business account and separate work expenses",

  "more.section.preferences": "Preferences & Appearance",
  "more.item.appearance": "App Appearance",
  "more.item.appearanceDesc": "Light & dark mode and interface language",
  "more.item.notifications": "Notifications & Alerts",
  "more.item.notificationsDesc": "Manage alerts and financial reminders",
  "more.item.aiReport": "AI Report & WhatsApp",
  "more.item.aiReportDesc": "Periodic reports and smart WhatsApp alerts",

  "more.section.services": "Services",
  "more.item.pro": "Plan & Subscription",
  "more.item.proDesc": "Review your plan and SmartSpend benefits",
  "more.item.plan": "Your Plan & Obligations",
  "more.item.planDesc": "What you owe until payday, and your agreed plan with Smart",
  "more.item.bankSync": "Bank Sync",
  "more.item.bankSyncDesc": "Securely import transactions from your phone",
  "more.item.support": "Help & Support",
  "more.item.supportDesc": "Frequently asked questions and contact",

  "more.section.security": "Security & System",
  "more.item.security": "Security & Passkeys",
  "more.item.securityDesc": "Biometrics, passkeys, and app lock",
  "more.item.admin": "Admin Console",
  "more.item.adminDesc": "Users, support, and system settings",

  "more.logout.button": "Log Out",
  "more.logout.title": "Log out?",
  "more.logout.description": "You will need to sign in again to access your data on this device.",
  "more.logout.unsentWarning":
    "You have {count} offline records waiting to be sent. If you log out now they will be deleted from this device; please connect to the internet first.",
  "more.logout.cancel": "Cancel",
  "more.logout.confirm": "Log Out",
  "more.logout.loading": "Logging out...",

  // Dashboard Header & Summary
  "dashboard.income": "Monthly Income",
  "dashboard.expense": "Monthly Spending",
  "dashboard.currency": "EGP",
  "dashboard.monthPrev": "Previous Month",
  "dashboard.monthNext": "Next Month",
  "dashboard.tabs.record": "Record",
  "dashboard.tabs.stats": "Stats",
  "dashboard.tabs.calendar": "Calendar",
  "dashboard.subtitle.record": "Record your daily transactions with AI",
  "dashboard.subtitle.stats": "Review your spending trends and plan with confidence",
  "dashboard.subtitle.calendar": "Track monthly transactions day by day",
  "dashboard.greeting": "Hello {name} 👋 • {subtitle}",
  "dashboard.defaultUserName": "friend",
  "dashboard.health.addIncome": "Add income for insights",
  "dashboard.health.stable": "Stable",
  "dashboard.health.monitoring": "Under review",
  "dashboard.health.stress": "Financial stress",
  "dashboard.business.backPersonal": "Back to personal account",
  "dashboard.business.modeProject": "Switch to business mode",
  "dashboard.business.personal": "Personal",

  // AI Center entry labels
  "aiCenter.title": "AI Center",
  "aiCenter.subtitle": "Your smart financial advisor",
  "aiCenter.tab.chat": "Smart Chat",
  "aiCenter.tab.chatDesc": "Ask Smart any financial question",
  "aiCenter.tab.voice": "Voice Call",
  "aiCenter.tab.voiceDesc": "Talk with your financial advisor",
  "aiCenter.tab.report": "Monthly Analysis",
  "aiCenter.tab.reportDesc": "Detailed monthly AI report",
};
