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

    // Every frame of the opening animation counts, not only where the editor settles.
    await page.evaluate(() => {
      const w = window as unknown as { __editorFrames: Array<{ left: number; right: number }> };
      w.__editorFrames = [];
      const sample = () => {
        const el = document.querySelector("[role=dialog]");
        if (el) {
          const box = el.getBoundingClientRect();
          w.__editorFrames.push({ left: box.left, right: box.right });
          if (el.getAnimations().length === 0) return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
    const frames = await page.evaluate(
      () => (window as unknown as { __editorFrames: Array<{ left: number; right: number }> }).__editorFrames,
    );
    expect(frames.length).toBeGreaterThan(0);
    expect(Math.min(...frames.map((frame) => frame.left))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frames.map((frame) => frame.right))).toBeLessThanOrEqual(viewport.width + 1);

    const nameInput = dialog.getByPlaceholder("مثال: أحمد، مريم...");
    const relationSelect = dialog.getByRole("combobox");
    await expect(nameInput).toBeVisible();
    await expect(relationSelect).toBeVisible();

    const inputBox = await nameInput.boundingBox();
    const selectBox = await relationSelect.boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(44);
    expect(selectBox?.height).toBeGreaterThanOrEqual(44);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    if (!dialogBox) return;
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
    // Phones use a full-width sheet; tablets use a centered, bounded dialog.
    expect(inputBox?.width).toBeGreaterThanOrEqual(
      viewport.width <= 768 ? viewport.width - 48 : dialogBox.width - 64,
    );

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
