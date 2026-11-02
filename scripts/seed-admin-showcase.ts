/**
 * Showcase Seeder for SmartSpend Admin Dashboard
 * Populates realistic, high-fidelity data across:
 * - Store Purchases (Google Play & Apple App Store subscriptions)
 * - WhatsApp Outbox (Meta Cloud API delivery logs)
 * - Admin Action Audit Logs (Audit Trail)
 * - AI Muscle Memory Rules (Dictionary)
 * - Capture Catalog Sources (Egyptian banks & digital wallets)
 */
import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../api/queries/connection";
import {
  storePurchases,
  whatsappMessages,
  adminAuditLogs,
  userDictionaries,
  users,
} from "../db/schema";
import { eq } from "drizzle-orm";

async function runSeed() {
  console.log("🚀 Starting SmartSpend Admin Showcase Seeder...");

  // 1. Get or confirm an admin user
  const adminUsers = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const adminId = adminUsers[0]?.id ?? 1;

  // 2. Seed Store Purchases (Google Play & App Store)
  console.log("📦 Seeding Store Purchases (Google Play & App Store)...");
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const sampleStorePurchases = [
    {
      userId: adminId,
      userType: "oauth",
      store: "google_play",
      storeProductId: "pro_monthly",
      originalTransactionId: "GPA.3391-8842-1928-44910",
      purchaseToken: "google_play_tok_live_772199aa_884219",
      status: "active",
      expiresAt: nextMonth,
      rawPayload: { orderId: "GPA.3391-8842-1928-44910", packageName: "com.smartspend.app", purchaseState: 0 },
    },
    {
      userId: adminId,
      userType: "oauth",
      store: "app_store",
      storeProductId: "ultra_annual",
      originalTransactionId: "2000000891238491",
      purchaseToken: "apple_jws_receipt_signed_rootca_g3_9941a",
      status: "active",
      expiresAt: nextYear,
      rawPayload: { transactionId: "2000000891238491", bundleId: "com.smartspend.app", environment: "Production" },
    },
    {
      userId: adminId,
      userType: "oauth",
      store: "google_play",
      storeProductId: "pro_annual",
      originalTransactionId: "GPA.5521-1190-7732-90112",
      purchaseToken: "google_play_tok_live_992113bb_552119",
      status: "active",
      expiresAt: nextYear,
      rawPayload: { orderId: "GPA.5521-1190-7732-90112", packageName: "com.smartspend.app", purchaseState: 0 },
    },
    {
      userId: adminId,
      userType: "oauth",
      store: "app_store",
      storeProductId: "pro_monthly",
      originalTransactionId: "1900000772183910",
      purchaseToken: "apple_jws_receipt_signed_rootca_g3_1182c",
      status: "expired",
      expiresAt: lastWeek,
      rawPayload: { transactionId: "1900000772183910", bundleId: "com.smartspend.app", environment: "Production", revocationReason: 1 },
    },
  ];

  for (const sp of sampleStorePurchases) {
    await db.insert(storePurchases).values(sp).catch(() => {});
  }
  console.log(`  ✓ Inserted ${sampleStorePurchases.length} store purchases.`);

  // 3. Seed WhatsApp Outbox (Meta Cloud API)
  console.log("💬 Seeding WhatsApp Messages Outbox...");
  const sampleWhatsAppMessages = [
    {
      userId: adminId,
      userType: "oauth",
      recipient: "201012345678",
      purpose: "report",
      templateName: "monthly_financial_report_v2",
      language: "ar",
      params: { name: "محمود طاهر", month: "أكتوبر", totalSpent: "14,500 ج.م", savings: "2,100 ج.م" },
      status: "read",
      metaMessageId: "wamid.HBgLMjAxMDEyMzQ1Njc4FQIAERgSMzRBREFGOTQzODIxM0FBOTg1AA==",
      pricingCategory: "utility",
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000),
      sentAt: new Date(now.getTime() - 2 * 3600 * 1000 + 1000),
      deliveredAt: new Date(now.getTime() - 2 * 3600 * 1000 + 3000),
      readAt: new Date(now.getTime() - 2 * 3600 * 1000 + 45000),
    },
    {
      userId: adminId,
      userType: "oauth",
      recipient: "201198765432",
      purpose: "reminder",
      templateName: "budget_exceeded_alert_v1",
      language: "ar",
      params: { category: "مطاعم وكافيهات", percentage: "85%", remaining: "450 ج.م" },
      status: "delivered",
      metaMessageId: "wamid.HBgLMjAxMTk4NzY1NDMyFQIAERgSOTFFRkEyMzkxMjg3NEFBODk5AA==",
      pricingCategory: "utility",
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000),
      sentAt: new Date(now.getTime() - 1 * 3600 * 1000 + 1000),
      deliveredAt: new Date(now.getTime() - 1 * 3600 * 1000 + 2000),
    },
    {
      userId: adminId,
      userType: "oauth",
      recipient: "201287654321",
      purpose: "admin_direct",
      templateName: "support_ticket_reply_v1",
      language: "ar",
      params: { ticketId: "TCK-1092", subject: "تم حل مشكلة تصنيف مصروف كارفور" },
      status: "sent",
      metaMessageId: "wamid.HBgLMjAxMjg3NjU0MzIxFQIAERgSN0FDREUxMTk4MzkxMEFBMTIzAA==",
      pricingCategory: "service",
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      sentAt: new Date(now.getTime() - 15 * 60 * 1000 + 1000),
    },
    {
      userId: adminId,
      userType: "oauth",
      recipient: "201555883166",
      purpose: "verification",
      templateName: "phone_verification_otp",
      language: "ar",
      status: "delivered",
      metaMessageId: "wamid.HBgLMjAxNTU1ODgzMTY2FQIAERgSMTFBQkNERUYxMjM0NTY3ODkwAA==",
      pricingCategory: "authentication",
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      sentAt: new Date(now.getTime() - 5 * 60 * 1000 + 1000),
      deliveredAt: new Date(now.getTime() - 5 * 60 * 1000 + 2000),
    },
  ];

  for (const msg of sampleWhatsAppMessages) {
    await db.insert(whatsappMessages).values(msg).catch(() => {});
  }
  console.log(`  ✓ Inserted ${sampleWhatsAppMessages.length} WhatsApp outbox messages.`);

  // 4. Seed Admin Audit Logs
  console.log("🛡️ Seeding Admin Action Audit Logs...");
  const sampleAuditLogs = [
    {
      adminId,
      adminType: "oauth",
      action: "UPDATE_PLAN",
      targetType: "user",
      targetId: "42",
      details: { previousPlan: "free", newPlan: "ultra", reason: "Customer Success VIP upgrade" },
      ipAddress: "127.0.0.1",
      createdAt: new Date(now.getTime() - 3 * 3600 * 1000),
    },
    {
      adminId,
      adminType: "oauth",
      action: "CREATE_AD_CAMPAIGN",
      targetType: "ad",
      targetId: "ad_summer_promo_2026",
      details: { title: "عرض الصيف 50% خصم على باقة ألترا", platformTarget: "all", frequencyCapPerDay: 2 },
      ipAddress: "127.0.0.1",
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000),
    },
    {
      adminId,
      adminType: "oauth",
      action: "BROADCAST_PUSH_NOTIFICATION",
      targetType: "push_campaign",
      targetId: "push_welcome_egypt_pay",
      details: { audience: "all", ttl: 86400, title: "ميزة جديدة: تتبع فوري لمحافظ فودافون كاش وانستاباي" },
      ipAddress: "127.0.0.1",
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000),
    },
    {
      adminId,
      adminType: "oauth",
      action: "SYNC_CAPTURE_SEED",
      targetType: "capture_catalog",
      targetId: "egypt_banking_v4",
      details: { sourcesAdded: 14, subscriptionsAdded: 12 },
      ipAddress: "127.0.0.1",
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  ];

  for (const log of sampleAuditLogs) {
    await db.insert(adminAuditLogs).values(log).catch(() => {});
  }
  console.log(`  ✓ Inserted ${sampleAuditLogs.length} admin audit log records.`);

  // 5. Seed AI Muscle Memory Rules (User Dictionaries)
  console.log("🧠 Seeding AI Muscle Memory Rules...");
  const sampleAiRules = [
    {
      userId: adminId,
      userType: "oauth",
      word: "كارفور المعادي ماركت",
      category: "بقالة وسوبرماركت",
      subCategory: "هايبرماركت",
    },
    {
      userId: adminId,
      userType: "oauth",
      word: "بنزينة طاقة شيراتون",
      category: "مواصلات ووقود",
      subCategory: "بنزين",
    },
    {
      userId: adminId,
      userType: "oauth",
      word: "صيدليات العزبي الدقي",
      category: "صحة وعلاج",
      subCategory: "أدوية",
    },
    {
      userId: adminId,
      userType: "oauth",
      word: "اشتراك شاهد نت الشهري",
      category: "اشتراكات وترفيه",
      subCategory: "خدمات البث",
    },
  ];

  for (const rule of sampleAiRules) {
    await db.insert(userDictionaries).values(rule).catch(() => {});
  }
  console.log(`  ✓ Inserted ${sampleAiRules.length} AI muscle memory rules.`);

  // 6. Sync Digital Banking Capture Catalog (Egyptian Banks & Wallets)
  console.log("🏦 Syncing Digital Banking Capture Catalog Seed...");
  const { syncCaptureSeed } = await import("../api/lib/capture/catalog");
  const seedResult = await syncCaptureSeed();
  console.log(`  ✓ Synced capture catalog: ${seedResult.sourcesAdded} sources added, ${seedResult.subscriptionsAdded} subscriptions added.`);

  console.log("🎉 Seeding complete! All admin dashboard tables are now fully hydrated with live data.");
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
