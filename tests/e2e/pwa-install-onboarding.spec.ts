import { expect, test } from "../fixtures/mobile-fixtures";

test.describe("PWA installation onboarding", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro", installedPwa: false });
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

  test("never leaves a control of the page stuck under the card", async ({ page }) => {
    await page.goto("/more");
    const installRegion = page.getByRole("region", { name: "تثبيت SmartSpend كتطبيق" });
    await expect(installRegion).toBeVisible({ timeout: 8_000 });

    // The last control of the page: it sits where the card floats unless the page reserves room.
    const logout = page.getByRole("button", { name: "تسجيل الخروج", exact: true });
    await expect
      .poll(async () => {
        // The page scrolls inside <main>, smoothly: keep asking for its end until it is there.
        await page.evaluate(() => {
          const main = document.querySelector("main")!;
          main.scrollTop = main.scrollHeight;
        });
        const [card, button] = await Promise.all([installRegion.boundingBox(), logout.boundingBox()]);
        return card && button ? button.y + button.height <= card.y : false;
      })
      .toBe(true);
    await logout.click({ trial: true });

    // Dismissed, the card gives the room back.
    await installRegion.getByRole("button", { name: "إغلاق اقتراح تثبيت التطبيق" }).click();
    await expect(installRegion).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--install-card-space")))
      .toBe("");
  });
});
