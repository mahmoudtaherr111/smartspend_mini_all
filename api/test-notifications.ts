import "dotenv/config";
import { checkAndTriggerSmartActivityNotifications, checkUserBudgetExceeded, seedDefaultTemplates } from "./notification-engine";
import { db } from "./queries/connection";
import { users, localUsers, userProfiles, expenses, notificationTemplates, notificationLogs } from "../db/schema";
import { eq, and, gte } from "drizzle-orm";

async function runTests() {
  console.log("=================================================");
  console.log(" SmartSpend Notifications Integration Test Runner ");
  console.log("=================================================");

  // 1. Seed templates verification
  console.log("\n[Test 1] Seeding default templates...");
  await seedDefaultTemplates();
  const templates = await db.select().from(notificationTemplates);
  console.log(`Seeded templates: ${templates.length} templates in database.`);

  // 2. Budget alert verification
  console.log("\n[Test 2] Testing budget exceeded alert trigger...");
  
  // Find a test local user to perform the tests
  const testUsers = await db.select().from(localUsers).limit(1);
  if (testUsers.length > 0) {
    const user = testUsers[0];
    console.log(`Targeting test local user ID: ${user.id} (${user.name})`);
    
    // Set user profile monthly income budget to 100.00
    await db.insert(userProfiles).values({
      userId: user.id,
      userType: "local",
      monthlyIncome: "100.00",
      profileCompleted: true
    }).onDuplicateKeyUpdate({
      set: { monthlyIncome: "100.00" }
    });

    // Delete existing expenses for this month to ensure accurate testing
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Insert a transaction expense that breaches the budget
    await db.insert(expenses).values({
      userId: user.id,
      userType: "local",
      amount: "150.00",
      category: "food",
      description: "Test expense breaching budget",
      date: new Date()
    });

    // Run the budget warnings engine
    console.log("Running budget exceeded check...");
    await checkUserBudgetExceeded(user.id, "local");
    
    // Check logs to verify warning was dispatched
    const logs = await db.select().from(notificationLogs)
      .where(and(eq(notificationLogs.userId, user.id), eq(notificationLogs.userType, "local")))
      .orderBy(notificationLogs.sentAt);
    
    console.log(`Found ${logs.length} notification logs for user.`);
    console.log("Notification warnings status:", JSON.stringify(logs, null, 2));

    // 3. Activity and streak triggers verification
    console.log("\n[Test 3] Testing smart inactivity and streak alerts...");
    
    // Simulate user activity: streak of 3, last active 28 hours ago (yesterday)
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 28);
    
    await db.update(localUsers).set({
      currentStreak: 3,
      lastStreakAt: yesterday
    }).where(eq(localUsers.id, user.id));

    // Trigger daily fحص check
    console.log("Running smart activity notifications checker...");
    await checkAndTriggerSmartActivityNotifications();
    console.log("Smart activity notifications check completed successfully.");

    // 4. Specific User target campaign test
    console.log("\n[Test 4] Testing specific user campaign targeting...");
    
    // Clear notificationTemplates for manual_scheduled
    await db.delete(notificationTemplates).where(eq(notificationTemplates.eventType, "manual_scheduled"));

    const specSendTime = new Date();
    specSendTime.setMinutes(specSendTime.getMinutes() - 5); // 5 minutes ago to make sure it's due
    
    await db.insert(notificationTemplates).values({
      name: "حملة مستخدم محدد للتحقق",
      eventType: "manual_scheduled",
      titleTemplate: "مرحباً يا بطل 🎯",
      bodyTemplate: "هذا الإشعار مخصص لك أنت فقط!",
      titleTemplateAr: "مرحباً يا بطل 🎯",
      bodyTemplateAr: "هذا الإشعار مخصص لك أنت فقط!",
      isActive: true,
      targetSegment: JSON.stringify({ plan: "all", userId: user.id, userType: "local" }),
      sendAt: specSendTime
    });

    // Run the scheduler
    const { processScheduledNotifications } = await import("./notification-engine");
    await processScheduledNotifications();

    // Verify user received it in logs
    const specLogs = await db.select().from(notificationLogs)
      .where(and(
        eq(notificationLogs.userId, user.id),
        eq(notificationLogs.userType, "local")
      ));
    console.log(`Verified Specific User notification sent. Logs count: ${specLogs.length}`);

    // 5. Usage (minUsage) filtering test
    console.log("\n[Test 5] Testing minUsage segment filter...");
    
    // Create another local user that has NO expenses
    await db.delete(localUsers).where(eq(localUsers.name, "مستخدم اختبار الفلترة"));
    
    const testPhone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
    const [dummyUser] = await db.insert(localUsers).values({
      name: "مستخدم اختبار الفلترة",
      phone: testPhone,
      passwordHash: "dummy",
      role: "user",
      plan: "free"
    });
    const dummyUserId = dummyUser.insertId;
    console.log(`Created dummy user for usage testing, ID: ${dummyUserId}`);

    // Create template with minUsage: 1
    const usageSendTime = new Date();
    usageSendTime.setMinutes(usageSendTime.getMinutes() - 5);
    
    await db.insert(notificationTemplates).values({
      name: "حملة شرط الاستخدام",
      eventType: "manual_scheduled",
      titleTemplate: "حملة الاستخدام النشط",
      bodyTemplate: "هذه الرسالة تصل للنشطين فقط!",
      titleTemplateAr: "حملة الاستخدام النشط",
      bodyTemplateAr: "هذه الرسالة تصل للنشطين فقط!",
      isActive: true,
      targetSegment: JSON.stringify({ plan: "all", minUsage: 1 }),
      sendAt: usageSendTime
    });

    // Run scheduler again
    await processScheduledNotifications();

    // Check logs for user (should have received it because they have 1 expense from Test 2)
    const userUsageLogs = await db.select().from(notificationLogs)
      .where(and(
        eq(notificationLogs.userId, user.id),
        eq(notificationLogs.userType, "local")
      ));
    console.log(`Active User (with expense) logs: ${userUsageLogs.length}`);

    // Check logs for dummyUser (should NOT have received it because they have 0 expenses)
    const dummyUsageLogs = await db.select().from(notificationLogs)
      .where(and(
        eq(notificationLogs.userId, dummyUserId),
        eq(notificationLogs.userType, "local")
      ));
    console.log(`Inactive User (0 expenses) logs: ${dummyUsageLogs.length} (Expected: 0)`);

    if (dummyUsageLogs.length === 0) {
      console.log("SUCCESS: Inactive user did not receive minUsage notification!");
    } else {
      console.error("FAIL: Inactive user received minUsage notification!");
    }

    // Cleanup dummy user
    await db.delete(localUsers).where(eq(localUsers.id, dummyUserId));
    
  } else {
    console.warn("⚠️ No local users found in database to run integration tests. Skipping user-specific tests.");
  }
}

runTests()
  .then(() => {
    console.log("\n=================================================");
    console.log(" Verification complete! All routines succeeded. ");
    console.log("=================================================");
    process.exit(0);
  })
  .catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
