import { expect, test } from "../fixtures/mobile-fixtures";

test.describe("PWA installation onboarding", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("shows a device-aware path to the home screen", async ({ page }) => {
    await page.goto("/dashboard?tab=record");

    const installRegion = page.getByRole("region", {
      name: "تثبيت SmartSpend كتطبيق",
    });
    await expect(installRegion).toBeVisible({ timeout: 8_000 });
    await installRegion
      .getByRole("button", { name: "اعرف طريقة التثبيت" })
      .click();

    const platform = await page.evaluate(() =>
      /Android/i.test(navigator.userAgent) ? "android" : "ios",
    );
    if (platform === "android") {
      await expect(
        page.getByRole("heading", { name: "ثبّت SmartSpend على Android" }),
      ).toBeVisible();
      await expect(page.getByText("افتح القائمة في Chrome")).toBeVisible();
      await expect(page.getByText("اختر «تثبيت التطبيق»")).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", {
          name: "ثبّت SmartSpend على iPhone أو iPad",
        }),
      ).toBeVisible();
      await expect(page.getByText("اضغط زر المشاركة")).toBeVisible();
      await expect(
        page.getByText("اختر «إضافة إلى الشاشة الرئيسية»"),
      ).toBeVisible();
    }
  });
});
