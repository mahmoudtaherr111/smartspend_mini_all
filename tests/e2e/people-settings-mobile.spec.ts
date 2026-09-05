import { expect, test } from "../fixtures/mobile-fixtures";

test.describe("People and relationships mobile UX", () => {
  test.beforeEach(async ({ setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: "pro" });
  });

  test("keeps the screen inset, touch targets large, and the editor full-width", async ({
    page,
  }) => {
    await page.goto("/settings/people");

    const view = page.getByTestId("people-settings-view");
    await expect(view).toBeVisible();
    const viewBox = await view.boundingBox();
    const viewport = page.viewportSize();
    expect(viewBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (!viewBox || !viewport) return;

    expect(viewBox.x).toBeGreaterThanOrEqual(12);
    expect(viewBox.width).toBeLessThanOrEqual(viewport.width - 24);
    expect(viewBox.y).toBeGreaterThanOrEqual(16);

    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByPlaceholder("مثال: أحمد، مريم...");
    const relationSelect = dialog.getByRole("combobox");
    await expect(nameInput).toBeVisible();
    await expect(relationSelect).toBeVisible();

    const inputBox = await nameInput.boundingBox();
    const selectBox = await relationSelect.boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(44);
    expect(selectBox?.height).toBeGreaterThanOrEqual(44);
    expect(inputBox?.width).toBeGreaterThanOrEqual(viewport.width - 48);

    const typeButtons = dialog
      .getByRole("group", { name: "نوع الشخص" })
      .getByRole("button");
    await expect(typeButtons).toHaveCount(4);
    for (const button of await typeButtons.all()) {
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
