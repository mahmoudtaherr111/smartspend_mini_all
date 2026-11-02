import { expect, test } from "../fixtures/mobile-fixtures";
import type { Locator } from "@playwright/test";

type Point = { x: number; y: number };

async function centerOf(locator: Locator): Promise<Point> {
  await locator.waitFor({ state: "visible" });
  let box: { height: number; width: number; x: number; y: number } | null =
    null;
  await expect
    .poll(async () => {
      box = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      });
      return box.width > 0 && box.height > 0;
    })
    .toBe(true);
  if (!box) throw new Error("Navigation tab must have a bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dispatchPointer(
  locator: Locator,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  point: Point,
  pointerId = 1,
) {
  await locator.dispatchEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId,
    pointerType: "touch",
  });
}

async function dispatchTap(locator: Locator, pointerId: number) {
  const point = await centerOf(locator);
  await dispatchPointer(locator, "pointerdown", point, pointerId);
  await dispatchPointer(locator, "pointerup", point, pointerId);
  await locator.dispatchEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail: 1,
  });
}

test.describe("iPhone bottom navigation touch state machine", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ setupMockEnvironment, page }) => {
    await setupMockEnvironment({ plan: "pro" });
    await page.goto("/dashboard?tab=record");
    await page.waitForLoadState("domcontentloaded");
  });

  test("previews a dragged tab and commits only when the finger is released", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("iPhone"));

    const nav = page.getByTestId("mobile-bottom-nav");
    const record = page.getByTestId("nav-tab-record");
    const stats = page.getByTestId("nav-tab-stats");
    const recordCenter = await centerOf(record);
    const statsCenter = await centerOf(stats);

    await dispatchPointer(record, "pointerdown", recordCenter);
    await expect(nav).toHaveAttribute("data-gesture-state", "pressed");
    await expect(page).toHaveURL(/tab=record/);

    await dispatchPointer(nav, "pointermove", {
      x: recordCenter.x - 3,
      y: recordCenter.y + 1,
    });
    await expect(nav).toHaveAttribute("data-scrubbing", "false");
    await expect(page).toHaveURL(/tab=record/);

    await dispatchPointer(nav, "pointermove", {
      x: (recordCenter.x + statsCenter.x) / 2,
      y: recordCenter.y,
    });
    await expect(page.getByTestId("ios-nav-indicator")).toHaveAttribute(
      "data-indicator-position",
      "0.500",
    );
    await expect(page.getByTestId("ios-nav-trail")).toHaveAttribute(
      "style",
      /opacity: 1/,
    );
    await expect(page).toHaveURL(/tab=record/);

    await dispatchPointer(nav, "pointermove", statsCenter);
    await expect(nav).toHaveAttribute("data-scrubbing", "true");
    await expect(nav).toHaveAttribute("data-preview-index", "1");
    await expect(page.getByTestId("ios-nav-indicator")).toHaveAttribute(
      "data-indicator-index",
      "1",
    );
    await expect(page).toHaveURL(/tab=record/);

    await dispatchPointer(nav, "pointerup", statsCenter);
    await expect(page).toHaveURL(/tab=stats/);
    await expect(nav).toHaveAttribute("data-gesture-state", "idle");
    await expect(page.getByTestId("ios-nav-indicator")).toHaveAttribute(
      "style",
      /translate3d\(-100%/,
    );
  });

  test("a single touch sequence navigates on its first release", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("iPhone"));

    const stats = page.getByTestId("nav-tab-stats");
    const point = await centerOf(stats);

    await dispatchPointer(stats, "pointerdown", point, 7);
    await dispatchPointer(stats, "pointerup", point, 7);

    await expect(page).toHaveURL(/tab=stats/);
  });

  test("pointer cancellation restores the active tab without navigation", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("iPhone"));

    const nav = page.getByTestId("mobile-bottom-nav");
    const record = page.getByTestId("nav-tab-record");
    const stats = page.getByTestId("nav-tab-stats");
    const start = await centerOf(record);
    const end = await centerOf(stats);

    await dispatchPointer(record, "pointerdown", start);
    await dispatchPointer(nav, "pointermove", end);
    await expect(nav).toHaveAttribute("data-preview-index", "1");
    await dispatchPointer(nav, "pointercancel", end);

    await expect(nav).toHaveAttribute("data-gesture-state", "idle");
    await expect(nav).toHaveAttribute("data-preview-index", "0");
    await expect(page).toHaveURL(/tab=record/);
  });

  test("vertical movement cancels selection without changing the route", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("iPhone"));

    const nav = page.getByTestId("mobile-bottom-nav");
    const record = page.getByTestId("nav-tab-record");
    const start = await centerOf(record);

    await dispatchPointer(record, "pointerdown", start);
    await dispatchPointer(nav, "pointermove", {
      x: start.x + 3,
      y: start.y - 26,
    });
    await dispatchPointer(nav, "pointerup", {
      x: start.x + 3,
      y: start.y - 26,
    });

    await expect(nav).toHaveAttribute("data-gesture-state", "idle");
    await expect(nav).toHaveAttribute("data-preview-index", "0");
    await expect(page).toHaveURL(/tab=record/);
  });

  test("five rapid taps are all accepted without a timed click lock", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("iPhone"));

    const tabs = ["stats", "calendar", "record", "ai", "stats"];
    for (const [index, tab] of tabs.entries()) {
      await dispatchTap(page.getByTestId(`nav-tab-${tab}`), index + 10);
    }

    await expect(page).toHaveURL(/dashboard\?tab=stats/);
    await expect(page.getByTestId("mobile-bottom-nav")).toHaveAttribute(
      "data-scrubbing",
      "false",
    );
  });

  test("Android keeps ordinary tap navigation and ignores scrub gestures", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Android Chrome Pixel 7");

    const nav = page.getByTestId("mobile-bottom-nav");
    const record = page.getByTestId("nav-tab-record");
    const stats = page.getByTestId("nav-tab-stats");
    const start = await centerOf(record);
    const end = await centerOf(stats);

    await expect(nav).toHaveAttribute("data-ios-scrub-enabled", "false");
    await dispatchPointer(record, "pointerdown", start);
    await dispatchPointer(nav, "pointermove", end);
    await dispatchPointer(nav, "pointerup", end);
    await expect(nav).toHaveAttribute("data-scrubbing", "false");
    await expect(page).toHaveURL(/tab=record/);

    await stats.click();
    await expect(page).toHaveURL(/tab=stats/);
  });
});
