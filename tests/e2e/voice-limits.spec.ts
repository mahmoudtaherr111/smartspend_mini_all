import { test, expect } from "../fixtures/mobile-fixtures";
import type { Page } from "@playwright/test";

const UNKNOWN_BALANCE = "مش قادرين نعرف دقايق الصوت دلوقتي. جرّب تاني أو سجّل بالنص.";
const MONTH_USED = "دقايق الصوت بتاعة الشهر ده خلصت. تقدر تكتب، أو ترقّي لـ Pro.";

function limits(remaining: number) {
  return {
    data: {
      ai: { limit: 30000, used: 0, remaining: 30000, maxPerRequest: 1000 },
      voice: { limit: remaining === -1 ? 0 : 1800, used: 0, remaining, resetDate: "2030-01-01T00:00:00.000Z", maxPerRequest: 180 },
      offline: { limit: 3 },
    },
  };
}

/** Counts microphone requests; the browser prompt itself is out of reach of these tests. */
async function countMicrophone(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { microphoneRequests: number };
    w.microphoneRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          w.microphoneRequests++;
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });
  return () => page.evaluate(() => (window as unknown as { microphoneRequests: number }).microphoneRequests);
}

async function pressMicrophone(page: Page) {
  await page.goto("/dashboard?tab=record");
  await page.getByRole("button", { name: /^بدء التسجيل الصوتي/ }).click();
}

async function expectTextStillWorks(page: Page) {
  const input = page.locator("textarea").first();
  await input.fill("قهوة بخمسين جنيه");
  await expect(input).toHaveValue("قهوة بخمسين جنيه");
}

for (const [name, reply] of [
  ["missing voice", { data: {} }],
  ["missing balance", { data: { voice: {} } }],
  ["invalid negative balance", { data: { voice: { remaining: -2 } } }],
  ["invalid fractional negative balance", { data: { voice: { remaining: -0.5 } } }],
  ["server error", "error"],
] as const) {
  test(`Unknown voice quota (${name}) keeps text usable and never opens the microphone`, async ({
    page,
    setupMockEnvironment,
    consoleErrors,
  }) => {
    await setupMockEnvironment({ plan: "pro", limitsReply: reply });
    const microphoneRequests = await countMicrophone(page);
    await pressMicrophone(page);
    await expect(page.getByText(UNKNOWN_BALANCE)).toBeVisible();
    expect(await microphoneRequests()).toBe(0);
    await expectTextStillWorks(page);
    // A failed request is logged by the browser; only the malformed payloads must stay silent.
    if (reply !== "error") expect(consoleErrors).toHaveLength(0);
  });
}

test("A used-up month says so and never opens the microphone", async ({ page, setupMockEnvironment }) => {
  await setupMockEnvironment({ plan: "pro", limitsReply: limits(0) });
  const microphoneRequests = await countMicrophone(page);
  await pressMicrophone(page);
  await expect(page.getByText(MONTH_USED)).toBeVisible();
  expect(await microphoneRequests()).toBe(0);
  await expectTextStillWorks(page);
});

for (const [name, remaining] of [["minutes left", 1200], ["an unlimited plan", -1]] as const) {
  test(`With ${name} the microphone is asked for`, async ({ page, setupMockEnvironment }) => {
    await setupMockEnvironment({ plan: remaining === -1 ? "ultra" : "pro", limitsReply: limits(remaining) });
    const microphoneRequests = await countMicrophone(page);
    await pressMicrophone(page);
    await expect.poll(microphoneRequests).toBe(1);
    await expect(page.getByText(UNKNOWN_BALANCE)).toHaveCount(0);
  });
}
