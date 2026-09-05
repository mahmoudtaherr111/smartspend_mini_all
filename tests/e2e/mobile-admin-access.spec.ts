import { test, expect, type Page } from "@playwright/test";

async function mockSession(
  page: Page,
  role: "admin" | "moderator" | "user",
  type: "oauth" | "local" = "oauth",
) {
  const user = {
    id: 101,
    name: "مسؤول الاختبار",
    email: "admin@example.test",
    role,
    plan: "free",
    type,
    phone: "01012345678",
    avatar: null,
  };
  await page.route("**/api/trpc/**", async (route) => {
    const procedures = decodeURIComponent(
      new URL(route.request().url()).pathname,
    )
      .split("/api/trpc/")[1]
      .split(",");
    const dataFor = (procedure: string): unknown => {
      if (procedure === "auth.me") return type === "oauth" ? user : null;
      if (procedure === "localAuth.me") return type === "local" ? user : null;
      if (procedure === "admin.getFounderMetrics")
        return {
          dau: 1,
          wau: 1,
          newProSubs7d: 0,
          activeProSubs: 0,
          estimatedTokensUsed: 0,
          upgradeEvents: 0,
        };
      if (procedure === "admin.listAllUsers")
        return {
          users: [
            {
              ...user,
              userType: type,
              totalSpent: "1250.50",
              expenseCount: 12,
            },
          ],
          total: 1,
        };
      if (procedure === "admin.getUserSessions") return [];
      if (procedure === "support.listAll") return { tickets: [], total: 0 };
      if (procedure === "expense.list") return { items: [], total: 0 };
      if (procedure === "goals.list") return { goals: [], isPro: false };
      if (procedure === "profile.getSmartProfile")
        return { profileCompleted: true };
      if (
        [
          "ads.list",
          "profile.getInAppNotifications",
          "chat.getQuickActions",
        ].includes(procedure)
      )
        return [];
      return {};
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        procedures.map((procedure) => ({
          result: { data: dataFor(procedure) },
        })),
      ),
    });
  });
}

for (const authType of ["oauth", "local"] as const) {
  test(`mobile admin entry and section navigation (${authType})`, async ({
    page,
  }, testInfo) => {
    await mockSession(page, "admin", authType);
    await page.goto("/more");
    await page.getByTestId("mobile-admin-link").click();
    await expect(page).toHaveURL(/\/admin$/);
    const trigger = page.getByTestId("admin-mobile-section-trigger");
    await expect(trigger).toContainText("نظرة عامة");
    await trigger.click();
    await expect(
      page.getByRole("heading", { name: "أقسام لوحة الإدارة" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("admin-sections.png"),
      animations: "disabled",
    });
    await page.getByTestId("admin-mobile-section-users").click();
    await expect(trigger).toContainText("المستخدمون");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("قاعدة بيانات المستخدمين")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await expect(
      page.getByRole("article", { name: "حساب مسؤول الاختبار" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("admin-users.png"),
      animations: "disabled",
    });
    await page.getByRole("link", { name: "العودة إلى المزيد" }).click();
    await expect(page).toHaveURL(/\/more$/);
  });
}

test("small phone supports user controls and contained dialogs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSession(page, "admin");
  await page.goto("/admin");
  await page.getByTestId("admin-mobile-section-trigger").click();
  await page.getByTestId("admin-mobile-section-users").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const card = page.getByRole("article", { name: "حساب مسؤول الاختبار" });
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await card.getByRole("button", { name: "الجلسات", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return bounds!.x + bounds!.width;
    })
    .toBeLessThanOrEqual(320);
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320);
});

test("wide layout retains desktop tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockSession(page, "admin");
  await page.goto("/admin");
  await expect(page.getByTestId("admin-mobile-section-trigger")).toBeHidden();
  await page.getByRole("tab", { name: "المستخدمون", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

for (const role of ["user", "moderator"] as const) {
  test(`does not expose admin navigation or direct access to ${role}`, async ({
    page,
  }) => {
    await mockSession(page, role);
    await page.goto("/more");
    await expect(
      page.getByRole("heading", { name: "المزيد", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("mobile-admin-link")).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
    await expect(page.getByTestId("admin-mobile-section-trigger")).toHaveCount(
      0,
    );
  });
}
